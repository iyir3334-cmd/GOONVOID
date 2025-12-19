
import React, { useEffect, useRef, useState } from 'react';
import { LoadingSpinnerIcon, CogIcon, MicIcon, DownloadIcon, ShuffleIcon } from './UIIcons';
import { HypnoOverlay } from './HypnoOverlay';
import { LiveTranscriptionService } from '../services/liveAudioService';
import { saveLocalVideo } from '../services/localVideoService';
import { resolvePlayableUrl } from '../services/videoService';

interface VideoPlayerProps {
    videoUrl: string | null;
    videoTitle: string | null;
    videoSource?: string | null;
    isStreamLoading: boolean;
    isHypnoMode: boolean;
    onVideoSaved?: () => void;
}

// A TypeScript interface for HLS quality levels for better type safety
interface HlsLevel {
    height: number;
    bitrate: number;
    name: string;
}

// Augment the Window interface to include Hls
declare global {
    interface Window {
        Hls: any;
    }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, videoTitle, videoSource, isStreamLoading, isHypnoMode, onVideoSaved }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<any>(null); // To hold the Hls instance
    const errorRetryCount = useRef(0);
    const maxErrorRetries = 3;

    // Live Transcription State
    const [liveCaption, setLiveCaption] = useState<string | null>(null);
    const [isCapturingAudio, setIsCapturingAudio] = useState(false);
    const liveServiceRef = useRef<LiveTranscriptionService | null>(null);
    const captionTimeoutRef = useRef<any>(null);

    // Download State
    const [isDownloading, setIsDownloading] = useState(false);

    // Player State
    const [qualityLevels, setQualityLevels] = useState<HlsLevel[]>([]);
    const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 signifies "Auto"
    const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
    const [playbackError, setPlaybackError] = useState<string | null>(null);

    // Determine if the URL is a direct stream or an embed page
    // FIX: Added blob: check to ensure local files are treated as direct streams
    // --- AUTO-CLIP STATE ---
    const [isAutoClip, setIsAutoClip] = useState(false);
    const clipTimeoutRef = useRef<any>(null);

    // --- STREAM RESOLUTION STATE ---
    const [resolvedDirectUrl, setResolvedDirectUrl] = useState<string | null>(null);
    const [isResolving, setIsResolving] = useState(false);

    // --- IFRAME AUTO-CLIP STATE ---
    const [iframeKey, setIframeKey] = useState(0);
    const [iframeTimestamp, setIframeTimestamp] = useState(0);
    const [showIframe, setShowIframe] = useState(true);
    const [isVoidStarted, setIsVoidStarted] = useState(false);

    // Determine if the URL passed in is ALREADY a direct stream (MP4/M3U8/Blob)
    const isPropDirectStream = videoUrl ? (videoUrl.includes('.mp4') || videoUrl.includes('.m3u8') || videoUrl.startsWith('blob:')) : false;

    // effective URL to play (either the resolved one or the original)
    const activeUrl = resolvedDirectUrl || videoUrl;

    // It is a direct stream if the prop was direct OR we resolved it
    const isActiveDirectStream = isPropDirectStream || !!resolvedDirectUrl;

    // It is an embed if we have a URL, it's NOT a direct stream, and we have NOT resolved it yet
    const isEmbed = videoUrl && !isActiveDirectStream;



    // --- VOID MODE INITIATION ---
    const handleInitiateVoid = async () => {
        if (isEmbed && videoUrl) {
            setIsResolving(true);
            setLiveCaption("TRANSMUTING EMBED TO STREAM...");
            try {
                const resolved = await resolvePlayableUrl(videoUrl);
                if (resolved) {
                    setResolvedDirectUrl(resolved);
                    setIsVoidStarted(true);
                    setLiveCaption("STREAM SYNCED.");
                } else {
                    setLiveCaption("TRANSMUTATION FAILED. USING IFRAME PROTOCOL.");
                    setIsVoidStarted(true);
                }
            } catch (e) {
                setLiveCaption("NEURAL LINK ERROR. USING IFRAME.");
                setIsVoidStarted(true);
            } finally {
                setIsResolving(false);
            }
        } else {
            setIsVoidStarted(true);
        }
    };

    // Toggle Auto-Clip
    const toggleAutoClip = () => {
        const nextState = !isAutoClip;
        setIsAutoClip(nextState);
        if (nextState) {
            handleInitiateVoid();
        } else {
            setIsVoidStarted(false);
            setResolvedDirectUrl(null); // Return to iframe if loop stopped
        }
    };

    // --- STREAM RESOLUTION LOGIC ---
    useEffect(() => {
        // Reset resolved state when the main video prop changes
        setResolvedDirectUrl(null);
        setIsResolving(false);
        setIsVoidStarted(false);
        // Do NOT reset isAutoClip here, let it persist across videos if active?
        // Actually, if we are in a new video, we should probably re-initiate if auto-clip is still on.
        if (isAutoClip) {
            handleInitiateVoid();
        }
    }, [videoUrl]);


    // Listen for native video play to trigger Void Mode
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = () => {
            if (isAutoClip && !isVoidStarted) {
                console.log("[VideoPlayer] Native Play detected, starting Void Loop");
                setIsVoidStarted(true);
            }
        };

        video.addEventListener('play', handlePlay);
        return () => video.removeEventListener('play', handlePlay);
    }, [isAutoClip, isVoidStarted]);



    // Auto-Clip Logic Effect
    useEffect(() => {
        if (!isAutoClip || !isVoidStarted) {
            if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
            return;
        }

        // --- IFRAME MODE ---
        // If it's an embed (and we failed to resolve a direct stream), we use the reload workaround
        if (isEmbed) {
            const triggerNextIframeClip = () => {
                const clipDurationMs = (Math.random() * 25000) + 5000;
                const randomStart = Math.floor(Math.random() * 300);

                console.log(`[AutoClip:Iframe] Hard Reset to ${randomStart}s`);

                // Hard Reset: Hide -> Wait -> Show (Forces fresh session)
                setShowIframe(false);

                setTimeout(() => {
                    setIframeTimestamp(randomStart);
                    setIframeKey(prev => prev + 1);
                    setShowIframe(true);
                    setLiveCaption(`VOID CLIP: ${randomStart}s START`);

                    clipTimeoutRef.current = setTimeout(triggerNextIframeClip, clipDurationMs);
                }, 100);
            };

            triggerNextIframeClip();
            return () => { if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current); };
        }

        // --- NATIVE VIDEO MODE ---
        if (!videoRef.current) return;
        const video = videoRef.current;

        const triggerNextClip = () => {
            if (!video.duration || isNaN(video.duration)) {
                clipTimeoutRef.current = setTimeout(triggerNextClip, 1000);
                return;
            }

            const clipDurationMs = (Math.random() * 25000) + 5000;
            const maxStart = Math.max(0, video.duration - (clipDurationMs / 1000));
            const randomStart = Math.random() * maxStart;

            console.log(`[AutoClip] Jumping to ${randomStart.toFixed(1)}s`);

            video.currentTime = randomStart;
            video.play().catch(e => console.error("AutoClip play failed", e));
            setLiveCaption(`VOID CLIP: ${(clipDurationMs / 1000).toFixed(0)}s SEGMENT`);

            clipTimeoutRef.current = setTimeout(triggerNextClip, clipDurationMs);
        };

        triggerNextClip();

        return () => {
            if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
        };
    }, [isAutoClip, isVoidStarted, activeUrl, isEmbed]); // Re-run if toggled, started, video changes, or embed status changes

    // --- DOWNLOAD LOGIC ---
    const handleDownload = async () => {
        if (!videoUrl || isDownloading) return;

        // Local file check
        if (videoUrl.startsWith('blob:')) {
            alert("This video is already playing from local storage.");
            return;
        }

        // HLS check (Only block if we know it's a direct m3u8 stream and we are NOT handling embed resolution)
        if (isActiveDirectStream && activeUrl.includes('.m3u8')) {
            alert("Live streams (HLS/m3u8) cannot be downloaded directly as a single file. Please use screen recording software.");
            return;
        }

        setIsDownloading(true);
        setLiveCaption("INITIATING DATA TRANSFER...");

        let downloadUrl = videoUrl;

        try {
            // If it is an Embed/Iframe, we must find the internal MP4 file first.
            if (isEmbed) {
                setLiveCaption("SCANNING EMBED FOR FILES...");
                const resolved = await resolvePlayableUrl(videoUrl);

                if (!resolved) {
                    throw new Error("No download file found inside embed.");
                }

                if (resolved.includes('.m3u8')) {
                    throw new Error("Found stream is HLS (m3u8) which cannot be downloaded as a single file.");
                }

                downloadUrl = resolved;
                setLiveCaption("FILE LOCATED. DOWNLOADING...");
            }

            // Use local proxy to avoid CORS and ensure binary data integrity
            // This hits our own vite server which forwards the request safely
            const proxyUrl = `/proxy?url=${encodeURIComponent(downloadUrl)}`;

            console.log(`[VideoPlayer] Downloading via local proxy: ${proxyUrl}`);
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Download failed with status: ${response.status}`);

            const blob = await response.blob();

            // Always save as MOV for maximum compatibility (User Request)
            const cleanTitle = (videoTitle || 'downloaded_video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const fileName = `${cleanTitle}.mov`;

            // Create File object for IDB with MOV MIME type
            const file = new File([blob], fileName, { type: 'video/quicktime' });

            // 1. Save to Computer (Trigger Browser Download)
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // 2. Save to "Downloads" Tab (IndexedDB)
            setLiveCaption("SAVING TO LOCAL STORAGE...");
            await saveLocalVideo(file);

            if (onVideoSaved) onVideoSaved();

            setLiveCaption("DOWNLOAD COMPLETE");
            setTimeout(() => setLiveCaption(null), 3000);

        } catch (e: any) {
            console.error("Download Error:", e);
            setLiveCaption("DOWNLOAD FAILED");
            alert(`Download failed: ${e.message || "Unknown Error"}`);
            setTimeout(() => setLiveCaption(null), 3000);
        } finally {
            setIsDownloading(false);
        }
    };

    // --- LIVE AUDIO CAPTURE HANDLER ---
    const handleStartAudioCapture = async () => {
        if (isCapturingAudio) {
            // Stop
            liveServiceRef.current?.stop();
            liveServiceRef.current = null;
            setIsCapturingAudio(false);
            setLiveCaption(null);
        } else {
            try {
                // Prompt user to share tab audio
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true, // Often required to get audio
                    audio: true
                });

                setIsCapturingAudio(true);
                setLiveCaption("CONNECTING TO NEURAL FEED...");

                liveServiceRef.current = new LiveTranscriptionService(
                    (text) => {
                        setLiveCaption(text);
                        // Auto clear after 4 seconds of silence
                        if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
                        captionTimeoutRef.current = setTimeout(() => {
                            // Optional: clear or keep last phrase? 
                            // Keeping last phrase creates better immersion usually.
                        }, 4000);
                    },
                    (err) => {
                        console.error("Live Service Error:", err);
                        setLiveCaption("LINK BROKEN");
                        setIsCapturingAudio(false);
                    }
                );

                await liveServiceRef.current.start(stream);

                // We only want the audio, so we can verify tracks
                const audioTrack = stream.getAudioTracks()[0];
                if (!audioTrack) {
                    alert("No audio track detected! Please ensure you checked 'Share tab audio' in the dialog.");
                    handleStartAudioCapture(); // Stop it
                }

                // Listen for stream stop (user clicks "Stop sharing")
                stream.getVideoTracks()[0].onended = () => {
                    handleStartAudioCapture(); // Trigger stop logic
                };

            } catch (e) {
                console.error("Failed to get display media", e);
                setIsCapturingAudio(false);
            }
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            liveServiceRef.current?.stop();
            if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
        };
    }, []);

    // --- DIRECT STREAM PLAYER LOGIC ---
    useEffect(() => {
        console.log(`[VideoPlayer:useEffect] Running effect. New videoUrl: ${videoUrl}`);
        const videoElement = videoRef.current;

        // Reset state for new video stream
        errorRetryCount.current = 0;
        setQualityLevels([]);
        setCurrentQuality(-1);
        setIsQualityMenuOpen(false);
        setPlaybackError(null);
        // Don't auto-reset AutoClip on video change? 
        // User might want to keep the mode on.
        // If we want to reset: setIsAutoClip(false);

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        if (videoElement) {
            videoElement.onerror = null;
            videoElement.removeAttribute('src');
            videoElement.load();
        }

        // Embed logic is handled above, return early for player setup
        if (isEmbed) return;

        if (!videoElement) return;

        if (activeUrl && isActiveDirectStream) {
            const isHls = activeUrl.includes('.m3u8');
            const Hls = window.Hls;

            if (isHls && Hls && Hls.isSupported()) {
                const hls = new Hls({
                    fragLoadErrorMaxRetry: 3,
                    manifestLoadErrorMaxRetry: 2,
                    xhrSetup: function (xhr: any, url: string) { xhr.withCredentials = false; }
                });
                hlsRef.current = hls;

                hls.loadSource(activeUrl);
                hls.attachMedia(videoElement);

                hls.on(Hls.Events.MANIFEST_PARSED, (event: any, data: any) => {
                    errorRetryCount.current = 0;
                    if (data.levels && data.levels.length > 1) {
                        setQualityLevels(data.levels.sort((a: HlsLevel, b: HlsLevel) => b.height - a.height));
                    }
                    if (!isAutoClip) videoElement.play().catch(e => console.log("Autoplay blocked", e));
                });

                hls.on(Hls.Events.ERROR, (event: any, data: any) => {
                    if (data.fatal) {
                        if (errorRetryCount.current >= maxErrorRetries) {
                            setPlaybackError("Stream unavailable.");
                            hls.destroy();
                            return;
                        }
                        errorRetryCount.current++;
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                            case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                            default: hls.destroy(); setPlaybackError("Critical error."); break;
                        }
                    }
                });
            } else {
                videoElement.src = activeUrl;
                videoElement.load();
                if (!isAutoClip) videoElement.play().catch(e => console.log("Autoplay blocked", e));
            }

            videoElement.onerror = () => setPlaybackError("Video load error.");

        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };

    }, [activeUrl, isActiveDirectStream]); // Re-run if URL changes or type changes

    const handleQualityChange = (levelIndex: number) => {
        if (hlsRef.current) {
            hlsRef.current.currentLevel = levelIndex;
            setCurrentQuality(levelIndex);
        }
        setIsQualityMenuOpen(false);
    };

    return (
        <div className={`w-full aspect-video bg-black rounded-sm overflow-hidden flex items-center justify-center relative transition-shadow duration-500 ${videoUrl ? 'pulse-glow' : 'border border-gray-800'}`}>

            {/* INTERNAL HYPNO OVERLAY */}
            <HypnoOverlay
                active={isHypnoMode && !!videoUrl}
                liveText={liveCaption}
            />

            {/* Fallback Iframe Player */}
            {isEmbed && videoUrl && showIframe && (
                <iframe
                    key={iframeKey}
                    src={`${videoUrl}${videoUrl.includes('?') ? '&' : '?'}t=${iframeTimestamp}&autoplay=${isVoidStarted ? 1 : 0}&muted=1&_=${Date.now()}`}
                    className="w-full h-full relative z-10"
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay *; fullscreen *; encrypted-media *; accelerometer; gyroscope; picture-in-picture; screen-wake-lock *"
                    sandbox="allow-forms allow-scripts allow-same-origin allow-presentation allow-popups allow-top-navigation-by-user-activation"
                />
            )}



            {/* BACK TO IFRAME BUTTON */}
            {resolvedDirectUrl && !videoUrl?.startsWith('blob:') && (
                <div className="absolute bottom-4 right-4 z-[70]">
                    <button
                        onClick={() => {
                            setResolvedDirectUrl(null);
                            setIsVoidStarted(false);
                        }}
                        className="px-4 py-2 bg-black/60 border border-white/20 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all"
                    >
                        Back to Iframe
                    </button>
                </div>
            )}

            {/* Standard Video Element (Hidden if embed) */}
            <video
                ref={videoRef}
                className={`w-full h-full bg-black relative z-10 ${isEmbed ? 'hidden' : 'block'}`}
                controls={!isAutoClip}
                playsInline
                muted={!resolvedDirectUrl}
                autoPlay
                loop
            />

            {/* --- LIVE AUDIO CONTROL --- */}
            {
                videoUrl && (
                    <div className="absolute top-4 left-4 z-50 flex gap-2 flex-wrap">
                        <button
                            onClick={handleStartAudioCapture}
                            className={`
                      flex items-center gap-2 px-3 py-1 text-xs font-bold uppercase tracking-widest border transition-all
                      ${isCapturingAudio
                                    ? 'bg-red-900/80 text-white border-red-500 animate-pulse'
                                    : 'bg-black/60 text-gray-300 border-gray-600 hover:text-white hover:border-white'
                                }
                  `}
                            title="Capture audio from this tab to generate captions"
                        >
                            <MicIcon active={isCapturingAudio} />
                            {isCapturingAudio ? 'LISTENING' : 'LINK AUDIO'}
                        </button>

                        {/* Download Button */}
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading || (isActiveDirectStream && activeUrl.includes('.m3u8') && !activeUrl.startsWith('blob:')) || false}
                            className={`
                      flex items-center gap-2 px-3 py-1 text-xs font-bold uppercase tracking-widest border transition-all
                      ${isDownloading
                                    ? 'bg-white text-black border-white animate-pulse'
                                    : 'bg-black/60 text-gray-300 border-gray-600 hover:text-white hover:border-white disabled:opacity-30 disabled:cursor-not-allowed'
                                }
                  `}
                            title={isDownloading ? "Downloading..." : "Download Video to Disk & Storage"}
                        >
                            {isDownloading ? <LoadingSpinnerIcon /> : <DownloadIcon />}
                            {isDownloading ? 'SAVING...' : 'SAVE'}
                        </button>

                        {/* AUTO CLIP TOGGLE - ALWAYS AVAILABLE NOW */}
                        <button
                            onClick={toggleAutoClip}
                            className={`
                        flex items-center gap-2 px-3 py-1 text-xs font-bold uppercase tracking-widest border transition-all
                        ${isAutoClip
                                    ? 'bg-purple-900/80 text-white border-purple-500 animate-pulse'
                                    : 'bg-black/60 text-gray-300 border-gray-600 hover:text-white hover:border-white'
                                }
                    `}
                            title="Auto-Clip Mode: Random seeking every <30s"
                        >
                            <ShuffleIcon className="w-5 h-5" />
                            {isAutoClip ? 'VOID LOOP' : 'AUTO CLIP'}
                        </button>
                    </div>
                )
            }

            {/* --- UI Elements --- */}

            {
                playbackError && !isEmbed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40">
                        <div className="text-white text-center p-4 bg-black border border-white/50 rounded-sm">
                            <p className="font-bold mb-2 uppercase tracking-widest">Playback Error</p>
                            <p>{playbackError}</p>
                            <p className="text-sm text-gray-400 mt-2">Try selecting a different video.</p>
                        </div>
                    </div>
                )
            }

            {
                qualityLevels.length > 0 && !playbackError && !isEmbed && (
                    <div className="absolute bottom-16 right-4 z-50">
                        {isQualityMenuOpen && (
                            <div className="absolute bottom-full right-0 mb-2 w-28 bg-black/90 backdrop-blur-sm rounded-none py-1 border border-white/30 shadow-lg">
                                <button onClick={() => handleQualityChange(-1)} className={`w-full text-left px-3 py-1 text-sm transition-colors ${currentQuality === -1 ? 'bg-white text-black font-bold' : 'text-white hover:bg-white/20'}`}>
                                    Auto
                                </button>
                                {qualityLevels.map((level, index) => (
                                    <button key={`${level.height}-${level.bitrate}`} onClick={() => handleQualityChange(index)} className={`w-full text-left px-3 py-1 text-sm transition-colors ${currentQuality === index ? 'bg-white text-black font-bold' : 'text-white hover:bg-white/20'}`}>
                                        {level.height}p
                                    </button>
                                ))}
                            </div>
                        )}
                        <button
                            onClick={() => setIsQualityMenuOpen(!isQualityMenuOpen)}
                            className="p-2 rounded-full bg-black/60 text-white hover:bg-white hover:text-black transition-colors border border-white/30"
                        >
                            <CogIcon />
                        </button>
                    </div>
                )
            }

            {
                !videoUrl && !isStreamLoading && !playbackError && (
                    <div className="text-gray-600 text-center animate-pulse relative z-10">
                        <p className="text-xl font-bold tracking-[0.3em] uppercase">Void Stream Inactive</p>
                        <p className="text-xs mt-2 uppercase">Awaiting Input Coordinates</p>
                    </div>
                )
            }

            {
                isStreamLoading && (
                    <div className="absolute inset-0 bg-black z-20 flex flex-col items-center justify-center">
                        <LoadingSpinnerIcon />
                        <p className="mt-4 text-white text-xs font-mono tracking-widest animate-pulse">ESTABLISHING CONNECTION...</p>
                    </div>
                )
            }
        </div >
    );
};

