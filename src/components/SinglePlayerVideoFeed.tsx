import React, { RefObject } from 'react';

interface SinglePlayerVideoFeedProps {
    videoRef: RefObject<HTMLVideoElement>;
    canvasRef?: RefObject<HTMLCanvasElement>;
    overlayCanvasRef?: RefObject<HTMLCanvasElement>;
    username: string;
}

const SinglePlayerVideoFeed: React.FC<SinglePlayerVideoFeedProps> = ({ 
    videoRef, 
    canvasRef, 
    overlayCanvasRef, 
    username 
}) => {
    // Single player mode with face mesh processing
    if (canvasRef) {
        return (
            <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={true}
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

    // Fallback: standard video rendering
    return (
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={true}
                className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1]"
            ></video>
            {overlayCanvasRef && (
                <canvas
                    ref={overlayCanvasRef}
                    className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1]"
                ></canvas>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                {username}
            </div>
        </div>
    );
};

export default SinglePlayerVideoFeed;