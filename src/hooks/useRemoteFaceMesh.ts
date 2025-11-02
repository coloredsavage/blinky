import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { getEyesBoundingBox, LEFT_EYE_INDICES, RIGHT_EYE_INDICES } from '../utils/faceDetection';

const useRemoteFaceMesh = (
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>
) => {
  const [isReady, setIsReady] = useState(false);
  const [hasFace, setHasFace] = useState(false);
  const faceMeshRef = useRef<any>(null);

  const onResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      setHasFace(true);
      const landmarks = results.multiFaceLandmarks[0];

      // Same eye cropping logic as local player
      const box = getEyesBoundingBox(landmarks);
      if(box) {
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        const padX = 0.08;
        const padY = 0.12;
        let x = Math.max(0, (box.minX - padX) * w);
        let y = Math.max(0, (box.minY - padY) * h);
        let width = Math.min(w, (box.maxX - box.minX + 2 * padX) * w);
        let height = Math.min(h, (box.maxY - box.minY + 2 * padY) * h);

        // Fill with black first
        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillRect(0, 0, w, h);

        // Draw cropped eyes
        canvasCtx.drawImage(videoRef.current, x, y, width, height, 0, 0, w, h);
      }
    } else {
      // No face detected - black screen
      setHasFace(false);
      canvasCtx.fillStyle = '#000000';
      canvasCtx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    canvasCtx.restore();
  }, [canvasRef, videoRef]);

  useEffect(() => {
    console.log('[useRemoteFaceMesh] Hook initialized, videoRef:', !!videoRef.current);
    if (!videoRef.current) {
      console.log('[useRemoteFaceMesh] No video ref, exiting');
      return;
    }

    // Prevent multiple instances
    if (faceMeshRef.current) {
      console.log('[useRemoteFaceMesh] MediaPipe already initialized, skipping');
      return;
    }

    let animationFrameId: number | null = null;
    let isActive = true;

    // Wait for video to have metadata before starting MediaPipe
    const initMediaPipe = () => {
      console.log('[useRemoteFaceMesh] initMediaPipe called, readyState:', videoRef.current?.readyState);

      // Check if already initialized or component unmounted
      if (faceMeshRef.current || !isActive) {
        console.log('[useRemoteFaceMesh] Already initialized or unmounted, skipping');
        return;
      }

      if (videoRef.current?.readyState >= 2) { // HAVE_CURRENT_DATA
        console.log('[useRemoteFaceMesh] Video ready, initializing MediaPipe...');
        const faceMesh = new (window as any).FaceMesh({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;
        setIsReady(true);
        console.log('[useRemoteFaceMesh] MediaPipe initialized successfully');

        // Process frames continuously
        const processFrame = async () => {
          if (videoRef.current && faceMeshRef.current && isActive) {
            try {
              await faceMeshRef.current.send({ image: videoRef.current });
            } catch (error) {
              console.error('[useRemoteFaceMesh] Error processing frame:', error);
            }
            if (isActive) {
              animationFrameId = requestAnimationFrame(processFrame);
            }
          }
        };
        processFrame();
        console.log('[useRemoteFaceMesh] Frame processing started');
      }
    };

    console.log('[useRemoteFaceMesh] Current video readyState:', videoRef.current.readyState);
    if (videoRef.current && videoRef.current.readyState >= 2) {
      console.log('[useRemoteFaceMesh] Video already ready, init now');
      initMediaPipe();
    } else {
      console.log('[useRemoteFaceMesh] Waiting for loadeddata event');
      videoRef.current?.addEventListener('loadeddata', initMediaPipe);
    }

    return () => {
      console.log('[useRemoteFaceMesh] Cleanup: stopping frame processing and closing MediaPipe');
      isActive = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      videoRef.current?.removeEventListener('loadeddata', initMediaPipe);
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
      setIsReady(false);
      setHasFace(false);
    };
  }, [videoRef, onResults]);

  return { isReady, hasFace };
};

export default useRemoteFaceMesh;
