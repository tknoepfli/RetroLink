import React, { useEffect, useRef } from 'react';

interface EmulatorScreenProps {
  onScreenReady: (container: HTMLDivElement) => void;
  enableCRT: boolean;
}

export const EmulatorScreen: React.FC<EmulatorScreenProps> = ({ onScreenReady, enableCRT }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      onScreenReady(containerRef.current);
    }
  }, [onScreenReady]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full bg-black rounded-lg overflow-hidden border border-zinc-800 shadow-2xl ${enableCRT ? 'screen-glow' : ''}`}
    >
      {/* Static/Noise Canvas - Default background */}
      {/* image-rendering: pixelated ensures the 640x480 stream looks sharp, not blurry, when scaled up */}
      <canvas 
        className="static-screen absolute inset-0 w-full h-full object-contain block z-0"
        style={{ imageRendering: 'pixelated' }}
      />
      
      {/* Emulator Canvas is injected dynamically by VirtualConsole.ts to #emulator-canvas */}
      
      {/* CRT Overlay Effects */}
      {enableCRT && (
        <div className="scanlines pointer-events-none absolute inset-0 z-20"></div>
      )}
    </div>
  );
};