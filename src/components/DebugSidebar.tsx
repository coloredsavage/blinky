import React, { useState } from 'react';

interface DebugInfo {
  // Connection status
  isConnected: boolean;
  connectionStatus: string;
  
  // Stream status
  hasLocalStream: boolean;
  hasRemoteStream: boolean;
  localStreamTracks: number;
  remoteStreamTracks: number;
  
  // Opponent data
  opponentUsername: string;
  opponentFaceVisible: boolean;
  
  // Peer info
  isPeerInitiator: boolean;
  peerConnected: boolean;
  
  // WebRTC debug
  localStreamId?: string;
  remoteStreamId?: string;
  remoteVideoDebug?: {
    exists: boolean;
    hasStreamAssigned: boolean;
    readyState: string;
    videoWidth: number;
    videoHeight: number;
    paused: boolean;
    muted: boolean;
  };
  
  // Face transmission debug
  localFaceVisible?: boolean;
  lastSentFaceData?: {
    isFaceVisible: boolean;
    landmarkCount: number;
    timestamp: number;
  } | null;
  lastReceivedFaceData?: {
    isFaceVisible: boolean;
    landmarkCount: number;
    timestamp: number;
    playerId: string;
  } | null;
  faceDataReceived?: boolean;
}

interface DebugSidebarProps {
  debugInfo: DebugInfo;
  onClose?: () => void;
}

