import React, { useEffect, useState } from 'react';
import useGlobalMultiplayer, { PlayerStats } from '../hooks/useGlobalMultiplayer';

interface GlobalQueueScreenProps {
  username: string;
  onMatchFound: (matchData: any) => void;
  onExit: () => void;
}

const GlobalQueueScreen: React.FC<GlobalQueueScreenProps> = ({ 
  username, 
  onMatchFound, 
  onExit 
}) => {
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const {
    isConnected,
    isInQueue,
    queueStatus,
    currentMatch,
    connectionStatus,
    error,
    joinGlobalQueue,
    leaveGlobalQueue,
    getPlayerStats,
  } = useGlobalMultiplayer();

  // Load player stats on mount
  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true);
      const stats = await getPlayerStats(username);
      setPlayerStats(stats);
      setIsLoading(false);
    };
    
    if (username) {
      loadStats();
    }
  }, [username, getPlayerStats]);

  // Handle match found
  useEffect(() => {
    if (currentMatch) {
      console.log('🎯 Match found, transitioning to game:', currentMatch);
      onMatchFound(currentMatch);
    }
  }, [currentMatch, onMatchFound]);

  const checkCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' },
        audio: false 
      });
      // Stop the stream immediately, we just needed to check permission
      stream.getTracks().forEach(track => track.stop());
      setCameraReady(true);
    } catch (error) {
      console.error('Camera check failed:', error);
      setCameraError('Camera access required. Please enable camera permissions and try again.');
      setCameraReady(false);
    }
  };

  const handleJoinQueue = () => {
    if (!cameraReady) {
      checkCamera();
      return;
    }
    if (!isInQueue && isConnected) {
      joinGlobalQueue(username);
    }
  };

  const handleLeaveQueue = () => {
    if (isInQueue) {
      leaveGlobalQueue();
    }
  };

  const handleExit = () => {
    if (isInQueue) {
      leaveGlobalQueue();
    }
    onExit();
  };

  const getRankDisplay = (stats: PlayerStats | null) => {
    if (!stats) return 'Unranked';
    if (stats.gamesPlayed < 5) return `Unranked (${5 - stats.gamesPlayed} games needed)`;
    return stats.rank ? `#${stats.rank}` : 'Unranked';
  };

  const getEloColor = (elo: number) => {
    if (elo >= 1200) return 'text-yellow-400'; // Gold
    if (elo >= 1100) return 'text-purple-400'; // Purple
    if (elo >= 1000) return 'text-blue-400';   // Blue
    return 'text-gray-400'; // Gray
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <button 
        onClick={handleExit}
        className="absolute top-4 right-4 btn-secondary z-10"
      >
        Exit to Menu
      </button>

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-purple-400 mb-2">Global Multiplayer</h1>
        <p className="text-gray-400">Compete against players worldwide</p>
      </div>

      {/* Connection Status */}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="text-sm text-gray-400">{connectionStatus}</span>
        </div>
        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}
      </div>

      {/* Player Stats */}
      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">Player Profile</h2>
        
        {isLoading ? (
          <div className="text-center text-gray-400">Loading stats...</div>
        ) : playerStats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getEloColor(playerStats.elo)}`}>
                {playerStats.elo}
              </div>
              <div className="text-sm text-gray-400">ELO Rating</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {getRankDisplay(playerStats)}
              </div>
              <div className="text-sm text-gray-400">Global Rank</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {playerStats.wins}W
              </div>
              <div className="text-sm text-gray-400">
                {playerStats.losses}L ({playerStats.winRate}%)
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {Math.round(playerStats.longestStare / 1000)}s
              </div>
              <div className="text-sm text-gray-400">Longest Stare</div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-gray-400 mb-2">New Player</div>
            <div className="text-sm text-gray-500">
              Play your first game to get ranked!
            </div>
          </div>
        )}
      </div>

      {/* Queue Status */}
      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">Matchmaking</h2>
        
        {cameraError && (
          <div className="text-center mb-4">
            <div className="text-red-400 text-sm mb-2">
              {cameraError}
            </div>
          </div>
        )}
        
        {!isInQueue ? (
          <div className="text-center">
            <div className="text-gray-400 mb-4">
              {cameraReady 
                ? "Camera ready! Find an opponent?" 
                : "Camera access required for video chat"
              }
            </div>
            <button 
              className="btn-primary text-lg px-8 py-3"
              onClick={handleJoinQueue}
              disabled={!isConnected || isLoading}
            >
              {!isConnected ? 'Connecting...' : cameraReady ? 'Find Match' : 'Enable Camera'}
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="animate-pulse mb-4">
              <div className="text-2xl text-purple-400 mb-2">🔍</div>
              <div className="text-lg text-white">Finding opponent...</div>
            </div>
            
            {queueStatus && (
              <div className="text-gray-400 mb-4">
                <div>Queue position: #{queueStatus.queuePosition}</div>
                <div>Estimated wait: {queueStatus.estimatedWait}s</div>
              </div>
            )}
            
            <button 
              className="btn-secondary"
              onClick={handleLeaveQueue}
            >
              Cancel Search
            </button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">How It Works</h2>
        <div className="text-gray-400 space-y-2">
          <div>• Players are matched based on similar ELO ratings</div>
          <div>• Win to gain ELO points, lose to lose points</div>
          <div>• Play 5+ games to get a global rank</div>
          <div>• The longer you stare without blinking, the better!</div>
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
      `}</style>
    </div>
  );
};

export default GlobalQueueScreen;