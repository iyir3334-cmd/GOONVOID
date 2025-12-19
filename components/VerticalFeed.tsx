import React, { useEffect, useRef, useState, useMemo } from 'react';
import { VideoResult } from '../services/videoService';
import { TrashIcon, PlayIcon, FilterIcon } from './UIIcons';

interface VerticalFeedProps {
    videos: VideoResult[];
    onClose: () => void;
    onDelete?: (id: string) => void; // Optional, only for local videos
    title?: string;
}

export const VerticalFeed: React.FC<VerticalFeedProps> = ({ videos, onClose, onDelete, title = "Feed View" }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Store resolved playable URLs: { [pageUrl]: streamUrl }
    const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

    // 1. Resolve Stream for Playing Video
    useEffect(() => {
        if (!playingId) return;

        const video = videos.find(v => (v.id || v.pageUrl) === playingId);
        if (!video) return;

        // Determine key for cache (prefer ID if available, else pageUrl)
        const key = video.id || video.pageUrl;

        // If already resolved or currently loading, skip
        if (resolvedUrls[key] || loadingMap[key]) return;

        // If it's a generic/direct source, use pageUrl directly (no fetch needed)
        if (video.source === 'generic') {
            setResolvedUrls(prev => ({ ...prev, [key]: video.pageUrl }));
            return;
        }

        // Otherwise, resolve via service
        const resolveStream = async () => {
            setLoadingMap(prev => ({ ...prev, [key]: true }));
            try {
                const { getVideoStreamUrl } = await import('../services/videoService');
                const streamUrl = await getVideoStreamUrl(video);
                setResolvedUrls(prev => ({ ...prev, [key]: streamUrl }));
            } catch (e) {
                console.error("Failed to resolve stream for feed:", video.title, e);
            } finally {
                setLoadingMap(prev => ({ ...prev, [key]: false }));
            }
        };

        resolveStream();
    }, [playingId, videos, resolvedUrls, loadingMap]);


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
                        // Only play if src is valid (it might be empty if waiting for resolution)
                        if (videoElement.src && videoElement.src !== window.location.href) {
                            videoElement.play().catch(e => console.log("Autoplay blocked", e));
                        }
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

    const scrollToVideo = (index: number) => {
        const container = containerRef.current;
        if (container) {
            const child = container.children[index] as HTMLElement;
            if (child) {
                child.scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black flex animate-in fade-in duration-300 font-sans">
            {/* Main Feed Area */}
            <div className="flex-1 relative flex flex-col h-full bg-black">
                {/* Header Overlay */}
                <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                    <div className="text-white drop-shadow-md pointer-events-auto">
                        <h2 className="font-bold uppercase tracking-widest text-lg flex items-center gap-2">
                            {title}
                            <span className="text-[10px] bg-white text-black px-2 rounded-full">{videos.length}</span>
                        </h2>
                    </div>
                    <div className="flex gap-2 pointer-events-auto">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={`p-2 rounded-full text-white transition-all border ${isSidebarOpen ? 'bg-white text-black border-white' : 'bg-black/40 border-white/20 hover:bg-white/10'}`}
                            title="Toggle Playlist"
                        >
                            <FilterIcon />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 bg-black/40 hover:bg-red-600/80 backdrop-blur-md rounded-full text-white transition-all border border-white/20"
                        >

                        </button>
                    </div>
                </div>

                {/* Scroll Container */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar w-full h-full"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    {videos.length === 0 ? (
                        <div className="h-full w-full flex items-center justify-center text-gray-500">
                            <p className="uppercase tracking-widest">NO VIDEOS IN FEED</p>
                        </div>
                    ) : (
                        videos.map((vid, index) => {
                            const key = vid.id || vid.pageUrl;
                            const streamUrl = resolvedUrls[key];
                            const isLoading = loadingMap[key];

                            // Determine if the stream is an embed or direct video
                            const isDirectStream = streamUrl ? (
                                streamUrl.includes('.mp4') ||
                                streamUrl.includes('.m3u8') ||
                                streamUrl.includes('.webm') ||
                                streamUrl.includes('.mov') ||
                                streamUrl.startsWith('blob:') ||
                                streamUrl.startsWith('/uploads/')
                            ) : false;
                            const isEmbed = streamUrl && !isDirectStream;

                            return (
                                <div
                                    key={`${key}-${index}`}
                                    data-id={key}
                                    className="feed-item w-full h-full snap-start relative flex items-center justify-center bg-black border-b border-white/10"
                                >
                                    {/* Video or Iframe Element */}
                                    {streamUrl ? (
                                        isEmbed ? (
                                            playingId === key ? (
                                                <iframe
                                                    src={streamUrl}
                                                    className="w-full h-full"
                                                    allow="autoplay; fullscreen; picture-in-picture; screen-wake-lock"
                                                    allowFullScreen
                                                    style={{ border: 'none' }}
                                                />
                                            ) : (
                                                <div
                                                    className="w-full h-full flex items-center justify-center bg-black"
                                                    style={{
                                                        backgroundImage: vid.thumbnailUrl ? `url(${vid.thumbnailUrl})` : 'none',
                                                        backgroundSize: 'contain',
                                                        backgroundPosition: 'center',
                                                        backgroundRepeat: 'no-repeat'
                                                    }}
                                                >
                                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                                        <PlayIcon />
                                                    </div>
                                                </div>
                                            )
                                        ) : (
                                            <video
                                                src={streamUrl}
                                                poster={vid.thumbnailUrl}
                                                className="w-full h-full object-contain max-h-screen"
                                                loop
                                                playsInline
                                                controls={true}
                                                autoPlay={playingId === key}
                                                onClick={(e) => {
                                                    const v = e.currentTarget;
                                                    v.paused ? v.play() : v.pause();
                                                }}
                                                onError={(e) => console.log("Video playback error", e)}
                                            />
                                        )
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-gray-500 gap-4">
                                            {isLoading ? (
                                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                                            ) : (
                                                <PlayIcon />
                                            )}
                                            <p className="uppercase tracking-widest text-xs">
                                                {isLoading ? "EXTRACTING SOURCE..." : "WAITING FOR SIGNAL..."}
                                            </p>
                                        </div>
                                    )}

                                    {/* Overlay Info */}
                                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pointer-events-none">
                                        <h3 className="text-white font-bold text-lg uppercase truncate drop-shadow-md mb-1">{vid.title}</h3>
                                        <div className="flex items-center gap-4 text-xs text-gray-300 font-mono">
                                            <span className="uppercase px-2 py-0.5 border border-gray-600 rounded">{vid.source}</span>
                                        </div>
                                    </div>

                                    {/* Floating Action Buttons */}
                                    {onDelete && (
                                        <div className="absolute bottom-20 right-4 z-20 flex flex-col gap-4">
                                            <button
                                                onClick={() => {
                                                    if (confirm("Permanently delete this clip?")) {
                                                        onDelete(key);
                                                    }
                                                }}
                                                className="p-3 bg-black/40 hover:bg-red-600/80 backdrop-blur-sm rounded-full text-white border border-white/20 transition-all shadow-lg"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Sidebar (Organized List) */}
            {isSidebarOpen && (
                <div className="w-80 bg-gray-900 border-l border-white/10 flex flex-col animate-in slide-in-from-right duration-300 z-50">
                    <div className="p-4 border-b border-white/10 bg-black">
                        <h3 className="text-white font-bold uppercase tracking-widest text-xs">Playlist Queue</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {videos.map((vid, idx) => {
                            const isPlaying = playingId === vid.pageUrl;
                            return (
                                <div
                                    key={`${vid.pageUrl}-${idx}`}
                                    onClick={() => scrollToVideo(idx)}
                                    className={`
                                        group flex gap-3 p-2 cursor-pointer transition-all border border-transparent
                                        ${isPlaying ? 'bg-white/10 border-white/30' : 'hover:bg-white/5'}
                                    `}
                                >
                                    {/* Thumbnail Preview */}
                                    <div className="w-16 h-12 bg-black flex-shrink-0 border border-white/10 overflow-hidden relative">
                                        {vid.thumbnailUrl ? (
                                            <img src={vid.thumbnailUrl} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-700">
                                                <PlayIcon />
                                            </div>
                                        )}
                                        {isPlaying && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Text Info */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <h4 className={`text-xs font-bold uppercase truncate ${isPlaying ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                                            {vid.title}
                                        </h4>
                                        <span className="text-[10px] text-gray-600 uppercase tracking-wider">{vid.source}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #000;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #333;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            `}</style>
        </div>
    );
};