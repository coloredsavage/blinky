import React, { useState } from 'react';

interface MultiplayerRoomScreenProps {
    username: string;
    onCreateRoom: (roomId: string) => void;
    onJoinRoom: (roomId: string) => void;
    onBack: () => void;
}

const MultiplayerRoomScreen: React.FC<MultiplayerRoomScreenProps> = ({ 
    username, 
    onCreateRoom, 
    onJoinRoom, 
    onBack 
}) => {
    const [roomId, setRoomId] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [error, setError] = useState('');

    // Generate a random room ID
    const generateRoomId = (): string => {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    const handleCreateRoom = async () => {
        setError('');
        setIsCreating(true);
        
        try {
            const newRoomId = generateRoomId();
            setRoomId(newRoomId);
            
            // Small delay to show the generated room ID before starting
            setTimeout(() => {
                onCreateRoom(newRoomId);
            }, 1000);
            
        } catch (err) {
            setError('Failed to create room. Please try again.');
            setIsCreating(false);
        }
    };

    const handleJoinRoom = async () => {
        if (!roomId.trim()) {
            setError('Please enter a room ID');
            return;
        }

        if (roomId.length < 4) {
            setError('Room ID must be at least 4 characters');
            return;
        }

        setError('');
        setIsJoining(true);

        try {
            // Clean up the room ID (remove spaces, make uppercase)
            const cleanRoomId = roomId.trim().toUpperCase();
            onJoinRoom(cleanRoomId);
        } catch (err) {
            setError('Failed to join room. Please check the room ID.');
            setIsJoining(false);
        }
    };

    const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        setRoomId(value);
        setError(''); // Clear error when user types
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
            <div className="bg-black bg-opacity-50 backdrop-blur-lg border border-gray-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <button 
                    onClick={onBack}
                    className="mb-6 text-gray-400 hover:text-white transition-colors"
                >
                    ← Back to Menu
                </button>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                        Multiplayer Mode
                    </h1>
                    <p className="text-gray-400">Playing as: <span className="text-white font-bold">{username}</span></p>
                </div>

                {error && (
                    <div className="bg-red-500 bg-opacity-20 border border-red-500 rounded-lg p-3 mb-6 text-red-200 text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-6">
                    {/* Create Room Section */}
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-4 text-purple-300">Create New Room</h2>
                        <p className="text-gray-400 text-sm mb-4">
                            Start a new game and share the room ID with your friend
                        </p>
                        
                        {isCreating && roomId ? (
                            <div className="space-y-3">
                                <div className="bg-green-500 bg-opacity-20 border border-green-500 rounded-lg p-4">
                                    <p className="text-green-200 mb-2">Room Created!</p>
                                    <div className="text-2xl font-mono font-bold text-white tracking-wider">
                                        {roomId}
                                    </div>
                                    <p className="text-green-200 text-sm mt-2">Share this ID with your opponent</p>
                                </div>
                                <div className="text-gray-400 text-sm">Starting game...</div>
                            </div>
                        ) : (
                            <button 
                                onClick={handleCreateRoom}
                                disabled={isCreating || isJoining}
                                className="btn-primary w-full"
                            >
                                {isCreating ? 'Creating Room...' : 'Create Room'}
                            </button>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="flex items-center">
                        <div className="flex-1 border-t border-gray-600"></div>
                        <span className="px-4 text-gray-400">OR</span>
                        <div className="flex-1 border-t border-gray-600"></div>
                    </div>

                    {/* Join Room Section */}
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-4 text-blue-300">Join Existing Room</h2>
                        <p className="text-gray-400 text-sm mb-4">
                            Enter the room ID shared by your friend
                        </p>
                        
                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Enter Room ID (e.g., ABC123)"
                                value={roomId}
                                onChange={handleRoomIdChange}
                                className="input-primary text-center text-lg font-mono tracking-wider"
                                maxLength={10}
                                disabled={isCreating || isJoining}
                            />
                            
                            <button 
                                onClick={handleJoinRoom}
                                disabled={!roomId.trim() || isCreating || isJoining}
                                className="btn-primary w-full"
                            >
                                {isJoining ? 'Joining Room...' : 'Join Room'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Instructions */}
                <div className="mt-8 pt-6 border-t border-gray-700">
                    <h3 className="text-lg font-bold mb-3 text-center text-yellow-300">How to Play</h3>
                    <ul className="text-sm text-gray-300 space-y-2">
                        <li>• One player creates a room and shares the room ID</li>
                        <li>• The other player joins using that room ID</li>
                        <li>• Both players must be ready to start the staring contest</li>
                        <li>• First player to blink loses!</li>
                    </ul>
                </div>
            </div>

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

export default MultiplayerRoomScreen;