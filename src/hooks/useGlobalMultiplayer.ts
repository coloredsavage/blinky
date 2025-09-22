import { useEffect, useRef, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

export interface PlayerStats {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  longestStare: number;
  totalPlayTime: number;
  joinedDate: string;
  rank: number | null;
  winRate: number;
}

export interface GlobalMatch {
  matchId: string;
  opponent: {
    username: string;
    elo: number;
  };
  isHost: boolean;
}

export interface QueueStatus {
  queuePosition: number;
  estimatedWait: number;
}

export interface GlobalMultiplayerState {
  isConnected: boolean;
  isInQueue: boolean;
  queueStatus: QueueStatus | null;
  currentMatch: GlobalMatch | null;
  playerStats: PlayerStats | null;
  connectionStatus: string;
  error: string | null;
}

export interface UseGlobalMultiplayerReturn extends GlobalMultiplayerState {
  joinGlobalQueue: (username: string) => void;
  leaveGlobalQueue: () => void;
  submitGameResult: (gameTime: number, winner: string) => void;
  getPlayerStats: (username: string) => Promise<PlayerStats | null>;
  disconnect: () => void;
}

const useGlobalMultiplayer = (): UseGlobalMultiplayerReturn => {
  const [state, setState] = useState<GlobalMultiplayerState>({
    isConnected: false,
    isInQueue: false,
    queueStatus: null,
    currentMatch: null,
    playerStats: null,
    connectionStatus: 'Disconnected',
    error: null,
  });

  const socketRef = useRef<Socket | null>(null);

  const updateState = useCallback((updates: Partial<GlobalMultiplayerState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('🌍 Already connected, skipping...');
      return;
    }
    
    if (socketRef.current && !socketRef.current.connected) {
      console.log('🌍 Disconnecting existing socket...');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log('🌍 Connecting to global multiplayer server...');
    updateState({ connectionStatus: 'Connecting...' });

    const socket = io('http://localhost:3001', {
      transports: ['polling'], // Use polling only to avoid WebSocket 400 errors
      autoConnect: true,
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      maxReconnectionAttempts: 5,
      forceNew: true
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('🌍 Connected to global multiplayer server');
      updateState({ 
        isConnected: true, 
        connectionStatus: 'Connected',
        error: null 
      });
    });

    socket.on('disconnect', () => {
      console.log('🌍 Disconnected from global multiplayer server');
      updateState({ 
        isConnected: false, 
        connectionStatus: 'Disconnected',
        isInQueue: false,
        queueStatus: null,
        currentMatch: null,
      });
    });

    socket.on('connect_error', (error) => {
      console.error('🌍 Connection error:', error);
      console.error('🌍 Error details:', {
        message: error.message,
        type: error.type,
        description: error.description
      });
      
      let errorMessage = 'Connection failed';
      if (error.message) {
        errorMessage = `Connection failed: ${error.message}`;
      } else if (error.type === 'TransportError') {
        errorMessage = 'Network connection failed. Please check your internet connection.';
      } else if (error.type === 'timeout') {
        errorMessage = 'Connection timeout. Server may be unavailable.';
      }
      
      updateState({ 
        error: errorMessage,
        connectionStatus: 'Connection failed',
        isConnected: false,
      });
    });

    socket.on('reconnect_error', (error) => {
      console.error('🌍 Reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('🌍 Reconnection failed after all attempts');
      updateState({ 
        error: 'Connection failed after multiple attempts',
        connectionStatus: 'Connection failed',
        isConnected: false,
      });
    });

    // Queue handlers
    socket.on('global-queue-joined', (data: QueueStatus) => {
      console.log('🌍 Joined global queue:', data);
      updateState({ 
        isInQueue: true, 
        queueStatus: data,
        connectionStatus: `In queue (position ${data.queuePosition})`,
        error: null,
      });
    });

    socket.on('global-queue-left', () => {
      console.log('🌍 Left global queue');
      updateState({ 
        isInQueue: false, 
        queueStatus: null,
        connectionStatus: 'Connected',
      });
    });

    // Match handlers
    socket.on('global-match-pairing', (pairingData: any) => {
      console.log('🔗 Players paired, connecting...', pairingData);
      updateState({ 
        isInQueue: false, 
        queueStatus: `Opponent found: ${pairingData.opponent.username}`,
        connectionStatus: 'Connecting to opponent...',
      });
    });

    socket.on('global-match-found', (matchData: GlobalMatch) => {
      console.log('🎯 Global match ready:', matchData);
      console.log('🔍 Match data details:', {
        matchId: matchData.matchId,
        isHost: matchData.isHost,
        roomReady: matchData.roomReady,
        opponent: matchData.opponent
      });
      updateState({ 
        isInQueue: false, 
        queueStatus: null,
        currentMatch: matchData,
        connectionStatus: `Match ready - ${matchData.isHost ? 'Host' : 'Guest'}`,
      });
    });

    socket.on('opponent-disconnected', (data) => {
      console.log('🏃 Opponent disconnected:', data);
      updateState({ 
        currentMatch: null,
        error: 'Opponent disconnected',
        connectionStatus: 'Connected',
      });
    });

    // Stats handlers
    socket.on('stats-updated', (stats) => {
      console.log('📊 Stats updated:', stats);
      updateState({ playerStats: { ...state.playerStats, ...stats } });
    });

    // WebRTC handlers (for compatibility with existing simple-peer system)
    socket.on('create-peer-connection', (data) => {
      console.log('🔗 Create peer connection:', data);
      // This will be handled by the existing WebRTC system
    });

  }, [updateState]); // Removed state.playerStats dependency to prevent recreation

  const joinGlobalQueue = useCallback((username: string) => {
    if (!socketRef.current?.connected) {
      connect();
      // Wait a moment for connection, then join
      setTimeout(() => {
        if (socketRef.current?.connected) {
          console.log('🌍 Joining global queue as:', username);
          socketRef.current.emit('join-global-queue', { username });
        }
      }, 1000);
    } else {
      console.log('🌍 Joining global queue as:', username);
      socketRef.current.emit('join-global-queue', { username });
    }
  }, [connect]);

  const leaveGlobalQueue = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('🌍 Leaving global queue');
      socketRef.current.emit('leave-global-queue');
    }
  }, []);

  const submitGameResult = useCallback((gameTime: number, winner: string) => {
    if (socketRef.current?.connected && state.currentMatch) {
      console.log('🏆 Submitting game result:', { gameTime, winner });
      socketRef.current.emit('global-game-result', {
        matchId: state.currentMatch.matchId,
        result: winner === 'You Win!' ? 'win' : 'loss',
        gameTime,
        winner: winner === 'You Win!' ? 'self' : state.currentMatch.opponent.username,
      });
    }
  }, [state.currentMatch]);

  const getPlayerStats = useCallback(async (username: string): Promise<PlayerStats | null> => {
    try {
      console.log('🌍 Fetching player stats for:', username);
      const response = await fetch(`http://localhost:3001/global/player/${username}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('🌍 Stats response status:', response.status);
      
      if (response.ok) {
        const stats = await response.json();
        console.log('🌍 Player stats loaded:', stats);
        updateState({ playerStats: stats });
        return stats;
      } else if (response.status === 404) {
        console.log('🌍 Player not found, creating default stats');
        // New player - create default stats
        const defaultStats: PlayerStats = {
          username,
          elo: 1000,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          longestStare: 0,
          totalPlayTime: 0,
          joinedDate: new Date().toISOString(),
          rank: null,
          winRate: 0,
        };
        updateState({ playerStats: defaultStats });
        return defaultStats;
      } else {
        console.error('🌍 Failed to fetch stats, status:', response.status);
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      console.error('🌍 Failed to get player stats:', error);
      console.error('🌍 Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
    return null;
  }, [updateState]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('🌍 Disconnecting from global multiplayer');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState({
      isConnected: false,
      isInQueue: false,
      queueStatus: null,
      currentMatch: null,
      playerStats: null,
      connectionStatus: 'Disconnected',
      error: null,
    });
  }, []);

  // Initialize connection on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []); // Empty dependency array to run only once on mount

  return {
    ...state,
    joinGlobalQueue,
    leaveGlobalQueue,
    submitGameResult,
    getPlayerStats,
    disconnect,
  };
};

export default useGlobalMultiplayer;