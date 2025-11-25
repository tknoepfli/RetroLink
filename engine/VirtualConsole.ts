import { GameState, PlayerState, ControllerInput, Platform } from '../types';
import { AudioService } from '../services/audioService';

/**
 * Key Mapping Configuration for Player 2.
 * We map P2 inputs to specific keyboard keys that don't conflict with P1 (WASD/Arrows).
 */
const P2_MAPPING: Record<string, { key: string, code: string, keyCode: number, retroarchKey: string }> = {
    up: { key: 'i', code: 'KeyI', keyCode: 73, retroarchKey: 'i' },
    down: { key: 'k', code: 'KeyK', keyCode: 75, retroarchKey: 'k' },
    left: { key: 'j', code: 'KeyJ', keyCode: 74, retroarchKey: 'j' },
    right: { key: 'l', code: 'KeyL', keyCode: 76, retroarchKey: 'l' },
    a: { key: 'm', code: 'KeyM', keyCode: 77, retroarchKey: 'm' },      // SNES A (Right)
    b: { key: 'n', code: 'KeyN', keyCode: 78, retroarchKey: 'n' },      // SNES B (Bottom)
    x: { key: 'b', code: 'KeyB', keyCode: 66, retroarchKey: 'b' },      // SNES X (Top)
    y: { key: 'v', code: 'KeyV', keyCode: 86, retroarchKey: 'v' },      // SNES Y (Left)
    start: { key: 'p', code: 'KeyP', keyCode: 80, retroarchKey: 'p' },
    select: { key: 'o', code: 'KeyO', keyCode: 79, retroarchKey: 'o' },
    l: { key: '9', code: 'Digit9', keyCode: 57, retroarchKey: '9' },
    r: { key: '0', code: 'Digit0', keyCode: 48, retroarchKey: '0' },
};

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
  
  // Remote Input Handling
  public static instance: VirtualConsole | null = null;
  private lastGuestInput: ControllerInput | null = null;

  // Simulation constants
  // Standard resolution for best latency/performance balance
  private width = 640; 
  private height = 480;

  constructor(container: HTMLDivElement, isHost: boolean, audio: AudioService) {
    VirtualConsole.instance = this;
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
   * Updates the virtual input state for the remote player (Guest).
   * This uses synthetic keyboard events to control Player 2.
   */
  public updateGuestInput(input: ControllerInput) {
      if (!this.lastGuestInput) {
          this.lastGuestInput = this.createEmptyInput();
      }

      // Compare current input with last frame's input
      // If changed, dispatch the corresponding KeyDown or KeyUp event
      this.handleButtonChange(input.up, this.lastGuestInput.up, P2_MAPPING.up);
      this.handleButtonChange(input.down, this.lastGuestInput.down, P2_MAPPING.down);
      this.handleButtonChange(input.left, this.lastGuestInput.left, P2_MAPPING.left);
      this.handleButtonChange(input.right, this.lastGuestInput.right, P2_MAPPING.right);
      
      this.handleButtonChange(input.a, this.lastGuestInput.a, P2_MAPPING.a);
      this.handleButtonChange(input.b, this.lastGuestInput.b, P2_MAPPING.b);
      this.handleButtonChange(input.x, this.lastGuestInput.x, P2_MAPPING.x);
      this.handleButtonChange(input.y, this.lastGuestInput.y, P2_MAPPING.y);
      
      this.handleButtonChange(input.start, this.lastGuestInput.start, P2_MAPPING.start);
      this.handleButtonChange(input.select, this.lastGuestInput.select, P2_MAPPING.select);
      this.handleButtonChange(input.l, this.lastGuestInput.l, P2_MAPPING.l);
      this.handleButtonChange(input.r, this.lastGuestInput.r, P2_MAPPING.r);

      this.lastGuestInput = { ...input };
  }

  private handleButtonChange(current: boolean | undefined, last: boolean | undefined, map: any) {
      const isPressed = !!current;
      const wasPressed = !!last;

      if (isPressed !== wasPressed) {
          const type = isPressed ? 'keydown' : 'keyup';
          this.dispatchKey(type, map);
      }
  }

  private dispatchKey(type: 'keydown' | 'keyup', map: { key: string, code: string, keyCode: number }) {
      if (typeof window === 'undefined') return;
      
      // Construct a robust KeyboardEvent that satisfies legacy and modern listeners
      const event = new KeyboardEvent(type, {
          key: map.key,
          code: map.code,
          keyCode: map.keyCode, 
          which: map.keyCode,
          bubbles: true,
          cancelable: true,
          view: window
      });
      
      // Explicitly define legacy properties for Emscripten/SDL compatibility
      Object.defineProperty(event, 'keyCode', { value: map.keyCode });
      Object.defineProperty(event, 'which', { value: map.keyCode });

      window.dispatchEvent(event);
  }

  private createEmptyInput(): ControllerInput {
      return { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, l: false, r: false, start: false, select: false };
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

        // Build RetroArch config for P2 Mapping
        const retroarchConfig: Record<string, string> = {
            // Map Player 2 buttons to our specific keys
            input_player2_up: P2_MAPPING.up.retroarchKey,
            input_player2_down: P2_MAPPING.down.retroarchKey,
            input_player2_left: P2_MAPPING.left.retroarchKey,
            input_player2_right: P2_MAPPING.right.retroarchKey,
            input_player2_a: P2_MAPPING.a.retroarchKey,
            input_player2_b: P2_MAPPING.b.retroarchKey,
            input_player2_x: P2_MAPPING.x.retroarchKey,
            input_player2_y: P2_MAPPING.y.retroarchKey,
            input_player2_start: P2_MAPPING.start.retroarchKey,
            input_player2_select: P2_MAPPING.select.retroarchKey,
            input_player2_l: P2_MAPPING.l.retroarchKey,
            input_player2_r: P2_MAPPING.r.retroarchKey,
            
            // Ensure Keyboard driver is active
            input_driver: 'sdl2', 
        };

        // 3. Launch Nostalgist
        this.nostalgist = await Nostalgist.launch({
            element: `#${canvasId}`,
            rom: file,
            core: core,
            retroarchConfig: retroarchConfig,
            style: {
                width: '100%',
                height: '100%',
                backgroundColor: 'transparent',
            },
            respondToGlobalEvents: true, // Listen to keyboard inputs (both real P1 and synthetic P2)
        });

        if (this.isDestroyed) {
            await this.nostalgist.exit();
            this.nostalgist = null;
            return;
        }

        this.isRomLoaded = true;
        this.staticCanvas.style.display = 'none';
        console.log("Emulator Launched Successfully with P2 Keyboard Mapping");

    } catch (e) {
      console.error("Failed to launch emulator:", e);
      this.isRomLoaded = false;
      this.romName = "Error Loading ROM";
      
      await this.destroyEmulator();
      
      this.staticCanvas.style.display = 'block';
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
    if (VirtualConsole.instance === this) {
        VirtualConsole.instance = null;
    }
    await this.destroyEmulator();
  }

  public async stop() {
    this.isRomLoaded = false;
    this.romName = "No Cartridge Inserted";
    this.lastGuestInput = null;
    await this.destroyEmulator();
    this.render(); 
  }

  public async saveState(): Promise<Blob | null> {
    if (!this.nostalgist || !this.isRomLoaded) return null;
    try {
        const state = await this.nostalgist.saveState();
        return state.blob;
    } catch (e) {
        console.error("Failed to save state:", e);
        return null;
    }
  }

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
    if (this.nostalgist) {
        try {
            await this.nostalgist.exit();
        } catch (e) {
            console.warn("Error exiting emulator:", e);
        }
        this.nostalgist = null;
    }
    
    if (this.wrapper) {
        this.wrapper.remove();
        this.wrapper = null;
    }

    if (this.container) {
        const orphans = this.container.querySelectorAll('.emulator-wrapper');
        orphans.forEach(el => el.remove());
    }

    if (this.staticCanvas) {
        this.staticCanvas.style.display = 'block';
    }
  }

  public captureStream(fps: number = 60): MediaStream {
      if (this.isRomLoaded && this.nostalgist && this.wrapper) {
          const emuCanvas = this.wrapper.querySelector('canvas') as HTMLCanvasElement;
          if (emuCanvas) {
              return emuCanvas.captureStream(fps);
          }
      }
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
    this.state.timestamp = Date.now();
  }

  // --- Rendering ---

  public render(externalState?: GameState) {
    if (this.isDestroyed) return;
    if (this.isRomLoaded && this.nostalgist) return;

    this.staticCanvas.style.display = 'block';

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
      this.ctx.font = '16px monospace';
      this.ctx.fillStyle = '#52525b';
      this.ctx.fillText("Please load a ROM file to begin", this.width / 2, this.height / 2 + 30);
      this.ctx.textAlign = 'left';
      
      this.ctx.font = '16px monospace';
      this.ctx.fillStyle = '#52525b';
      this.ctx.fillText(`SYSTEM: ${this.platform}`, 20, 30);
      return;
    }
  }

  public renderVideo(video: HTMLVideoElement) {
      if (this.isDestroyed) return;
      this.ctx.drawImage(video, 0, 0, this.width, this.height);
      
      this.ctx.font = '20px monospace';
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`REMOTE PLAY: ${this.platform}`, 20, 30);
  }

  private drawStaticNoise() {
     const id = this.ctx.getImageData(0, 0, this.width, this.height);
     const pixels = id.data;
     // Optimization: Skip every 4th pixel update to save CPU
     for(let i = 0; i < pixels.length; i += 8) {
         const color = Math.random() * 50;
         pixels[i] = color;
         pixels[i+1] = color;
         pixels[i+2] = color;
         pixels[i+4] = color;
         pixels[i+5] = color;
         pixels[i+6] = color;
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
    
    await this.destroyEmulator();
    this.reset();
  }

  public async reset() {
    if (this.nostalgist && this.isRomLoaded) {
        try {
            await this.nostalgist.restart();
            console.log("Emulator restarted");
        } catch (e) {
            console.error("Failed to restart emulator", e);
        }
    }

    this.state.ball = { x: 320, y: 240, dx: 4, dy: 4 };
    this.state.p1.x = 100;
    this.state.p2.x = 500;
  }
}