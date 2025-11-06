import React from 'react';

interface TransitionOverlayProps {
  isVisible: boolean;
  runState: {
    currentTime: number;
    opponentsDefeated: number;
    status: 'searching' | 'countdown' | 'active' | 'transitioning' | 'ended';
    searchMessageIndex: number;
    searchStartTime: number;
  };
}

const TransitionOverlay: React.FC<TransitionOverlayProps> = ({ isVisible, runState }) => {
  if (!isVisible) return null;

  const formatTime = (ms: number) => {
    const seconds = ms / 1000;
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${seconds.toFixed(1)}s`;
  };

  // Get search messages based on search duration
  const getSearchMessages = (searchDuration: number) => {
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
  };

  const getTransitionContent = () => {
    switch (runState.status) {
      case 'transitioning':
        const searchDuration = Date.now() - runState.searchStartTime;
        const searchMessages = getSearchMessages(searchDuration);
        const currentMessage = searchMessages[runState.searchMessageIndex % searchMessages.length];
        
        return (
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse">{currentMessage.icon}</div>
            <div className="text-4xl font-bold text-white mb-2">{currentMessage.title}</div>
            <div className="text-2xl text-purple-300 mb-4">{currentMessage.subtitle}</div>
            <div className="text-xl text-gray-400">
              Opponents defeated: <span className="text-yellow-400 font-bold">{runState.opponentsDefeated}</span>
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Keep staring! Your timer is still running: <span className="text-green-400">{formatTime(runState.currentTime)}</span>
            </div>
            <div className="text-xs text-gray-600 mt-4">
              Search duration: {Math.floor(searchDuration / 1000)}s
            </div>
          </div>
        );

      case 'searching':
        return (
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">🔍</div>
            <div className="text-4xl font-bold text-white mb-2">Finding First Opponent</div>
            <div className="text-2xl text-purple-300 mb-4">Preparing your run...</div>
            <div className="text-sm text-gray-500 mt-2">
              Get ready to face challengers one after another!
            </div>
          </div>
        );

      case 'countdown':
        return (
          <div className="text-center">
            <div className="text-6xl mb-4">🎯</div>
            <div className="text-4xl font-bold text-white mb-2">Next Opponent Found!</div>
            <div className="text-2xl text-purple-300 mb-4">Starting in 3 seconds...</div>
            <div className="text-xl text-gray-400">
              Opponents defeated: <span className="text-yellow-400 font-bold">{runState.opponentsDefeated}</span>
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Current time: <span className="text-green-400">{formatTime(runState.currentTime)}</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 bg-opacity-90 border-2 border-purple-500 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {getTransitionContent()}
      </div>
    </div>
  );
};

export default TransitionOverlay;
