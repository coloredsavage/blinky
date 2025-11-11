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
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [checkingCamera, setCheckingCamera] = useState(true);
  
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

  // Check camera permission on mount
  useEffect(() => {
    const checkCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
        // Stop the stream immediately - we just needed to check permission
        stream.getTracks().forEach(track => track.stop());
        setHasCameraPermission(true);
        setCheckingCamera(false);
      } catch (error) {
        console.error('Camera permission denied:', error);
        setHasCameraPermission(false);
        setCheckingCamera(false);
      }
    };

    checkCameraPermission();
  }, []);

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

  // Auto-join queue when returning from a match (if connected and not already in queue)
  useEffect(() => {
    if (isConnected && !isInQueue && hasCameraPermission && !checkingCamera && username) {
      console.log('🔄 Auto-joining queue after returning from match');
      joinGlobalQueue(username);
    }
  }, [isConnected, isInQueue, hasCameraPermission, checkingCamera, username, joinGlobalQueue]);

  // Handle match found
  useEffect(() => {
    console.log('🔍 GlobalQueueScreen match check:', {
      hasCurrentMatch: !!currentMatch,
      currentMatch,
      isInQueue,
      isConnected
    });

    if (currentMatch) {
      console.log('🎯 Match found, transitioning to game:', currentMatch);
      onMatchFound(currentMatch);
    }
  }, [currentMatch, onMatchFound, isInQueue, isConnected]);

  const handleJoinQueue = () => {
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
              <div className="text-2xl font-bold text-white">
                {playerStats.gamesPlayed}
              </div>
              <div className="text-sm text-gray-400">Games Played</div>
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
        
        {!isInQueue ? (
          <div className="text-center">
            {!hasCameraPermission && !checkingCamera && (
              <div className="bg-red-900 bg-opacity-30 border border-red-500 rounded-lg p-4 mb-4">
                <div className="text-red-400 font-bold mb-2">📷 Camera Access Required</div>
                <div className="text-sm text-gray-300 mb-3">
                  Please grant camera permission to play global multiplayer
                </div>
                <button
                  className="btn-secondary text-sm px-4 py-2"
                  onClick={() => window.location.reload()}
                >
                  Grant Permission
                </button>
              </div>
            )}
            {checkingCamera && (
              <div className="text-gray-400 mb-4">
                Checking camera access...
              </div>
            )}
            {hasCameraPermission && !checkingCamera && (
              <div className="text-gray-400 mb-4">
                Ready to find an opponent?
              </div>
            )}
            <button
              className="btn-primary text-lg px-8 py-3"
              onClick={handleJoinQueue}
              disabled={!isConnected || isLoading || !hasCameraPermission || checkingCamera}
            >
              {checkingCamera ? 'Checking Camera...' : !hasCameraPermission ? 'Camera Required' : !isConnected ? 'Connecting...' : 'Find Match'}
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

      {/* Leaderboard */}
      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">Global Leaderboard</h2>
        <div className="text-gray-400 text-center">
          <div className="text-lg mb-2">🏆 Top Players Worldwide</div>
          <div className="text-sm">Play 5+ games to appear on the leaderboard</div>
          <div className="mt-4 text-sm text-gray-500">
            • Compete for the highest win rate
          </div>
          <div className="text-sm text-gray-500">
            • Climb the ranks with each victory
          </div>
          <div className="text-sm text-gray-500">
            • Your current rank: {getRankDisplay(playerStats)}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">How It Works</h2>
        <div className="text-gray-400 space-y-2">
          <div>• Players are matched first-come-first-served for fast gameplay</div>
          <div>• Win to improve your win rate and climb the leaderboard</div>
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
