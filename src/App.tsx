import React, { useState, useEffect } from 'react';
import WelcomeScreen from './components/WelcomeScreen';
import GameScreen from './components/GameScreen';
import { GameMode } from './types';

const App: React.FC = () => {
    const [gameMode, setGameMode] = useState<GameMode>(GameMode.None);
    const [username, setUsername] = useState<string>('');
    const [roomId, setRoomId] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState<boolean>(false);
    const [isHost, setIsHost] = useState<boolean>(false);

    // Check URL for room parameter on app load
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = params.get('room');
        if (roomFromUrl) {
            setRoomId(roomFromUrl);
            setIsJoining(true);
            setGameMode(GameMode.Multiplayer);
        }
    }, []);

    const handleStartGame = (mode: GameMode, user: string, id?: string, isCreating?: boolean) => {
        setGameMode(mode);
        setUsername(user);
        
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
    
    const handleExitGame = () => {
        setGameMode(GameMode.None);
        setUsername('');
        setRoomId(null);
        setIsJoining(false);
        setIsHost(false);
        
        // Clean up URL when exiting
        window.history.pushState({}, document.title, window.location.pathname);
    };

    const renderContent = () => {
        // Show welcome screen if no mode selected OR if multiplayer but no username yet
        if (gameMode === GameMode.None || (gameMode === GameMode.Multiplayer && !username)) {
            return (
                <WelcomeScreen 
                    onStartGame={handleStartGame} 
                    isJoiningViaUrl={isJoining} 
                    roomToJoin={roomId} 
                />
            );
        }
        
        // Show game screen once we have mode and username
        return (
            <GameScreen 
                mode={gameMode} 
                username={username} 
                roomId={roomId} 
                onExit={handleExitGame} 
                isHost={isHost} 
            />
        );
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
            <header className="text-center my-4 md:my-8">
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