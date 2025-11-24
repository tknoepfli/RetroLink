import React, { useRef, useEffect } from 'react';

interface MobileControlsProps {
  onInput: (button: string, pressed: boolean) => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({ onInput }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Helper to extract button ID and trigger callback
    const trigger = (e: Event, pressed: boolean) => {
        // Prevent default browser behaviors (scrolling, zooming, context menu)
        if (e.cancelable) e.preventDefault();
        
        // Find the closest button element (target might be an icon inside)
        const target = (e.target as HTMLElement).closest('[data-btn]');
        if (target) {
            const btn = (target as HTMLElement).dataset.btn;
            if (btn) {
                onInput(btn, pressed);
                // Haptic feedback
                if (pressed && navigator.vibrate) {
                    try { navigator.vibrate(15); } catch (_) {}
                }
            }
        }
    };

    const handleDown = (e: Event) => trigger(e, true);
    const handleUp = (e: Event) => trigger(e, false);

    // Select all button elements via data attribute
    const buttons = container.querySelectorAll('[data-btn]');

    // Attach Pointer Events (covers Touch and Mouse) for lower latency and better capture
    const opts = { passive: false };
    
    buttons.forEach((btn) => {
        btn.addEventListener('pointerdown', handleDown, opts);
        btn.addEventListener('pointerup', handleUp, opts);
        btn.addEventListener('pointerleave', handleUp, opts); 
        btn.addEventListener('pointercancel', handleUp, opts);
        
        // Disable context menu on buttons to prevent long-press issues
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    return () => {
        buttons.forEach((btn) => {
            btn.removeEventListener('pointerdown', handleDown);
            btn.removeEventListener('pointerup', handleUp);
            btn.removeEventListener('pointerleave', handleUp);
            btn.removeEventListener('pointercancel', handleUp);
            btn.removeEventListener('contextmenu', (e) => e.preventDefault());
        });
    };
  }, [onInput]);

  // Reusable Button UI Component
  // Note: We use data-btn to identify the input for the logic above.
  const Btn = ({ button, label, color, className, icon }: any) => (
    <div
      data-btn={button}
      className={`relative flex items-center justify-center rounded-full shadow-lg active:scale-90 transition-transform duration-75 select-none touch-none border border-white/10 backdrop-blur-md overflow-hidden cursor-pointer ${color} ${className}`}
      style={{ touchAction: 'none' }} // Crucial for preventing browser gestures
    >
      {icon ? <i className={`ph ${icon} text-2xl relative z-10 pointer-events-none`}></i> : <span className="font-bold text-xl relative z-10 pointer-events-none">{label}</span>}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none"></div>
    </div>
  );

  const DPad = () => (
    <div className="relative w-44 h-44 pointer-events-auto">
        <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-xl rounded-full border border-white/5 shadow-2xl"></div>
        <div className="absolute inset-2 grid grid-cols-3 grid-rows-3 gap-1">
            <div className="col-start-2 row-start-1">
                <Btn button="up" icon="ph-caret-up" color="bg-zinc-800 text-zinc-300 active:bg-zinc-700" className="w-full h-full !rounded-none rounded-t-xl" />
            </div>
            <div className="col-start-1 row-start-2">
                <Btn button="left" icon="ph-caret-left" color="bg-zinc-800 text-zinc-300 active:bg-zinc-700" className="w-full h-full !rounded-none rounded-l-xl" />
            </div>
            <div className="col-start-3 row-start-2">
                <Btn button="right" icon="ph-caret-right" color="bg-zinc-800 text-zinc-300 active:bg-zinc-700" className="w-full h-full !rounded-none rounded-r-xl" />
            </div>
            <div className="col-start-2 row-start-3">
                <Btn button="down" icon="ph-caret-down" color="bg-zinc-800 text-zinc-300 active:bg-zinc-700" className="w-full h-full !rounded-none rounded-b-xl" />
            </div>
            <div className="col-start-2 row-start-2 bg-zinc-800/80 rounded-sm flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-zinc-950/50 inset-shadow"></div>
            </div>
        </div>
    </div>
  );

  return (
    <div 
        ref={containerRef}
        id="mobile-controls-container" 
        className="absolute inset-0 z-50 pointer-events-none flex flex-col justify-end pb-6 px-4 select-none touch-none"
    >
      <div className="flex justify-between items-end w-full max-w-2xl mx-auto">
        
        {/* D-Pad Section */}
        <div className="mb-2">
           <DPad />
        </div>

        {/* Center Actions */}
        <div className="flex gap-3 mb-6 pointer-events-auto opacity-80">
            <div className="flex flex-col items-center gap-1">
                <Btn button="select" label="" className="w-14 h-8 bg-zinc-700/80 rounded-full border-none active:bg-zinc-600" />
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider shadow-black drop-shadow-md">Select</span>
            </div>
            <div className="flex flex-col items-center gap-1">
                <Btn button="start" label="" className="w-14 h-8 bg-zinc-700/80 rounded-full border-none active:bg-zinc-600" />
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider shadow-black drop-shadow-md">Start</span>
            </div>
        </div>

        {/* Face Buttons Section */}
        <div className="relative w-44 h-44 pointer-events-auto">
            <div className="absolute inset-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2">
                    <Btn button="x" label="X" color="bg-blue-600/90 text-white active:bg-blue-500" className="w-16 h-16 border-blue-400/30" />
                </div>
                <div className="absolute top-1/2 right-0 -translate-y-1/2">
                    <Btn button="a" label="A" color="bg-red-600/90 text-white active:bg-red-500" className="w-16 h-16 border-red-400/30" />
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                    <Btn button="b" label="B" color="bg-yellow-500/90 text-white active:bg-yellow-400" className="w-16 h-16 border-yellow-300/30" />
                </div>
                <div className="absolute top-1/2 left-0 -translate-y-1/2">
                    <Btn button="y" label="Y" color="bg-green-600/90 text-white active:bg-green-500" className="w-16 h-16 border-green-400/30" />
                </div>
            </div>
        </div>
      </div>
      
      {/* Shoulder Buttons */}
      <div className="absolute top-4 left-0 w-full px-4 flex justify-between pointer-events-auto opacity-40 hover:opacity-100 active:opacity-100 transition-opacity">
         <Btn button="l" label="L" color="bg-zinc-800/90 text-zinc-300 active:bg-zinc-700" className="w-24 h-12 rounded-2xl border-zinc-600/50" />
         <Btn button="r" label="R" color="bg-zinc-800/90 text-zinc-300 active:bg-zinc-700" className="w-24 h-12 rounded-2xl border-zinc-600/50" />
      </div>
    </div>
  );
};