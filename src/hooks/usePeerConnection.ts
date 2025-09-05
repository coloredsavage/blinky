import { useState, useEffect, useRef, useCallback } from 'react';
import { PeerData } from '../types';
import { Peer } from 'peerjs';

interface Opponent {
    username: string;
}

interface PeerMessage {
    type: 'READY_STATE' | 'BLINK' | 'GAME_STATE' | 'USER_INFO';
    payload?: any;
}

const generateUniqueRoomId = (): string => {
    // Use crypto.randomUUID if available, otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID().substring(0, 8).toUpperCase();
    }
    
    // Fallback: timestamp + random + session storage check
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp.toString(36).toUpperCase()}-${random.toUpperCase()}`;
};

const usePeerConnection = (username: string) => {
    const [peer, setPeer] = useState<any>(null);
    const [connection, setConnection] = useState<any>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [opponent, setOpponent] = useState<Opponent | null>(null);
    const [isOpponentReady, setIsOpponentReady] = useState<boolean>(false);
    const [lastBlinkWinner, setLastBlinkWinner] = useState<string | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<string>('Not connected');
    const localStreamRef = useRef<MediaStream | null>(null);
    const peerRef = useRef<any>(null);
    const currentConfigIndex = useRef(0);

    // Default PeerJS configuration
    const peerOptions = {
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        }
    };

    const tryPeerConnection = useCallback((peerId: string) => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }

        console.log(`🔄 Creating peer with ID: ${peerId}`);
        setConnectionStatus('Initializing peer...');
        
        // Add a small delay to ensure cleanup
        setTimeout(() => {
            const newPeer = new Peer(peerId, peerOptions);
            peerRef.current = newPeer;

            newPeer.on('open', (id: string) => {
            console.log(`✅ Peer opened successfully with ID: ${id}`);
            console.log(`🏠 HOST is now available for connections at ID: ${id}`);
            setPeer(newPeer);
            peerRef.current = newPeer;
            setConnectionError(null);
            setConnectionStatus(`Host ready at ${id}`);
            
            // Get user media for the connection
            navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }, 
                audio: false 
            })
            .then(stream => {
                localStreamRef.current = stream;
                console.log('Local stream acquired for peer connection');
            })
            .catch(err => {
                console.error('Error getting user media for peer:', err);
            });
        });

        newPeer.on('error', (error: any) => {
            console.error(`❌ Peer error:`, error);
            
            if (error.message && error.message.includes('taken')) {
                console.log(`🔄 ID ${peerId} is taken, generating new ID...`);
                const newId = generateUniqueRoomId();
                console.log(`🆔 Retrying with new ID: ${newId}`);
                setTimeout(() => tryPeerConnection(newId), 1000);
            } else {
                setConnectionError(`Peer error: ${error.message || 'Connection failed'}`);
                setConnectionStatus('Connection failed');
            }
        });

        newPeer.on('connection', (conn: any) => {
            console.log('☎️ HOST received incoming connection from GUEST:', conn.peer);
            setupConnection(conn);
        });

        newPeer.on('call', (call: any) => {
            console.log('📹 Incoming call from:', call.peer);
            if (localStreamRef.current) {
                call.answer(localStreamRef.current);
                call.on('stream', (remoteStream: MediaStream) => {
                    console.log('Received remote stream from call');
                    setRemoteStream(remoteStream);
                });
            }
        });

            newPeer.on('disconnected', () => {
                console.log(`⚠️ Peer disconnected`);
                setConnectionStatus('Disconnected');
            });
        }, 100); // Small delay for cleanup
    }, []);

    const initializePeer = useCallback((peerId: string) => {
        console.log('Initializing peer with ID:', peerId);
        setConnectionError(null);
        currentConfigIndex.current = 0;
        tryPeerConnection(peerId);
    }, [tryPeerConnection]);

    const setupConnection = useCallback((conn: any) => {
        console.log('Setting up connection with:', conn.peer);
        
        conn.on('open', () => {
            console.log('Data connection opened');
            setConnection(conn);
            setConnectionStatus('Connected');
            
            // Exchange user information
            conn.send({
                type: 'USER_INFO',
                payload: { username, peerId: conn.peer }
            });

            // Start video call if we have local stream
            if (localStreamRef.current && peerRef.current) {
                console.log('Starting video call');
                const call = peerRef.current.call(conn.peer, localStreamRef.current);
                
                call.on('stream', (remoteStream: MediaStream) => {
                    console.log('Received remote stream from outgoing call');
                    setRemoteStream(remoteStream);
                });

                call.on('error', (error: any) => {
                    console.error('Call error:', error);
                });
            }
        });

        conn.on('data', (data: any) => {
            console.log('Received data:', data);
            handleIncomingMessage(data);
        });

        conn.on('error', (error: any) => {
            console.error('Connection error:', error);
            setConnectionError('Connection lost. Please try reconnecting.');
            setConnectionStatus('Connection error');
        });

        conn.on('close', () => {
            console.log('Connection closed');
            setConnection(null);
            setOpponent(null);
            setRemoteStream(null);
            setConnectionStatus('Connection closed');
        });
    }, [username]);

    const handleIncomingMessage = useCallback((message: any) => {
        console.log('Processing message:', message);
        
        switch (message.type) {
            case 'USER_INFO':
                setOpponent({
                    username: message.payload.username
                });
                break;
            case 'READY_STATE':
                setIsOpponentReady(message.payload.isReady);
                break;
            case 'BLINK':
                setLastBlinkWinner('You Win!');
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }, []);

    const createRoom = useCallback((roomId: string) => {
        console.log('🏠 Creating room as HOST with exact ID:', roomId);
        setConnectionError(null);
        setConnectionStatus(`Creating room ${roomId}...`);
        initializePeer(roomId);
    }, [initializePeer]);

    const joinRoom = useCallback((roomId: string) => {
        console.log('👥 GUEST attempting to join room:', roomId);
        setConnectionError(null);
        setConnectionStatus(`Joining room ${roomId}...`);
        
        const guestId = `guest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        console.log('👥 GUEST creating peer with ID:', guestId);
        
        // Initialize guest peer
        if (peerRef.current) {
            peerRef.current.destroy();
        }
        
        const newPeer = new Peer(guestId, peerOptions);
        peerRef.current = newPeer;

        newPeer.on('open', (id: string) => {
            console.log(`✅ GUEST peer ready with ID: ${id}`);
            console.log(`👥 GUEST now connecting to HOST room: ${roomId}`);
            setConnectionStatus(`Connecting to ${roomId}...`);
            
            // Small delay to ensure host is ready
            setTimeout(() => {
                try {
                    const conn = newPeer.connect(roomId, {
                        reliable: true,
                        serialization: 'json'
                    });
                    
                    console.log('👥 GUEST connection attempt started to:', roomId);
                    
                    conn.on('open', () => {
                        console.log('🎉 GUEST successfully connected to HOST!');
                        setConnection(conn);
                        setConnectionStatus('Connected');
                        setConnectionError(null);
                        
                        // Send user info
                        conn.send({
                            type: 'USER_INFO',
                            payload: { username }
                        });
                    });

                    conn.on('error', (error: any) => {
                        console.error('❌ GUEST connection error:', error);
                        setConnectionError(`Failed to connect: ${error.message || error}`);
                        setConnectionStatus('Connection failed');
                    });

                    conn.on('close', () => {
                        console.log('🔴 GUEST connection closed');
                        setConnectionStatus('Disconnected');
                    });

                    conn.on('data', (data: any) => {
                        console.log('📨 GUEST received data:', data);
                        handleIncomingMessage(data);
                    });
                    
                    // Connection timeout
                    setTimeout(() => {
                        if (!conn.open) {
                            console.error('⏰ GUEST connection timeout');
                            setConnectionError('Connection timeout. Host may not be ready.');
                            setConnectionStatus('Connection timeout');
                        }
                    }, 10000);
                    
                } catch (error) {
                    console.error('❌ GUEST failed to initiate connection:', error);
                    setConnectionError('Failed to connect to room.');
                    setConnectionStatus('Connection failed');
                }
            }, 1000); // Give host time to be ready
        });

        newPeer.on('error', (error: any) => {
            console.error('❌ GUEST peer initialization error:', error);
            setConnectionError(`Peer error: ${error.message}`);
            setConnectionStatus('Peer failed');
        });

    }, [handleIncomingMessage]);

    const sendData = useCallback((message: PeerMessage) => {
        if (connection && connection.open) {
            console.log('Sending data:', message);
            try {
                connection.send(message);
            } catch (error) {
                console.error('Error sending data:', error);
            }
        } else {
            console.warn('Cannot send data: connection not ready');
        }
    }, [connection]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (connection) {
                connection.close();
            }
            if (peer && !peer.destroyed) {
                peer.destroy();
            }
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Reset states when connection changes
    useEffect(() => {
        if (!connection) {
            setIsOpponentReady(false);
            setLastBlinkWinner(null);
        }
    }, [connection]);

    return {
        connection,
        remoteStream,
        opponent,
        isOpponentReady,
        lastBlinkWinner,
        connectionError,
        connectionStatus,
        createRoom,
        joinRoom,
        sendData,
        currentPeerId: peerRef.current?.id || null
    };
};

export default usePeerConnection;