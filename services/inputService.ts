import { ControllerInput } from '../types';

export class InputService {
  private static instance: InputService;
  
  private keysPressed: Set<string> = new Set();
  
  private constructor() {
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', (e) => this.keysPressed.add(e.code));
        window.addEventListener('keyup', (e) => this.keysPressed.delete(e.code));
    }
  }

  public static getInstance(): InputService {
    if (!InputService.instance) {
      InputService.instance = new InputService();
    }
    return InputService.instance;
  }

  // Legacy method kept for compatibility with unused MobileControls component
  public updateMobileInput(action: keyof ControllerInput, pressed: boolean) {
      // Virtual gamepad support has been removed to prevent emulator conflicts.
  }

  public getInput(): ControllerInput {
    // Initialize with false
    const result: ControllerInput = {
      up: false, down: false, left: false, right: false,
      a: false, b: false, x: false, y: false,
      l: false, r: false, start: false, select: false
    };

    // 1. Keyboard Mappings
    result.up = this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp');
    result.down = this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown');
    result.left = this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft');
    result.right = this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight');

    result.a = this.keysPressed.has('KeyX') || this.keysPressed.has('KeyK');
    result.b = this.keysPressed.has('KeyZ') || this.keysPressed.has('KeyJ');
    result.x = this.keysPressed.has('KeyI'); 
    result.y = this.keysPressed.has('KeyU');
    
    result.l = this.keysPressed.has('KeyQ');
    result.r = this.keysPressed.has('KeyW'); 
    
    result.start = this.keysPressed.has('Enter');
    result.select = this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight');

    // 2. Poll Native Gamepads
    // We strictly use native gamepads now to avoid conflicts with emulator cores.
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gamepad = gamepads[0]; // Primary controller

    if (gamepad) {
      // Merge Gamepad inputs (OR logic)
      
      // Face Buttons (Standard/Xbox Layout)
      result.b = result.b || gamepad.buttons[0]?.pressed || false; // Bottom
      result.a = result.a || gamepad.buttons[1]?.pressed || false; // Right
      result.y = result.y || gamepad.buttons[2]?.pressed || false; // Left
      result.x = result.x || gamepad.buttons[3]?.pressed || false; // Top
      
      result.l = result.l || gamepad.buttons[4]?.pressed || false;
      result.r = result.r || gamepad.buttons[5]?.pressed || false;
      
      result.select = result.select || gamepad.buttons[8]?.pressed || false;
      result.start = result.start || gamepad.buttons[9]?.pressed || false;

      // D-Pad
      result.up = result.up || gamepad.buttons[12]?.pressed || false;
      result.down = result.down || gamepad.buttons[13]?.pressed || false;
      result.left = result.left || gamepad.buttons[14]?.pressed || false;
      result.right = result.right || gamepad.buttons[15]?.pressed || false;
      
      // Axes (Threshold 0.5)
      if (gamepad.axes) {
          result.left = result.left || (gamepad.axes[0] < -0.5);
          result.right = result.right || (gamepad.axes[0] > 0.5);
          result.up = result.up || (gamepad.axes[1] < -0.5);
          result.down = result.down || (gamepad.axes[1] > 0.5);
      }
    }

    return result;
  }
}