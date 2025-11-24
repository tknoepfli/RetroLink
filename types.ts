export enum ConnectionRole {
  HOST = 'HOST',
  GUEST = 'GUEST',
  NONE = 'NONE'
}

export enum Platform {
  NES = 'Nintendo Entertainment System',
  SNES = 'Super Nintendo',
  GB = 'Game Boy',
  GBA = 'Game Boy Advance',
  GENESIS = 'Sega Genesis',
  PSX = 'PlayStation'
}

export interface PlayerState {
  id: string;
  connected: boolean;
  color: string;
  x: number;
  y: number;
  input: ControllerInput;
}

export interface ControllerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean; // Primary action
  b: boolean; // Secondary action
  x?: boolean; // Tertiary
  y?: boolean; // Quaternary
  l?: boolean; // Left Shoulder
  r?: boolean; // Right Shoulder
  start: boolean;
  select: boolean;
}

// Data sent over PeerJS
export interface PeerMessage {
  type: 'INPUT' | 'STATE_UPDATE' | 'PLATFORM_CHANGE' | 'ROM_LOAD' | 'SAVE_RESTORE' | 'CHAT';
  payload: any;
}

export interface GameState {
  p1: PlayerState;
  p2: PlayerState;
  ball?: { x: number; y: number; dx: number; dy: number };
  timestamp: number;
}