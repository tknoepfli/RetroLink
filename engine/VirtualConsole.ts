import { GameState, PlayerState, ControllerInput, Platform } from '../types';
import { AudioService } from '../services/audioService';

/**
 * Manages the emulation lifecycle using Nostalgist.js.
 * Handles ROM loading, core switching, and input bridging.
 */
export class VirtualConsole {
  public container: HTMLDivElement;
  public staticCanvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D; // Context for static/guest canvas
  
  public platform: Platform = Platform.SNES;
  public romName: string = "No Cartridge Inserted";
  public isRomLoaded: boolean = false;
  
  private state: GameState;
  private audio: AudioService;
  private isHost: boolean;
  
  // Emulator instance
  private nostalgist: any = null;
  private isLaunching: boolean = false;
  private isDestroyed: boolean = false;
  private wrapper: HTMLElement | null = null;
  
  // Simulation constants
  private width = 640;
  private height = 480;

  constructor(container: HTMLDivElement, isHost: boolean, audio: AudioService) {
    this.container = container;
    this.isHost = isHost;
    this.audio = audio;
    
    // Locate the pre-rendered static canvas inside the container
    const foundCanvas = container.querySelector('canvas.static-screen') as HTMLCanvasElement;
    if (!foundCanvas) {
        throw new Error("Static canvas not found in container");
    }
    this.staticCanvas = foundCanvas;
    
    // Initialize 2D context ONLY on the static canvas
    this.ctx = this.staticCanvas.getContext('2d', { alpha: false })!;
    
    // Set internal resolution for static canvas
    this.staticCanvas.width = this.width;
    this.staticCanvas.height = this.height;

    // Ensure we start clean
    this.staticCanvas.style.display = 'block';
    
    // Initial State (used for fallback/waiting screen)
    this.state = {
      p1: this.createPlayer('p1', '#ef4444', 100, 200),
      p2: this.createPlayer('p2', '#3b82f6', 500, 200),
      ball: { x: 320, y: 240, dx: 4, dy: 4 },
      timestamp: Date.now()
    };
  }

  /**
   * Helper to ensure Nostalgist library is loaded via ESM.
   */
  private async ensureLibraryLoaded(): Promise<any> {
      try {
        // @ts-ignore
        const module = await import('nostalgist');
        const lib = module as any;
        // Handle various ESM export shapes
        if (lib.default) return lib.default;
        if (lib.Nostalgist) return lib.Nostalgist;
        return lib;
      } catch (e) {
        console.error("Failed to import Nostalgist:", e);
        throw new Error("Nostalgist library unavailable.");
      }
  }

