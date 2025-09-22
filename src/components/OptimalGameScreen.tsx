import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GameMode, GameStatus } from '../types';
import VideoFeed from './VideoFeed';
import useOptimalFaceMesh from '../hooks/useOptimalFaceMesh';
import useOptimalPeer from '../hooks/useOptimalPeer';
import { EyeOpenIcon, EyeClosedIcon } from './icons/EyeIcons';
import { BLINK_THRESHOLD } from '../constants';

interface OptimalGameScreenProps {
  mode: GameMode;
  username: string;
  roomId: string | null;
  onExit: () => void;
  isHost: boolean;
}

const OptimalGameScreen: React.FC<OptimalGameScreenProps> = ({ 
  mode, 
  username, 
  roomId, 
  onExit, 
  isHost 
}) => {
  const [gameStatus, setGameStatus] = useState(GameStatus.Idle);
  const [winner, setWinner] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [isMyReady, setIsMyReady] = useState(false);
  const [score, setScore] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use optimal hooks for split processing
  const {
    videoRef: processingVideoRef,
    croppedCanvasRef,
    isProcessing,
    lastBlinkState: isBlinking,
    blinkCount,
    confidence,
    croppedVideoStream,
    onBlinkDetected,
    startProcessing,
    stopProcessing
  } = useOptimalFaceMesh(username);
  
  const {
    isConnected,
    connectionStatus,
    connectionError,
    opponent: opponentData,
    remoteVideoStream: remoteStream,
    opponentBlinkState,
    createRoom,
    joinRoom,
    sendBlinkEvent,
    addLocalCroppedStream,
    cleanup
  } = useOptimalPeer(username);

  // Simulate face mesh data for UI compatibility
  const leftEar = isBlinking ? 0.1 : 0.4; // Below threshold = blinking
  const rightEar = isBlinking ? 0.1 : 0.4;
  const isFaceCentered = isProcessing;
  const lightingQuality = 'good';
  const faceMeshReady = isProcessing;

  // Set up room connections
  useEffect(() => {
    if (roomId && mode === GameMode.Multiplayer) {
      if (isHost) {
        createRoom(roomId);
      } else {
        joinRoom(roomId);
      }
    }
  }, [mode, roomId, isHost, createRoom, joinRoom]);

  // Initialize processing
  useEffect(() => {
    const init = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await startProcessing();
    };
    init();
    return () => stopProcessing();
  }, []);

  // Sync video streams
  useEffect(() => {
    if (processingVideoRef.current?.srcObject && videoRef.current) {
      videoRef.current.srcObject = processingVideoRef.current.srcObject;
    }
  }, [isProcessing]);

  // Copy processing results to display canvas
  useEffect(() => {
    if (!croppedCanvasRef.current || !canvasRef.current) return;
    
    const copyFrame = () => {
      const srcCanvas = croppedCanvasRef.current;
      const destCanvas = canvasRef.current;
      if (!srcCanvas || !destCanvas) return;
      
      const srcCtx = srcCanvas.getContext('2d');
      const destCtx = destCanvas.getContext('2d');
      if (!srcCtx || !destCtx) return;
      
      destCanvas.width = srcCanvas.width;
      destCanvas.height = srcCanvas.height;
      destCtx.drawImage(srcCanvas, 0, 0);
    };
    
    const interval = setInterval(copyFrame, 33);
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Add video stream to peer
  useEffect(() => {
    if (croppedVideoStream && isConnected) {
      addLocalCroppedStream(croppedVideoStream);
    }
  }, [croppedVideoStream, isConnected, addLocalCroppedStream]);

  // Handle blink events
  useEffect(() => {
    onBlinkDetected((blinkEvent) => {
      if (isConnected && mode === GameMode.Multiplayer) {
        sendBlinkEvent(blinkEvent);
      }
      
      if (gameStatus === GameStatus.Playing && blinkEvent.isBlinking) {
        setWinner('You Lose!');
        setGameStatus(GameStatus.GameOver);
      }
    });
  }, [onBlinkDetected, isConnected, mode, sendBlinkEvent, gameStatus]);

  // Handle opponent blinks
  useEffect(() => {
    if (opponentBlinkState.isBlinking && gameStatus === GameStatus.Playing) {
      setWinner('You Win!');
      setGameStatus(GameStatus.GameOver);
    }
  }, [opponentBlinkState.isBlinking, gameStatus]);

  const startCountdown = useCallback(() => {
    setGameStatus(GameStatus.Countdown);
    setCountdown(3);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          setGameStatus(GameStatus.Playing);
          
          const startTime = Date.now();
          const gameInterval = setInterval(() => {
            setScore(Date.now() - startTime);
          }, 100);
          
          setTimeout(() => {
            clearInterval(gameInterval);
            if (gameStatus === GameStatus.Playing) {
              setWinner('Draw - Time up!');
              setGameStatus(GameStatus.GameOver);
            }
          }, 60000);
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [gameStatus]);

  const resetGame = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setGameStatus(GameStatus.Idle);
    setWinner(null);
    setScore(0);
    setIsMyReady(false);
    setCountdown(3);
  };

  const handleReadyClick = () => {
    setIsMyReady(true);
    if (mode === GameMode.Multiplayer && opponentData && isConnected) {
      startCountdown();
    }
  };

  const getStatusMessage = (): string => {
    if (!faceMeshReady) return "Loading Face Detection Model...";
    
    if (lightingQuality === 'poor') {
      return "⚠️ Poor lighting detected!\nPlease improve lighting for better accuracy.";
    }
    
    if (gameStatus !== GameStatus.Playing && gameStatus !== GameStatus.Countdown) {
      if (!isFaceCentered) return "Please center your face in the frame.";
    }

    if (mode === GameMode.Multiplayer) {
      if (connectionError) return `Connection Error:\n${connectionError}`;
      if (!isConnected) {
        if (connectionStatus.includes('Connecting') || connectionStatus.includes('Trying')) {
          return `${connectionStatus}\n${isHost ? `Room: ${roomId}` : `Joining: ${roomId}`}`;
        }
        return isHost ? `Waiting for opponent...\nRoom: ${roomId}` : `Connecting to room: ${roomId}`;
      }
      if (!opponentData) return "Establishing connection...";
      if (gameStatus === GameStatus.Idle) {
        if (!isMyReady) return "Click 'Ready' to start";
        return `Waiting for ${opponentData.username}...`;
      }
    }
    
    if (gameStatus === GameStatus.Playing) return "Don't blink!";
    return "Ready to play!";
  };

  const formatTime = (ms: number) => {
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
  };

  const renderScore = () => (
    <div className="flex gap-4 text-lg mb-4">
      <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
        Time: {formatTime(score)}
      </div>
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
    if (mode === GameMode.Multiplayer && gameStatus === GameStatus.Idle) {
      return (
        <div className="space-y-2">
          <button 
            className="btn-primary" 
            onClick={handleReadyClick} 
            disabled={isMyReady || !isConnected || !opponentData || !isFaceCentered || lightingQuality === 'poor' || !!connectionError}
          >
            {isMyReady ? 'Ready ✓' : 'Ready'}
          </button>
          {connectionError && (
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
      if (isConnected && opponentData) return 'bg-green-500';
      if (connectionError) return 'bg-red-500';
      if (connectionStatus.includes('Connecting') || connectionStatus.includes('Trying') || connectionStatus.includes('Creating') || connectionStatus.includes('Joining')) return 'bg-yellow-500';
      return 'bg-gray-500';
    };
    
    return (
      <div className="mb-4 text-sm">
        <div className="flex items-center justify-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
          <span className="text-gray-400">
            {isConnected && opponentData 
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
    <div className="optimal-game-container w-full relative">
      <button onClick={onExit} className="absolute -top-12 right-0 btn-secondary z-10">
        Exit to Menu
      </button>
      
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
        {mode === GameMode.Multiplayer && (
          <div className="manga-video-feed">
            <div className="video-crop-wrapper">
              <VideoFeed 
                videoRef={remoteVideoRef} 
                username={opponentData?.username || 'Waiting...'} 
                isMuted={false} 
                remoteStream={remoteStream} 
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 text-center w-full mx-auto shadow-lg relative">
        
        {renderConnectionStatus()}
        
        <div className="manga-battle-display mb-6">
          {renderMangaEyePanel(
            username, 
            leftEar > BLINK_THRESHOLD, 
            rightEar > BLINK_THRESHOLD, 
            true
          )}
          
          {mode === GameMode.Multiplayer && (
            <>
              <div className="vs-divider">VS</div>
              {renderMangaEyePanel(
                opponentData?.username || 'Opponent', 
                opponentBlinkState ? !opponentBlinkState.isBlinking : true,
                opponentBlinkState ? !opponentBlinkState.isBlinking : true, 
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
      </div>

      {/* Hidden processing elements for optimal architecture */}
      <div style={{ display: 'none' }}>
        <video 
          ref={processingVideoRef}
          autoPlay 
          playsInline 
          muted 
        />
        <canvas ref={croppedCanvasRef} />
      </div>
    </div>
  );
};

export default OptimalGameScreen;