import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GameMode, GameStatus } from '../types';
import VideoFeed from './VideoFeed';
import useBestScore from '../hooks/useBestScore';
import useFaceMesh from '../hooks/useFaceMesh';
import useRemoteFaceMesh from '../hooks/useRemoteFaceMesh'; // NEW
import useSimplePeer, { GameMessage } from '../hooks/useSimplePeer';
import useGlobalMultiplayer from '../hooks/useGlobalMultiplayer';
import useDistractions from '../hooks/useDistractions';
import useSession from '../hooks/useSession';
import CameraPermissionModal from './CameraPermissionModal';
import DistractionOverlay from './DistractionOverlay';
import EmailCaptureModal from './EmailCaptureModal';
import { EyeOpenIcon, EyeClosedIcon } from './icons/EyeIcons';
import { BLINK_THRESHOLD, BLINK_DURATION_MS } from '../constants';
import useEmailCapture from '../hooks/useEmailCapture';

interface AnonymousSession {
    id: string;
    username: string;
    gamesPlayed: number;
    totalTime: number;
    bestScore: number;
}

interface GameScreenProps {
    mode: GameMode;
    username: string;
    roomId: string | null;
    onExit: () => void;
    isHost: boolean;
    session?: AnonymousSession | null;
    globalMatchData?: any;
}

