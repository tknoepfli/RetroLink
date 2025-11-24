export class AudioService {
  private static instance: AudioService | null = null;
  private masterVolume: number = 0.5;
  private contexts: Set<AudioContext> = new Set();
  private gainNodes: Map<AudioContext, GainNode> = new Map();
  private internalCtx: AudioContext | null = null;

  constructor() {
    if (AudioService.instance) {
        return AudioService.instance;
    }
    AudioService.instance = this;
    
    this.patchAudioContext();
    
    // Initialize internal context for UI sounds (playTone)
    // This will trigger our patched constructor and register itself automatically.
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            this.internalCtx = new AudioContextClass();
        }
    } catch (e) {
        console.error("Failed to init internal audio context", e);
    }
  }

  /**
   * Monkey-patch the global AudioContext constructor.
   * This ensures we capture ANY AudioContext created by the app or libraries (like emulators).
   */
  private patchAudioContext() {
    if (typeof window === 'undefined') return;

    const OriginalAudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!OriginalAudioContext) return;

    // Avoid double-patching
    if ((OriginalAudioContext as any).__isPatched) return;

    const self = this;

    const PatchedContext = class extends OriginalAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        // Register this new context to be controlled by AudioService
        self.registerContext(this as unknown as AudioContext);
      }
    };
    
    // Mark as patched
    (PatchedContext as any).__isPatched = true;

    // Apply patch
    window.AudioContext = PatchedContext as any;
    (window as any).webkitAudioContext = PatchedContext;
  }

  private registerContext(ctx: AudioContext) {
    if (this.contexts.has(ctx)) return;
    this.contexts.add(ctx);

    try {
        // Create a GainNode to act as the master volume for this context
        const gainNode = ctx.createGain();
        gainNode.gain.value = this.masterVolume;
        
        // Connect the gain node to the real destination
        gainNode.connect(ctx.destination);

        // Store reference so we can update volume later
        this.gainNodes.set(ctx, gainNode);

        // Intercept the 'destination' property on the instance.
        // We force any code asking for 'ctx.destination' to get our gainNode instead.
        // This effectively routes all emulator audio through our gain node.
        Object.defineProperty(ctx, 'destination', {
            get: () => gainNode,
            configurable: true 
        });
        
        console.log("AudioContext hijacked for volume control");
    } catch (e) {
        console.warn("Failed to hijack AudioContext destination", e);
    }
  }

  /**
   * Resumes all tracked AudioContexts.
   */
  public async resume() {
    this.contexts.forEach((ctx) => {
        if (ctx.state === 'suspended') {
            ctx.resume().catch(e => console.warn("Failed to resume context", e));
        }
    });
  }

  public setVolume(val: number) {
    // Clamp between 0 and 1
    this.masterVolume = Math.max(0, Math.min(1, val));
    
    // Update all gain nodes (Emulator + Internal)
    this.gainNodes.forEach((node) => {
        if (node) {
            node.gain.value = this.masterVolume;
            // Often browsers need a resume call if interaction happens on slider
            if (node.context.state === 'suspended') {
                (node.context as AudioContext).resume();
            }
        }
    });
  }

  public playTone(freq: number, type: OscillatorType = 'square', duration: number = 0.1) {
    if (!this.internalCtx) return;
    
    // Use the hijacked destination (which is actually a gain node now)
    // or we can use the gain node from our map directly.
    const dest = this.internalCtx.destination; 

    const osc = this.internalCtx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.internalCtx.currentTime);
    osc.connect(dest);
    osc.start();
    osc.stop(this.internalCtx.currentTime + duration);
    
    if (this.internalCtx.state === 'suspended') this.internalCtx.resume();
  }
}