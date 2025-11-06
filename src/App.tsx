import React, { useState, useEffect } from 'react';
import WelcomeScreen from './components/WelcomeScreen';
import GameScreen from './components/GameScreen';
import GlobalQueueScreen from './components/GlobalQueueScreen';
import CalibrationScreen from './components/CalibrationScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import { GameMode } from './types';

const App: React.FC = () => {
    const [gameMode, setGameMode] = useState<GameMode>(GameMode.None);
    const [username, setUsername] = useState<string>('');
    const [roomId, setRoomId] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState<boolean>(false);
    const [isHost, setIsHost] = useState<boolean>(false);
    const [globalMatchData, setGlobalMatchData] = useState<any>(null);
    const [showCalibration, setShowCalibration] = useState<boolean>(false);
    const [isCalibrated, setIsCalibrated] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
    const [pendingGameData, setPendingGameData] = useState<{
        mode: GameMode | null;
        username: string;
        roomId: string | null;
        isHost: boolean;
        isCreating: boolean;
    } | null>(null);

    // Check URL for room parameter on app load
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = params.get('room');
        if (roomFromUrl) {
            setRoomId(roomFromUrl);
            setIsJoining(true);
            setGameMode(GameMode.Multiplayer);
        }

        // Check if user has calibrated before (using localStorage)
        const hasCalibrated = localStorage.getItem('blinky_calibrated');
        if (hasCalibrated === 'true') {
            setIsCalibrated(true);
        }
    }, []);

    // Auto-start game when calibration completes and there's pending game data
    useEffect(() => {
        if (isCalibrated && pendingGameData && pendingGameData.mode) {
            console.log('🎯 Calibration complete, starting pending game:', pendingGameData);
            
            setGameMode(pendingGameData.mode);
            setUsername(pendingGameData.username);
            
            if (pendingGameData.mode === GameMode.Multiplayer) {
                if (pendingGameData.roomId) {
                    setRoomId(pendingGameData.roomId);
                }
                setIsHost(pendingGameData.isHost);
                
                if (pendingGameData.isCreating && pendingGameData.roomId) {
                    const newUrl = `${window.location.origin}${window.location.pathname}?room=${pendingGameData.roomId}`;
                    window.history.pushState({}, document.title, newUrl);
                }
            }
            
            setPendingGameData(null); // Clear pending data
        }
    }, [isCalibrated, pendingGameData]);

    const handleExitGame = () => {
        setGameMode(GameMode.None);
        setUsername('');
        setRoomId(null);
        setIsJoining(false);
        setIsHost(false);
        setGlobalMatchData(null);
        
        // Clean up URL when exiting
        window.history.pushState({}, document.title, window.location.pathname);
    };

    const handleGlobalMatchFound = (matchData: any) => {
        console.log('🎯 App: Global match found:', matchData);
        setGlobalMatchData(matchData);
        setIsHost(matchData.isHost);
        setRoomId(matchData.matchId); // Use matchId as roomId for GameScreen compatibility
    };

    const handleStartCalibration = () => {
        console.log('🎯 App: Starting calibration');
        setShowCalibration(true);
    };

    const handleCalibrationComplete = (threshold: number) => {
        console.log('🎯 App: Calibration complete with threshold:', threshold);
        setShowCalibration(false);
        setIsCalibrated(true);
        // Save calibration state to localStorage
        localStorage.setItem('blinky_calibrated', 'true');
        localStorage.setItem('blinky_calibration_threshold', threshold.toString());
    };

    const handleSkipCalibration = () => {
        console.log('🎯 App: Skipping calibration');
        setShowCalibration(false);
        setIsCalibrated(true);
        // Save calibration state to localStorage
        localStorage.setItem('blinky_calibrated', 'true');
    };

    const handleStartGame = (mode: GameMode, user?: string, id?: string, isCreating?: boolean) => {
        console.log('🚀 App handleStartGame called:', { mode, user, id, isCreating });
        
        // Check if this is first time playing and not calibrated
        const hasCalibrated = localStorage.getItem('blinky_calibrated');
        if (hasCalibrated !== 'true') {
            console.log('🎯 First time player - showing calibration and saving pending game data');
            
            // Save pending game data
            setPendingGameData({
                mode,
                username: user || 'Anonymous',
                roomId: id || null,
                isHost: !!isCreating,
                isCreating: !!isCreating
            });
            
            setShowCalibration(true);
            return; // Don't proceed to game until calibration is complete
        }
        
        // Normal game start flow for already calibrated users
        setGameMode(mode);
        setUsername(user || 'Anonymous');
        
        if (mode === GameMode.Multiplayer) {
            if (id) {
                setRoomId(id);
            }
            setIsHost(!!isCreating);
            
            // Update URL if creating a room
            if (isCreating && id) {
                const newUrl = `${window.location.origin}${window.location.pathname}?room=${id}`;
                window.history.pushState({}, document.title, newUrl);
            }
        }
    };

    const renderContent = () => {
        console.log('🎮 App renderContent - gameMode:', gameMode, 'username:', username, 'globalMatchData:', !!globalMatchData, 'showCalibration:', showCalibration, 'isCalibrated:', isCalibrated, 'showLeaderboard:', showLeaderboard);
        
        // Show leaderboard screen if requested
        if (showLeaderboard) {
            console.log('🏆 Rendering LeaderboardScreen');
            return (
                <LeaderboardScreen 
                    onExit={() => setShowLeaderboard(false)}
                    currentUsername={username}
                />
            );
        }

        // Show calibration screen if needed
        if (showCalibration) {
            console.log('🎯 Rendering CalibrationScreen');
            return (
                <CalibrationScreen
                    onComplete={handleCalibrationComplete}
                />
            );
        }

        // Show welcome screen if no mode selected OR if multiplayer but no username yet
        if (gameMode === GameMode.None || 
           (gameMode === GameMode.Multiplayer && !username) ||
           (gameMode === GameMode.Global && !username)) {
            console.log('📋 Rendering WelcomeScreen');
            return (
                <WelcomeScreen 
                    onStartGame={handleStartGame} 
                    isJoiningViaUrl={isJoining} 
                    roomToJoin={roomId} 
                    onCalibrate={handleStartCalibration}
                    isCalibrated={isCalibrated}
                    onShowLeaderboard={() => setShowLeaderboard(true)}
                />
            );
        }

        // Global mode uses GlobalQueueScreen (shows leaderboard and stats)
        if (gameMode === GameMode.Global && !globalMatchData) {
            console.log('🌍 Rendering GlobalQueueScreen');
            return (
                <GlobalQueueScreen 
                    username={username}
                    onMatchFound={handleGlobalMatchFound}
                    onExit={handleExitGame}
                />
            );
        }

        // Continuous mode goes directly to GameScreen (continuous run mechanics)
        if (gameMode === GameMode.Continuous) {
            console.log('🏃 Rendering GameScreen for Continuous mode');
            return (
                <GameScreen 
                    mode={gameMode} 
                    username={username} 
                    roomId={null} 
                    onExit={handleExitGame} 
                    isHost={false}
                    globalMatchData={null}
                />
            );
        }
        
        // Show game screen once we have mode, username, and (for global) match data
        return (
            <GameScreen 
                mode={gameMode} 
                username={username} 
                roomId={roomId} 
                onExit={handleExitGame} 
                isHost={isHost}
                globalMatchData={globalMatchData}
            />
        );
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4 safe-area-top safe-area-bottom">
            <header className="text-center my-4 md:my-8 relative w-full max-w-4xl container-mobile">
                <div className="absolute top-0 right-0">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-800"
                        title="Settings"
                    >
                        ⚙️
                    </button>
                    {showSettings && (
                        <div className="absolute right-0 top-10 bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg z-10 min-w-48">
                            <div className="text-left">
                                <h3 className="text-white font-semibold mb-2">Settings</h3>
                                <button
                                    onClick={() => {
                                        handleStartCalibration();
                                        setShowSettings(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 rounded transition-colors"
                                >
                                    🎯 {isCalibrated ? 'Recalibrate' : 'Calibrate Face Detection'}
                                </button>
                                <button
                                    onClick={() => {
                                        localStorage.removeItem('blinky_calibrated');
                                        localStorage.removeItem('blinky_calibration_threshold');
                                        setIsCalibrated(false);
                                        setShowSettings(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 rounded transition-colors mt-1"
                                >
                                    🔄 Reset Calibration
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                    Blinky
                </h1>
                <p className="text-gray-500">The Ultimate Web Staring Contest</p>
            </header>
            
            <main className="w-full max-w-4xl flex-grow flex items-center justify-center">
                {renderContent()}
            </main>
        </div>
    );
};

export default App;
