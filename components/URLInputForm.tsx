
import React, { useState } from 'react';
import { LoadingSpinnerIcon, PlayIcon } from './icons';

interface SearchFormProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex w-full group">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ENTER KEYWORDS..."
          disabled={isLoading}
          className="w-full block px-4 py-3 bg-black border border-r-0 border-white/40 text-white placeholder-gray-600 focus:ring-0 focus:border-white text-lg transition-all font-mono tracking-wide uppercase rounded-none"
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="inline-flex items-center px-6 py-3 border border-white/40 text-lg font-bold text-black bg-white hover:bg-gray-200 disabled:bg-gray-900 disabled:text-gray-700 disabled:border-gray-800 focus:outline-none transition-all uppercase tracking-wider rounded-none"
        >
          {isLoading ? <LoadingSpinnerIcon /> : 'SEARCH'}
        </button>
      </div>
      <TagSuggestions onSelect={(tag) => onSearch(tag)} />
    </form>
  );
};

// --- NEW FEATURE: Tag Suggestions ---
interface TagProps {
  onSelect: (tag: string) => void;
}

const COMMON_TAGS = ['BBW', 'PAWG', 'BIG TITS', 'ASIAN', 'LATINA', 'MILF', 'BLONDE', 'EBONY', 'ANAL', 'CREAMPIE', 'SQUIRT', 'LESBIAN', "BBW MILF", "3D PORN", "MERU THE DEMON", "BBW ASIAN", 'BBW LATINA', 'BBW RUSSIAN', "BBW PAWG", "PAWG"];

export const TagSuggestions: React.FC<TagProps> = ({ onSelect }) => {
  return (
    <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
      {COMMON_TAGS.map(tag => (
        <button
          key={tag}
          onClick={() => onSelect(tag)}
          className="px-2 py-1 text-[10px] font-bold border border-gray-700 bg-black/50 text-gray-400 hover:text-white hover:border-white hover:bg-white/10 transition-all uppercase tracking-widest"
        >
          {tag}
        </button>
      ))}
    </div>
  );
};

interface DirectUrlFormProps {
  onPlay: (url: string) => void;
  isLoading: boolean;
}

export const DirectUrlForm: React.FC<DirectUrlFormProps> = ({ onPlay, isLoading }) => {
  const [directUrl, setDirectUrl] = useState('');
  const [embedCode, setEmbedCode] = useState('');

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (directUrl.trim()) {
      onPlay(directUrl.trim());
      setDirectUrl('');
    }
  };

  const handleEmbedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (embedCode.trim()) {
      onPlay(embedCode.trim());
      setEmbedCode('');
    }
  };

  return (
    <div className="w-full pt-6 border-t border-white/10 space-y-6">

      <div className="flex items-center gap-4">
        <div className="h-px bg-white/20 flex-grow"></div>
        <p className="text-white text-xs font-bold tracking-[0.2em] uppercase">Universal URL Loader</p>
        <div className="h-px bg-white/20 flex-grow"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* URL Input Form */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-widest ml-1">Paste Website URL</label>
          <form onSubmit={handleUrlSubmit} className="flex gap-0">
            <input
              type="text"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              placeholder="https://..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-black border border-white/30 text-white placeholder-gray-700 focus:border-white text-sm transition-colors font-mono rounded-none"
            />
            <button
              type="submit"
              disabled={isLoading || !directUrl.trim()}
              className="px-4 py-2 bg-white/10 hover:bg-white hover:text-black text-white text-sm font-bold border border-l-0 border-white/30 transition-all disabled:opacity-50 whitespace-nowrap rounded-none"
            >
              <PlayIcon />
            </button>
          </form>
        </div>

        {/* Embed Code Input Form */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-widest ml-1">Paste Embed Code</label>
          <form onSubmit={handleEmbedSubmit} className="flex gap-0">
            <input
              type="text"
              value={embedCode}
              onChange={(e) => setEmbedCode(e.target.value)}
              placeholder='<iframe src="..."> '
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-black border border-white/30 text-white placeholder-gray-700 focus:border-white text-sm transition-colors font-mono rounded-none"
            />
            <button
              type="submit"
              disabled={isLoading || !embedCode.trim()}
              className="px-4 py-2 bg-white/10 hover:bg-white hover:text-black text-white text-sm font-bold border border-l-0 border-white/30 transition-all disabled:opacity-50 whitespace-nowrap rounded-none"
            >
              LOAD
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

interface ControlPanelProps {
  onRandomSearch: () => void;
  isLoading: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ onRandomSearch, isLoading }) => {
  return (
    <div className="py-2">
      <div className="flex items-center justify-center">
        <button
          onClick={onRandomSearch}
          disabled={isLoading}
          className="group relative flex items-center justify-center bg-black text-white font-bold py-3 px-8 transition-all duration-300 border border-white/40 hover:border-white hover:bg-white hover:text-black disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden rounded-none"
        >
          <span className="relative z-10 flex items-center gap-2 uppercase tracking-widest">
            Randomize Feed
          </span>
        </button>
      </div>
    </div>
  );
};
