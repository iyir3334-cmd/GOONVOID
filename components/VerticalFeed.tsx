
import React, { useEffect, useRef, useState } from 'react';
import { LocalVideo } from '../services/localVideoService';
import { TrashIcon, PlayIcon } from './icons';

interface VerticalFeedProps {
    videos: LocalVideo[];
    onClose: () => void;
    onDelete: (id: string) => void;
}

export const VerticalFeed: React.FC<VerticalFeedProps> = ({ videos, onClose, onDelete }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);

    // Setup Intersection Observer to handle autoplay/pause on scroll
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const options = {
            root: container,
            threshold: 0.6 // Trigger when 60% of video is visible
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const videoId = entry.target.getAttribute('data-id');
                const videoElement = entry.target.querySelector('video');

                if (entry.isIntersecting && videoId) {
                    setPlayingId(videoId);
                    if (videoElement) {
                        videoElement.currentTime = 0;
                        videoElement.play().catch(e => console.log("Autoplay blocked", e));
                    }
                } else {
                    if (videoElement) {
                        videoElement.pause();
                    }
                }
            });
        }, options);

        const items = container.querySelectorAll('.feed-item');
        items.forEach(item => observer.observe(item));

        return () => observer.disconnect();
    }, [videos]);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-300">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
                <div className="text-white drop-shadow-md">
                    <h2 className="font-bold uppercase tracking-widest text-lg">Local Feed</h2>
                    <p className="text-[10px] opacity-70">{videos.length} CLIPS</p>
                </div>
                <button 
                    onClick={onClose}
                    className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/20"
                >
                    ✕
                </button>
            </div>

            {/* Scroll Container */}
            <div 
                ref={containerRef}
                className="flex-1 overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar"
                style={{ scrollBehavior: 'smooth' }}
            >
                {videos.length === 0 ? (
                    <div className="h-full w-full flex items-center justify-center text-gray-500">
                        <p className="uppercase tracking-widest">NO DATA</p>
                    </div>
                ) : (
                    videos.map((vid) => (
                        <div 
                            key={vid.id}
                            data-id={vid.id}
                            className="feed-item w-full h-full snap-start relative flex items-center justify-center bg-black border-b border-white/10"
                        >
                            {/* Video Element */}
                            <video
                                src={URL.createObjectURL(vid.blob)}
                                className="w-full h-full object-contain max-h-screen"
                                loop
                                playsInline
                                controls={false} // Custom controls or minimal interface preferred for feed
                                onClick={(e) => {
                                    const v = e.currentTarget;
                                    v.paused ? v.play() : v.pause();
                                }}
                            />

                            {/* Overlay Info */}
                            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pointer-events-none">
                                <h3 className="text-white font-bold text-lg uppercase truncate drop-shadow-md mb-1">{vid.title}</h3>
                                <div className="flex items-center gap-4 text-xs text-gray-300 font-mono">
                                    <span>{(vid.blob.size / (1024 * 1024)).toFixed(1)} MB</span>
                                    <span>{new Date(vid.date).toLocaleDateString()}</span>
                                </div>
                            </div>

                            {/* Floating Action Buttons */}
                            <div className="absolute bottom-20 right-4 z-20 flex flex-col gap-4">
                                <button 
                                    onClick={() => {
                                        if (confirm("Permanently delete this clip?")) {
                                            onDelete(vid.id);
                                        }
                                    }}
                                    className="p-3 bg-black/40 hover:bg-red-600/80 backdrop-blur-sm rounded-full text-white border border-white/20 transition-all shadow-lg"
                                >
                                    <TrashIcon />
                                </button>
                            </div>

                            {/* Play Indicator (Only shows when paused) */}
                            {/* Note: We rely on standard click-to-pause logic, handled by video onclick above */}
                        </div>
                    ))
                )}
            </div>
            
            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    );
};
