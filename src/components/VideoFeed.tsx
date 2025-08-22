
import React, { RefObject, useEffect } from 'react';

interface VideoFeedProps {
    videoRef: RefObject<HTMLVideoElement>;
    canvasRef?: RefObject<HTMLCanvasElement>;
    username: string;
    isMuted: boolean;
    remoteStream?: MediaStream | null;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ videoRef, canvasRef, username, isMuted, remoteStream }) => {
    
    useEffect(() => {
        if (remoteStream && videoRef.current) {
            videoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, videoRef]);

    // Local feed: hidden video for processing, visible canvas for cropped/styled output
    if (canvasRef) {
        return (
            <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[4/3]">
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
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                    {username}
                </div>
            </div>
        );
    }

    // Remote feed: just a visible video element
    return (
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[4/3]">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isMuted}
                className="absolute top-0 left-0 w-full h-full object-cover"
            ></video>
             <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                {username}
            </div>
        </div>
    );
};

export default VideoFeed;
