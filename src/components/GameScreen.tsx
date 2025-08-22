import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GameMode, GameStatus } from '../types';
import VideoFeed from './VideoFeed';
import useBestScore from '../hooks/useBestScore';
import useFaceMesh from '../hooks/useFaceMesh';
import usePeerConnection from '../hooks/usePeerConnection';
import CameraPermissionModal from './CameraPermissionModal';
import { EyeOpenIcon, EyeClosedIcon } from './icons/EyeIcons';
import { BLINK_THRESHOLD, BLINK_DURATION_MS } from '../constants';

interface GameScreenProps {
    mode: GameMode;
    username: string;
    roomId: string | null;
    onExit: () => void;
    isHost: boolean;
}

const GameScreen: React.FC<GameScreenProps> = ({ mode, username, roomId, onExit, isHost }) => {
    const [gameStatus, setGameStatus] = useState(GameStatus.Idle);
    const [winner, setWinner] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(3);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [needsPermission, setNeedsPermission] = useState(false);
    const [isMyReady, setIsMyReady] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    const { bestScore, setBestScore } = useBestScore();
    const [score, setScore] = useState(0);

    const { 
        isReady: faceMeshReady, 
        leftEar, 
        rightEar, 
        isFaceCentered, 
        startFaceMesh, 
    } = useFaceMesh(videoRef, canvasRef);
    
    const { 
      connection,
      remoteStream,
      opponent,
      createRoom,
      joinRoom,
      sendData,
      isOpponentReady,
      lastBlinkWinner
    } = usePeerConnection(username);

    const bothEyesClosedStart = useRef<number | null>(null);

    const handleCameraReady = useCallback(() => {
        setIsCameraReady(true);
        startFaceMesh();
    }, [startFaceMesh]);

    const requestCamera = useCallback(() => {
        setNeedsPermission(false);
        navigator.mediaDevices.getUserMedia({ video: true })
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
        if (mode === GameMode.Multiplayer && roomId) {
            if (isHost) {
                createRoom(roomId);
            } else {
                joinRoom(roomId);
            }
        }
    }, [mode, roomId, isHost, createRoom, joinRoom]);
    
    useEffect(() => {
        if (lastBlinkWinner) {
            setGameStatus(GameStatus.GameOver);
            setWinner(lastBlinkWinner);
        }
    }, [lastBlinkWinner]);

    const resetGame = useCallback(() => {
        setGameStatus(GameStatus.Idle);
        setScore(0);
        setWinner(null);
        bothEyesClosedStart.current = null;
        
        // Clear any existing countdown interval
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        
        if (mode === GameMode.Multiplayer) {
            setIsMyReady(false);
            sendData({type: 'READY_STATE', payload: { isReady: false }});
        }
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
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // Cleanup countdown interval on unmount
    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    // Start game logic - score tracking
    useEffect(() => {
        if (gameStatus === GameStatus.Playing) {
            const startTime = Date.now();
            const scoreInterval = setInterval(() => {
                setScore(Date.now() - startTime);
            }, 50);
            return () => clearInterval(scoreInterval);
        }
    }, [gameStatus]);
    
    // Auto-start for multiplayer
    useEffect(() => {
        if (mode === GameMode.Multiplayer && isMyReady && isOpponentReady && gameStatus === GameStatus.Idle) {
            startCountdown();
        }
    }, [mode, isMyReady, isOpponentReady, gameStatus, startCountdown]);

    // Blink detection logic
    useEffect(() => {
        if (gameStatus !== GameStatus.Playing || !faceMeshReady) return;

        const leftClosed = leftEar < BLINK_THRESHOLD;
        const rightClosed = rightEar < BLINK_THRESHOLD;
        
        if (leftClosed && rightClosed) {
            if (bothEyesClosedStart.current === null) {
                bothEyesClosedStart.current = Date.now();
            } else if (Date.now() - bothEyesClosedStart.current > BLINK_DURATION_MS) {
                setGameStatus(GameStatus.GameOver);
                if (mode === GameMode.Multiplayer) {
                    sendData({ type: 'BLINK' });
                    setWinner('You Lose!');
                } else {
                    setWinner('You blinked!');
                    if (score > bestScore) {
                        setBestScore(score);
                    }
                }
            }
        } else {
            bothEyesClosedStart.current = null;
        }
    }, [leftEar, rightEar, gameStatus, faceMeshReady, mode, bestScore, score, sendData, setBestScore]);
    
    const getStatusMessage = (): string => {
        if (!isCameraReady) return "Waiting for camera access...\nPlease grant permission to play.";
        if (!faceMeshReady) return "Loading Face Detection Model...";
        
        if (gameStatus !== GameStatus.Playing && gameStatus !== GameStatus.Countdown) {
            if (!isFaceCentered) return "Please center your face in the frame.";
        }

        if (mode === GameMode.Multiplayer) {
            if (!connection) return isHost ? `Waiting for opponent to join...` : `Connecting to room...`;
            if (gameStatus === GameStatus.Idle) {
                if (!isMyReady) return "Click 'Ready' to start";
                if (!isOpponentReady) return "Waiting for opponent...";
            }
        }
        
        if (gameStatus === GameStatus.Playing) return "Don't blink!";

        return "Ready to play!";
    };

    const renderScore = () => (
        <div className="flex gap-4 text-lg">
            <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
                Time: {(score / 1000).toFixed(2)}s
            </div>
            {mode === GameMode.SinglePlayer && (
                <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
                    Best: {(bestScore / 1000).toFixed(2)}s
                </div>
            )}
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
                    disabled={!faceMeshReady || !isFaceCentered}
                >
                    Start Game
                </button>
            );
        }
        if (mode === GameMode.Multiplayer && gameStatus === GameStatus.Idle) {
            return (
                <button 
                    className="btn-primary" 
                    onClick={handleReadyClick} 
                    disabled={isMyReady || !connection || !isFaceCentered}
                >
                    Ready
                </button>
            );
        }
        return null;
    };
    
    return (
        <div className="w-full relative">
            <button onClick={onExit} className="absolute -top-12 right-0 btn-secondary z-10">
                Exit to Menu
            </button>
            
            <CameraPermissionModal isOpen={needsPermission} onRequest={requestCamera} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <VideoFeed 
                    videoRef={videoRef} 
                    canvasRef={canvasRef} 
                    username={username} 
                    isMuted={true} 
                />
                {mode === GameMode.Multiplayer && (
                    <VideoFeed 
                        videoRef={remoteVideoRef} 
                        username={opponent?.username || 'Opponent'} 
                        isMuted={false} 
                        remoteStream={remoteStream} 
                    />
                )}
            </div>

            <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 text-center w-full mx-auto shadow-lg">
                <div className="flex justify-around items-center mb-4">
                    <div className="flex items-center gap-2">
                        <span className={`p-2 rounded-full ${leftEar > BLINK_THRESHOLD ? 'bg-green-500 bg-opacity-80' : 'bg-red-500 bg-opacity-80'}`}>
                            {leftEar > BLINK_THRESHOLD ? <EyeOpenIcon /> : <EyeClosedIcon />}
                        </span>
                        <span className="font-bold text-lg">{username}</span>
                        <span className={`p-2 rounded-full ${rightEar > BLINK_THRESHOLD ? 'bg-green-500 bg-opacity-80' : 'bg-red-500 bg-opacity-80'}`}>
                            {rightEar > BLINK_THRESHOLD ? <EyeOpenIcon /> : <EyeClosedIcon />}
                        </span>
                    </div>
                    {mode === GameMode.Multiplayer && (
                        <div className="flex items-center gap-2">
                            <span className="p-2 rounded-full bg-gray-700">
                                <EyeOpenIcon />
                            </span>
                            <span className="font-bold text-lg">
                                {opponent?.username || 'Opponent'}
                            </span>
                            <span className="p-2 rounded-full bg-gray-700">
                                <EyeOpenIcon />
                            </span>
                        </div>
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
                        <div className="text-xl text-gray-400 whitespace-pre-line">
                            {getStatusMessage()}
                        </div>
                    )}
                </div>

                <div className="flex justify-center gap-4">
                    {renderControls()}
                </div>
            </div>

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
                .input-primary { 
                    background-color: rgba(0, 0, 0, 0.5);
                    border: 1px solid rgb(55 65 81);
                    border-radius: 0.5rem;
                    padding: 0.5rem 1rem;
                    color: white;
                    width: 100%;
                }
                .input-primary:focus {
                    outline: none;
                    ring: 2px solid rgb(147 51 234);
                }
            `}</style>
        </div>
    );
};

export default GameScreen;