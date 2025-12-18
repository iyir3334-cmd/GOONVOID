
import React, { useState } from 'react';
// FIX: Corrected the import path for VideoResult.
import { VideoResult } from '../services/videoService';
import { LoadingSpinnerIcon } from './icons';

interface VideoListProps {
  videos: VideoResult[];
  onVideoSelect: (video: VideoResult) => void;
  isLoading: boolean;
}

const VideoCard: React.FC<{ video: VideoResult; onSelect: () => void; }> = ({ video, onSelect }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div 
      className="group cursor-pointer rounded-none overflow-hidden bg-black border border-gray-800 hover:border-white transition-all duration-300 transform shadow-lg hover:shadow-[0_0_15px_rgba(255,255,255,0.3)]"
      onClick={onSelect}
      aria-label={`Play video: ${video.title}`}
      role="button"
      tabIndex={0}
    >
      <div className="relative aspect-video bg-black flex items-center justify-center">
        {!imgError && video.thumbnailUrl ? (
            <img 
              src={video.thumbnailUrl} 
              alt={video.title} 
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 grayscale group-hover:grayscale-0"
              loading="lazy"
              onError={() => setImgError(true)}
            />
        ) : (
            <div className="w-full h-full bg-gray-900 flex items-center justify-center border border-white/10 relative overflow-hidden">
               {/* Static noise effect for placeholder */}
               <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
               <span className="text-xs text-gray-500 font-mono z-10 uppercase tracking-widest">NO SIGNAL</span>
            </div>
        )}

        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white drop-shadow-md" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8.118v3.764a1 1 0 001.555.832l3.197-1.882a1 1 0 000-1.664l-3.197-1.882z" clipRule="evenodd" />
            </svg>
        </div>
      </div>
      <div className="p-3 border-t border-gray-800 group-hover:border-white/50 transition-colors">
        <h3 className="text-sm font-medium text-gray-400 truncate group-hover:text-white uppercase tracking-tight" title={video.title}>
          {video.title}
        </h3>
      </div>
    </div>
  );
};

export const VideoList: React.FC<VideoListProps> = ({ videos, onVideoSelect, isLoading }) => {
  if (isLoading) {
      return (
          <div className="flex flex-col items-center justify-center text-center p-10 text-gray-400">
             <LoadingSpinnerIcon />
              <p className="mt-4 text-lg uppercase tracking-widest">Scanning...</p>
          </div>
      );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center p-10 text-gray-500">
        <p className="uppercase">No search results. The void is empty.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {videos.map((video) => (
        <VideoCard key={video.pageUrl} video={video} onSelect={() => onVideoSelect(video)} />
      ))}
    </div>
  );
};
