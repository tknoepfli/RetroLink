import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { Lobby } from './components/Lobby';
import { EmulatorScreen } from './components/EmulatorScreen';
import { ControlPanel } from './components/ControlPanel';
import { ConnectionRole, Platform, PeerMessage, ControllerInput } from './types';
import { VirtualConsole } from './engine/VirtualConsole';
import { InputService } from './services/inputService';
import { AudioService } from './services/audioService';

const detectPlatform = (filename: string): Platform => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'nes') return Platform.NES;
  if (['sfc', 'smc'].includes(ext || '')) return Platform.SNES;
  if (ext === 'gb') return Platform.GB;
  if (ext === 'gba') return Platform.GBA;
  if (['smd', 'gen', 'bin', 'md'].includes(ext || '')) return Platform.GENESIS;
  if (['iso', 'img', 'cue'].includes(ext || '')) return Platform.PSX;
  return Platform.SNES; // Default
};

const App: React.FC = () => {
  // State
  const [role, setRole] = useState<ConnectionRole>(ConnectionRole.NONE);
  const [myId, setMyId] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [platform, setPlatform] = useState<Platform>(Platform.SNES);
  const [romName, setRomName] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.5);
  const [notification, setNotification] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [enableCRT, setEnableCRT] = useState(false);
  const [isGamepadConnected, setIsGamepadConnected] = useState(false);
  
  // Refs for stable access in gameLoop without triggering re-renders/re-creation
  const roleRef = useRef(role);
  const romNameRef = useRef(romName);
  const platformRef = useRef(platform);
  const connRef = useRef<DataConnection | null>(null);
  const consoleRef = useRef<VirtualConsole | null>(null);
  const inputService = useRef(InputService.getInstance());
  const audioService = useRef<AudioService | null>(null);
  const loopRef = useRef<number>(0);
  const peerRef = useRef<Peer | null>(null);
  
  // Sync refs with state
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { romNameRef.current = romName; }, [romName]);
  useEffect(() => { platformRef.current = platform; }, [platform]);

  // Streaming Refs
  const guestVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const currentStream = useRef<MediaStream | null>(null);

  // --- Initialization ---

  // Initialize Audio once
  useEffect(() => {
    audioService.current = new AudioService();
    // Setup hidden video element for Guest streaming
    guestVideoRef.current.autoplay = true;
    guestVideoRef.current.muted = true; 
    guestVideoRef.current.playsInline = true;
  }, []);

  // Monitor Gamepad Connection
  useEffect(() => {
    const checkGamepad = () => {
        const gps = navigator.getGamepads ? navigator.getGamepads() : [];
        const hasGamepad = Array.from(gps).some(gp => gp !== null);
        setIsGamepadConnected(hasGamepad);
    };

    window.addEventListener("gamepadconnected", checkGamepad);
    window.addEventListener("gamepaddisconnected", checkGamepad);
    
    // Initial check
    checkGamepad();

    return () => {
        window.removeEventListener("gamepadconnected", checkGamepad);
        window.removeEventListener("gamepaddisconnected", checkGamepad);
    };
  }, []);

  const resumeAudio = useCallback(async () => {
      if (audioService.current) {
          await audioService.current.resume();
      }
  }, []);

  // Initialize Peer
  const initPeer = useCallback(() => {
    if (peerRef.current) {
        if (!peerRef.current.destroyed) peerRef.current.destroy();
    }

    const newPeer = new Peer(); 
    peerRef.current = newPeer;

    newPeer.on('open', (id) => {
      setMyId(id);
      setIsConnecting(false);
    });

    newPeer.on('connection', (connection) => {
      handleConnection(connection);
    });

    newPeer.on('call', (call) => {
        console.log("Receiving call (Stream)...");
        call.answer(undefined); 
        call.on('stream', (remoteStream) => {
            console.log("Stream received!");
            guestVideoRef.current.srcObject = remoteStream;
            guestVideoRef.current.play().catch(e => console.error("Video play error", e));
        });
    });

    newPeer.on('disconnected', () => {
        console.log("Peer disconnected from signaling server.");
        if (newPeer && !newPeer.destroyed) {
            newPeer.reconnect();
        }
    });

    newPeer.on('error', (err) => {
      console.error("Peer Error:", err);
      if (err.type === 'peer-unavailable') {
         showNotification('Peer unavailable - check ID');
      } else if (err.type === 'unavailable-id') {
         showNotification('ID unavailable - try again');
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
         console.warn("Network/Server error, waiting for recovery...");
      } else {
         showNotification('Connection Error: ' + err.type);
         setIsConnecting(false);
      }
    });

    // setPeer(newPeer); // Removed setPeer state to avoid unnecessary re-renders if not needed for UI
    return newPeer;
  }, []);

  const handleConnection = (connection: DataConnection) => {
    connRef.current = connection;
    // Force update to show connected status in UI if needed (using notification or separate state)
    // For now we rely on the ref for logic, but we might want a 'isConnected' state for UI
    
    connection.on('open', () => {
      showNotification('Peer Connected!');
      if (consoleRef.current && roleRef.current === ConnectionRole.HOST) {
            connection.send({ type: 'PLATFORM_CHANGE', payload: platformRef.current } as PeerMessage);
            if (romNameRef.current) {
                connection.send({ type: 'ROM_LOAD', payload: { name: romNameRef.current } } as PeerMessage);
                startStreaming(connection.peer);
            }
      }
    });

    connection.on('data', (data: any) => {
        const msg = data as PeerMessage;
        handlePeerMessage(msg);
    });

    connection.on('close', () => {
      showNotification('Peer Disconnected');
      connRef.current = null;
      if (consoleRef.current) {
        consoleRef.current.setPlayerConnected('p2', false);
      }
    });
  };

  const startStreaming = (destId: string) => {
      if (!peerRef.current || !consoleRef.current) return;
      try {
          const stream = consoleRef.current.captureStream(30);
          currentStream.current = stream;
          peerRef.current.call(destId, stream);
          console.log("Started streaming to", destId);
      } catch (e) {
          console.error("Failed to capture stream", e);
      }
  };

  const handlePeerMessage = (msg: PeerMessage) => {
    if (!consoleRef.current) return;

    switch (msg.type) {
        case 'INPUT':
            if (roleRef.current === ConnectionRole.HOST) {
               // Store input logic if needed
            }
            break;
        case 'STATE_UPDATE':
            if (roleRef.current === ConnectionRole.GUEST) {
                consoleRef.current.setState(msg.payload);
            }
            break;
        case 'PLATFORM_CHANGE':
            setPlatform(msg.payload);
            setRomName(null); 
            consoleRef.current.setPlatform(msg.payload);
            showNotification(`Host switched core to ${msg.payload}`);
            break;
        case 'ROM_LOAD':
            setRomName(msg.payload.name);
            showNotification(`Loaded Game: ${msg.payload.name}`);
            break;
    }
  };

  const createSession = () => {
    resumeAudio(); 
    setIsConnecting(true);
    setRole(ConnectionRole.HOST);
    initPeer();
  };

  const joinSession = (hostId: string) => {
    if (!hostId) return;
    resumeAudio(); 
    setIsConnecting(true);
    setRole(ConnectionRole.GUEST);
    const p = initPeer();
    
    p.on('open', () => {
        const connection = p.connect(hostId);
        handleConnection(connection);
    });
  };

  // --- Engine Loop ---

  // Stable Game Loop - No dependencies to prevent recreation
  const gameLoop = useCallback(() => {
    if (!consoleRef.current) return;

    const myInput = inputService.current.getInput();
    const currentRole = roleRef.current;
    const currentConn = connRef.current;

    if (currentRole === ConnectionRole.HOST) {
        // Host rendering handles by Nostalgist or static fallback
        consoleRef.current.render();

        // Optional handshake state sync
        if (currentConn && currentConn.open && !consoleRef.current.isRomLoaded) {
            const state = consoleRef.current.getState();
            currentConn.send({ type: 'STATE_UPDATE', payload: state } as PeerMessage);
        }
    } else if (currentRole === ConnectionRole.GUEST) {
        // Send Input
        if (currentConn && currentConn.open) {
            currentConn.send({ type: 'INPUT', payload: myInput } as PeerMessage);
        }

        // Render Guest View
        if (consoleRef.current.isRomLoaded || romNameRef.current) {
             if (guestVideoRef.current.readyState >= 2) {
                 consoleRef.current.renderVideo(guestVideoRef.current);
             }
        } else {
            consoleRef.current.render();
        }
    }

    loopRef.current = requestAnimationFrame(gameLoop);
  }, []); // Empty dependency array = Stable Reference

  const onScreenReady = useCallback((container: HTMLDivElement) => {
    // Only initialize if we haven't already or if container changed significantly
    // However, consoleRef checks prevent double init usually.
    // We strictly want to avoid destroying the console if it's just a state change.
    
    if (consoleRef.current && consoleRef.current.container === container) {
        return; // Already initialized on this container
    }

    if (consoleRef.current) {
      consoleRef.current.destroy();
    }

    const isHost = roleRef.current === ConnectionRole.HOST;
    consoleRef.current = new VirtualConsole(container, isHost, audioService.current!);
    
    // Set initial platform
    consoleRef.current.setPlatform(platformRef.current);
    
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    loopRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]); // Only depends on the stable gameLoop

  useEffect(() => {
    return () => {
        if (loopRef.current) cancelAnimationFrame(loopRef.current);
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        // Explicitly destroy the VirtualConsole instance to clean up emulators
        if (consoleRef.current) {
            consoleRef.current.destroy();
            consoleRef.current = null;
        }
    };
  }, []);

  // --- Host Controls ---

  const handlePlatformChange = (p: Platform) => {
    setPlatform(p);
    setRomName(null);
    if (consoleRef.current) {
        consoleRef.current.setPlatform(p);
    }
    if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'PLATFORM_CHANGE', payload: p } as PeerMessage);
    }
  };

  const handleRomSelect = async (file: File) => {
      resumeAudio();
      const detectedPlatform = detectPlatform(file.name);
      
      // Update platform state if needed
      if (detectedPlatform !== platform) {
        setPlatform(detectedPlatform); // triggers render
        if (connRef.current?.open) {
            connRef.current.send({ type: 'PLATFORM_CHANGE', payload: detectedPlatform } as PeerMessage);
        }
      }

      setRomName(file.name); // triggers render
      
      // Use a timeout to allow React state updates to flush before loading ROM
      // This is a safety measure, though refs should handle stability now.
      setTimeout(async () => {
        if (consoleRef.current) {
            consoleRef.current.setPlatform(detectedPlatform); // Update internal platform of VC
            await consoleRef.current.loadRom(file);
            
            showNotification(`Loaded ${file.name}`);
            
            if (connRef.current && connRef.current.open) {
                startStreaming(connRef.current.peer);
                connRef.current.send({ type: 'ROM_LOAD', payload: { name: file.name } } as PeerMessage);
            }
        }
      }, 50);
  };

  const handleSaveState = async () => {
    if (!consoleRef.current || !consoleRef.current.isRomLoaded) {
      showNotification("No game running to save");
      return;
    }

    const blob = await consoleRef.current.saveState();
    if (blob) {
      // Create a distinct filename: GameName_YYYY-MM-DDTHH-mm.sav
      const cleanName = (romNameRef.current || 'game').replace(/\.[^/.]+$/, "");
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${cleanName}_${timestamp}.sav`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showNotification("State Saved & Downloaded");
    } else {
      showNotification("Failed to save state");
    }
  };

  const handleLoadState = () => {
    if (!consoleRef.current || !consoleRef.current.isRomLoaded) {
      showNotification("Load a game first");
      return;
    }

    // Create a temporary file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sav,.state,.blob';
    
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        try {
          await consoleRef.current!.loadState(target.files[0]);
          showNotification("State Loaded");
        } catch (err) {
          console.error(err);
          showNotification("Failed to load state file");
        }
      }
    };
    
    input.click();
  };
  
  const handlePowerOff = async () => {
    if (consoleRef.current) {
        await consoleRef.current.stop();
        setRomName(null);
        showNotification("Console Powered Off");
    }
  };

  const handleVolumeChange = (v: number) => {
      setVolume(v);
      if (audioService.current) audioService.current.setVolume(v);
      if (consoleRef.current) consoleRef.current.setVolume(v);
  };

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 3000);
  };

  const copyId = () => {
      navigator.clipboard.writeText(myId);
      showNotification("Session ID Copied!");
  };

  const copyLink = () => {
      const url = `${window.location.origin}${window.location.pathname}?join=${myId}`;
      navigator.clipboard.writeText(url);
      showNotification("Join Link Copied!");
  };

  // --- Render ---

  if (role === ConnectionRole.NONE) {
    return <Lobby onCreate={createSession} onJoin={joinSession} isConnecting={isConnecting} />;
  }

  // Helper to determine player indicator status
  // P1 active if Host + Gamepad, or if Guest + Connected to Host (Host is P1)
  const p1Connected = role === ConnectionRole.HOST ? isGamepadConnected : !!connRef.current;
  // P2 active if Host + Connected to Guest, or if Guest + Gamepad (Guest is P2)
  const p2Connected = role === ConnectionRole.HOST ? !!connRef.current : isGamepadConnected;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 lg:px-6 bg-zinc-900/50 backdrop-blur-md z-20">
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <i className="ph ph-game-controller text-white text-lg"></i>
                </div>
                <div className="hidden sm:block">
                    <h1 className="font-bold text-sm tracking-wide">RETRO<span className="text-indigo-400">LINK</span></h1>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{role} MODE</span>
                </div>
            </div>

            <div className="flex items-center gap-3 lg:gap-4">
                {role === ConnectionRole.HOST && (
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full pl-3 pr-1 py-1 max-w-[150px] sm:max-w-none">
                        <span className="text-xs text-zinc-400 font-mono truncate">{myId || 'Generating...'}</span>
                        <button onClick={copyId} className="p-1.5 hover:bg-zinc-700 rounded-full text-zinc-300 transition-colors flex-shrink-0" title="Copy ID">
                            <i className="ph ph-copy"></i>
                        </button>
                        <div className="w-px h-3 bg-zinc-700 mx-0.5"></div>
                        <button onClick={copyLink} className="p-1.5 hover:bg-zinc-700 rounded-full text-zinc-300 transition-colors flex-shrink-0" title="Copy Join Link">
                            <i className="ph ph-link"></i>
                        </button>
                    </div>
                )}
                
                <div className={`hidden sm:flex px-3 py-1 rounded-full text-xs font-medium items-center gap-1.5 ${connRef.current ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-900/50' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-900/50'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${connRef.current ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`}></div>
                    {connRef.current ? 'P2 CONNECTED' : 'WAITING FOR P2'}
                </div>

                 {/* Settings Toggle (Visible on all screens now) */}
                 <button 
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className={`p-2 rounded-lg transition-colors ${isSettingsOpen ? 'bg-zinc-800 text-indigo-400' : 'hover:bg-zinc-800 text-zinc-400'}`}
                >
                    <i className="ph ph-gear text-lg"></i>
                </button>

                <button 
                  onClick={() => window.location.reload()} 
                  className="p-2 hover:bg-red-900/20 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
                  title="Leave Session"
                >
                    <i className="ph ph-sign-out text-lg"></i>
                </button>
            </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden relative">
            {/* Game Area */}
            <main className="flex-1 flex flex-col items-center justify-center bg-black/50 p-4 lg:p-6 relative w-full">
                 {/* Notification Toast */}
                 {notification && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium animate-bounce whitespace-nowrap">
                        {notification}
                    </div>
                )}

                <div className="w-full max-w-4xl relative">
                   <EmulatorScreen onScreenReady={onScreenReady} enableCRT={enableCRT} />
                   
                   <div className="mt-4 flex justify-between items-center text-zinc-500 text-xs font-mono">
                       <span>CORE: {platform}</span>
                       <div className="flex gap-4">
                           <span className={`flex items-center gap-1 ${p1Connected ? 'text-emerald-400' : 'text-zinc-600'}`}>
                               <i className="ph ph-game-controller"></i> {role === ConnectionRole.HOST ? 'P1' : 'P1 (HOST)'}
                           </span>
                           <span className={`flex items-center gap-1 ${p2Connected ? 'text-emerald-400' : 'text-zinc-600'}`}>
                               <i className="ph ph-game-controller"></i> {role === ConnectionRole.HOST ? 'P2 (GUEST)' : 'P2'}
                           </span>
                       </div>
                   </div>
                </div>
            </main>

            {/* Settings Drawer - Now overlaid on all screens */}
            
            {/* Backdrop */}
            {isSettingsOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
                    onClick={() => setIsSettingsOpen(false)}
                />
            )}

            {/* Drawer */}
            <aside className={`
                fixed top-0 right-0 bottom-0 w-80 bg-zinc-900 border-l border-zinc-800 z-50
                transform transition-transform duration-300 ease-in-out shadow-2xl
                ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}
            `}>
                <ControlPanel 
                    isHost={role === ConnectionRole.HOST}
                    currentPlatform={platform}
                    romName={romName}
                    onRomSelect={handleRomSelect}
                    onSaveState={handleSaveState}
                    onLoadState={handleLoadState}
                    onReset={handlePowerOff}
                    volume={volume}
                    onVolumeChange={handleVolumeChange}
                    onClose={() => setIsSettingsOpen(false)}
                    enableCRT={enableCRT}
                    onToggleCRT={setEnableCRT}
                />
            </aside>
        </div>
    </div>
  );
};

export default App;