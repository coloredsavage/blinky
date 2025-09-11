import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { LEFT_EYE_INDICES, RIGHT_EYE_INDICES } from '../constants';

// Declare MediaPipe globals from CDN
declare const FaceMesh: any;

const euclidean = (p1: any, p2: any) => {
    if (!p1 || !p2) return 0;
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
};

const getEAR = (landmarks: any[], eyeIndices: { [key: string]: number }) => {
    if (!landmarks) return 0.4;
    try {
        const outer = landmarks[eyeIndices.outer];
        const inner = landmarks[eyeIndices.inner];
        const top1 = landmarks[eyeIndices.top1];
        const bottom1 = landmarks[eyeIndices.bottom1];
        const top2 = landmarks[eyeIndices.top2];
        const bottom2 = landmarks[eyeIndices.bottom2];

        if (!outer || !inner || !top1 || !bottom1 || !top2 || !bottom2) return 0.4;

        const vertical1 = euclidean(top1, bottom1);
        const vertical2 = euclidean(top2, bottom2);
        const horizontal = euclidean(outer, inner);

        if (horizontal === 0) return 0.4;

        const ear = (vertical1 + vertical2) / (2.0 * horizontal);
        return Math.max(0, Math.min(1, ear));
    } catch {
        return 0.4;
    }
};

interface RemoteFaceData {
    leftEar: number;
    rightEar: number;
    isFacePresent: boolean;
    faceConfidence: number;
    lastSeenTimestamp: number;
}

const useRemoteFaceMesh = (
    videoRef: RefObject<HTMLVideoElement>, 
    onFaceDataUpdate?: (data: RemoteFaceData) => void
) => {
    const [isReady, setIsReady] = useState(false);
    const [leftEar, setLeftEar] = useState(0.4);
    const [rightEar, setRightEar] = useState(0.4);
    const [isFacePresent, setIsFacePresent] = useState(false);
    const [faceConfidence, setFaceConfidence] = useState(0);
    const [lastSeenTimestamp, setLastSeenTimestamp] = useState(Date.now());
    
    const faceMeshRef = useRef<any>(null);
    const processIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const onResults = useCallback((results: any) => {
        const timestamp = Date.now();
        
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Calculate face presence confidence based on number of detected landmarks
            const confidence = landmarks.length / 468; // 468 is max landmarks for face mesh
            
            const newLeftEar = getEAR(landmarks, LEFT_EYE_INDICES);
            const newRightEar = getEAR(landmarks, RIGHT_EYE_INDICES);
            
            setLeftEar(newLeftEar);
            setRightEar(newRightEar);
            setIsFacePresent(true);
            setFaceConfidence(confidence);
            setLastSeenTimestamp(timestamp);
            
            // Send face data to parent component for multiplayer sync
            if (onFaceDataUpdate) {
                onFaceDataUpdate({
                    leftEar: newLeftEar,
                    rightEar: newRightEar,
                    isFacePresent: true,
                    faceConfidence: confidence,
                    lastSeenTimestamp: timestamp
                });
            }
        } else {
            // No face detected
            setIsFacePresent(false);
            setFaceConfidence(0);
            
            if (onFaceDataUpdate) {
                onFaceDataUpdate({
                    leftEar: 0.4, // Default "open" value
                    rightEar: 0.4,
                    isFacePresent: false,
                    faceConfidence: 0,
                    lastSeenTimestamp: timestamp
                });
            }
        }
    }, [onFaceDataUpdate]);

    const processFrame = useCallback(async () => {
        if (!faceMeshRef.current || !videoRef.current || videoRef.current.readyState !== 4) {
            return;
        }

        try {
            await faceMeshRef.current.send({ image: videoRef.current });
        } catch (error) {
            console.error('Error processing remote video frame:', error);
        }
    }, [videoRef]);

    const startProcessing = useCallback(() => {
        if (processIntervalRef.current) {
            clearInterval(processIntervalRef.current);
        }
        
        // Process at 10 FPS to balance performance and accuracy
        processIntervalRef.current = setInterval(processFrame, 100);
    }, [processFrame]);

    const stopProcessing = useCallback(() => {
        if (processIntervalRef.current) {
            clearInterval(processIntervalRef.current);
            processIntervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!videoRef.current) return;

        const faceMesh = new (window as any).FaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: false, // Faster processing for remote
            minDetectionConfidence: 0.3, // Lower threshold for remote detection
            minTrackingConfidence: 0.3,
        });
        
        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;
        setIsReady(true);

        return () => {
            stopProcessing();
        };
    }, [onResults, videoRef, stopProcessing]);

    // Auto-start processing when video is ready
    useEffect(() => {
        if (isReady && videoRef.current && videoRef.current.readyState === 4) {
            startProcessing();
        }
        
        return () => {
            stopProcessing();
        };
    }, [isReady, startProcessing, stopProcessing]);

    return { 
        isReady, 
        leftEar, 
        rightEar, 
        isFacePresent, 
        faceConfidence,
        lastSeenTimestamp,
        startProcessing, 
        stopProcessing 
    };
};

export default useRemoteFaceMesh;