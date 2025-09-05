import React, { useState, useEffect } from 'react';
import { GameMode } from '../types';

interface AnonymousSession {
    id: string;
    username: string;
    gamesPlayed: number;
    totalTime: number;
    bestScore: number;
}

interface WelcomeScreenProps {
    onStartGame: (mode: GameMode, username?: string, roomId?: string, isCreating?: boolean) => void;
    isJoiningViaUrl: boolean;
    roomToJoin: string | null;
    session: AnonymousSession | null;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
    onStartGame, 
    isJoiningViaUrl, 
    roomToJoin,
    session 
}) => {
    const [showMultiplayerSetup, setShowMultiplayerSetup] = useState(false);
    const [username, setUsername] = useState('');
    const [roomIdInput, setRoomIdInput] = useState('');
    const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
    const [copyButtonText, setCopyButtonText] = useState('Copy Link');
    const [error, setError] = useState('');

    // Auto-show multiplayer setup if joining via URL
    useEffect(() => {
        if (isJoiningViaUrl && roomToJoin) {
            setShowMultiplayerSetup(true);
            setRoomIdInput(roomToJoin);
        }
    }, [isJoiningViaUrl, roomToJoin]);

    const validateUsername = (name: string): boolean => {
        if (!name.trim()) {
            setError('Please enter a username');
            return false;
        }
        if (name.length < 2) {
            setError('Username must be at least 2 characters');
            return false;
        }
        if (name.length > 20) {
            setError('Username must be less than 20 characters');
            return false;
        }
        return true;
    };

    const handleSinglePlayerStart = () => {
        // Use custom username if provided, otherwise use session username, or anonymous
        const playerName = username.trim() || session?.username;
        onStartGame(GameMode.SinglePlayer, playerName);
    };

    const handleMultiplayerClick = () => {
        setShowMultiplayerSetup(true);
        setError('');
    };
    
    const handleCreateRoom = () => {
        if (!validateUsername(username)) return;
        
        // Generate a truly unique ID using crypto.randomUUID
        let newRoomId;
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            newRoomId = crypto.randomUUID().substring(0, 8).toUpperCase();
        } else {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 6);
            newRoomId = `${timestamp.toString(36).slice(-4).toUpperCase()}${random.toUpperCase()}`;
        }
        
        console.log('🏠 WelcomeScreen creating room with ID:', newRoomId);
        setCreatedRoomId(newRoomId);
        setError('');
    };

    const handleJoinRoom = () => {
        if (!validateUsername(username)) return;
        
        if (!roomIdInput.trim()) {
            setError('Please enter a Room ID');
            return;
        }
        
        if (roomIdInput.length < 4) {
            setError('Room ID must be at least 4 characters');
            return;
        }
        
        setError('');
        onStartGame(GameMode.Multiplayer, username.trim(), roomIdInput.trim().toUpperCase(), false);
    };

    const handleEnterLobby = () => {
        if (createdRoomId && username.trim()) {
            onStartGame(GameMode.Multiplayer, username.trim(), createdRoomId, true);
        }
    };

    const handleCopyLink = async () => {
        if (!createdRoomId) return;
        
        try {
            const link = `${window.location.origin}${window.location.pathname}?room=${createdRoomId}`;
            await navigator.clipboard.writeText(link);
            setCopyButtonText('Copied!');
            setTimeout(() => setCopyButtonText('Copy Link'), 2000);
        } catch (err) {
            console.error('Failed to copy link:', err);
            setCopyButtonText('Copy Failed');
            setTimeout(() => setCopyButtonText('Copy Link'), 2000);
        }
    };

    const handleBack = () => {
        setShowMultiplayerSetup(false);
        setCreatedRoomId(null);
        setRoomIdInput('');
        setError('');
        setCopyButtonText('Copy Link');
    };

    const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''); // Only allow alphanumeric, underscore, dash
        setUsername(value);
        setError('');
    };

    const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        setRoomIdInput(value);
        setError('');
    };

    return (
        <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 text-center w-full max-w-lg mx-auto shadow-2xl relative">
            {!showMultiplayerSetup ? (
                <>
                    <h2 className="text-3xl font-bold mb-6 text-purple-300">Choose Your Challenge</h2>
                    
                    {/* Show session stats if available */}
                    {session && (
                        <div className="mb-6 bg-gray-800 bg-opacity-50 rounded-lg p-4">
                            <div className="text-sm text-gray-300 mb-2">
                                Welcome back, <span className="text-purple-400 font-bold">{session.username}</span>!
                            </div>
                            <div className="flex justify-center gap-4 text-xs text-gray-400">
                                <span>Games: {session.gamesPlayed}</span>
                                <span>Best: {(session.bestScore / 1000).toFixed(1)}s</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Optional username override */}
                    <div className="mb-6">
                        <input
                            type="text"
                            placeholder={session ? `Playing as ${session.username} (or enter new name)` : "Enter your username (optional)"}
                            value={username}
                            onChange={handleUsernameChange}
                            className="input-primary mb-2"
                            maxLength={20}
                        />
                        {error && (
                            <div className="text-red-400 text-sm mt-2">{error}</div>
                        )}
                    </div>
                    
                    <div className="flex flex-col gap-4 justify-center">
                        <button 
                            onClick={handleSinglePlayerStart} 
                            className="btn-primary"
                        >
                            🎯 Single Player
                        </button>
                        <button 
                            onClick={handleMultiplayerClick} 
                            className="btn-secondary"
                        >
                            👥 Multiplayer
                        </button>
                        <button 
                            className="btn-disabled" 
                            disabled
                        >
                            🌍 Global Stare-Down (Coming Soon)
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <button 
                        onClick={handleBack} 
                        className="absolute top-4 left-4 text-gray-400 hover:text-white transition-colors"
                    >
                        ← Back
                    </button>
                    
                    <h2 className="text-3xl font-bold mb-6 text-blue-300">Multiplayer Setup</h2>
                    
                    {createdRoomId ? (
                        <div className="space-y-4">
                            <div className="bg-green-500 bg-opacity-20 border border-green-500 rounded-lg p-4">
                                <h3 className="text-2xl font-bold mb-2 text-green-200">Room Created!</h3>
                                <div className="text-3xl font-mono font-bold text-white tracking-wider mb-2">
                                    {createdRoomId}
                                </div>
                                <p className="text-green-200 text-sm">Share this room ID or link with your friend</p>
                            </div>
                            
                            <div className="space-y-3">
                                <label className="block text-sm text-gray-400">Shareable Link:</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={`${window.location.origin}${window.location.pathname}?room=${createdRoomId}`}
                                        className="input-primary flex-grow text-xs"
                                    />
                                    <button 
                                        onClick={handleCopyLink} 
                                        className="btn-secondary whitespace-nowrap"
                                    >
                                        {copyButtonText}
                                    </button>
                                </div>
                            </div>
                            
                            <button 
                                onClick={handleEnterLobby} 
                                className="btn-primary w-full mt-6"
                            >
                                Enter Game Lobby
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Username Input */}
                            <div>
                                <label className="block text-left text-sm text-gray-400 mb-2">Username:</label>
                                <input
                                    type="text"
                                    placeholder="Enter your username"
                                    value={username}
                                    onChange={handleUsernameChange}
                                    className="input-primary"
                                    maxLength={20}
                                    autoFocus={!isJoiningViaUrl}
                                />
                            </div>

                            {error && (
                                <div className="bg-red-500 bg-opacity-20 border border-red-500 rounded-lg p-3 text-red-200 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Join Room Section */}
                            <div>
                                <label className="block text-left text-sm text-gray-400 mb-2">Join Existing Room:</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Enter Room ID"
                                        value={roomIdInput}
                                        onChange={handleRoomIdChange}
                                        className="input-primary flex-grow text-center font-mono tracking-wider"
                                        maxLength={8}
                                        autoFocus={isJoiningViaUrl}
                                    />
                                    <button 
                                        onClick={handleJoinRoom} 
                                        className="btn-secondary whitespace-nowrap"
                                        disabled={!username.trim() || !roomIdInput.trim()}
                                    >
                                        Join Room
                                    </button>
                                </div>
                                {isJoiningViaUrl && roomToJoin && (
                                    <p className="text-yellow-200 text-sm mt-2">
                                        Joining room: <span className="font-mono font-bold">{roomToJoin}</span>
                                    </p>
                                )}
                            </div>

                            {/* Divider */}
                            <div className="relative flex items-center my-6">
                                <div className="flex-grow border-t border-gray-600"></div>
                                <span className="px-4 text-gray-400 bg-gray-900">OR</span>
                                <div className="flex-grow border-t border-gray-600"></div>
                            </div>

                            {/* Create Room Section */}
                            <div>
                                <label className="block text-left text-sm text-gray-400 mb-2">Create New Room:</label>
                                <button 
                                    onClick={handleCreateRoom} 
                                    className="btn-primary w-full"
                                    disabled={!username.trim()}
                                >
                                    🎮 Create Room
                                </button>
                                <p className="text-gray-400 text-xs mt-2">
                                    You'll get a room ID to share with your friend
                                </p>
                            </div>
                        </div>
                    )}
                </>
            )}

            <style>{`
                .btn-primary { 
                    background: linear-gradient(135deg, rgb(147 51 234), rgb(168 85 247));
                    color: white;
                    font-weight: bold;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.75rem;
                    transition: all 0.3s ease;
                    transform: scale(1);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(147, 51, 234, 0.3);
                }
                .btn-primary:hover:not(:disabled) { 
                    transform: scale(1.02);
                    box-shadow: 0 6px 20px rgba(147, 51, 234, 0.4);
                }
                .btn-primary:disabled {
                    background: rgb(55 65 81);
                    cursor: not-allowed;
                    transform: scale(1);
                    box-shadow: none;
                    opacity: 0.6;
                }
                .btn-secondary { 
                    background: linear-gradient(135deg, rgb(59 130 246), rgb(99 102 241));
                    color: white;
                    font-weight: bold;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.75rem;
                    transition: all 0.3s ease;
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
                }
                .btn-secondary:hover:not(:disabled) { 
                    transform: scale(1.02);
                    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
                }
                .btn-secondary:disabled {
                    background: rgb(55 65 81);
                    cursor: not-allowed;
                    transform: scale(1);
                    box-shadow: none;
                    opacity: 0.6;
                }
                .btn-disabled { 
                    background: rgb(31 41 55);
                    color: rgb(107 114 128);
                    font-weight: bold;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.75rem;
                    cursor: not-allowed;
                    border: none;
                }
                .input-primary { 
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid rgb(55 65 81);
                    border-radius: 0.75rem;
                    padding: 0.75rem 1rem;
                    color: white;
                    width: 100%;
                    transition: all 0.3s ease;
                }
                .input-primary:focus {
                    outline: none;
                    border-color: rgb(147 51 234);
                    box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.1);
                }
                .input-primary::placeholder {
                    color: rgb(156 163 175);
                }
            `}</style>
        </div>
    );
};

export default WelcomeScreen;