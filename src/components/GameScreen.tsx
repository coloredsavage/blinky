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
    const [shareCardDismissed, setShareCardDismissed] = useState(false);
    const [showMatchFoundSplash, setShowMatchFoundSplash] = useState(false);
    const matchFoundTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hasStartedCountdownRef = useRef(false); // Track if countdown started for current opponent
    const currentMatchIdRef = useRef<string | null>(null); // Track current match ID to prevent stale connections

    // For Global mode, track opponent separately since we don't use continuous-run server system
    const [globalOpponent, setGlobalOpponent] = useState<{ username: string; socketId: string } | null>(null);
    const [globalOpponentsDefeated, setGlobalOpponentsDefeated] = useState(0);
    const [isSearchingNextOpponent, setIsSearchingNextOpponent] = useState(false);
    const isSearchingNextOpponentRef = useRef(false); // Ref to avoid closure issues in event handlers
    const lastDefeatedOpponentRef = useRef<string | null>(null);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null); // NEW
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const bothEyesClosedStart = useRef<number | null>(null);
    const blinkFrameCount = useRef<number>(0); // Frame-based blink verification
    const faceLeftFrameTime = useRef<number | null>(null); // Track when face left frame for grace period
    
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
    
    // Global multiplayer hook - MUST be called BEFORE useSimplePeer to establish socket first
    const {
      currentMatch: globalMatch,
      submitGameResult,
      joinGlobalQueue,
      isInQueue,
      socket: globalSocket,
    } = useGlobalMultiplayer(mode === GameMode.Global); // Enable for global mode to get the socket

    // Room-based multiplayer hook - pass global socket to prevent duplication
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
      localStream,
      cleanupPeerOnly,
      initializePeer,
    } = useSimplePeer(username, mode === GameMode.Global ? globalSocket : null);

    // Continuous run mechanics - used by BOTH Continuous and Global modes
    // Continuous mode = endless local practice with continuous mechanics
    // Global mode = global matchmaking using the same continuous mechanics
    const {
      runState,
      startRun,
      endRun,
      handleOpponentLoss,
      handlePlayerLoss,
      isInRun,
    } = useContinuousRun(simplePeerSocket);

    // Mode flags for clarity
    const isGlobalMode = mode === GameMode.Global; // Global matchmaking
    const isContinuousMode = mode === GameMode.Continuous || mode === GameMode.Global; // Uses continuous mechanics
    const multiplayerData = isGlobalMode ? globalMatchData : null;
    // Use globalMatchData (prop) as fallback if globalMatch (from hook) is null
    const effectiveGlobalMatch = globalMatch || globalMatchData;
    // Use opponent from SimplePeer first, then fall back to match data
    const opponentData = isGlobalMode
        ? (opponent || effectiveGlobalMatch?.opponent)
        : opponent;

    // For Global mode, consider connected if we have remote stream
    // For global mode, use actual peer connection status, not remoteStream
    // remoteStream can be stale during transitions between matches
    const effectiveIsConnected = isGlobalMode ? (isConnected && !!remoteStream && !!effectiveGlobalMatch) : isConnected;

    // Initialize match ID for first match from globalMatchData
    useEffect(() => {
        if (isGlobalMode && globalMatchData && globalMatchData.matchId && !currentMatchIdRef.current) {
            console.log('🆔 [INIT] Setting initial match ID from globalMatchData:', globalMatchData.matchId);
            currentMatchIdRef.current = globalMatchData.matchId;

            // Also set the opponent for first match
            if (globalMatchData.opponent && !globalOpponent) {
                console.log('👤 [INIT] Setting initial opponent from globalMatchData:', globalMatchData.opponent);
                setGlobalOpponent({
                    username: globalMatchData.opponent.username,
                    socketId: globalMatchData.matchId
                });
            }
        }
    }, [isGlobalMode, globalMatchData, globalOpponent]);

    // Initialize local stream for continuous mode
    useEffect(() => {
      if (isContinuousMode) {
        console.log('📹 Continuous mode: Initializing local stream...');
        initializeLocalStream();
      }
    }, [isContinuousMode, initializeLocalStream]);

    // Auto-start continuous run when entering continuous mode (ONLY for Continuous, NOT Global)
    // Global mode is handled by global matchmaking server
    useEffect(() => {
      if (mode === GameMode.Continuous && simplePeerSocket && runState.status === 'ended' && isLocalStreamReady) {
        console.log('🏃 Auto-starting continuous run for:', username);
        startRun(username);
      }
    }, [mode, simplePeerSocket, username, startRun, runState.status, isLocalStreamReady]);

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
      console.log('🔄 Blink winner effect triggered:', {
        isContinuousMode,
        lastBlinkWinner,
        victoryNotificationShown: victoryNotificationShownRef.current,
        gameStatus,
        runStateStatus: runState.status,
        currentOpponent: runState.currentOpponent
      });

      // Get current opponent identifier for Global mode
      const currentOpponentId = mode === GameMode.Global ? globalOpponent?.socketId : runState.currentOpponent?.socketId;
      const alreadyDefeatedThisOpponent = lastDefeatedOpponentRef.current === currentOpponentId;

      if (isContinuousMode && lastBlinkWinner && lastBlinkWinner.includes('Win') && !alreadyDefeatedThisOpponent && gameStatus === GameStatus.Playing && currentOpponentId) {
        // Player won against current opponent
        console.log('🎯 Continuous/Global run: Player won via BLINK message');
        console.log('🎯 Mode:', mode, 'Run state:', runState, 'Global opponent:', globalOpponent);

        // Mark this opponent as defeated to prevent double-trigger
        lastDefeatedOpponentRef.current = currentOpponentId;
        victoryNotificationShownRef.current = true;

        // STOP the current game for winner
        setGameStatus(GameStatus.Idle);
        const gameTime = Date.now() - (gameStartTime || 0);
        setGameEndTime(gameTime);
        console.log('✅ Game stopped, status set to Idle, gameTime:', gameTime);

        // Clear winner state (not showing end screen for winner in continuous)
        setWinner(null);

        // For Global mode vs Continuous mode
        if (mode === GameMode.Global) {
          // Global mode: Increment global counter and show notification
          const newOpponentsDefeated = globalOpponentsDefeated + 1;
          setGlobalOpponentsDefeated(newOpponentsDefeated);
          setShowVictoryNotification(true);
          setVictoryOpponentsDefeated(newOpponentsDefeated);
          console.log('🌍 [VICTORY FLOW] Global mode - opponents defeated:', newOpponentsDefeated);

          // Auto-hide victory notification and find next opponent (stay in same session!)
          setTimeout(() => {
            console.log('⏱️ [VICTORY FLOW] Hiding victory notification, finding next opponent in same session');
            console.log('📊 [VICTORY FLOW] Current state before reset:', {
              gameStatus,
              winner,
              hasGameStartTime: !!gameStartTime,
              hasGameEndTime: !!gameEndTime,
              globalOpponent,
              isSearchingNextOpponent,
              simplePeerSocketConnected: simplePeerSocket?.connected,
              simplePeerSocketId: simplePeerSocket?.id
            });

            setShowVictoryNotification(false);

            // Reset game state for next match BUT keep session alive
            setGameStatus(GameStatus.Idle);
            setWinner(null);
            setWinnerUsername(null);
            setGameStartTime(null);
            setGameEndTime(null);
            setEyeScreenshot(null);
            setIsMyReady(false);

            // Reset ALL blink detection state
            bothEyesClosedStart.current = null;
            blinkFrameCount.current = 0;
            faceLeftFrameTime.current = null;

            // Reset countdown/match tracking refs
            hasStartedCountdownRef.current = false;
            currentMatchIdRef.current = null;

            // Show searching state and clear defeated opponent
            console.log('🔍 [VICTORY FLOW] Setting isSearchingNextOpponent = true (both state and ref)');
            setIsSearchingNextOpponent(true);
            isSearchingNextOpponentRef.current = true;

            console.log('🧹 [VICTORY FLOW] Clearing globalOpponent (was:', globalOpponent?.username, ')');
            setGlobalOpponent(null); // Clear defeated opponent so new one can be detected

            // Cleanup peer connection but keep camera running (continuous play optimization)
            console.log('🧹 ========== VICTORY FLOW: CLEANUP PHASE ==========');
            console.log('🧹 [VICTORY FLOW] About to call cleanupPeerOnly');
            console.log('🧹 [VICTORY FLOW] Pre-cleanup state:', {
              hasConnection: !!connection,
              isConnected,
              hasRemoteStream: !!remoteStream,
              opponent: opponent?.username
            });
            cleanupPeerOnly();
            console.log('✅ [VICTORY FLOW] cleanupPeerOnly completed');

            // Rejoin the queue using the simplePeerSocket to avoid conflicts
            console.log('🔄 ========== VICTORY FLOW: REJOIN QUEUE PHASE ==========');
            console.log('🔄 [VICTORY FLOW] Rejoining global queue for next opponent:', username);
            console.log('🔌 [VICTORY FLOW] Socket status:', {
              exists: !!simplePeerSocket,
              connected: simplePeerSocket?.connected,
              id: simplePeerSocket?.id,
              hasListeners: simplePeerSocket ? simplePeerSocket.listeners('global-match-found').length : 0
            });

            if (simplePeerSocket?.connected) {
              console.log('✅ [VICTORY FLOW] Emitting join-global-queue event');
              simplePeerSocket.emit('join-global-queue', { username });
              console.log('✅ [VICTORY FLOW] join-global-queue event emitted successfully');
            } else {
              console.error('❌ [VICTORY FLOW] Cannot rejoin queue - socket not connected!');
            }
          }, 3000);
        } else {
          // Continuous mode: Use run state
          setVictoryTime(runState.currentTime);
          setShowVictoryNotification(true);
          setVictoryOpponentsDefeated(runState.opponentsDefeated + 1);
          console.log('🏆 Continuous mode - victory notification shown, opponents defeated:', runState.opponentsDefeated + 1);

          // Auto-hide victory notification after 3 seconds
          setTimeout(() => {
            console.log('⏱️ Hiding victory notification after 3 seconds');
            setShowVictoryNotification(false);
            victoryNotificationShownRef.current = false;
          }, 3000);

          if (runState.currentOpponent) {
            console.log('🎯 Calling handleOpponentLoss for:', runState.currentOpponent);
            handleOpponentLoss(runState.currentOpponent.socketId);
          } else {
            console.log('❌ No current opponent to handle loss for!');
          }
        }
      } else if (isContinuousMode && lastBlinkWinner && lastBlinkWinner.includes('Lose') && gameStatus === GameStatus.Playing) {
        // Player lost - end the run immediately (BLINK message was already sent before this)
        // ONLY end if game is actively playing to prevent premature endings
        console.log('💀 Continuous run: Player lost during active gameplay - ending run');
        handlePlayerLoss();
      }
    }, [isContinuousMode, lastBlinkWinner, gameStatus, runState.currentOpponent, runState.opponentsDefeated, runState.currentTime, handleOpponentLoss, handlePlayerLoss, gameStartTime, runState]);

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

    // Removed spammy opponent eye status debug logging

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
        // Don't process lastBlinkWinner if we're searching for next opponent (continuous mode)
        if (lastBlinkWinner && !isSearchingNextOpponent) {
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
        } else if (lastBlinkWinner && isSearchingNextOpponent) {
            console.log('⏭️ Ignoring lastBlinkWinner during continuous mode search:', lastBlinkWinner);
        }
    }, [lastBlinkWinner, gameStartTime, updateSessionStats, captureEyeScreenshot, username, opponentData, isSearchingNextOpponent]);

    const resetGame = useCallback(() => {
        setGameStatus(GameStatus.Idle);
        setScore(0);
        setWinner(null);
        setGameStartTime(null);
        setGameEndTime(null);
        setEyeScreenshot(null);
        setWinnerUsername(null);
        setShowShareCard(false);
        setShareCardDismissed(false);
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
    if (isGlobalMode) {
      // Global mode: Exit back to queue screen
      console.log('🏠 Exiting back to Global Queue screen');
      onExit();
    } else {
      // Continuous mode: Restart the run
      console.log('🔄 Restarting Continuous run');

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

      // Start a new continuous run
      console.log('🏃 Starting new run for:', username);
      startRun(username);
    }
  }, [isGlobalMode, username, startRun, resetGameState, onExit]);

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
    
    // Initialize Global mode opponent tracking when match is found
    useEffect(() => {
        console.log('🔧 [OPPONENT DETECTION] Effect triggered:', {
            mode,
            effectiveIsConnected,
            hasOpponentData: !!opponentData,
            opponentDataUsername: opponentData?.username,
            hasOpponent: !!opponent,
            opponentSocketId: opponent?.socketId,
            hasRemoteStream: !!remoteStream,
            remoteStreamId: remoteStream?.id,
            currentGlobalOpponent: globalOpponent?.username,
            currentGlobalOpponentSocketId: globalOpponent?.socketId
        });

        // Only run opponent detection for FIRST match
        // For subsequent matches (continuous mode), opponent is set in match-found handler
        if (mode === GameMode.Global && effectiveIsConnected && opponentData && !globalOpponent) {
            console.log('🌍 [OPPONENT DETECTION] First match - setting up opponent');
            const opponentSocketId = opponent?.socketId || remoteStream?.id || 'unknown';

            setGlobalOpponent({
                username: opponentData.username,
                socketId: opponentSocketId
            });
            console.log('✅ [OPPONENT DETECTION] globalOpponent state updated for first match');

            // Reset victory tracking for match
            victoryNotificationShownRef.current = false;
            lastDefeatedOpponentRef.current = null;
            hasStartedCountdownRef.current = false;
        } else if (globalOpponent) {
            console.log('⏭️ [OPPONENT DETECTION] Opponent already set (continuous mode), skipping detection');
        } else {
            console.log('⏭️ [OPPONENT DETECTION] Conditions not met for opponent tracking');
        }
    }, [mode, effectiveIsConnected, opponentData, globalOpponent, opponent, remoteStream]);

    // Watch for new global matches when searching for next opponent (continuous session)
    // Set up listener ALWAYS for Global mode, not just when searching
    useEffect(() => {
        console.log('🔧 [LISTENER SETUP] Effect triggered:', {
            mode,
            hasSimplePeerSocket: !!simplePeerSocket,
            simplePeerSocketConnected: simplePeerSocket?.connected,
            simplePeerSocketId: simplePeerSocket?.id,
            isSearchingNextOpponent
        });

        if (mode !== GameMode.Global || !simplePeerSocket) {
            console.log('⏭️ [LISTENER SETUP] Skipping listener setup - not Global mode or no socket');
            return;
        }

        console.log('👂 [LISTENER SETUP] Setting up global-match-found listener for Global mode');
        console.log('📊 [LISTENER SETUP] Current listener count before setup:', simplePeerSocket.listeners('global-match-found').length);

        const handleGlobalMatchFound = (matchData: { matchId: string; opponent: { username: string }; isHost: boolean }) => {
            console.log('🎯 [MATCH FOUND] Event received! Match data:', matchData);
            console.log('📊 [MATCH FOUND] Current state:', {
                isSearchingNextOpponentState: isSearchingNextOpponent,
                isSearchingNextOpponentRef: isSearchingNextOpponentRef.current,
                gameStatus,
                hasGlobalOpponent: !!globalOpponent,
                globalOpponentUsername: globalOpponent?.username,
                hasRemoteStream: !!remoteStream,
                isLocalStreamReady,
                isPeerConnected: isConnected
            });

            // Only process if we're actually searching (check REF not state to avoid closure issues)
            if (!isSearchingNextOpponentRef.current) {
                console.log('⏭️ [MATCH FOUND] Ignoring match - not currently searching (isSearchingNextOpponentRef.current = false)');
                return;
            }

            console.log('✅ [MATCH FOUND] Processing match while searching for next opponent');

            // Stop searching state
            console.log('🔍 [MATCH FOUND] Setting isSearchingNextOpponent = false (both state and ref)');
            setIsSearchingNextOpponent(false);
            isSearchingNextOpponentRef.current = false;

            // The match data includes opponent info and new matchId
            const newMatchId = matchData.matchId;
            console.log('🔄 [MATCH FOUND] Setting up peer connection for new match:', newMatchId);
            console.log('🏠 [MATCH FOUND] Role:', matchData.isHost ? 'HOST' : 'GUEST');

            // Reset game state to allow new room join (clear flags from previous match)
            console.log('🔄 [MATCH FOUND] Resetting game state before joining new room');
            resetGameState();

            // Store current match ID to verify peer connections
            currentMatchIdRef.current = newMatchId;
            console.log('🆔 [MATCH FOUND] Set current match ID:', newMatchId);

            // Set the new opponent data immediately so auto-start can work
            // Use matchId as socketId to ensure each match has a unique opponent identifier
            console.log('👤 [MATCH FOUND] Setting opponent data:', matchData.opponent);
            setGlobalOpponent({
                username: matchData.opponent.username,
                socketId: newMatchId  // Use matchId to make each opponent unique
            });

            // Initialize peer for new match (camera already running from cleanupPeerOnly)
            console.log('🔄 ========== MATCH FOUND: INITIALIZE PEER PHASE ==========');
            console.log('🔄 [MATCH FOUND] About to call initializePeer');
            console.log('🔄 [MATCH FOUND] Pre-init peer state:', {
              hasConnection: !!connection,
              isConnected,
              hasRemoteStream: !!remoteStream,
              hasSocket: !!simplePeerSocket,
              socketConnected: simplePeerSocket?.connected
            });
            initializePeer();
            console.log('✅ [MATCH FOUND] initializePeer() called');

            // Create or join the new peer connection
            console.log('🔄 ========== MATCH FOUND: CREATE/JOIN ROOM PHASE ==========');
            if (matchData.isHost) {
                console.log(`🏠 [MATCH FOUND] About to call createRoom(${newMatchId})`);
                console.log('🏠 [MATCH FOUND] Current state before createRoom:', {
                  hasLocalStream: !!localStream,
                  socketConnected: simplePeerSocket?.connected,
                  hasExistingPeer: !!connection
                });
                createRoom(newMatchId);
                console.log('✅ [MATCH FOUND] createRoom() called');
            } else {
                console.log(`👤 [MATCH FOUND] About to call joinRoom(${newMatchId})`);
                console.log('👤 [MATCH FOUND] Current state before joinRoom:', {
                  hasLocalStream: !!localStream,
                  socketConnected: simplePeerSocket?.connected,
                  hasExistingPeer: !!connection
                });
                joinRoom(newMatchId);
                console.log('✅ [MATCH FOUND] joinRoom() called');
            }
            console.log('🔄 ========== MATCH FOUND HANDLER COMPLETE ==========');
        };

        console.log('🔗 [LISTENER SETUP] Attaching event listener to socket');
        simplePeerSocket.on('global-match-found', handleGlobalMatchFound);
        console.log('✅ [LISTENER SETUP] Event listener attached successfully');
        console.log('📊 [LISTENER SETUP] Current listener count after setup:', simplePeerSocket.listeners('global-match-found').length);

        return () => {
            console.log('🧹 [LISTENER CLEANUP] Removing global-match-found listener');
            simplePeerSocket.off('global-match-found', handleGlobalMatchFound);
            console.log('✅ [LISTENER CLEANUP] Listener removed');
        };
    }, [mode, simplePeerSocket, createRoom, joinRoom, isSearchingNextOpponent]);

    // Socket reconnection handler for continuous play
    useEffect(() => {
        if (!isGlobalMode || !simplePeerSocket) return;

        const handleReconnect = () => {
            console.log('🔄 [RECONNECT] Socket reconnected');

            // If we were searching for an opponent when disconnected, rejoin queue
            if (isSearchingNextOpponentRef.current) {
                console.log('🔄 [RECONNECT] Was searching, rejoining global queue');
                simplePeerSocket.emit('join-global-queue', { username });
            }
        };

        simplePeerSocket.on('reconnect', handleReconnect);

        return () => {
            simplePeerSocket.off('reconnect', handleReconnect);
        };
    }, [isGlobalMode, simplePeerSocket, username]);

    // Auto-start for Global mode (no splash screen - it's not continuous mode)
    // Use username as stable dependency instead of the entire opponentData object
    const opponentUsername = opponentData?.username;

    useEffect(() => {
        console.log('🔍 [AUTO-START] Effect triggered:', {
            mode,
            effectiveIsConnected,
            hasOpponentData: !!opponentData,
            opponentUsername,
            gameStatus,
            hasStartedCountdown: hasStartedCountdownRef.current,
            globalOpponentSocketId: globalOpponent?.socketId,
            currentMatchId: currentMatchIdRef.current
        });

        if (mode === GameMode.Global && effectiveIsConnected && opponentUsername && gameStatus === GameStatus.Idle) {
            // Verify we're connected to the CURRENT match, not a stale connection
            const isCorrectMatch = globalOpponent?.socketId === currentMatchIdRef.current;

            if (!isCorrectMatch) {
                console.log('⚠️ [AUTO-START] Skipping - opponent socketId does not match current match ID');
                console.log('   Expected:', currentMatchIdRef.current, 'Got:', globalOpponent?.socketId);
                return;
            }

            // Only start countdown if we haven't already for this opponent
            if (!hasStartedCountdownRef.current) {
                console.log('🎯 Global match ready! Starting countdown immediately...');
                hasStartedCountdownRef.current = true; // Mark as started

                // Start immediately - no timeout needed since we're using the ref to prevent duplicates
                console.log('🎯 Starting countdown for global match');
                startCountdown();
            } else {
                console.log('⏭️ Countdown already started for this opponent, skipping');
            }
        }
    }, [mode, effectiveIsConnected, opponentUsername, gameStatus, startCountdown, globalOpponent]);

    // Regular multiplayer still uses ready system
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
    }, [mode, isMyReady, isOpponentReady, gameStatus, startCountdown, opponentData, isConnected, connectionStatus, opponent, globalMatch]);

    // Auto-lose if player leaves frame during gameplay (with grace period)
    useEffect(() => {
        if (gameStatus !== GameStatus.Playing) {
            // Reset grace period when not playing
            faceLeftFrameTime.current = null;
            return;
        }

        const FRAME_EXIT_GRACE_PERIOD_MS = 2000; // 2 second grace period

        // Check if local player left the frame
        if (!isFaceCentered) {
            if (faceLeftFrameTime.current === null) {
                faceLeftFrameTime.current = Date.now();
                console.log('⚠️ Face left frame - grace period started (2 seconds)');
            } else if (Date.now() - faceLeftFrameTime.current > FRAME_EXIT_GRACE_PERIOD_MS) {
                console.log('❌ Face out of frame too long - Auto lose!');
                faceLeftFrameTime.current = null;

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
        } else {
            if (faceLeftFrameTime.current !== null) {
                console.log('✅ Face returned to frame - grace period cancelled');
                faceLeftFrameTime.current = null;
            }
        }
    }, [gameStatus, isFaceCentered, mode, sendData, updateSessionStats, gameStartTime, globalMatchData, submitGameResult, session]);

    useEffect(() => {
        if (gameStatus !== GameStatus.Playing || !faceMeshReady) {
            // Reset blink detection when not playing
            blinkFrameCount.current = 0;
            bothEyesClosedStart.current = null;
            return;
        }

        const leftClosed = leftEar < currentThreshold;
        const rightClosed = rightEar < currentThreshold;

        if (leftClosed && rightClosed) {
            // Increment frame count for consecutive closed-eye detections
            blinkFrameCount.current++;

            // Require 3 consecutive frames before starting blink timer
            // This prevents false positives from momentary detection errors
            const BLINK_CONFIRMATION_FRAMES = 3;

            if (blinkFrameCount.current >= BLINK_CONFIRMATION_FRAMES) {
                if (bothEyesClosedStart.current === null) {
                    bothEyesClosedStart.current = Date.now();
                    console.log('👁️ Confirmed blink started (after', BLINK_CONFIRMATION_FRAMES, 'frames)');
                } else if (Date.now() - bothEyesClosedStart.current > BLINK_DURATION_MS) {
                    // Confirmed deliberate blink - end game
                    console.log('👁️ Blink confirmed - ending game');
                    blinkFrameCount.current = 0;
                    bothEyesClosedStart.current = null;

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
            }
        } else {
            // Eyes are open - reset counters
            blinkFrameCount.current = 0;
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
                // Global mode: Auto-starts, show "Get Ready" message
                if (mode === GameMode.Global) return "Get Ready...";

                // Multiplayer mode: Manual ready button
                if (!isMyReady) return "Click 'Ready' to start";
                if (!isOpponentReady) return `Waiting for ${opponentData.username}...`;
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

    // REMOVED: Auto-create share card when player loses
    // The defeat card should only appear when user explicitly clicks the button
    // This was causing the modal to auto-appear and re-trigger on close

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
                                    onClick={async () => {
                                        console.log('📸 Share button clicked (Continuous mode)');
                                        await createShareCard();
                                    }}
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
                        {isContinuousMode ? (
                            <>
                                <button
                                    className="btn-primary text-xl px-8 py-4"
                                    onClick={handlePlayAgain}
                                >
                                    🔄 Try Again
                                </button>
                                <button
                                    className="btn-secondary text-xl px-8 py-4"
                                    onClick={onExit}
                                >
                                    🏠 Return to Menu
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="btn-primary text-xl px-8 py-4"
                                    onClick={resetGame}
                                >
                                    🔄 Play Again
                                </button>
                                <button
                                    className="btn-secondary text-xl px-8 py-4"
                                    onClick={onExit}
                                >
                                    🏠 Exit
                                </button>
                            </>
                        )}
                    </div>

                    {/* Share Card Button for All Modes */}
                    {eyeScreenshot && (
                        <div className="mt-6">
                            <button
                                onClick={async () => {
                                    console.log('📸 Share button clicked, eyeScreenshot:', !!eyeScreenshot, 'gameEndTime:', gameEndTime);
                                    const result = await createShareCard();
                                    console.log('📸 createShareCard result:', !!result);
                                }}
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
        // Global mode: No ready button - auto-starts
        if (mode === GameMode.Global && gameStatus === GameStatus.Idle) {
            return null; // No controls needed - auto-starts after match found
        }

        // Regular multiplayer: Keep ready button
        if (mode === GameMode.Multiplayer && gameStatus === GameStatus.Idle) {
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

            {/* Transition Overlay for Continuous Mode - positioned to cover entire game area */}
            {isContinuousMode && mode !== GameMode.Global && (
                <TransitionOverlay
                    isVisible={runState.status === 'transitioning' || runState.status === 'searching' || runState.status === 'countdown'}
                    runState={runState}
                />
            )}

            {/* Finding Next Opponent Overlay for Global Mode */}
            {isGlobalMode && isSearchingNextOpponent && (
                <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50">
                    <div className="text-center space-y-8 p-8">
                        <div className="animate-pulse">
                            <div className="text-6xl mb-4">🌍</div>
                            <h2 className="text-4xl font-bold text-white mb-2">
                                Finding Next Opponent
                            </h2>
                            <p className="text-xl text-gray-300">
                                Searching for your next challenger...
                            </p>
                        </div>

                        <div className="flex gap-4 justify-center items-center">
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={() => {
                                    console.log('🛑 User clicked Return to Menu during search');
                                    setIsSearchingNextOpponent(false);
                                    isSearchingNextOpponentRef.current = false;
                                    onExit();
                                }}
                                className="btn-secondary text-lg px-8 py-3 bg-gray-700 hover:bg-gray-600 border-2 border-gray-500 rounded-lg transition-all"
                            >
                                Return to Menu
                            </button>
                        </div>
                    </div>
                </div>
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
                                onClick={() => {
                                    setShowShareCard(false);
                                    setShareCardDismissed(true);
                                }}
                                className="btn-secondary text-lg px-6 py-3"
                            >
                                ❌ Close
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Hide video feeds only on game over */}
            {gameStatus !== GameStatus.GameOver && (
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
                    {(mode === GameMode.Multiplayer || mode === GameMode.Global || mode === GameMode.Continuous) && (
                        <div className="manga-video-feed relative">
                            <div className="video-crop-wrapper">
                                <VideoFeed
                                    videoRef={remoteVideoRef as React.RefObject<HTMLVideoElement>}
                                    canvasRef={remoteCanvasRef as React.RefObject<HTMLCanvasElement>}
                                    username={opponentData?.username || 'Waiting...'}
                                    isMuted={false}
                                    remoteStream={remoteStream}
                                    isRemote={true}
                                />
                            </div>

                            {/* Victory Notification - Overlay on opponent's video */}
                            {showVictoryNotification && (
                                <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center rounded-lg animate-fadeIn z-10">
                                    <div className="text-center p-4">
                                        <div className="text-6xl mb-4 animate-bounce">🏆</div>
                                        <h1 className="text-4xl font-bold text-green-400 mb-2 animate-pulse">
                                            OPPONENT DEFEATED!
                                        </h1>
                                        <div className="text-2xl text-purple-300 mb-2">
                                            {runState.currentOpponent?.username || globalOpponent?.username || 'Opponent'}
                                        </div>
                                        <div className="text-xl text-gray-300">
                                            Defeated: <span className="text-yellow-400 font-bold">{victoryOpponentsDefeated}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Searching for Next Opponent - Overlay on opponent's video */}
                            {isSearchingNextOpponent && (
                                <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center rounded-lg animate-fadeIn z-10">
                                    <div className="text-center p-4">
                                        <div className="text-5xl mb-3 animate-pulse">🔍</div>
                                        <h2 className="text-3xl font-bold text-white mb-2">Searching...</h2>
                                        <div className="text-lg text-purple-300 mb-2">Finding next opponent</div>
                                        <div className="text-md text-gray-400">
                                            Defeated: <span className="text-yellow-400 font-bold">{globalOpponentsDefeated}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-2">
                                            Keep staring!
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Hide this entire section during game over */}
            {gameStatus !== GameStatus.GameOver && (
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
                                const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
                                const response = await fetch(`${SOCKET_URL}/rooms`);
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
            )}

            {/* End Game Screen - shown when gameStatus is GameOver */}
            {renderEndGameScreen()}

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

                /* Match Found Splash Screen */
                .match-found-card {
                    background: linear-gradient(135deg, rgba(31, 31, 31, 0.98), rgba(15, 15, 15, 0.98));
                    border: 4px solid rgba(34, 197, 94, 0.6);
                    border-radius: 24px;
                    padding: 4rem 3rem;
                    max-width: 600px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 20px 80px rgba(34, 197, 94, 0.4);
                    animation: matchFoundSlideUp 0.5s ease-out;
                }

                .opponent-reveal {
                    padding: 1.5rem;
                    background: rgba(147, 51, 234, 0.1);
                    border-radius: 16px;
                    border: 2px solid rgba(147, 51, 234, 0.3);
                }

                @keyframes matchFoundSlideUp {
                    from {
                        transform: translateY(100px) scale(0.9);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0) scale(1);
                        opacity: 1;
                    }
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
};

export default GameScreen;
