import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GameMode, GameStatus } from '../types';
import VideoFeed from './VideoFeed';
import useBestScore from '../hooks/useBestScore';
import useFaceMesh from '../hooks/useFaceMesh';
import useRemoteFaceMesh from '../hooks/useRemoteFaceMesh'; // NEW
import useSimplePeer, { GameMessage } from '../hooks/useSimplePeer';
import useCalibration from '../hooks/useCalibration';
import useGlobalMultiplayer from '../hooks/useGlobalMultiplayer';
import useContinuousRun from '../hooks/useContinuousRun';
import useDistractions from '../hooks/useDistractions';
import useSession from '../hooks/useSession';
import CameraPermissionModal from './CameraPermissionModal';
import DistractionOverlay from './DistractionOverlay';
import EmailCaptureModal from './EmailCaptureModal';
import TransitionOverlay from './TransitionOverlay';
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
    const [gameEndTime, setGameEndTime] = useState<number | null>(null);
    const [eyeScreenshot, setEyeScreenshot] = useState<string | null>(null);
    const [winnerUsername, setWinnerUsername] = useState<string | null>(null);
    const [showVictoryNotification, setShowVictoryNotification] = useState(false);
    const [victoryOpponentsDefeated, setVictoryOpponentsDefeated] = useState(0);
    const [victoryTime, setVictoryTime] = useState(0);
    const victoryNotificationShownRef = useRef(false);
    const [showShareCard, setShowShareCard] = useState(false);
    const [shareCardImage, setShareCardImage] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null); // NEW
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const bothEyesClosedStart = useRef<number | null>(null);
    
    const { bestScore, setBestScore } = useBestScore();
    const [score, setScore] = useState(0);
    const { session: currentSession, updateSessionStats } = useSession();

    // Calibration system
    const { 
        getCurrentThreshold, 
        shouldShowCalibration, 
        saveCalibration,
        isCalibrated 
    } = useCalibration();
    const currentThreshold = getCurrentThreshold();

    const { 
        isReady: faceMeshReady, 
        leftEar, 
        rightEar, 
        isFaceCentered, 
        lightingQuality,
        startFaceMesh, 
        blinkThreshold: faceMeshThreshold
    } = useFaceMesh(videoRef as React.RefObject<HTMLVideoElement>, canvasRef as React.RefObject<HTMLCanvasElement>, {
        blinkThreshold: currentThreshold
    });
    
    // NEW: Remote face mesh hook for opponent video cropping
    const {
        isReady: remoteFaceMeshReady,
        hasFace: opponentHasFace,
        leftEar: opponentLeftEar,
        rightEar: opponentRightEar
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
      connectionStatus,
      socket: simplePeerSocket,
      resetGameState,
      initializeLocalStream,
      isLocalStreamReady,
    } = useSimplePeer(username);

    // Global multiplayer hook (disabled in Continuous/Global mode to prevent socket conflicts)
    const isContinuousModeCheck = mode === GameMode.Continuous || mode === GameMode.Global;
    const {
      currentMatch: globalMatch,
      submitGameResult,
      joinGlobalQueue,
    } = useGlobalMultiplayer(false); // Always disabled now

    // Continuous run hook - use socket from useSimplePeer (same socket as WebRTC signaling)
    const {
      runState,
      startRun,
      endRun,
      handleOpponentLoss,
      handlePlayerLoss,
      isInRun,
    } = useContinuousRun(simplePeerSocket);

    // Determine which multiplayer system to use
    const isGlobalMode = mode === GameMode.Global;
    const isContinuousMode = mode === GameMode.Continuous || mode === GameMode.Global;
    const multiplayerData = isGlobalMode ? globalMatchData : null;
    // Use globalMatchData (prop) as fallback if globalMatch (from hook) is null
    const effectiveGlobalMatch = globalMatch || globalMatchData;
    const opponentData = isGlobalMode ? effectiveGlobalMatch?.opponent : opponent;

    // For Global mode, consider connected if we have remote stream
    const effectiveIsConnected = isGlobalMode ? (!!remoteStream && !!effectiveGlobalMatch) : isConnected;

    // Initialize local stream for continuous mode
    useEffect(() => {
      if (isContinuousMode) {
        console.log('📹 Continuous mode: Initializing local stream...');
        initializeLocalStream();
      }
    }, [isContinuousMode, initializeLocalStream]);

    // Auto-start continuous run when entering continuous mode (wait for local stream to be ready)
    useEffect(() => {
      if (isContinuousMode && simplePeerSocket && runState.status === 'ended' && isLocalStreamReady) {
        console.log('🏃 Auto-starting continuous run for:', username);
        startRun(username);
      }
    }, [isContinuousMode, simplePeerSocket, username, startRun, runState.status, isLocalStreamReady]);

    // Handle continuous run transitions
    useEffect(() => {
      if (isContinuousMode && runState.status === 'countdown') {
        // Reset game state for new match
        console.log('🔄 Continuous mode: New match starting - resetting game state');
        resetGameState();
        // Start countdown for continuous mode
        startCountdown();
      }
    }, [isContinuousMode, runState.status, resetGameState]);

    // Handle opponent disconnection in continuous mode (means they lost)
    useEffect(() => {
      if (!isContinuousMode || !simplePeerSocket) return;

      const handleOpponentDisconnected = (data: any) => {
        console.log('🔌 Opponent disconnected in continuous mode:', data);
        console.log('🔌 Current gameStatus:', gameStatus);
        console.log('🔌 Current runState.status:', runState.status);
        console.log('🔌 Current runState.currentOpponent:', runState.currentOpponent);

        // If we're in an active game and opponent disconnects, we win (unless we already lost)
        // Check if we haven't already ended the game (winner is still null means we haven't decided yet)
        if (runState.status === 'active' && !winner) {
          console.log('🎯 Opponent disconnected during active game - Player wins!');
          setGameStatus(GameStatus.GameOver);
          setWinner('You Win!');
          const gameTime = Date.now() - (gameStartTime || 0);
          setGameEndTime(gameTime);
          updateSessionStats(gameTime, true);

          // Handle as opponent loss
          if (runState.currentOpponent) {
            console.log('🎯 Calling handleOpponentLoss for:', runState.currentOpponent.socketId);
            handleOpponentLoss(runState.currentOpponent.socketId);
          } else {
            console.log('❌ No currentOpponent to handle loss for');
          }
        } else {
          console.log('❌ Not handling as win - wrong game state or winner already decided');
          console.log('❌ runState.status === active?', runState.status === 'active');
          console.log('❌ winner:', winner);
        }
      };

      simplePeerSocket.on('opponent-disconnected', handleOpponentDisconnected);

      return () => {
        simplePeerSocket.off('opponent-disconnected', handleOpponentDisconnected);
      };
    }, [isContinuousMode, simplePeerSocket, gameStatus, runState, gameStartTime, updateSessionStats, handleOpponentLoss, winner]);

    // Handle continuous run opponent loss (from BLINK message)
    useEffect(() => {
      if (isContinuousMode && lastBlinkWinner && lastBlinkWinner.includes('Win') && !victoryNotificationShownRef.current) {
        // Player won against current opponent
        console.log('🎯 Continuous run: Player won via BLINK message');
        
        // Prevent double-trigger
        victoryNotificationShownRef.current = true;
        
        // Freeze the run time at the moment of victory
        setVictoryTime(runState.currentTime);
        
        // Show victory notification before handling opponent loss
        setShowVictoryNotification(true);
        setVictoryOpponentsDefeated(runState.opponentsDefeated + 1);
        
        // Auto-hide victory notification after 3 seconds
        setTimeout(() => {
          setShowVictoryNotification(false);
          victoryNotificationShownRef.current = false; // Reset for next match
        }, 3000);
        
        if (runState.currentOpponent) {
          handleOpponentLoss(runState.currentOpponent.socketId);
        }
      } else if (isContinuousMode && lastBlinkWinner && lastBlinkWinner.includes('Lose')) {
        // Player lost - end the run immediately (BLINK message was already sent before this)
        console.log('💀 Continuous run: Player lost - ending run immediately');
        handlePlayerLoss();
      }
    }, [isContinuousMode, lastBlinkWinner, runState.currentOpponent, runState.opponentsDefeated, runState.currentTime, handleOpponentLoss, handlePlayerLoss]);

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

    // Debug logging for opponent eye status
    useEffect(() => {
        if (mode === GameMode.Multiplayer || mode === GameMode.Global) {
            console.log('👁️ Opponent Eye Status:', {
                opponentLeftEar,
                opponentRightEar,
                currentThreshold,
                leftEyeOpen: opponentLeftEar > currentThreshold,
                rightEyeOpen: opponentRightEar > currentThreshold,
                remoteFaceMeshReady,
                opponentHasFace
            });
        }
    }, [mode, opponentLeftEar, opponentRightEar, remoteFaceMeshReady, opponentHasFace, currentThreshold]);

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
    } = useEmailCapture(currentSession || session || null, score, gameStatus);


    // Function to capture eye screenshot when game ends
    const captureEyeScreenshot = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            try {
                const screenshot = canvas.toDataURL('image/png');
                setEyeScreenshot(screenshot);
                console.log('📸 Captured eye screenshot');
                return screenshot;
            } catch (error) {
                console.error('❌ Failed to capture screenshot:', error);
                return null;
            }
        }
        return null;
    }, []);

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
            setGameEndTime(gameTime);
            const didWin = lastBlinkWinner.includes('Win');
            console.log('🎮 Multiplayer game ended! Duration:', gameTime, 'Won:', didWin);

            // Capture screenshot of winner's eyes
            if (didWin) {
                captureEyeScreenshot();
                setWinnerUsername(username);
            } else {
                setWinnerUsername(opponentData?.username || 'Opponent');
            }

            updateSessionStats(gameTime, didWin);
        }
    }, [lastBlinkWinner, gameStartTime, updateSessionStats, captureEyeScreenshot, username, opponentData]);

    const resetGame = useCallback(() => {
        setGameStatus(GameStatus.Idle);
        setScore(0);
        setWinner(null);
        setGameStartTime(null);
        setGameEndTime(null);
        setEyeScreenshot(null);
        setWinnerUsername(null);
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
        console.log('📤 Sending ready state to opponent...');
        setIsMyReady(true);
        sendData({type: 'READY_STATE', payload: { isReady: true }});
    }, [sendData]);

  const handlePlayAgain = useCallback(() => {
    console.log('🔄 Play Again clicked in Global mode');
    // Reset game state
    resetGame();
    // Re-join global queue
    if (mode === GameMode.Global) {
      console.log('🌍 Re-joining global queue:', username);
      joinGlobalQueue(username);
    }
  }, [mode, username, joinGlobalQueue, resetGame]);

  const handleTryAgainContinuous = useCallback(() => {
    console.log('🔄 Try Again clicked in Continuous mode');

    // Reset all game state
    setGameStatus(GameStatus.Idle);
    setScore(0);
    setWinner(null);
    setGameStartTime(null);
    setGameEndTime(null);
    setEyeScreenshot(null);
    setWinnerUsername(null);
    setShowVictoryNotification(false);
    setVictoryOpponentsDefeated(0);
    setVictoryTime(0);
    bothEyesClosedStart.current = null;
    victoryNotificationShownRef.current = false;

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Reset game state in peer connection
    resetGameState();

    // Start a completely new continuous run
    // This will reset personal timer and re-enter queue
    console.log('🏃 Starting new continuous run for:', username);
    startRun(username);
  }, [username, startRun, resetGameState]);

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
            console.log('🎯 Both players ready! Starting multiplayer game countdown!');
            startCountdown();
        }
        // Global mode: BOTH players must be ready before game starts
        if (mode === GameMode.Global && isMyReady && isOpponentReady && opponentData && gameStatus === GameStatus.Idle) {
            console.log('🎯 Both players ready! Starting global game countdown!');
            startCountdown();
        }
    }, [mode, isMyReady, isOpponentReady, gameStatus, startCountdown, opponentData, isConnected, connectionStatus, opponent, globalMatch]);

    // Auto-lose if player leaves frame during gameplay
    useEffect(() => {
        if (gameStatus !== GameStatus.Playing) return;

        // Check if local player left the frame
        if (!isFaceCentered) {
            console.log('❌ Player left frame - Auto lose!');
            setGameStatus(GameStatus.GameOver);
            setWinner('You Lost!\n(Left Frame)');

            // Notify opponent in multiplayer
            if (mode === GameMode.Multiplayer || mode === GameMode.Global) {
                sendData({ type: 'GAME_STATE', payload: { status: 'ended', winner: 'opponent', reason: 'left-frame' } });
            }

            // Update stats
            const gameDuration = gameStartTime ? Date.now() - gameStartTime : 0;
            if (session) {
                updateSessionStats(gameDuration, false);
            }

            // Submit result for global mode
            if (mode === GameMode.Global && globalMatchData && submitGameResult) {
                submitGameResult(globalMatchData.matchId, 'loss');
            }
        }
    }, [gameStatus, isFaceCentered, mode, sendData, updateSessionStats, gameStartTime, globalMatchData, submitGameResult, session]);

    useEffect(() => {
        if (gameStatus !== GameStatus.Playing || !faceMeshReady) return;

        const leftClosed = leftEar < currentThreshold;
        const rightClosed = rightEar < currentThreshold;
        
        if (leftClosed && rightClosed) {
            if (bothEyesClosedStart.current === null) {
                bothEyesClosedStart.current = Date.now();
            } else if (Date.now() - bothEyesClosedStart.current > BLINK_DURATION_MS) {
                setGameStatus(GameStatus.GameOver);
                const gameTime = Date.now() - (gameStartTime || 0);
                setGameEndTime(gameTime);
                console.log('🎮 Game ended! Duration:', gameTime, 'Session:', session);

                // Capture screenshot of loser's eyes
                captureEyeScreenshot();

                if (mode === GameMode.Multiplayer || mode === GameMode.Continuous || mode === GameMode.Global) {
                    sendData({ type: 'BLINK', payload: { gameTime } });
                    setWinner('You Lose!');
                    setWinnerUsername(opponentData?.username || 'Opponent');
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
    }, [leftEar, rightEar, gameStatus, faceMeshReady, mode, bestScore, score, sendData, setBestScore, gameStartTime, session, updateSessionStats, captureEyeScreenshot, opponentData, submitGameResult, currentThreshold]);
    
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

    // Function to create shareable defeat card
    const createShareCard = useCallback(async () => {
        if (!eyeScreenshot || !gameEndTime) return null;

        try {
            // Create a canvas for the share card
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            // Set canvas size for social media (1200x630 is common for social sharing)
            canvas.width = 1200;
            canvas.height = 630;

            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, '#1f2937');
            gradient.addColorStop(1, '#111827');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Add decorative elements
            ctx.fillStyle = 'rgba(147, 51, 234, 0.3)';
            ctx.fillRect(0, 0, canvas.width, 100);
            ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

            // Title
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 72px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('💀 DEFEAT', canvas.width / 2, 180);

            // Username
            ctx.font = 'bold 48px Arial';
            ctx.fillStyle = '#d1d5db';
            ctx.fillText(`${username} lasted for ${formatTime(gameEndTime)}`, canvas.width / 2, 250);

            // Load eye screenshot
            const eyeImg = new Image();
            await new Promise((resolve, reject) => {
                eyeImg.onload = resolve;
                eyeImg.onerror = reject;
                eyeImg.src = eyeScreenshot;
            });

            // Draw eye screenshot (centered, scaled appropriately)
            const eyeSize = 300;
            const eyeX = (canvas.width - eyeSize) / 2;
            const eyeY = 300;
            ctx.drawImage(eyeImg, eyeX, eyeY, eyeSize, eyeSize);

            // Add border around eye image
            ctx.strokeStyle = 'rgba(147, 51, 234, 0.8)';
            ctx.lineWidth = 8;
            ctx.strokeRect(eyeX - 4, eyeY - 4, eyeSize + 8, eyeSize + 8);

            // Footer text
            ctx.font = '36px Arial';
            ctx.fillStyle = '#9ca3af';
            ctx.fillText('Play Blinky - The Ultimate Staring Contest', canvas.width / 2, canvas.height - 50);

            // Convert to data URL
            const shareCardUrl = canvas.toDataURL('image/png');
            setShareCardImage(shareCardUrl);
            setShowShareCard(true);
            
            return shareCardUrl;
        } catch (error) {
            console.error('Error creating share card:', error);
            return null;
        }
    }, [eyeScreenshot, gameEndTime, username]);

    // Function to download share card
    const downloadShareCard = useCallback(() => {
        if (!shareCardImage) return;

        const link = document.createElement('a');
        link.download = `blinky-defeat-${username}-${Date.now()}.png`;
        link.href = shareCardImage;
        link.click();
    }, [shareCardImage, username]);

    // Function to share to Twitter/X
    const shareToTwitter = useCallback(() => {
        const text = encodeURIComponent(`I lasted ${formatTime(gameEndTime || 0)} in Blinky! Can you beat my staring time? 👁️`);
        const url = encodeURIComponent(window.location.href);
        const hashtags = encodeURIComponent('Blinky,StaringContest,Gaming');
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`, '_blank', 'width=550,height=420');
    }, [gameEndTime]);

    // Function to share to Instagram (note: Instagram doesn't have direct share API, so we download image)
    const shareToInstagram = useCallback(() => {
        if (!shareCardImage) return;
        
        // For Instagram, we download the image and user can upload it manually
        // Instagram doesn't have a direct share API like Twitter
        downloadShareCard();
        
        // Show helpful message
        alert('📸 Image downloaded! Open Instagram and upload this image to share your Blinky result!');
    }, [shareCardImage, downloadShareCard]);

    // Auto-create share card when player loses
    useEffect(() => {
        if (gameStatus === GameStatus.GameOver && winner && winner.includes('Lose') && eyeScreenshot && !showShareCard) {
            createShareCard();
        }
    }, [gameStatus, winner, eyeScreenshot, showShareCard, createShareCard]);

    const renderEndGameScreen = () => {
        if (!winner || gameStatus !== GameStatus.GameOver) return null;

        const isWinner = winner.includes('Win');
        const displayWinner = isWinner ? username : (winnerUsername || opponentData?.username || 'Opponent');

        // In Continuous mode, winners don't see end screen (they continue to next opponent)
        if (isContinuousMode && isWinner) {
            return null;
        }

        // In Continuous mode, losers see defeat screen and auto-exit (timer is in useEffect above)
        if (isContinuousMode && !isWinner) {
            return (
                <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
                    <div className="end-game-card">
                        <h1 className="text-5xl font-bold mb-6 text-red-400">
                            💀 DEFEAT
                        </h1>

                        {eyeScreenshot && (
                            <div className="eye-screenshot-container mb-6">
                                <p className="text-xl text-gray-300 mb-2">
                                    Your Last Moment
                                </p>
                                <img
                                    src={eyeScreenshot}
                                    alt="Eye Screenshot"
                                    className="eye-screenshot-img"
                                />
                            </div>
                        )}

                        <div className="winner-info mb-6">
                            <p className="text-3xl font-semibold text-purple-300 mb-2">
                                Run Ended
                            </p>
                            <p className="text-xl text-gray-400">
                                Opponents Defeated: {runState.opponentsDefeated}
                            </p>
                            <p className="text-xl text-gray-400">
                                Your Run Time: {formatTime(runState.currentTime)}
                            </p>
                            <p className="text-xl text-gray-400">
                                Match Duration: {formatTime(runState.gameTime)}
                            </p>
                        </div>

                        <div className="flex gap-4 justify-center mt-4">
                            <button
                                onClick={handleTryAgainContinuous}
                                className="btn-primary text-xl px-8 py-3"
                            >
                                🔄 Try Again
                            </button>
                            <button
                                onClick={onExit}
                                className="btn-secondary text-xl px-8 py-3"
                            >
                                🏠 Return to Menu
                            </button>
                        </div>

                        {/* Share Card Button for Continuous Mode Defeat */}
                        {eyeScreenshot && (
                            <div className="mt-6">
                                <button
                                    onClick={() => createShareCard()}
                                    className="btn-primary text-xl px-8 py-3 bg-blue-600 hover:bg-blue-700"
                                >
                                    📸 Share Your Defeat Card
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // Normal end game screen for other modes
        return (
            <div className="end-game-overlay">
                <div className="end-game-card">
                    <h1 className={`text-5xl font-bold mb-6 ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
                        {isWinner ? '🏆 VICTORY!' : '💀 DEFEAT'}
                    </h1>

                    {/* Eye Screenshot */}
                    {eyeScreenshot && (
                        <div className="eye-screenshot-container mb-6">
                            <p className="text-xl text-gray-300 mb-2">
                                {isWinner ? 'Your Winning Eyes' : 'Your Last Moment'}
                            </p>
                            <img
                                src={eyeScreenshot}
                                alt="Eye Screenshot"
                                className="eye-screenshot-img"
                            />
                        </div>
                    )}

                    {/* Winner Info */}
                    <div className="winner-info mb-6">
                        <p className="text-3xl font-semibold text-purple-300 mb-2">
                            {displayWinner}
                        </p>
                        <p className="text-xl text-gray-400">
                            {isWinner ? 'Outlasted their opponent' : 'Won the staring contest'}
                        </p>
                    </div>

                    {/* Game Stats */}
                    <div className="game-stats mb-8">
                        <div className="stat-item">
                            <span className="stat-label">Duration</span>
                            <span className="stat-value">{gameEndTime ? formatTime(gameEndTime) : '--'}</span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 justify-center">
                        {mode === GameMode.Global && (
                            <button
                                className="btn-primary text-xl px-8 py-4"
                                onClick={handlePlayAgain}
                            >
                                🔄 Play Again
                            </button>
                        )}
                        {mode !== GameMode.Global && (
                            <button
                                className="btn-primary text-xl px-8 py-4"
                                onClick={resetGame}
                            >
                                🔄 Play Again
                            </button>
                        )}
                        <button
                            className="btn-secondary text-xl px-8 py-4"
                            onClick={onExit}
                        >
                            🏠 Exit
                        </button>
                    </div>

                    {/* Share Card Button for All Modes */}
                    {eyeScreenshot && (
                        <div className="mt-6">
                            <button
                                onClick={() => createShareCard()}
                                className="btn-primary text-xl px-8 py-3 bg-blue-600 hover:bg-blue-700"
                            >
                                📸 Share Your Defeat Card
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
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
            {isContinuousMode && (runState.status === 'active' || runState.status === 'transitioning' || runState.status === 'countdown') && (
                <>
                    <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
                        Match Time: {formatTime(runState.gameTime)}
                    </div>
                    <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
                        Your Run Time: {formatTime(runState.currentTime)}
                    </div>
                    <div className="bg-black bg-opacity-50 px-4 py-2 rounded-md">
                        Opponents: {runState.opponentsDefeated}
                    </div>
                </>
            )}
        </div>
    );
    
    const renderMangaEyePanel = (
        username: string,
        leftEyeOpen: boolean,
        rightEyeOpen: boolean,
        isPlayer: boolean = true
    ) => {
        // For opponent during active gameplay, show "ready" state only (not individual blinks)
        // This maintains strategic gameplay while showing connection status
        const isGameActive = gameStatus === GameStatus.Playing || gameStatus === GameStatus.Countdown;
        const showReadyStateOnly = !isPlayer && isGameActive;

        // During game, opponent shows as "ready/active" if face is detected
        const opponentReady = showReadyStateOnly ? (opponentHasFace && remoteFaceMeshReady) : false;

        // Check if we should show victory state in opponent panel
        const showVictoryState = isContinuousMode && showVictoryNotification && !isPlayer;
        const showSearchingState = isContinuousMode && runState.status === 'transitioning' && !isPlayer;

        return (
        <div className="manga-eye-panel">
            <div className="flex flex-col items-center space-y-2">
                <div className="text-sm font-bold text-gray-300 mb-1">
                    {username}
                </div>

                {/* Victory State - Show "DEFEATED [Name]" in opponent panel */}
                {showVictoryState && (
                    <div className="victory-state-container">
                        <div className="text-2xl font-bold text-red-400 mb-1 animate-pulse">
                            🏆 DEFEATED!
                        </div>
                        <div className="text-sm text-gray-300">
                            {runState.currentOpponent?.username || 'Opponent'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                            Opponents: {victoryOpponentsDefeated}
                        </div>
                    </div>
                )}

                {/* Searching State - Show "SEARCHING..." in opponent panel */}
                {showSearchingState && !showVictoryState && (
                    <div className="searching-state-container">
                        <div className="text-xl font-bold text-yellow-400 mb-1 animate-pulse">
                            🔍 SEARCHING...
                        </div>
                        <div className="text-xs text-gray-400">
                            Finding opponent...
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                            Opponents: {runState.opponentsDefeated}
                        </div>
                    </div>
                )}

                {/* Normal Eye Display - Only show when not in victory/searching state */}
                {!showVictoryState && !showSearchingState && (
                    <>
                        <div className="manga-eye-container">
                            <div className={`manga-eye ${
                                showReadyStateOnly
                                    ? (opponentReady ? 'eye-ready' : 'eye-inactive')
                                    : (leftEyeOpen ? 'eye-open' : 'eye-closed')
                            } ${isPlayer ? 'player-eye' : 'opponent-eye'}`}>
                                <div className="eye-content">
                                    {showReadyStateOnly
                                        ? (opponentReady ? '👁️' : '○')
                                        : (leftEyeOpen ? <EyeOpenIcon /> : <EyeClosedIcon />)
                                    }
                                </div>
                            </div>
                            <div className="eye-label">L</div>
                        </div>

                        <div className="manga-eye-container">
                            <div className={`manga-eye ${
                                showReadyStateOnly
                                    ? (opponentReady ? 'eye-ready' : 'eye-inactive')
                                    : (rightEyeOpen ? 'eye-open' : 'eye-closed')
                            } ${isPlayer ? 'player-eye' : 'opponent-eye'}`}>
                                <div className="eye-content">
                                    {showReadyStateOnly
                                        ? (opponentReady ? '👁️' : '○')
                                        : (rightEyeOpen ? <EyeOpenIcon /> : <EyeClosedIcon />)
                                    }
                                </div>
                            </div>
                            <div className="eye-label">R</div>
                        </div>
                    </>
                )}
            </div>
        </div>
        );
    };

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
                        disabled={
                            isMyReady ||
                            !effectiveIsConnected ||
                            !opponentData ||
                            !!connectionError ||
                            !faceMeshReady ||
                            !isFaceCentered ||
                            lightingQuality === 'poor'
                        }
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
        <div className="w-full relative game-screen-mobile">
            <button onClick={onExit} className="absolute -top-12 right-0 btn-secondary z-10 touch-target">
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

            {/* Victory Notification for Continuous Mode Winners - Now shown in opponent's eye panel */}
            {/* Full-screen overlay removed as per Phase 2 requirements */}

            {/* Transition Overlay for Continuous Mode - positioned to cover entire game area */}
            {isContinuousMode && (
                <TransitionOverlay
                    isVisible={runState.status === 'transitioning' || runState.status === 'searching' || runState.status === 'countdown'}
                    runState={runState}
                />
            )}

            {/* Share Card Modal */}
            {showShareCard && shareCardImage && (
                <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
                    <div className="share-card-modal bg-gray-900 border-2 border-purple-500 rounded-2xl p-8 max-w-2xl w-full mx-4">
                        <h2 className="text-3xl font-bold text-white mb-6 text-center">
                            📸 Your Defeat Card
                        </h2>
                        
                        <div className="share-card-preview mb-6 flex justify-center">
                            <img
                                src={shareCardImage}
                                alt="Defeat Card"
                                className="max-w-full max-h-96 rounded-lg border-2 border-purple-400"
                            />
                        </div>
                        
                        <div className="text-center text-gray-300 mb-6">
                            <p className="text-lg mb-2">
                                <strong>{username}</strong> lasted for <strong>{formatTime(gameEndTime || 0)}</strong>
                            </p>
                            <p className="text-sm">
                                Share your staring contest result with friends!
                            </p>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                onClick={downloadShareCard}
                                className="btn-primary text-lg px-6 py-3 bg-green-600 hover:bg-green-700"
                            >
                                💾 Download Image
                            </button>
                            <button
                                onClick={shareToTwitter}
                                className="btn-primary text-lg px-6 py-3 bg-blue-500 hover:bg-blue-600"
                            >
                                🐦 Share on X/Twitter
                            </button>
                            <button
                                onClick={shareToInstagram}
                                className="btn-primary text-lg px-6 py-3 bg-pink-600 hover:bg-pink-700"
                            >
                                📸 Share on Instagram
                            </button>
                            <button
                                onClick={() => setShowShareCard(false)}
                                className="btn-secondary text-lg px-6 py-3"
                            >
                                ❌ Close
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <div className="manga-video-container mb-4">
                <div className="manga-video-feed">
                    <div className="video-crop-wrapper">
                        <VideoFeed 
                            videoRef={videoRef as React.RefObject<HTMLVideoElement>} 
                            canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>} 
                            username={username} 
                            isMuted={true} 
                        />
                    </div>
                </div>
                {(mode === GameMode.Multiplayer || mode === GameMode.Global || (mode === GameMode.Continuous && gameStatus !== GameStatus.GameOver)) && (
                    <div className="manga-video-feed">
                        <div className="video-crop-wrapper">
                            <VideoFeed
                                videoRef={remoteVideoRef as React.RefObject<HTMLVideoElement>}
                                canvasRef={remoteCanvasRef as React.RefObject<HTMLCanvasElement>}  // CHANGED: Now has canvas
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
                        leftEar > currentThreshold, 
                        rightEar > currentThreshold, 
                        true
                    )}
                    
                    {(mode === GameMode.Multiplayer || mode === GameMode.Global || mode === GameMode.Continuous) && (
                        <>
                            <div className="vs-divider">VS</div>
                            {renderMangaEyePanel(
                                opponentData?.username || runState.currentOpponent?.username || 'Opponent',
                                opponentLeftEar > currentThreshold,
                                opponentRightEar > currentThreshold,
                                false
                            )}
                        </>
                    )}
                </div>

                {renderScore()}

                {/* End Game Screen Overlay */}
                {gameStatus === GameStatus.GameOver && winner && renderEndGameScreen()}

                <div className="my-4 min-h-24 flex items-center justify-center">
                    {gameStatus === GameStatus.Countdown && (
                        <div className="text-6xl font-bold text-purple-400">{countdown}</div>
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
                
                .manga-eye.eye-open.opponent-eye {
                    background: linear-gradient(45deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.9));
                    border-color: rgb(59, 130, 246);
                    box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
                    animation: eyePulse 2s ease-in-out infinite;
                }

                .manga-eye.eye-closed.opponent-eye {
                    background: linear-gradient(45deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.9));
                    border-color: rgb(239, 68, 68);
                    box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
                    height: 15px;
                    animation: eyeBlink 0.5s ease-in-out;
                }

                .manga-eye.eye-ready.opponent-eye {
                    background: linear-gradient(45deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.9));
                    border-color: rgb(34, 197, 94);
                    box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
                    animation: eyePulse 2s ease-in-out infinite;
                }

                .manga-eye.eye-inactive.opponent-eye {
                    background: linear-gradient(45deg, rgba(107, 114, 128, 0.5), rgba(75, 85, 99, 0.6));
                    border-color: rgb(75, 85, 99);
                    box-shadow: 0 0 10px rgba(107, 114, 128, 0.2);
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

                /* End Game Screen Styles */
                .end-game-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.95);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    animation: fadeIn 0.5s ease-in;
                }

                .end-game-card {
                    background: linear-gradient(135deg, rgba(31, 31, 31, 0.95), rgba(15, 15, 15, 0.98));
                    border: 3px solid rgba(147, 51, 234, 0.5);
                    border-radius: 20px;
                    padding: 3rem;
                    max-width: 600px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(147, 51, 234, 0.3);
                    animation: slideUp 0.5s ease-out;
                }

                .eye-screenshot-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .eye-screenshot-img {
                    max-width: 300px;
                    max-height: 200px;
                    border-radius: 10px;
                    border: 2px solid rgba(147, 51, 234, 0.5);
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                }

                .winner-info {
                    padding: 1rem 0;
                }

                .game-stats {
                    display: flex;
                    justify-content: center;
                    gap: 2rem;
                    flex-wrap: wrap;
                }

                .stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .stat-label {
                    font-size: 0.875rem;
                    color: rgba(255, 255, 255, 0.6);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .stat-value {
                    font-size: 2rem;
                    font-weight: bold;
                    color: rgb(147, 51, 234);
                    text-shadow: 0 0 10px rgba(147, 51, 234, 0.5);
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes slideUp {
                    from {
                        transform: translateY(50px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                /* Victory Notification Styles */
                .victory-notification-card {
                    background: linear-gradient(135deg, rgba(31, 31, 31, 0.95), rgba(15, 15, 15, 0.98));
                    border: 3px solid rgba(34, 197, 94, 0.5);
                    border-radius: 20px;
                    padding: 3rem;
                    max-width: 500px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(34, 197, 94, 0.3);
                    animation: victorySlideUp 0.5s ease-out;
                }

                .victory-stats {
                    padding: 1rem 0;
                }

                @keyframes victorySlideUp {
                    from {
                        transform: translateY(50px) scale(0.9);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0) scale(1);
                        opacity: 1;
                    }
                }

                /* Victory and Searching State Styles */
                .victory-state-container {
                    text-align: center;
                    padding: 0.5rem;
                    border: 2px solid rgba(239, 68, 68, 0.5);
                    border-radius: 0.5rem;
                    background: linear-gradient(45deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.2));
                    box-shadow: 0 0 15px rgba(239, 68, 68, 0.3);
                    margin: 0.5rem 0;
                }

                .searching-state-container {
                    text-align: center;
                    padding: 0.5rem;
                    border: 2px solid rgba(234, 179, 8, 0.5);
                    border-radius: 0.5rem;
                    background: linear-gradient(45deg, rgba(234, 179, 8, 0.1), rgba(202, 138, 4, 0.2));
                    box-shadow: 0 0 15px rgba(234, 179, 8, 0.3);
                    margin: 0.5rem 0;
                }
            `}</style>
        </div>
    );
};

export default GameScreen;
