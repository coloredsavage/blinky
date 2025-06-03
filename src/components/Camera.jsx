import { useEffect, useRef, useState } from "react";
import { loadFaceMeshModel } from "../models/faceMeshSetup";
import { isBlinking } from "../utils/blinkDetector";
import * as tf from "@tensorflow/tfjs"; // Import TensorFlow.js

function Camera() {
    const videoRef = useRef(null);
    const [disconnected, setDisconnected] = useState(false);
    const [model, setModel] = useState(null); // Store the model in state

    useEffect(() => {
        console.log("TensorFlow.js version:", tf.version.tfjs); // Log TensorFlow.js version
    }, []);

    useEffect(() => {
        async function setupCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing webcam:", err);
            }
        }

        setupCamera();
    }, []);

    useEffect(() => {
        async function loadModel() {
            try {
                const loadedModel = await loadFaceMeshModel();
                setModel(loadedModel);
            } catch (error) {
                console.error("Error loading model:", error);
            }
        }

        loadModel();
    }, []); // Load model only once

    useEffect(() => {
        let interval;

        if (model) {  // Only start detecting if the model is loaded
            interval = setInterval(async () => {
                const video = videoRef.current;
                if (video && video.readyState === 4) {
                    try {
                        const predictions = await model.estimateFaces({
                            input: video, // Use the video element directly
                            returnTensors: false,
                            flipHorizontal: false,
                            predictIrises: false,
                        });

                        if (predictions.length > 0) {
                            const landmarks = predictions[0].scaledMesh;
                            if (isBlinking(landmarks)) {
                                console.log("Blink detected!");
                                setDisconnected(true);
                                clearInterval(interval);
                            }
                        }
                    } catch (error) {
                        console.error("Error during face estimation:", error);
                    }
                }
            }, 200);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [model]); //  Depend on model

    if (disconnected) {
        return (
            <div style={{ textAlign: "center", marginTop: "100px" }}>
                <h1>🔌 Disconnected (You blinked)</h1>
            </div>
        );
    }

    return (
        <div>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "auto" }}
            />
        </div>
    );
}

export default Camera;