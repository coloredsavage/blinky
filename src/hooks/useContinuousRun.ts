import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

export interface RunData {
  runId: string;
  currentTime: number;
  gameTime: number; // Current match duration
  opponentsDefeated: number;
  currentOpponent: {
    username: string;
    socketId: string;
  } | null;
  nextOpponent: {
    username: string;
    socketId: string;
  } | null;
  status: 'searching' | 'countdown' | 'active' | 'transitioning' | 'ended';
  matchHistory: Array<{
    opponent: string;
    defeatedAt: number;
    duration: number;
  }>;
  hasStartedFirstMatch: boolean; // Track if first match has started
  searchMessageIndex: number; // Track current search message for rotation
  searchStartTime: number; // Track when search started for message rotation
  gameStartTimestamp?: number; // Server-synchronized game start timestamp
}

export interface UseContinuousRunReturn {
  runState: RunData;
  startRun: (username: string) => void;
  endRun: (reason?: string) => void;
  handleOpponentLoss: (opponentSocketId: string) => void;
  handlePlayerLoss: () => void;
  isInRun: boolean;
}

const useContinuousRun = (socket: Socket | null): UseContinuousRunReturn => {
  const [runState, setRunState] = useState<RunData>({
    runId: '',
    currentTime: 0,
    gameTime: 0,
    opponentsDefeated: 0,
    currentOpponent: null,
    nextOpponent: null,
    status: 'ended',
    matchHistory: [],
    hasStartedFirstMatch: false,
    searchMessageIndex: 0,
    searchStartTime: 0
  });

  const runTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchMessageRotationRef = useRef<NodeJS.Timeout | null>(null);

  // Generate unique run ID
  const generateRunId = useCallback(() => {
    return 'RUN_' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }, []);

  // Start the run timer
  const startRunTimer = useCallback(() => {
    if (runTimerRef.current) {
      clearInterval(runTimerRef.current);
    }

    runTimerRef.current = setInterval(() => {
      setRunState(prev => ({
        ...prev,
        currentTime: prev.currentTime + 100 // Update every 100ms for smooth display
      }));
    }, 100);
  }, []);

  // Stop the run timer
  const stopRunTimer = useCallback(() => {
    if (runTimerRef.current) {
      clearInterval(runTimerRef.current);
      runTimerRef.current = null;
    }
  }, []);

  // Start the game timer (resets and starts for current match)
  const startGameTimer = useCallback(() => {
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
    }

    // If we have server timestamp, use it; otherwise use local time
    const startTime = runState.gameStartTimestamp || Date.now();

    // Reset game time to 0
    setRunState(prev => ({
      ...prev,
      gameTime: 0
    }));

    gameTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setRunState(prev => ({
        ...prev,
        gameTime: elapsed
      }));
    }, 100);
  }, [runState.gameStartTimestamp]);

  // Stop the game timer
  const stopGameTimer = useCallback(() => {
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
  }, []);

  // Handle countdown complete - starts game timer and marks first match if needed
  const handleCountdownComplete = useCallback(() => {
    console.log('🎯 Countdown complete - starting game timer');
    
    // Start game timer for current match
    startGameTimer();
    
    // If this is the first match, mark it as started and start personal timer
    if (!runState.hasStartedFirstMatch) {
      console.log('🏁 First match started - starting personal timer');
      startRunTimer(); // Start personal timer on first match
      setRunState(prev => ({
        ...prev,
        hasStartedFirstMatch: true
      }));
    }
  }, [startGameTimer, startRunTimer, runState.hasStartedFirstMatch]);

  // Start a new continuous run
  const startRun = useCallback((username: string) => {
    const runId = generateRunId();

    console.log('🏃 Starting continuous run:', runId);
    console.log('🔌 Socket status:', {
      exists: !!socket,
      connected: socket?.connected,
      id: socket?.id
    });

    setRunState({
      runId,
      currentTime: 0,
      gameTime: 0,
      opponentsDefeated: 0,
      currentOpponent: null,
      nextOpponent: null,
      status: 'searching',
      matchHistory: [],
      hasStartedFirstMatch: false,
      searchMessageIndex: 0,
      searchStartTime: Date.now()
    });

    // Join the continuous run queue
    if (socket) {
      console.log('🚀 Emitting continuous-run:join event:', { username, runId, socketId: socket.id });
      socket.emit('continuous-run:join', { username, runId });
    } else {
      console.error('❌ Cannot emit continuous-run:join - socket is null!');
    }

    // Personal timer will start in handleCountdownComplete() on first match
    // DO NOT start timer here - it should only start when first match begins
  }, [socket, generateRunId]);

  // End the current run
  const endRun = useCallback((reason?: string) => {
    console.log('🏁 Ending continuous run:', runState.runId, reason);
    
    stopRunTimer();
    
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    // Notify server that run ended
    if (socket && runState.runId) {
      socket.emit('continuous-run:end', { 
        runId: runState.runId,
        reason: reason || 'player_lost'
      });
    }

    setRunState(prev => ({
      ...prev,
      status: 'ended',
      currentOpponent: null,
      nextOpponent: null
    }));
  }, [socket, runState.runId, stopRunTimer]);

  // Handle when opponent loses (player wins)
  const handleOpponentLoss = useCallback((opponentSocketId: string) => {
    if (runState.status !== 'active' || !runState.currentOpponent) {
      console.log('❌ Cannot handle opponent loss - no active opponent');
      return;
    }

    if (runState.currentOpponent.socketId !== opponentSocketId) {
      console.log('❌ Opponent socket ID mismatch');
      return;
    }

    console.log('🎯 Opponent defeated! Finding next challenger...');

    // Stop game timer for current match
    stopGameTimer();

    // Record the match in history
    const matchRecord = {
      opponent: runState.currentOpponent.username,
      defeatedAt: runState.currentTime,
      duration: runState.gameTime // Use game time for match duration
    };

    setRunState(prev => ({
      ...prev,
      opponentsDefeated: prev.opponentsDefeated + 1,
      status: 'transitioning',
      matchHistory: [...prev.matchHistory, matchRecord],
      currentOpponent: null
    }));

    // Request next opponent from server
    if (socket && runState.runId) {
      socket.emit('continuous-run:find-next', { 
        runId: runState.runId,
        currentTime: runState.currentTime,
        opponentsDefeated: runState.opponentsDefeated + 1
      });
    }

    // Set transition timeout (extended to 5 minutes to allow for indefinite searching)
    transitionTimeoutRef.current = setTimeout(() => {
      console.log('⏰ No opponent found after 5 minutes - ending run');
      endRun('queue_timeout');
    }, 300000); // 5 minutes
  }, [socket, runState, endRun, stopGameTimer]);

  // Handle when player loses
  const handlePlayerLoss = useCallback(() => {
    console.log('💀 Player lost - stopping timer and ending run');
    // Stop timers immediately before calling endRun to prevent race condition
    stopRunTimer();
    stopGameTimer();
    endRun('player_lost');
  }, [endRun, stopRunTimer, stopGameTimer]);

  // Handle new opponent found
  const handleNewOpponent = useCallback((data: {
    opponent: { username: string; socketId: string };
    yourCurrentTime: number;
  }) => {
    console.log('🎯 New opponent found:', data.opponent.username);

    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    setRunState(prev => ({
      ...prev,
      currentOpponent: data.opponent,
      currentTime: data.yourCurrentTime,
      status: 'countdown'
    }));

    // Start countdown automatically
    setTimeout(() => {
      setRunState(prev => ({
        ...prev,
        status: 'active'
      }));
      // Call countdown complete handler to start game timer
      handleCountdownComplete();
    }, 3000); // 3 second countdown
  }, [handleCountdownComplete]);

  // Start search message rotation
  const startSearchMessageRotation = useCallback(() => {
    if (searchMessageRotationRef.current) {
      clearInterval(searchMessageRotationRef.current);
    }

    searchMessageRotationRef.current = setInterval(() => {
      setRunState(prev => {
        const searchDuration = Date.now() - prev.searchStartTime;
        const messageCount = getSearchMessages(searchDuration).length;
        const nextIndex = (prev.searchMessageIndex + 1) % messageCount;
        
        console.log(`🔄 Rotating search message to index ${nextIndex} (${searchDuration}ms searching)`);
        
        return {
          ...prev,
          searchMessageIndex: nextIndex
        };
      });
    }, 5000); // Rotate every 5 seconds
  }, []);

  // Stop search message rotation
  const stopSearchMessageRotation = useCallback(() => {
    if (searchMessageRotationRef.current) {
      clearInterval(searchMessageRotationRef.current);
      searchMessageRotationRef.current = null;
    }
  }, []);

  // Get search messages based on search duration
  const getSearchMessages = useCallback((searchDuration: number) => {
    const baseMessages = [
      { icon: '🔍', title: 'Searching for opponent...', subtitle: 'Finding worthy challenger...' },
      { icon: '⏳', title: 'Still searching...', subtitle: 'Looking for active players...' },
      { icon: '🌐', title: 'Scanning the globe...', subtitle: 'Checking all regions...' },
      { icon: '🎯', title: 'Matchmaking in progress...', subtitle: 'Finding perfect match...' },
      { icon: '⚡', title: 'Quick match search...', subtitle: 'Connecting to nearest players...' },
      { icon: '🔄', title: 'Searching continues...', subtitle: 'All players currently paired, waiting...' },
      { icon: '📡', title: 'Extended search...', subtitle: 'Looking for new challengers...' },
      { icon: '🎮', title: 'Player search active...', subtitle: 'Waiting for available opponents...' }
    ];

    // After 30 seconds, show more patient messages
    if (searchDuration > 30000) {
      return [
        ...baseMessages,
        { icon: '⏰', title: 'Taking a bit longer...', subtitle: 'Players are busy, please wait...' },
        { icon: '☕', title: 'Extended wait time...', subtitle: 'Grab a drink, we\'re still searching...' },
        { icon: '📊', title: 'Searching thoroughly...', subtitle: 'Finding the best possible match...' },
        { icon: '🎲', title: 'Matchmaking continues...', subtitle: 'Looking for fair competition...' }
      ];
    }

    return baseMessages;
  }, []);

  // Handle searching for next opponent
  const handleSearchingNext = useCallback((data: {
    opponentsDefeated: number;
    currentTime: number;
  }) => {
    console.log('🔍 Searching for next opponent...');

    setRunState(prev => ({
      ...prev,
      opponentsDefeated: data.opponentsDefeated,
      currentTime: data.currentTime,
      status: 'transitioning',
      searchStartTime: Date.now(),
      searchMessageIndex: 0
    }));

    // Start search message rotation
    startSearchMessageRotation();

    // Timer keeps running during transition!
  }, [startSearchMessageRotation]);

  // Handle pre-fetched next opponent
  const handleNextOpponentPrefetched = useCallback((data: {
    opponent: { username: string; socketId: string };
  }) => {
    console.log('📥 Next opponent pre-fetched:', data.opponent.username);

    setRunState(prev => ({
      ...prev,
      nextOpponent: data.opponent
    }));
  }, []);

  // Handle synchronized game start from server
  const handleGameStart = useCallback((data: {
    runId: string;
    startTimestamp: number;
  }) => {
    console.log('🕐 Server game start timestamp received:', data.startTimestamp);
    
    // Update run state with server timestamp for synchronized game timing
    setRunState(prev => ({
      ...prev,
      gameStartTimestamp: data.startTimestamp
    }));
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleRunNewOpponent = (data: any) => handleNewOpponent(data);
    const handleRunSearchingNext = (data: any) => handleSearchingNext(data);
    const handleRunNextOpponentPrefetched = (data: any) => handleNextOpponentPrefetched(data);
    const handleRunGameStart = (data: any) => handleGameStart(data);

    socket.on('continuous-run:new_opponent', handleRunNewOpponent);
    socket.on('continuous-run:searching_next', handleRunSearchingNext);
    socket.on('continuous-run:next_opponent_prefetched', handleRunNextOpponentPrefetched);
    socket.on('continuous-run:game-start', handleRunGameStart);

    return () => {
      socket.off('continuous-run:new_opponent', handleRunNewOpponent);
      socket.off('continuous-run:searching_next', handleRunSearchingNext);
      socket.off('continuous-run:next_opponent_prefetched', handleRunNextOpponentPrefetched);
      socket.off('continuous-run:game-start', handleRunGameStart);
    };
  }, [socket, handleNewOpponent, handleSearchingNext, handleNextOpponentPrefetched, handleGameStart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRunTimer();
      stopGameTimer();
      stopSearchMessageRotation();
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [stopRunTimer, stopGameTimer, stopSearchMessageRotation]);

  return {
    runState,
    startRun,
    endRun,
    handleOpponentLoss,
    handlePlayerLoss,
    isInRun: runState.status !== 'ended'
  };
};

export default useContinuousRun;
