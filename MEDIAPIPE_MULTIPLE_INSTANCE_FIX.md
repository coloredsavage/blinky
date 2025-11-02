# MediaPipe Multiple Instance Fix

**Date:** November 2, 2025
**Issue:** MediaPipe WASM crashes due to multiple instances in React Strict Mode
**Status:** ✅ **FIXED** - Added instance guards and proper cleanup

---

## Problem Summary

After fixing the WebRTC connection, MediaPipe was crashing with WASM errors:

```
RuntimeError: abort(Module.arguments has been replaced with plain arguments_)
Assertion failed: undefined
```

**Console evidence:**
```
[useRemoteFaceMesh] initMediaPipe called, readyState: 4
[useRemoteFaceMesh] Video ready, initializing MediaPipe...
[useRemoteFaceMesh] MediaPipe initialized successfully
[useRemoteFaceMesh] Frame processing started
[useRemoteFaceMesh] initMediaPipe called, readyState: 4  ← DUPLICATE!
[useRemoteFaceMesh] Video ready, initializing MediaPipe...  ← DUPLICATE!
[useRemoteFaceMesh] MediaPipe initialized successfully  ← DUPLICATE!
[useRemoteFaceMesh] Frame processing started  ← DUPLICATE!
VM4399 face_mesh_solution_simd_wasm_bin.js:9 Module.arguments has been replaced...
```

---

## Root Cause

**React Strict Mode Double-Mounting**

In development mode, React Strict Mode intentionally mounts components twice to help detect side effects. This caused:

