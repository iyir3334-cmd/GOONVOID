
import React from 'react';

interface HypnoOverlayProps {
  active: boolean;
  liveText: string | null;
}

export const HypnoOverlay: React.FC<HypnoOverlayProps> = ({ active, liveText }) => {
  if (!active) return null;

  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center overflow-hidden">
      {/* Radial Gradient overlay to darken edges (Tunnel vision) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_30%,#000000_100%)] opacity-90 transition-opacity duration-300" />

      {/* Flashing Word */}
      {liveText && (
        <div className="relative z-40 px-8 text-center max-w-5xl">
            <h1 
                key={liveText} // Trigger animation on change
                className={`
                    text-4xl md:text-5xl lg:text-6xl font-black text-transparent bg-clip-text 
                    tracking-widest animate-in fade-in zoom-in duration-300 ease-out
                    bg-gradient-to-t from-white via-gray-200 to-gray-400 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]
                `}
                style={{ 
                    lineHeight: '1.2'
                }}
            >
                {liveText}
            </h1>
        </div>
      )}
      
      {/* Subliminal Flicker layer */}
      <div className="absolute inset-0 bg-white mix-blend-overlay animate-pulse pointer-events-none opacity-[0.03]"></div>
    </div>
  );
};
