export function isBlinking(landmarks) {
    if (!landmarks || landmarks.length === 0) return false;
  
    // Get the vertical distance between upper and lower eyelid
    const leftEyeTop = landmarks[159];
    const leftEyeBottom = landmarks[145];
    const rightEyeTop = landmarks[386];
    const rightEyeBottom = landmarks[374];
  
    const leftEyeDist = Math.hypot(
      leftEyeTop.x - leftEyeBottom.x,
      leftEyeTop.y - leftEyeBottom.y
    );
    const rightEyeDist = Math.hypot(
      rightEyeTop.x - rightEyeBottom.x,
      rightEyeTop.y - rightEyeBottom.y
    );
  
    // Threshold: If the distance is too small, assume blinking
    const blinkThreshold = 0.015; // tweak if needed
  
    return leftEyeDist < blinkThreshold && rightEyeDist < blinkThreshold;
  }
  