  /**
   * Loads a real ROM file using Nostalgist.
   */
  public async loadRom(file: File) {
    if (this.isDestroyed) {
        console.warn("Attempted to load ROM on destroyed console instance.");
        return;
    }
    if (this.isLaunching) return;

    this.isLaunching = true;
    
    try {
        // Ensure library is available
        const Nostalgist = await this.ensureLibraryLoaded();

        // 1. Terminate previous instance completely
        await this.destroyEmulator();
        
        if (this.isDestroyed) return; // Check again after await

        this.romName = file.name;
        
        // 2. Resolve Core
        const core = this.getCore(this.platform);
        console.log(`Launching ${file.name} on core: ${core}`);

        if (!this.container || !this.container.isConnected) {
             throw new Error("Emulator container is missing or detached from DOM.");
        }

        // Create a dedicated wrapper div for this session.
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'emulator-wrapper';
        
        Object.assign(this.wrapper.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '10', // Above static canvas
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'transparent'
        });

        // Create a dedicated CANVAS for the emulator.
        // Nostalgist/RetroArch strictly requires a canvas element target.
        const canvas = document.createElement('canvas');
        const canvasId = `emu-canvas-${Date.now()}`;
        canvas.id = canvasId;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        this.wrapper.appendChild(canvas);
        this.container.appendChild(this.wrapper);

        // Double check connection before launch
        if (!document.getElementById(canvasId)) {
             throw new Error("Canvas element failed to attach to DOM");
        }

        // 3. Launch Nostalgist
        // Pass the CANVAS selector ID string
        this.nostalgist = await Nostalgist.launch({
            element: `#${canvasId}`,
            rom: file,
            core: core,
            style: {
                width: '100%',
                height: '100%',
                backgroundColor: 'transparent',
            },
            respondToGlobalEvents: true, // Listen to keyboard inputs
        });

        if (this.isDestroyed) {
            // If we got destroyed while launching, exit immediately
            await this.nostalgist.exit();
            this.nostalgist = null;
            return;
        }

        this.isRomLoaded = true;
        
        // Hide static screen while playing
        this.staticCanvas.style.display = 'none';
        console.log("Emulator Launched Successfully");

    } catch (e) {
      console.error("Failed to launch emulator:", e);
      this.isRomLoaded = false;
      this.romName = "Error Loading ROM";
      
      // Cleanup failed launch artifacts
      await this.destroyEmulator();
      
      // Force static screen back
      this.staticCanvas.style.display = 'block';

      // Re-throw to inform UI
      throw e; 
    } finally {
        this.isLaunching = false;
    }
  }

  public setVolume(v: number) {
     // Volume is handled globally by AudioService via AudioContext hijacking
  }

  public async destroy() {
    this.isDestroyed = true;
    await this.destroyEmulator();
  }

  /**
   * Stops the emulator and unloads the ROM, returning to static screen.
   */
  public async stop() {
    this.isRomLoaded = false;
    this.romName = "No Cartridge Inserted";
    await this.destroyEmulator();
    this.render(); // Ensure static screen is drawn immediately
  }

  /**
   * Captures the current state of the emulator as a Blob.
   */
  public async saveState(): Promise<Blob | null> {
    if (!this.nostalgist || !this.isRomLoaded) return null;
    try {
        const state = await this.nostalgist.saveState();
        return state.blob; // Nostalgist returns { blob: Blob, thumbnail: Blob } or just Blob depending on version, checking docs standard is blob
    } catch (e) {
        console.error("Failed to save state:", e);
        return null;
    }
  }

  /**
   * Loads a state blob into the running emulator.
   */
  public async loadState(stateBlob: Blob) {
      if (!this.nostalgist || !this.isRomLoaded) return;
      try {
          await this.nostalgist.loadState(stateBlob);
      } catch (e) {
          console.error("Failed to load state:", e);
          throw e;
      }
  }

  private async destroyEmulator() {
    // 1. Exit Nostalgist instance
    if (this.nostalgist) {
        try {
            await this.nostalgist.exit();
        } catch (e) {
            console.warn("Error exiting emulator:", e);
        }
        this.nostalgist = null;
    }
    
    // 2. Remove the wrapper we created
    if (this.wrapper) {
        this.wrapper.remove();
        this.wrapper = null;
    }

    // 3. Cleanup any potential orphaned wrappers from previous crashes
    if (this.container) {
        const orphans = this.container.querySelectorAll('.emulator-wrapper');
        orphans.forEach(el => el.remove());
    }

    // 4. Restore static screen
    if (this.staticCanvas) {
        this.staticCanvas.style.display = 'block';
    }
  }

  /**
   * Returns a MediaStream from the active canvas.
   */
  public captureStream(fps: number = 30): MediaStream {
      // If Nostalgist is running, find its canvas within our wrapper
      if (this.isRomLoaded && this.nostalgist && this.wrapper) {
          const emuCanvas = this.wrapper.querySelector('canvas') as HTMLCanvasElement;
          if (emuCanvas) {
              return emuCanvas.captureStream(fps);
          }
      }
      
      // Fallback to static canvas stream
      return this.staticCanvas.captureStream(fps);
  }

  private getCore(p: Platform): string {
    switch(p) {
      case Platform.NES: return 'fceumm';
      case Platform.SNES: return 'snes9x';
      case Platform.GB: return 'mgba';
      case Platform.GBA: return 'mgba';
      case Platform.GENESIS: return 'genesis_plus_gx';
      case Platform.PSX: return 'pcsx_rearmed';
      default: return 'snes9x';
    }
  }

  private createPlayer(id: string, color: string, x: number, y: number): PlayerState {
    return {
      id,
      connected: false,
      color,
      x,
      y,
      input: { up: false, down: false, left: false, right: false, a: false, b: false, start: false, select: false }
    };
  }

  // --- Core Loop ---

  public update(inputsP1: ControllerInput, inputsP2: ControllerInput) {
    // Nostalgist handles its own loop.
    this.state.timestamp = Date.now();
  }

  // --- Rendering ---

  public render(externalState?: GameState) {
    if (this.isDestroyed) return;

    // If Emulator is running, it handles its own rendering.
    if (this.isRomLoaded && this.nostalgist) return;

    // Otherwise, ensure static canvas is visible and draw fallback UI
    this.staticCanvas.style.display = 'block';

    // Clear
    this.ctx.fillStyle = '#18181b'; 
    this.ctx.fillRect(0, 0, this.width, this.height);

    if (!this.isRomLoaded) {
      this.drawStaticNoise();
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      this.ctx.font = '24px monospace';
      this.ctx.fillStyle = '#a1a1aa';
      this.ctx.textAlign = 'center';
      this.ctx.fillText("NO CARTRIDGE INSERTED", this.width / 2, this.height / 2);
      this.ctx.font = '14px monospace';
      this.ctx.fillStyle = '#52525b';
      this.ctx.fillText("Please load a ROM file to begin", this.width / 2, this.height / 2 + 30);
      this.ctx.textAlign = 'left';
      
      this.ctx.font = '16px monospace';
      this.ctx.fillStyle = '#52525b';
      this.ctx.fillText(`SYSTEM: ${this.platform}`, 20, 30);
      return;
    }
  }

  /**
   * For Guest: Renders the video stream received from Host onto the static canvas.
   */
  public renderVideo(video: HTMLVideoElement) {
      if (this.isDestroyed) return;
      this.ctx.drawImage(video, 0, 0, this.width, this.height);
      
      this.ctx.font = '16px monospace';
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`REMOTE PLAY: ${this.platform}`, 20, 30);
  }

  private drawStaticNoise() {
     const id = this.ctx.getImageData(0, 0, this.width, this.height);
     const pixels = id.data;
     for(let i = 0; i < pixels.length; i += 4) {
         const color = Math.random() * 50;
         pixels[i] = color;
         pixels[i+1] = color;
         pixels[i+2] = color;
     }
     this.ctx.putImageData(id, 0, 0);
  }

  public getState(): GameState {
    return this.state;
  }

  public setState(newState: GameState) {
    this.state = newState;
  }

  public setPlayerConnected(playerId: 'p1' | 'p2', isConnected: boolean) {
    this.state[playerId].connected = isConnected;
  }

  public async setPlatform(platform: Platform) {
    if (this.isDestroyed) return;
    this.platform = platform;
    this.romName = "No Cartridge Inserted";
    this.isRomLoaded = false;
    
    // Cleanup existing emulator
    await this.destroyEmulator();
    this.reset();
  }

  public async reset() {
    // If emulator is running, restart it
    if (this.nostalgist && this.isRomLoaded) {
        try {
            await this.nostalgist.restart();
            console.log("Emulator restarted");
        } catch (e) {
            console.error("Failed to restart emulator", e);
        }
    }

    // Always reset internal state
    this.state.ball = { x: 320, y: 240, dx: 4, dy: 4 };
    this.state.p1.x = 100;
    this.state.p2.x = 500;
  }
}