
import React, { useState } from 'react';
import { VideoResult } from '../services/videoService';
import { CopyIcon, PlayIcon, CodeIcon } from './UIIcons';

interface ActionModalProps {
    video: VideoResult;
    onClose: () => void;
    onPlay: () => void;
}

export const ActionModal: React.FC<ActionModalProps> = ({ video, onClose, onPlay }) => {
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(video.pageUrl);
            setCopyFeedback("URL Copied!");
            setTimeout(() => onClose(), 1200);
        } catch (err) {
            setCopyFeedback("Failed to copy");
        }
    };

    const handleCopyEmbed = async () => {
        try {
            // Generating a generic iframe code based on the page URL
            const embedCode = `<iframe src="${video.pageUrl}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
            await navigator.clipboard.writeText(embedCode);
            setCopyFeedback("Embed Code Copied!");
            setTimeout(() => onClose(), 1200);
        } catch (err) {
            setCopyFeedback("Failed to copy");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-black border border-white rounded-none shadow-2xl overflow-hidden transform transition-all">

                {/* Header with Thumbnail Blur Background */}
                <div className="relative h-32 overflow-hidden">
                    <div
                        className="absolute inset-0 bg-cover bg-center blur-md opacity-40 grayscale"
                        style={{ backgroundImage: `url(${video.thumbnailUrl})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
                    <button
                        onClick={onClose}
                        className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-white hover:text-black text-white transition-colors border border-white/20"
                    >
                        ✕
                    </button>
                    <div className="absolute bottom-4 left-4 right-4">
                        <h3 className="text-lg font-bold text-white truncate shadow-black drop-shadow-md uppercase tracking-wide">
                            {video.title}
                        </h3>
                        <span className="text-xs text-black font-bold font-mono bg-white px-2 py-1 uppercase">
                            {video.source}
                        </span>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {copyFeedback ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-2 animate-in zoom-in duration-300">
                            <div className="p-3 bg-white text-black rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <p className="text-xl font-semibold text-white uppercase">{copyFeedback}</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-gray-400 text-sm text-center uppercase tracking-widest">Initiate Protocol</p>

                            <div className="grid gap-3">
                                <button
                                    onClick={onPlay}
                                    className="flex items-center justify-center gap-3 w-full p-4 bg-white hover:bg-gray-200 text-black font-bold rounded-none transition-all transform hover:scale-[1.01] shadow-lg"
                                >
                                    <PlayIcon />
                                    PLAY NOW
                                </button>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={handleCopyUrl}
                                        className="flex items-center justify-center gap-2 p-3 bg-black hover:bg-white hover:text-black text-gray-300 font-medium rounded-none border border-white/30 transition-colors"
                                    >
                                        <CopyIcon />
                                        Copy URL
                                    </button>

                                    <button
                                        onClick={handleCopyEmbed}
                                        className="flex items-center justify-center gap-2 p-3 bg-black hover:bg-white hover:text-black text-gray-300 font-medium rounded-none border border-white/30 transition-colors"
                                    >
                                        <CodeIcon />
                                        Copy Embed
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
