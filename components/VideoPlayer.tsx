
import React, { useEffect, useRef, useState } from 'react';
import { LoadingSpinnerIcon, CogIcon, MicIcon, DownloadIcon } from './icons';
import { HypnoOverlay } from './HypnoOverlay';
import { LiveTranscriptionService } from '../services/liveAudioService';
import { saveLocalVideo } from '../services/localVideoService';
import { resolvePlayableUrl } from '../services/videoService';

interface VideoPlayerProps {
  videoUrl: string | null;
  videoTitle: string | null;
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

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, videoTitle, isStreamLoading, isHypnoMode, onVideoSaved }) => {
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
  const isDirectStream = videoUrl ? (videoUrl.includes('.mp4') || videoUrl.includes('.m3u8') || videoUrl.startsWith('blob:')) : false;
  const isEmbed = videoUrl && !isDirectStream;

  // --- DOWNLOAD LOGIC ---
  const handleDownload = async () => {
    if (!videoUrl || isDownloading) return;

    // Local file check
    if (videoUrl.startsWith('blob:')) {
        alert("This video is already playing from local storage.");
        return;
    }

    // HLS check (Only block if we know it's a direct m3u8 stream and we are NOT handling embed resolution)
    if (isDirectStream && videoUrl.includes('.m3u8')) {
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

        // Use the same proxy logic as videoService to avoid CORS on download
        // We use corsproxy.io
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(downloadUrl)}`;
        
        console.log(`[VideoPlayer] Downloading via proxy: ${proxyUrl}`);
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Download failed with status: ${response.status}`);
        
        const blob = await response.blob();
        
        // Determine filename
        const ext = blob.type.split('/')[1] || 'mp4';
        const cleanTitle = (videoTitle || 'downloaded_video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const fileName = `${cleanTitle}.${ext}`;
        
        // Create File object for IDB
        const file = new File([blob], fileName, { type: blob.type });

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

    if (videoUrl && isDirectStream) {
      const isHls = videoUrl.includes('.m3u8');
      const Hls = window.Hls;
      
      if (isHls && Hls && Hls.isSupported()) {
        const hls = new Hls({
            fragLoadErrorMaxRetry: 3,
            manifestLoadErrorMaxRetry: 2,
            xhrSetup: function (xhr: any, url: string) { xhr.withCredentials = false; }
        });
        hlsRef.current = hls;
        
        hls.loadSource(videoUrl); 
        hls.attachMedia(videoElement);

        hls.on(Hls.Events.MANIFEST_PARSED, (event: any, data: any) => {
          errorRetryCount.current = 0;
          if (data.levels && data.levels.length > 1) {
              setQualityLevels(data.levels.sort((a: HlsLevel, b: HlsLevel) => b.height - a.height));
          }
          videoElement.play().catch(e => console.log("Autoplay blocked", e));
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
        videoElement.src = videoUrl;
        videoElement.load();
        videoElement.play().catch(e => console.log("Autoplay blocked", e));
      }

      videoElement.onerror = () => setPlaybackError("Video load error.");

    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

  }, [videoUrl, isDirectStream]); // Re-run if URL changes or type changes
  
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
      {isEmbed && videoUrl && (
         <iframe 
            src={videoUrl} 
            className="w-full h-full relative z-10" 
            frameBorder="0" 
            allowFullScreen 
            allow="autoplay; encrypted-media"
            sandbox="allow-scripts allow-same-origin allow-presentation"
         />
      )}

      {/* Standard Video Element (Hidden if embed) */}
      <video 
        ref={videoRef} 
        className={`w-full h-full bg-black relative z-10 ${isEmbed ? 'hidden' : 'block'}`}
        controls 
        playsInline 
        muted 
        autoPlay
        loop
      />
      
      {/* --- LIVE AUDIO CONTROL --- */}
      {videoUrl && (
          <div className="absolute top-4 left-4 z-50 flex gap-2">
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
                  disabled={isDownloading || (isDirectStream && videoUrl.includes('.m3u8') && !videoUrl.startsWith('blob:')) || false}
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
          </div>
      )}

      {/* --- UI Elements --- */}

      {playbackError && !isEmbed && (
         <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40">
             <div className="text-white text-center p-4 bg-black border border-white/50 rounded-sm">
                 <p className="font-bold mb-2 uppercase tracking-widest">Playback Error</p>
                 <p>{playbackError}</p>
                 <p className="text-sm text-gray-400 mt-2">Try selecting a different video.</p>
             </div>
         </div>
      )}

      {qualityLevels.length > 0 && !playbackError && !isEmbed && (
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
      )}

      {!videoUrl && !isStreamLoading && !playbackError && (
          <div className="text-gray-600 text-center animate-pulse relative z-10">
              <p className="text-xl font-bold tracking-[0.3em] uppercase">Void Stream Inactive</p>
              <p className="text-xs mt-2 uppercase">Awaiting Input Coordinates</p>
          </div>
      )}
      
      {isStreamLoading && (
          <div className="absolute inset-0 bg-black z-20 flex flex-col items-center justify-center">
              <LoadingSpinnerIcon />
              <p className="mt-4 text-white text-xs font-mono tracking-widest animate-pulse">ESTABLISHING CONNECTION...</p>
          </div>
      )}
    </div>
  );
};
