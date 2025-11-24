import React, { useState } from 'react';

interface LobbyProps {
  onCreate: () => void;
  onJoin: (id: string) => void;
  isConnecting: boolean;
}

export const Lobby: React.FC<LobbyProps> = ({ onCreate, onJoin, isConnecting }) => {
  const [joinId, setJoinId] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 lg:p-8 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-900/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-900/20 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="max-w-md w-full bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-6 sm:p-8 rounded-2xl shadow-2xl relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-800 rounded-2xl mb-4 text-indigo-400">
                <i className="ph ph-game-controller text-4xl"></i>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">RetroLink</h1>
            <p className="text-zinc-400 text-sm sm:text-base">Low-latency P2P multiplayer emulation.</p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={onCreate}
              disabled={isConnecting}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all transform active:scale-95 shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                  <i className="ph ph-spinner animate-spin text-xl"></i>
              ) : (
                  <i className="ph ph-plus-circle text-xl"></i>
              )}
              Create New Session
            </button>
            
            <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-zinc-800"></span>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-zinc-900 px-2 text-zinc-500">Or Join Existing</span>
                </div>
            </div>

            <div className="flex gap-2">
                <input 
                    type="text" 
                    placeholder="Enter Session ID..."
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder-zinc-600 text-sm"
                />
                <button 
                    onClick={() => onJoin(joinId)}
                    disabled={!joinId || isConnecting}
                    className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Join
                </button>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-xs text-zinc-600">
                Supported: NES • SNES • GB • GBA • Genesis • PSX
            </p>
          </div>
        </div>
    </div>
  );
};