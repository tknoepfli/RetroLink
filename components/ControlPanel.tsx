import React from 'react';
import { Platform } from '../types';

interface ControlPanelProps {
  isHost: boolean;
  currentPlatform: Platform;
  romName: string | null;
  onRomSelect: (file: File) => void;
  onSaveState: () => void;
  onLoadState: () => void;
  onReset: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  onClose?: () => void;
  enableCRT: boolean;
  onToggleCRT: (enabled: boolean) => void;
}

const ALL_EXTENSIONS = ".nes,.sfc,.smc,.gb,.gba,.smd,.gen,.bin,.md,.iso,.img,.cue";

const SYSTEMS = [
    { id: Platform.NES, label: 'NES', activeClass: 'bg-red-500/10 border-red-500/50 text-red-200 shadow-[0_0_15px_-3px_rgba(239,68,68,0.3)]' },
    { id: Platform.SNES, label: 'SNES', activeClass: 'bg-indigo-500/10 border-indigo-500/50 text-indigo-200 shadow-[0_0_15px_-3px_rgba(99,102,241,0.3)]' },
    { id: Platform.GB, label: 'GAME BOY', activeClass: 'bg-emerald-500/10 border-emerald-500/50 text-emerald-200 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]' },
    { id: Platform.GBA, label: 'GBA', activeClass: 'bg-purple-500/10 border-purple-500/50 text-purple-200 shadow-[0_0_15px_-3px_rgba(168,85,247,0.3)]' },
    { id: Platform.GENESIS, label: 'GENESIS', activeClass: 'bg-amber-500/10 border-amber-500/50 text-amber-200 shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)]' },
    { id: Platform.PSX, label: 'PSX', activeClass: 'bg-blue-500/10 border-blue-500/50 text-blue-200 shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]' },
];

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isHost,
  currentPlatform,
  romName,
  onRomSelect,
  onSaveState,
  onLoadState,
  onReset,
  volume,
  onVolumeChange,
  onClose,
  enableCRT,
  onToggleCRT
}) => {
  return (
    <div className="bg-zinc-900 flex flex-col w-full h-full relative">
      
      {/* Header & Title */}
      <div className="p-6 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-4 relative">
            <div className="space-y-1">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <i className="ph ph-sliders-horizontal"></i> Settings
                </h2>
                <p className="text-xs text-zinc-500">Session Controls</p>
            </div>
            {/* Absolute positioning ensures this button is never pushed out of view */}
            {onClose && (
                <button 
                    onClick={onClose}
                    className="p-3 text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 backdrop-blur rounded-full shadow-lg transition-all z-50 border border-zinc-700"
                    aria-label="Close Settings"
                >
                    <i className="ph ph-x text-xl font-bold"></i>
                </button>
            )}
          </div>
          <hr className="border-zinc-800" />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
          
          {/* 1. Supported Systems Grid (Visual Only) */}
          <div className="space-y-2">
            <div className="flex justify-between items-end">
                <label className="text-sm font-semibold text-zinc-400">Supported Systems</label>
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono">Auto-Detect</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                {SYSTEMS.map((sys) => {
                    const isActive = currentPlatform === sys.id;
                    return (
                        <div 
                            key={sys.id}
                            className={`flex flex-col items-center justify-center p-3 rounded-md border transition-all cursor-default select-none ${isActive ? sys.activeClass : 'bg-zinc-800/50 border-zinc-800 text-zinc-600 opacity-60'}`}
                        >
                            <span className="text-[10px] font-black tracking-widest">{sys.label}</span>
                        </div>
                    );
                })}
            </div>
          </div>

          {/* 2. ROM Loader - Hidden for Guest */}
          {isHost && (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-400">Game ROM</label>
            <label className={`group flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg transition-all relative overflow-hidden ${!isHost ? 'opacity-50 cursor-not-allowed border-zinc-700' : 'cursor-pointer border-zinc-700 hover:border-indigo-500 hover:bg-zinc-800/50'}`}>
                <div className="flex flex-col items-center justify-center p-4 z-10 w-full">
                    <i className={`ph ph-floppy-disk-back text-2xl mb-2 ${romName ? 'text-indigo-400' : 'text-zinc-500'}`}></i>
                    <p className="text-xs text-zinc-300 font-medium px-2 text-center truncate w-full">
                        {romName ? romName : "Load ROM File"}
                    </p>
                    <span className="mt-2 text-[10px] text-zinc-500 uppercase tracking-wide bg-zinc-900/50 px-2 py-1 rounded">
                        Click to Upload
                    </span>
                </div>
                <input 
                    type="file" 
                    className="hidden" 
                    onChange={(e) => e.target.files && e.target.files[0] && onRomSelect(e.target.files[0])}
                    accept={ALL_EXTENSIONS} 
                />
                {romName && <div className="absolute bottom-0 left-0 h-1 bg-indigo-500 w-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>}
            </label>
          </div>
          )}

          {/* 3. Game State Controls - Hidden for Guest */}
          {isHost && (
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-400">Game State</label>
            
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={onSaveState}
                disabled={!isHost || !romName}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm transition-colors disabled:opacity-50"
              >
                <i className="ph ph-floppy-disk"></i> Save
              </button>
              <button 
                onClick={onLoadState}
                disabled={!isHost || !romName}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm transition-colors disabled:opacity-50"
              >
                <i className="ph ph-upload-simple"></i> Load
              </button>
            </div>

            <button 
              onClick={onReset}
              disabled={!isHost || !romName}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-900/10 hover:bg-red-900/20 text-red-400 border border-red-900/30 rounded-md text-sm transition-colors disabled:opacity-50"
            >
              <i className="ph ph-power"></i> Power Off Console
            </button>
          </div>
          )}

          {/* 4. Display Options (CRT Filter) */}
          <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-400">Display</label>
              <div className="flex items-center justify-between bg-zinc-800 p-3 rounded-lg">
                  <span className="text-sm text-zinc-300">CRT Filter</span>
                  <button 
                    onClick={() => onToggleCRT(!enableCRT)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableCRT ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                  >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableCRT ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
              </div>
          </div>

          <hr className="border-zinc-800" />

          {/* 5. Volume */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-zinc-400">Master Volume</label>
              <span className="text-xs text-zinc-500">{Math.round(volume * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* 6. Instructions */}
          <div className="mt-4 bg-zinc-800/30 p-4 rounded-lg border border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">Controls</h3>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-zinc-500 font-mono">
              <span>D-Pad / WASD</span>
              <span className="text-right">Move</span>
              <span>X / K</span>
              <span className="text-right">A Button</span>
              <span>Z / J</span>
              <span className="text-right">B Button</span>
            </div>
          </div>
      </div>
    </div>
  );
};