const DebugSidebar: React.FC<DebugSidebarProps> = ({ debugInfo, onClose }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  
  if (isMinimized) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button 
          onClick={() => setIsMinimized(false)}
          className="bg-yellow-500 text-black px-3 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-yellow-400"
        >
          🐛 Debug
        </button>
      </div>
    );
  }
  
  return (
    <div className="fixed top-4 right-4 z-50 bg-gray-900 border-2 border-yellow-500 rounded-lg p-4 text-white text-xs w-80 shadow-2xl">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-yellow-400">🐛 Debug Panel</h3>
        <div className="flex gap-1">
          <button 
            onClick={() => setIsMinimized(true)}
            className="text-gray-400 hover:text-white text-lg"
          >
            −
          </button>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white text-lg"
            >
              ×
            </button>
          )}
        </div>
      </div>
      
      {/* Connection Status */}
      <div className="mb-3">
        <div className="text-yellow-400 font-semibold mb-1">Connection</div>
        <div className={`text-xs ${debugInfo.isConnected ? 'text-green-400' : 'text-red-400'}`}>
          Status: {debugInfo.connectionStatus}
        </div>
        <div className={`text-xs ${debugInfo.peerConnected ? 'text-green-400' : 'text-red-400'}`}>
          Peer: {debugInfo.peerConnected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="text-xs text-gray-400">
          Role: {debugInfo.isPeerInitiator ? 'Initiator (Host)' : 'Receiver (Guest)'}
        </div>
      </div>
      
      {/* Stream Status */}
      <div className="mb-3">
        <div className="text-yellow-400 font-semibold mb-1">Video Streams</div>
        <div className={`text-xs ${debugInfo.hasLocalStream ? 'text-green-400' : 'text-red-400'}`}>
          📹 Local: {debugInfo.hasLocalStream ? `${debugInfo.localStreamTracks} tracks` : 'No stream'}
        </div>
        {debugInfo.localStreamId && (
          <div className="text-xs text-gray-400 ml-4">ID: {debugInfo.localStreamId.substring(0, 8)}...</div>
        )}
        
        <div className={`text-xs ${debugInfo.hasRemoteStream ? 'text-green-400' : 'text-red-400'}`}>
          📺 Remote: {debugInfo.hasRemoteStream ? `${debugInfo.remoteStreamTracks} tracks` : 'No stream'}
        </div>
        {debugInfo.remoteStreamId && (
          <div className="text-xs text-gray-400 ml-4">ID: {debugInfo.remoteStreamId.substring(0, 8)}...</div>
        )}
        
        {/* Remote Video Element Debug */}
        {debugInfo.remoteVideoDebug && (
          <div className="text-xs text-gray-400 mt-2 border-t border-gray-600 pt-2">
            <div>Video Element: {debugInfo.remoteVideoDebug.exists ? '✅' : '❌'}</div>
            <div>Stream Assigned: {debugInfo.remoteVideoDebug.hasStreamAssigned ? '✅' : '❌'}</div>
            <div>Ready State: {debugInfo.remoteVideoDebug.readyState}</div>
            <div>Video Size: {debugInfo.remoteVideoDebug.videoWidth}x{debugInfo.remoteVideoDebug.videoHeight}</div>
            <div>Paused: {debugInfo.remoteVideoDebug.paused ? '⏸️' : '▶️'}</div>
            <div>Muted: {debugInfo.remoteVideoDebug.muted ? '🔇' : '🔊'}</div>
          </div>
        )}
      </div>
      
      {/* Opponent Info */}
      <div className="mb-3">
        <div className="text-yellow-400 font-semibold mb-1">Opponent</div>
        <div className="text-xs text-gray-300">
          Name: {debugInfo.opponentUsername || 'None'}
        </div>
        <div className={`text-xs ${debugInfo.opponentFaceVisible ? 'text-green-400' : 'text-red-400'}`}>
          Face: {debugInfo.opponentFaceVisible ? 'Visible' : 'Not detected'}
        </div>
      </div>
      
      {/* Face Transmission Debug */}
      <div className="mb-3">
        <div className="text-yellow-400 font-semibold mb-1">Face Data Transmission</div>
        
        {/* Local face being sent */}
        <div className="text-xs mb-2">
          <div className={`${debugInfo.localFaceVisible ? 'text-green-400' : 'text-red-400'}`}>
            📤 Sending: {debugInfo.localFaceVisible ? 'Face Visible' : 'No Face'}
          </div>
          {debugInfo.lastSentFaceData && (
            <div className="text-gray-400 ml-4 text-xs">
              L: {debugInfo.lastSentFaceData.landmarkCount} | 
              Age: {Math.min(Math.floor((Date.now() - debugInfo.lastSentFaceData.timestamp) / 1000), 999)}s
            </div>
          )}
        </div>
        
        {/* Remote face being received */}
        <div className="text-xs">
          <div className={`${debugInfo.faceDataReceived ? 'text-green-400' : 'text-red-400'}`}>
            📥 Receiving: {debugInfo.faceDataReceived ? 'Data Active' : 'No Data'}
          </div>
          {debugInfo.lastReceivedFaceData && (
            <div className="text-gray-400 ml-4 text-xs">
              Face: {debugInfo.lastReceivedFaceData.isFaceVisible ? 'YES' : 'NO'} | 
              L: {debugInfo.lastReceivedFaceData.landmarkCount} | 
              From: {debugInfo.lastReceivedFaceData.playerId} |
              Age: {Math.min(Math.floor((Date.now() - debugInfo.lastReceivedFaceData.timestamp) / 1000), 999)}s
            </div>
          )}
        </div>
      </div>
      
      {/* Status Summary */}
      <div className="border-t border-gray-700 pt-2">
        <div className="text-yellow-400 font-semibold mb-1">Status</div>
        {debugInfo.hasLocalStream && debugInfo.hasRemoteStream ? (
          <div className="text-green-400 text-xs">✅ Both streams active</div>
        ) : debugInfo.hasLocalStream && !debugInfo.hasRemoteStream ? (
          <div className="text-red-400 text-xs">❌ Missing remote stream</div>
        ) : !debugInfo.hasLocalStream && debugInfo.hasRemoteStream ? (
          <div className="text-red-400 text-xs">❌ Missing local stream</div>
        ) : (
          <div className="text-red-400 text-xs">❌ No streams available</div>
        )}
      </div>
    </div>
  );
};

export default DebugSidebar;