const GameScreen: React.FC<GameScreenProps> = ({ mode, username, roomId, onExit, isHost, session, globalMatchData }) => {
    const [gameStatus, setGameStatus] = useState(GameStatus.Idle);
    const [winner, setWinner] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(3);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [needsPermission, setNeedsPermission] = useState(false);
    const [isMyReady, setIsMyReady] = useState(false);
    const [gameStartTime, setGameStartTime] = useState<number | null>(null);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null); // NEW
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const bothEyesClosedStart = useRef<number | null>(null);
    
    const { bestScore, setBestScore } = useBestScore();
    const [score, setScore] = useState(0);
    const { session: currentSession, updateSessionStats } = useSession();

    const { 
        isReady: faceMeshReady, 
        leftEar, 
        rightEar, 
        isFaceCentered, 
        lightingQuality,
        startFaceMesh, 
    } = useFaceMesh(videoRef, canvasRef);
    
    // NEW: Remote face mesh hook for opponent video cropping
    const {
        isReady: remoteFaceMeshReady,
        hasFace: opponentHasFace
    } = useRemoteFaceMesh(remoteVideoRef, remoteCanvasRef);
    
    // Room-based multiplayer hook
    const { 
      connection,
      isConnected,
      remoteStream,
      opponent,
      createRoom,
      joinRoom,
      sendData,
      isOpponentReady,
      lastBlinkWinner,
      connectionError,
      connectionStatus
    } = useSimplePeer(username);

    // Global multiplayer hook
    const {
      currentMatch: globalMatch,
      submitGameResult,
    } = useGlobalMultiplayer();

    // Determine which multiplayer system to use
    const isGlobalMode = mode === GameMode.Global;
    const multiplayerData = isGlobalMode ? globalMatchData : null;
    // Use globalMatchData (prop) as fallback if globalMatch (from hook) is null
    const effectiveGlobalMatch = globalMatch || globalMatchData;
    const opponentData = isGlobalMode ? effectiveGlobalMatch?.opponent : opponent;

    // For Global mode, consider connected if we have remote stream
    const effectiveIsConnected = isGlobalMode ? (!!remoteStream && !!effectiveGlobalMatch) : isConnected;

    // Debug logging for connection status
    useEffect(() => {
        if (isGlobalMode) {
            console.log('🔍 Global Mode Connection Debug:', {
                remoteStream: !!remoteStream,
                globalMatch: !!globalMatch,
                globalMatchDataProp: !!globalMatchData,
                effectiveGlobalMatch: !!effectiveGlobalMatch,
                effectiveGlobalMatchData: effectiveGlobalMatch,
                opponentData,
                effectiveIsConnected,
                isConnected
            });
        }
    }, [isGlobalMode, remoteStream, globalMatch, globalMatchData, effectiveGlobalMatch, opponentData, effectiveIsConnected, isConnected]);

    // Initialize distraction system
    const {
        activeDistractions,
        removeDistraction,
        clearAllDistractions,
        triggerTestDistraction,
        triggerLightDistraction,
        triggerMediumDistraction,
        triggerHeavyDistraction
    } = useDistractions(gameStartTime, gameStatus === GameStatus.Playing);
    
    // Initialize email capture system
    const {
        shouldShowEmailModal,
        emailTrigger,
        hasSubmittedEmail,
        submitEmail,
        dismissEmailModal,
        triggerEmailModal
    } = useEmailCapture(currentSession || session, score, gameStatus);
    
    // Removed noisy render log

    // Ensure remote video gets the stream
    useEffect(() => {
        console.log('🎥 Remote video effect - remoteStream:', !!remoteStream, 'remoteVideoRef:', !!remoteVideoRef.current);
        if (remoteStream && remoteVideoRef.current) {
            console.log('🎥 Setting remote stream to video element:', remoteStream);
            remoteVideoRef.current.srcObject = remoteStream;
            
            remoteVideoRef.current.onloadedmetadata = () => {
                console.log('🎥 Remote video metadata loaded, attempting to play');
                remoteVideoRef.current?.play().then(() => {
                    console.log('🎥 Remote video started playing successfully');
                }).catch(err => {
                    console.error('❌ Error playing remote video:', err);
                });
            };
        } else if (remoteStream && !remoteVideoRef.current) {
            console.log('⚠️ Have remote stream but no video ref');
        } else if (!remoteStream && remoteVideoRef.current) {
            console.log('⚠️ Have video ref but no remote stream');
        }
    }, [remoteStream]);

    const handleCameraReady = useCallback(() => {
        setIsCameraReady(true);
        startFaceMesh();
    }, [startFaceMesh]);

    const requestCamera = useCallback(() => {
        setNeedsPermission(false);
        navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } 
        })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                handleCameraReady();
            })
            .catch((error) => {
                console.error('Camera access error:', error);
                setNeedsPermission(true);
            });
    }, [handleCameraReady]);

    useEffect(() => {
        requestCamera();
    }, [requestCamera]);

    useEffect(() => {
        if ((mode === GameMode.Multiplayer || mode === GameMode.Global) && roomId) {
            if (isHost) {
                console.log(`🏠 HOST: useEffect calling createRoom for ${mode === GameMode.Global ? 'matchId' : 'roomId'}:`, roomId);
                createRoom(roomId);
            } else {
                console.log(`👤 GUEST: useEffect calling joinRoom for ${mode === GameMode.Global ? 'matchId' : 'roomId'}:`, roomId);
                joinRoom(roomId);
            }
        }
    }, [mode, roomId, isHost]); // Removed createRoom, joinRoom from dependencies to prevent re-runs
    
    useEffect(() => {
        if (lastBlinkWinner) {
            setGameStatus(GameStatus.GameOver);
            setWinner(lastBlinkWinner);
            const gameTime = Date.now() - (gameStartTime || 0);
            const didWin = lastBlinkWinner.includes('Win');
            console.log('🎮 Multiplayer game ended! Duration:', gameTime, 'Won:', didWin);
            updateSessionStats(gameTime, didWin);
        }
    }, [lastBlinkWinner, gameStartTime, updateSessionStats]);

    const resetGame = useCallback(() => {
        setGameStatus(GameStatus.Idle);
        setScore(0);
        setWinner(null);
        setGameStartTime(null);
        bothEyesClosedStart.current = null;
        
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        
        if (mode === GameMode.Multiplayer) {
            setIsMyReady(false);
            sendData({type: 'READY_STATE', payload: { isReady: false }});
        }
        // Global mode doesn't need ready state reset as matches are automatically created
    }, [mode, sendData]);

    const handleReadyClick = useCallback(() => {
        setIsMyReady(true);
        sendData({type: 'READY_STATE', payload: { isReady: true }});
    }, [sendData]);

    const startCountdown = useCallback(() => {
        setGameStatus(GameStatus.Countdown);
        setCountdown(3);
        
        countdownIntervalRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev === 1) {
                    if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                        countdownIntervalRef.current = null;
                    }
                    setGameStatus(GameStatus.Playing);
                    const startTime = Date.now();
                    setGameStartTime(startTime); // Start distraction timer
                    console.log('🎮 Game started! Start time:', startTime);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (gameStatus === GameStatus.Playing) {
            const startTime = Date.now();
            const scoreInterval = setInterval(() => {
                setScore(Date.now() - startTime);
            }, 50);
            return () => clearInterval(scoreInterval);
        }
    }, [gameStatus]);
    
    useEffect(() => {
        console.log('🎮 Game start conditions check:', {
            mode,
            isMyReady,
            isOpponentReady,
            gameStatus,
            opponentData,
            isConnected,
            connectionStatus,
            opponent,
            globalMatch
        });

        if (mode === GameMode.Multiplayer && isMyReady && isOpponentReady && gameStatus === GameStatus.Idle) {
            console.log('🎯 Starting multiplayer game countdown!');
            startCountdown();
        }
        // Global mode will auto-start when both players are ready (handled via global multiplayer system)
        if (mode === GameMode.Global && isMyReady && opponentData && gameStatus === GameStatus.Idle) {
            console.log('🎯 Starting global game countdown!');
            startCountdown();
        }
    }, [mode, isMyReady, isOpponentReady, gameStatus, startCountdown, opponentData, isConnected, connectionStatus, opponent, globalMatch]);

    useEffect(() => {
        if (gameStatus !== GameStatus.Playing || !faceMeshReady) return;

        const leftClosed = leftEar < BLINK_THRESHOLD;
        const rightClosed = rightEar < BLINK_THRESHOLD;
        
        if (leftClosed && rightClosed) {
            if (bothEyesClosedStart.current === null) {
                bothEyesClosedStart.current = Date.now();
            } else if (Date.now() - bothEyesClosedStart.current > BLINK_DURATION_MS) {
                setGameStatus(GameStatus.GameOver);
                const gameTime = Date.now() - (gameStartTime || 0);
                console.log('🎮 Game ended! Duration:', gameTime, 'Session:', session);
                
                if (mode === GameMode.Multiplayer) {
                    sendData({ type: 'BLINK' });
                    setWinner('You Lose!');
                    updateSessionStats(gameTime, false);
                } else if (mode === GameMode.Global) {
                    setWinner('You Lose!');
                    // Submit result to global multiplayer system
                    if (opponentData) {
                        submitGameResult(gameTime, opponentData.username);
                    }
                    updateSessionStats(gameTime, false);
                } else {
                    setWinner('You blinked!');
                    if (score > bestScore) {
                        setBestScore(score);
                    }
                    updateSessionStats(gameTime, true);
                }
            }
        } else {
            bothEyesClosedStart.current = null;
        }
    }, [leftEar, rightEar, gameStatus, faceMeshReady, mode, bestScore, score, sendData, setBestScore, gameStartTime, session, updateSessionStats]);
    
    const getStatusMessage = (): string => {
        if (!isCameraReady) return "Waiting for camera access...\nPlease grant permission to play.";
        if (!faceMeshReady) return "Loading Face Detection Model...";
        
        if (lightingQuality === 'poor') {
            return "⚠️ Poor lighting detected!\nPlease improve lighting for better accuracy.";
        }
        
        if (gameStatus !== GameStatus.Playing && gameStatus !== GameStatus.Countdown) {
            if (!isFaceCentered) return "Please center your face in the frame.";
        }

        if (mode === GameMode.Multiplayer || mode === GameMode.Global) {
            if (connectionError) return `Connection Error:\n${connectionError}`;
            if (!effectiveIsConnected) {
                if (connectionStatus.includes('Connecting') || connectionStatus.includes('Trying')) {
                    return mode === GameMode.Multiplayer 
                        ? `${connectionStatus}\n${isHost ? `Room: ${roomId}` : `Joining: ${roomId}`}`
                        : connectionStatus;
                }
                return mode === GameMode.Multiplayer 
                    ? (isHost ? `Waiting for opponent...\nRoom: ${roomId}` : `Connecting to room: ${roomId}`)
                    : "Connecting to global matchmaking...";
            }
            if (!opponentData) return "Establishing connection...";
            if (gameStatus === GameStatus.Idle) {
                if (!isMyReady) return "Click 'Ready' to start";
                if (mode === GameMode.Multiplayer && !isOpponentReady) return `Waiting for ${opponentData.username}...`;
                if (mode === GameMode.Global) return `Waiting for ${opponentData.username}...`;
            }
        }
        
        if (gameStatus === GameStatus.Playing) return "Don't blink!";

        return "Ready to play!";
    };

    const formatTime = (ms: number) => {
        const seconds = ms / 1000;
        if (seconds >= 60) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${seconds.toFixed(2)}s`;
    };

    const renderScore = () => (
        <div className="flex gap-4 text-lg mb-4">
            <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
                Time: {formatTime(score)}
            </div>
            {mode === GameMode.SinglePlayer && (
                <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
                    Best: {formatTime(bestScore)}
                </div>
            )}
        </div>
    );
    
    const renderMangaEyePanel = (
        username: string, 
        leftEyeOpen: boolean, 
        rightEyeOpen: boolean, 
        isPlayer: boolean = true
    ) => (
        <div className="manga-eye-panel">
            <div className="flex flex-col items-center space-y-2">
                <div className="text-sm font-bold text-gray-300 mb-1">
                    {username}
                </div>
                
                <div className="manga-eye-container">
                    <div className={`manga-eye ${leftEyeOpen ? 'eye-open' : 'eye-closed'} ${isPlayer ? 'player-eye' : 'opponent-eye'}`}>
                        <div className="eye-content">
                            {leftEyeOpen ? <EyeOpenIcon /> : <EyeClosedIcon />}
                        </div>
                    </div>
                    <div className="eye-label">L</div>
                </div>
                
                <div className="manga-eye-container">
                    <div className={`manga-eye ${rightEyeOpen ? 'eye-open' : 'eye-closed'} ${isPlayer ? 'player-eye' : 'opponent-eye'}`}>
                        <div className="eye-content">
                            {rightEyeOpen ? <EyeOpenIcon /> : <EyeClosedIcon />}
                        </div>
                    </div>
                    <div className="eye-label">R</div>
                </div>
            </div>
        </div>
    );
    
    const renderControls = () => {
        if (gameStatus === GameStatus.GameOver) {
            return (
                <button className="btn-primary" onClick={resetGame}>
                    Play Again
                </button>
            );
        }
        if (mode === GameMode.SinglePlayer && gameStatus === GameStatus.Idle) {
            return (
                <button 
                    className="btn-primary" 
                    onClick={startCountdown} 
                    disabled={!faceMeshReady || !isFaceCentered || lightingQuality === 'poor'}
                >
                    Start Game
                </button>
            );
        }
        if ((mode === GameMode.Multiplayer || mode === GameMode.Global) && gameStatus === GameStatus.Idle) {
            return (
                <div className="space-y-2">
                    <button
                        className="btn-primary"
                        onClick={handleReadyClick}
                        disabled={isMyReady || !effectiveIsConnected || !opponentData || !!connectionError}
                    >
                        {isMyReady ? 'Ready ✓' : 'Ready'}
                    </button>
                    {connectionError && mode === GameMode.Multiplayer && (
                        <button 
                            className="btn-secondary text-sm" 
                            onClick={() => {
                                if (isHost && roomId) {
                                    createRoom(roomId);
                                } else if (roomId) {
                                    joinRoom(roomId);
                                }
                            }}
                        >
                            Retry Connection
                        </button>
                    )}
                </div>
            );
        }
        return null;
    };

    const renderConnectionStatus = () => {
        if (mode === GameMode.SinglePlayer) return null;
        
        const getStatusColor = () => {
            if (effectiveIsConnected && opponentData) return 'bg-green-500';
            if (connectionError) return 'bg-red-500';
            if (connectionStatus.includes('Connecting') || connectionStatus.includes('Trying') || connectionStatus.includes('Creating') || connectionStatus.includes('Joining')) return 'bg-yellow-500';
            return 'bg-gray-500';
        };
        
        return (
            <div className="mb-4 text-sm">
                <div className="flex items-center justify-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
                    <span className="text-gray-400">
                        {effectiveIsConnected && opponentData
                            ? `Connected to ${opponentData.username}`
                            : connectionStatus
                        }
                    </span>
                </div>
                {roomId && mode === GameMode.Multiplayer && (
                    <div className="text-gray-500 text-xs mt-1">
                        Room: {roomId}
                    </div>
                )}
            </div>
        );
    };
    
    return (
        <div className="w-full relative">
            <button onClick={onExit} className="absolute -top-12 right-0 btn-secondary z-10">
                Exit to Menu
            </button>
            
            <CameraPermissionModal isOpen={needsPermission} onRequest={requestCamera} />
            
            <EmailCaptureModal
                isOpen={shouldShowEmailModal}
                onSubmit={submitEmail}
                onDismiss={dismissEmailModal}
                trigger={emailTrigger || 'score'}
                stats={{
                    bestScore: session?.bestScore || 0,
                    gamesPlayed: session?.gamesPlayed || 0,
                    totalTime: session?.totalTime || 0
                }}
                currentUsername={username}
            />
            
            <div className="manga-video-container mb-4">
                <div className="manga-video-feed">
                    <div className="video-crop-wrapper">
                        <VideoFeed 
                            videoRef={videoRef} 
                            canvasRef={canvasRef} 
                            username={username} 
                            isMuted={true} 
                        />
                    </div>
                </div>
                {(mode === GameMode.Multiplayer || mode === GameMode.Global) && (
                    <div className="manga-video-feed">
                        <div className="video-crop-wrapper">
                            <VideoFeed 
                                videoRef={remoteVideoRef} 
                                canvasRef={remoteCanvasRef}  // CHANGED: Now has canvas
                                username={opponentData?.username || 'Waiting...'} 
                                isMuted={false} 
                                remoteStream={remoteStream} 
                                isRemote={true}  // NEW: Flag as remote
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 text-center w-full mx-auto shadow-lg relative">
                
                {/* Single Distraction Overlay handling multiple distractions */}
                <DistractionOverlay
                    isActive={activeDistractions.length > 0}
                    distractions={activeDistractions}
                    onComplete={(id: string) => removeDistraction(id)}
                />
                
                {renderConnectionStatus()}
                
                <div className="manga-battle-display mb-6">
                    {renderMangaEyePanel(
                        username, 
                        leftEar > BLINK_THRESHOLD, 
                        rightEar > BLINK_THRESHOLD, 
                        true
                    )}
                    
                    {(mode === GameMode.Multiplayer || mode === GameMode.Global) && (
                        <>
                            <div className="vs-divider">VS</div>
                            {renderMangaEyePanel(
                                opponentData?.username || 'Opponent', 
                                true,
                                true, 
                                false
                            )}
                        </>
                    )}
                </div>

                {renderScore()}

                <div className="my-4 min-h-24 flex items-center justify-center">
                    {gameStatus === GameStatus.Countdown && (
                        <div className="text-6xl font-bold text-purple-400">{countdown}</div>
                    )}
                    {gameStatus === GameStatus.GameOver && winner && (
                        <div className="text-3xl font-bold text-yellow-400">{winner}</div>
                    )}
                    {(gameStatus === GameStatus.Idle || gameStatus === GameStatus.Playing) && winner === null && (
                        <div className="text-xl text-gray-400 whitespace-pre-line text-center">
                            {getStatusMessage()}
                        </div>
                    )}
                </div>

                <div className="flex justify-center gap-4">
                    {renderControls()}
                </div>
                
                {/* Debug buttons for testing */}
                <div className="flex justify-center gap-2 mt-4 flex-wrap">
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={triggerLightDistraction}
                    >
                        2 Ads
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={triggerMediumDistraction}
                    >
                        6 Ads
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={triggerHeavyDistraction}
                    >
                        15 Ads
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={clearAllDistractions}
                    >
                        Clear All
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={() => {
                            console.log('🔧 Testing email modal trigger');
                            console.log('📊 Current session:', session);
                            if (session) {
                                // Force update session stats for testing
                                updateSessionStats(35000, true);
                            }
                        }}
                    >
                        Test Email
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={() => {
                            console.log('🔧 Testing email modal trigger');
                            triggerEmailModal('games');
                        }}
                    >
                        Test Email2
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={() => {
                            console.log('🧪 Manual test distraction trigger - using triggerTestDistraction');
                            triggerTestDistraction();
                        }}
                    >
                        Manual Test
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={() => {
                            console.log('🔍 DEBUG INFO:');
                            console.log('- Mode:', mode);
                            console.log('- Room ID:', roomId);
                            console.log('- Room ID Length:', roomId?.length);
                            console.log('- Username:', username);
                            console.log('- Connection Status:', connectionStatus);
                            console.log('- Is Connected:', isConnected);
                            console.log('- Opponent:', opponent);
                            console.log('- Connection Error:', connectionError);
                        }}
                    >
                        Debug Info
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={async () => {
                            try {
                                const response = await fetch('http://localhost:3001/rooms');
                                const data = await response.json();
                                console.log('🏠 SERVER ROOMS:', data);
                                console.log('🏠 Available room IDs:', data.rooms.map((r: any) => r.roomId));
                            } catch (error) {
                                console.error('Failed to fetch rooms:', error);
                            }
                        }}
                    >
                        Check Rooms
                    </button>
                    <button 
                        className="btn-secondary text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                            console.log('🧪 ========== USER_INFO TEST BUTTON CLICKED ==========');
                            console.log('🧪 Testing USER_INFO message exchange...');
                            console.log('🧪 Current connection state:', {
                                isConnected,
                                connectionStatus,
                                opponent,
                                remoteStream: !!remoteStream,
                                connectionError
                            });
                            
                            if (isConnected && connection) {
                                console.log('📤 Attempting to send USER_INFO test message...');
                                const testMessage: GameMessage = { 
                                    type: 'USER_INFO', 
                                    payload: { 
                                        username: username,
                                        test: true,
                                        timestamp: Date.now()
                                    } 
                                };
                                console.log('📤 Test message content:', testMessage);
                                sendData(testMessage);
                                console.log('✅ Test USER_INFO message sent!');
                            } else {
                                console.log('❌ Cannot send test message - not connected');
                                console.log('❌ Connection state:', {
                                    isConnected,
                                    connection: !!connection,
                                    connectionStatus
                                });
                            }
                        }}
                    >
                        Test USER_INFO
                    </button>
                </div>
            </div>

            {/* All your existing styles remain the same */}
            <style>{`
                .btn-primary { 
                    background-color: rgb(147 51 234);
                    color: white;
                    font-weight: bold;
                    padding: 0.5rem 1.5rem;
                    border-radius: 0.5rem;
                    transition: all 0.3s ease;
                    transform: scale(1);
                    border: none;
                    cursor: pointer;
                }
                .btn-primary:hover:not(:disabled) { 
                    background-color: rgb(126 34 206);
                    transform: scale(1.05);
                }
                .btn-primary:disabled {
                    background-color: rgb(55 65 81);
                    cursor: not-allowed;
                    transform: scale(1);
                }
                .btn-secondary { 
                    background-color: rgb(31 41 55);
                    color: white;
                    font-weight: bold;
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    transition: all 0.3s ease;
                    border: none;
                    cursor: pointer;
                }
                .btn-secondary:hover { 
                    background-color: rgb(55 65 81);
                }
                
                /* All your existing manga styles stay the same */
                .manga-video-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    width: 100%;
                }
                
                .manga-video-feed {
                    width: 100%;
                    aspect-ratio: 16 / 9;
                    border-radius: 1rem;
                    overflow: hidden;
                    border: 3px solid rgba(147, 51, 234, 0.5);
                    box-shadow: 0 8px 32px rgba(147, 51, 234, 0.2);
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.8), rgba(31, 31, 31, 0.6));
                    position: relative;
                }
                
                .manga-video-feed video:not(.remote-video) {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: center 65% !important;
                    transform: translateY(-20%);
                }
                
                .manga-video-feed video.remote-video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: center 65% !important;
                    transform: translateY(-20%) scaleX(-1);
                }
                
                .manga-video-feed canvas {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                }
                
                @media (min-width: 1024px) {
                    .manga-video-feed {
                        aspect-ratio: 21 / 9;
                    }
                }
                
                .manga-battle-display {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 2rem;
                    flex-wrap: wrap;
                }
                
                .manga-eye-panel {
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.8), rgba(31, 31, 31, 0.6));
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 1rem;
                    padding: 1.5rem 1rem;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }
                
                .manga-eye-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                
                .manga-eye {
                    width: 60px;
                    height: 40px;
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                    border: 3px solid;
                }
                
                .manga-eye.eye-open.player-eye {
                    background: linear-gradient(45deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.9));
                    border-color: rgb(34, 197, 94);
                    box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
                    animation: eyePulse 2s ease-in-out infinite;
                }
                
                .manga-eye.eye-closed.player-eye {
                    background: linear-gradient(45deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.9));
                    border-color: rgb(239, 68, 68);
                    box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
                    height: 15px;
                    animation: eyeBlink 0.5s ease-in-out;
                }
                
                .manga-eye.opponent-eye {
                    background: linear-gradient(45deg, rgba(107, 114, 128, 0.8), rgba(75, 85, 99, 0.9));
                    border-color: rgb(107, 114, 128);
                    box-shadow: 0 0 15px rgba(107, 114, 128, 0.3);
                }
                
                .eye-content {
                    font-size: 1.25rem;
                    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.5));
                }
                
                .eye-label {
                    font-size: 0.75rem;
                    font-weight: bold;
                    color: rgba(255, 255, 255, 0.7);
                    text-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
                }
                
                .vs-divider {
                    font-size: 1.5rem;
                    font-weight: bold;
                    color: rgb(147, 51, 234);
                    text-shadow: 0 0 10px rgba(147, 51, 234, 0.5);
                    display: flex;
                    align-items: center;
                    animation: vsGlow 2s ease-in-out infinite alternate;
                }
                
                @keyframes eyePulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.4); }
                    50% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.8); }
                }
                
                @keyframes eyeBlink {
                    0% { height: 40px; }
                    100% { height: 15px; }
                }
                
                @keyframes vsGlow {
                    0% { text-shadow: 0 0 10px rgba(147, 51, 234, 0.5); }
                    100% { text-shadow: 0 0 20px rgba(147, 51, 234, 1); }
                }
                
                @media (max-width: 768px) {
                    .manga-battle-display {
                        flex-direction: column;
                        gap: 1rem;
                    }
                    
                    .vs-divider {
                        transform: rotate(90deg);
                        margin: 0.5rem 0;
                    }
                }
            `}</style>
        </div>
    );
};

export default GameScreen;
