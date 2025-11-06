import React, { useEffect, useState } from 'react';
import { LeaderboardService, LeaderboardEntry } from '../services/leaderboardService';

interface LeaderboardScreenProps {
  onExit: () => void;
  currentUsername?: string;
}

type LeaderboardType = 'global' | 'streaks' | 'active' | 'continuous' | 'stares';

const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ onExit, currentUsername }) => {
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>('global');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [continuousRuns, setContinuousRuns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPlayers: 0,
    totalMatches: 0,
    highestWinRate: 0,
    longestStreak: 0
  });

  const loadLeaderboard = async (type: LeaderboardType) => {
    setIsLoading(true);
    try {
      switch (type) {
        case 'global':
          const globalData = await LeaderboardService.getGlobalLeaderboard();
          setLeaderboardData(globalData);
          break;
        case 'streaks':
          const streaksData = await LeaderboardService.getTopStreaks();
          setLeaderboardData(streaksData);
          break;
        case 'active':
          const activeData = await LeaderboardService.getMostActivePlayers();
          setLeaderboardData(activeData);
          break;
        case 'continuous':
          const runsData = await LeaderboardService.getBestContinuousRuns();
          setContinuousRuns(runsData);
          break;
        case 'stares':
          const staresData = await LeaderboardService.getLongestStares();
          setLeaderboardData(staresData);
          break;
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const leaderboardStats = await LeaderboardService.getLeaderboardStats();
      setStats(leaderboardStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  useEffect(() => {
    loadLeaderboard(leaderboardType);
    loadStats();
  }, [leaderboardType]);

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-orange-400';
    return 'text-white';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const formatWinRate = (winRate: number) => {
    return `${winRate.toFixed(1)}%`;
  };

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto leaderboard-mobile">
      <button 
        onClick={onExit}
        className="absolute top-4 right-4 btn-secondary z-10 touch-target"
      >
        Back to Menu
      </button>

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-purple-400 mb-2">Global Leaderboards</h1>
        <p className="text-gray-400">See how you stack up against players worldwide</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{stats.totalPlayers}</div>
          <div className="text-sm text-gray-400">Total Players</div>
        </div>
        <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{stats.totalMatches}</div>
          <div className="text-sm text-gray-400">Total Matches</div>
        </div>
        <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{formatWinRate(stats.highestWinRate)}</div>
          <div className="text-sm text-gray-400">Best Win Rate</div>
        </div>
        <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.longestStreak}</div>
          <div className="text-sm text-gray-400">Longest Streak</div>
        </div>
      </div>

      {/* Leaderboard Type Selector */}
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        <button
          className={`px-4 py-2 rounded-lg transition-colors ${
            leaderboardType === 'global'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          onClick={() => setLeaderboardType('global')}
        >
          🏆 Global
        </button>
        <button
          className={`px-4 py-2 rounded-lg transition-colors ${
            leaderboardType === 'streaks'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          onClick={() => setLeaderboardType('streaks')}
        >
          ⚡ Win Streaks
        </button>
        <button
          className={`px-4 py-2 rounded-lg transition-colors ${
            leaderboardType === 'active'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          onClick={() => setLeaderboardType('active')}
        >
          🔥 Most Active
        </button>
        <button
          className={`px-4 py-2 rounded-lg transition-colors ${
            leaderboardType === 'continuous'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          onClick={() => setLeaderboardType('continuous')}
        >
          🏃 Best Runs
        </button>
        <button
          className={`px-4 py-2 rounded-lg transition-colors ${
            leaderboardType === 'stares'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          onClick={() => setLeaderboardType('stares')}
        >
          👁️ Longest Stares
        </button>
      </div>

      {/* Leaderboard Content */}
      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto mb-4"></div>
            <div className="text-gray-400">Loading leaderboard...</div>
          </div>
        ) : leaderboardType === 'continuous' ? (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">🏃 Best Continuous Runs</h2>
            {continuousRuns.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No continuous runs recorded yet
              </div>
            ) : (
              <div className="space-y-3">
                {continuousRuns.map((run, index) => (
                  <div
                    key={run.id}
                    className={`flex items-center justify-between p-4 rounded-lg ${
                      index % 2 === 0 ? 'bg-gray-800 bg-opacity-30' : 'bg-gray-800 bg-opacity-50'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`text-2xl font-bold ${getRankColor(index + 1)}`}>
                        {getRankIcon(index + 1)}
                      </div>
                      <div>
                        <div className="text-white font-semibold">
                          {run.user?.username || 'Anonymous'}
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatDuration(run.total_time || 0)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-400">
                        {run.opponents_defeated || 0}
                      </div>
                      <div className="text-sm text-gray-400">opponents</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">
              {leaderboardType === 'global' && '🏆 Global Leaderboard'}
              {leaderboardType === 'streaks' && '⚡ Top Win Streaks'}
              {leaderboardType === 'active' && '🔥 Most Active Players'}
              {leaderboardType === 'stares' && '👁️ Longest Stares'}
            </h2>
            {leaderboardData.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No players found
              </div>
            ) : (
              <div className="space-y-3">
                {leaderboardData.map((entry) => (
                  <div
                    key={entry.user.id}
                    className={`flex items-center justify-between p-4 rounded-lg ${
                      entry.user.username === currentUsername
                        ? 'bg-purple-900 bg-opacity-30 border border-purple-500'
                        : entry.rank % 2 === 0
                        ? 'bg-gray-800 bg-opacity-30'
                        : 'bg-gray-800 bg-opacity-50'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`text-2xl font-bold ${getRankColor(entry.rank)}`}>
                        {getRankIcon(entry.rank)}
                      </div>
                      <div>
                        <div className="text-white font-semibold">
                          {entry.user.username}
                          {entry.user.username === currentUsername && (
                            <span className="ml-2 text-xs bg-purple-600 px-2 py-1 rounded">You</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400">
                          {entry.user.wins}W {entry.user.losses}L
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {leaderboardType === 'global' && (
                        <>
                          <div className="text-xl font-bold text-green-400">
                            {formatWinRate(entry.win_rate)}
                          </div>
                          <div className="text-sm text-gray-400">win rate</div>
                        </>
                      )}
                      {leaderboardType === 'streaks' && (
                        <>
                          <div className="text-xl font-bold text-blue-400">
                            {entry.user.best_streak || 0}
                          </div>
                          <div className="text-sm text-gray-400">streak</div>
                        </>
                      )}
                      {leaderboardType === 'active' && (
                        <>
                          <div className="text-xl font-bold text-orange-400">
                            {entry.user.total_matches || 0}
                          </div>
                          <div className="text-sm text-gray-400">matches</div>
                        </>
                      )}
                      {leaderboardType === 'stares' && (
                        <>
                          <div className="text-xl font-bold text-purple-400">
                            {formatDuration(entry.user.longest_stare || 0)}
                          </div>
                          <div className="text-sm text-gray-400">longest stare</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
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

export default LeaderboardScreen;
