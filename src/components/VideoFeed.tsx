
import React, { RefObject, useEffect } from 'react';

interface VideoFeedProps {
    videoRef: RefObject<HTMLVideoElement>;
    canvasRef?: RefObject<HTMLCanvasElement>;
    username: string;
    isMuted: boolean;
    remoteStream?: MediaStream | null;
    isRemote?: boolean; // NEW: Flag to indicate remote player
}

const VideoFeed: React.FC<VideoFeedProps> = ({
    videoRef,
    canvasRef,
    username,
    isMuted,
    remoteStream,
    isRemote = false // NEW
}) => {
    
    useEffect(() => {
        console.log('[VideoFeed] Remote stream effect:', {
            hasRemoteStream: !!remoteStream,
            hasVideoRef: !!videoRef.current,
            isRemote,
            streamTracks: remoteStream?.getTracks().length || 0
        });

        if (remoteStream && videoRef.current) {
            console.log('[VideoFeed] Setting srcObject on video element');
            console.log('[VideoFeed] Stream tracks:', remoteStream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState
            })));
            videoRef.current.srcObject = remoteStream;

            // Force play
            videoRef.current.play().then(() => {
                console.log('[VideoFeed] Video playing successfully');
            }).catch(err => {
                console.error('[VideoFeed] Failed to play video:', err);
            });
        }
    }, [remoteStream, videoRef, isRemote]);

    // Both local AND remote now use canvas when canvasRef provided
    if (canvasRef) {
        return (
            <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isMuted}
                    className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1] hidden"
                ></video>
                <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1]"
                ></canvas>
                <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs px-2 py-1 rounded z-50">
                    {isRemote ? 'REMOTE' : 'LOCAL'}
                </div>
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                    {username}
                </div>
            </div>
        );
    }

    // Remote feed: visible video element with proper face framing
    return (
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isMuted}
                className="absolute top-0 left-0 w-full h-full object-cover remote-video"
                style={{
                    transform: 'scaleX(-1)'
                }}
            ></video>
             <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                {username}
            </div>
        </div>
    );
};

export default VideoFeed;
