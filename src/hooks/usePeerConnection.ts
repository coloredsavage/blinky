import { useState, useEffect, useRef, useCallback } from 'react';
import { PeerData } from '../types';

declare const Peer: any;

interface Opponent {
    username: string;
}

const usePeerConnection = (username: string) => {
    const peerRef = useRef<any>(null);
    const [connection, setConnection] = useState<any>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [opponent, setOpponent] = useState<Opponent | null>(null);
    const [isOpponentReady, setIsOpponentReady] = useState<boolean>(false);
    const [lastBlinkWinner, setLastBlinkWinner] = useState<string | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const isInitiatedRef = useRef(false); // Guard against Strict Mode double-effect

    const handleDataReceived = useCallback((data: PeerData) => {
        switch (data.type) {
            case 'USER_INFO':
                setOpponent({ username: data.payload.username });
                break;
            case 'READY_STATE':
                setIsOpponentReady(data.payload.isReady);
                break;
            case 'BLINK':
                // The sender blinked, so the local user (receiver) is the winner.
                setLastBlinkWinner('You Win!');
                break;
        }
    }, []);

    // Setup connection event listeners
    const setupConnectionListeners = useCallback((conn: any) => {
        conn.on('data', handleDataReceived);
        conn.on('open', () => {
            // Send our info to the newly connected peer
            conn.send({ type: 'USER_INFO', payload: { username } });
        });
        conn.on('close', () => {
            // Handle disconnection
            setConnection(null);
            setRemoteStream(null);
            setOpponent(null);
            setIsOpponentReady(false);
        });
        setConnection(conn);
    }, [handleDataReceived, username]);

    // Cleanup peer on unmount
    useEffect(() => {
        return () => {
            if (peerRef.current) {
                peerRef.current.destroy();
            }
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            isInitiatedRef.current = false;
        };
    }, []);

    const getLocalStream = async () => {
        if (!localStreamRef.current) {
             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
             localStreamRef.current = stream;
        }
        return localStreamRef.current;
    };
    
    // For Host
    const createRoom = useCallback(async (roomId: string) => {
        if (isInitiatedRef.current) return;
        isInitiatedRef.current = true;

        if (peerRef.current) peerRef.current.destroy();

        const peer = new Peer(roomId, {
            host: 'peerjs.com', secure: true, port: 443,
        });
        peerRef.current = peer;

        peer.on('connection', (conn: any) => {
            setupConnectionListeners(conn);
        });

        peer.on('call', async (call: any) => {
            const stream = await getLocalStream();
            call.answer(stream);
            call.on('stream', (remoteUserStream: MediaStream) => {
                setRemoteStream(remoteUserStream);
            });
        });
    }, [setupConnectionListeners]);

    // For Client
    const joinRoom = useCallback(async (roomId: string) => {
        if (isInitiatedRef.current) return;
        isInitiatedRef.current = true;

        if (peerRef.current) peerRef.current.destroy();
        
        const peer = new Peer(undefined, {
            host: 'peerjs.com', secure: true, port: 443,
        });
        peerRef.current = peer;

        peer.on('open', async () => {
            const conn = peer.connect(roomId);
            setupConnectionListeners(conn);

            const stream = await getLocalStream();
            const call = peer.call(roomId, stream);
            call.on('stream', (remoteUserStream: MediaStream) => {
                setRemoteStream(remoteUserStream);
            });
        });
    }, [setupConnectionListeners]);

    const sendData = useCallback((data: PeerData) => {
        if (connection) {
            connection.send(data);
        }
    }, [connection]);
    
    return { connection, remoteStream, opponent, createRoom, joinRoom, sendData, isOpponentReady, lastBlinkWinner };
};

export default usePeerConnection;