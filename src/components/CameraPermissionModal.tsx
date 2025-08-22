
import React from 'react';

interface CameraPermissionModalProps {
    isOpen: boolean;
    onRequest: () => void;
}

const CameraPermissionModal: React.FC<CameraPermissionModalProps> = ({ isOpen, onRequest }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center max-w-sm mx-4 shadow-2xl">
                <h2 className="text-2xl font-bold mb-4">Camera Access Required</h2>
                <p className="text-gray-400 mb-6">
                    Blinky needs access to your camera to play. Please grant permission when prompted by your browser.
                </p>
                <button 
                    onClick={onRequest}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                    Grant Access
                </button>
            </div>
        </div>
    );
};

export default CameraPermissionModal;