1. First mount: MediaPipe instance created
2. Cleanup runs (but didn't properly close MediaPipe)
3. Second mount: Another MediaPipe instance created
4. Two MediaPipe instances try to use the same WASM module
5. WASM module crashes with "Module.arguments" error

### Affected Hooks:

1. `useFaceMesh.ts` - Local player face tracking
2. `useRemoteFaceMesh.ts` - Opponent video face tracking

---

## Solution Implemented

Added instance guards and proper cleanup to both hooks:

### 1. Instance Guard (Prevent Multiple Instances)

```typescript
// Prevent multiple instances
if (faceMeshRef.current) {
  console.log('[useRemoteFaceMesh] MediaPipe already initialized, skipping');
  return;
}

// Check before initializing
if (faceMeshRef.current || !isActive) {
  console.log('[useRemoteFaceMesh] Already initialized or unmounted, skipping');
  return;
}
```

### 2. Proper Cleanup

```typescript
return () => {
  console.log('[useRemoteFaceMesh] Cleanup: stopping frame processing and closing MediaPipe');
  isActive = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
  videoRef.current?.removeEventListener('loadeddata', initMediaPipe);
  if (faceMeshRef.current) {
    faceMeshRef.current.close();  // ← CRITICAL: Close MediaPipe instance
    faceMeshRef.current = null;
  }
  setIsReady(false);
  setHasFace(false);
};
```

### 3. Active Flag for Animation Frames

```typescript
let isActive = true;

const processFrame = async () => {
  if (videoRef.current && faceMeshRef.current && isActive) {  // ← Check isActive
    try {
      await faceMeshRef.current.send({ image: videoRef.current });
    } catch (error) {
      console.error('[useRemoteFaceMesh] Error processing frame:', error);
    }
    if (isActive) {  // ← Check again before scheduling next frame
      animationFrameId = requestAnimationFrame(processFrame);
    }
  }
};
```

### 4. Error Handling

```typescript
try {
  await faceMeshRef.current.send({ image: videoRef.current });
} catch (error) {
  console.error('[useRemoteFaceMesh] Error processing frame:', error);
}
```

---

## Files Modified

| File | Lines | Changes |
|------|-------|---------|
| `src/hooks/useRemoteFaceMesh.ts` | 56-142 | Added instance guard, cleanup, active flag, error handling |
| `src/hooks/useFaceMesh.ts` | 160-208 | Added instance guard, cleanup, error handling |

---

## Changes in Detail

### useRemoteFaceMesh.ts Changes:

**Before:**
```typescript
useEffect(() => {
  const initMediaPipe = () => {
    // Always creates new instance
    const faceMesh = new (window as any).FaceMesh({...});
    faceMeshRef.current = faceMesh;
    // No active flag
    const processFrame = async () => {
      await faceMeshRef.current.send({ image: videoRef.current });
      requestAnimationFrame(processFrame);  // Always schedules next frame
    };
  };

  return () => {
    // No cleanup of MediaPipe instance
    videoRef.current?.removeEventListener('loadeddata', initMediaPipe);
  };
}, [videoRef, onResults]);
```

**After:**
```typescript
useEffect(() => {
  // Instance guard
  if (faceMeshRef.current) {
    console.log('MediaPipe already initialized, skipping');
    return;
  }

  let animationFrameId: number | null = null;
  let isActive = true;  // Active flag

  const initMediaPipe = () => {
    // Check before creating
    if (faceMeshRef.current || !isActive) return;

    const faceMesh = new (window as any).FaceMesh({...});
    faceMeshRef.current = faceMesh;

    const processFrame = async () => {
      if (videoRef.current && faceMeshRef.current && isActive) {
        try {
          await faceMeshRef.current.send({ image: videoRef.current });
        } catch (error) {
          console.error('Error:', error);
        }
        if (isActive) {  // Only schedule if still active
          animationFrameId = requestAnimationFrame(processFrame);
        }
      }
    };
  };

  return () => {
    isActive = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();  // Close MediaPipe
      faceMeshRef.current = null;
    }
    setIsReady(false);
    setHasFace(false);
  };
}, [videoRef, onResults]);
```

---

## Testing Checklist

To verify the fix is working:

### Expected Logs (Should See):

1. ✅ `[useRemoteFaceMesh] Hook initialized, videoRef: true` (once)
2. ✅ `[useRemoteFaceMesh] Video ready, initializing MediaPipe...` (once)
3. ✅ `[useRemoteFaceMesh] MediaPipe initialized successfully` (once)
4. ✅ `[useRemoteFaceMesh] Frame processing started` (once)

### Should NOT See:

- ❌ Duplicate initialization logs
- ❌ `Module.arguments has been replaced` error
- ❌ `Assertion failed: undefined` error
- ❌ Multiple WASM loading errors

### In React Strict Mode (Development):

You should see:
```
[useRemoteFaceMesh] Hook initialized, videoRef: true
[useRemoteFaceMesh] MediaPipe already initialized, skipping  ← This is GOOD!
```

This means the instance guard is working correctly.

---

## Why This Matters

1. **Production Stability**: Prevents WASM crashes in production
2. **Development Experience**: Works correctly even with React Strict Mode
3. **Resource Management**: Properly cleans up MediaPipe instances and animation frames
4. **Error Resilience**: Catches and logs errors instead of crashing

---

## Related Issues

This fix resolves:
- MediaPipe WASM module crashes
- Multiple face detection instances running simultaneously
- Memory leaks from unclosed MediaPipe instances
- Animation frames continuing after component unmount

---

## Related Documents

- `GLOBAL_MULTIPLAYER_WEBRTC_FIX.md` - Server-side WebRTC connection fix
- `OPPONENT_VIDEO_STATUS.md` - Event listener lifecycle fix

---

## Commit Message Suggestion

```
Fix MediaPipe multiple instance crashes in React Strict Mode

- Added instance guards to prevent multiple MediaPipe instances
- Properly close MediaPipe instances in cleanup
- Cancel animation frames on component unmount
- Added error handling for frame processing
- Added active flag to prevent stale async operations

This resolves WASM crashes caused by React Strict Mode
double-mounting creating multiple MediaPipe instances
that conflict with each other.

Both useFaceMesh and useRemoteFaceMesh now properly
handle cleanup and prevent duplicate initialization.
```

---

**Status**: ✅ Fix implemented, ready for testing
