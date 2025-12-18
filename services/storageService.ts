
import { VideoResult } from './videoService';

const HISTORY_KEY = 'wvf_history_v1';
const FAVORITE_PROVIDERS_KEY = 'wvf_fav_providers_v1';
const MAX_HISTORY_ITEMS = 50;

export const saveToHistory = (video: VideoResult): VideoResult[] => {
  try {
    const currentHistory = getHistory();
    // Remove duplicates based on pageUrl
    const filteredHistory = currentHistory.filter(item => item.pageUrl !== video.pageUrl);
    
    // Add new video to the beginning
    const newHistory = [video, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    return newHistory;
  } catch (error) {
    console.error('Failed to save history', error);
    return [];
  }
};

export const getHistory = (): VideoResult[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load history', error);
    return [];
  }
};

export const clearHistory = (): void => {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error('Failed to clear history', error);
  }
};

// --- Favorite Providers ---

export const getFavoriteProviders = (): string[] => {
  try {
    const stored = localStorage.getItem(FAVORITE_PROVIDERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load favorite providers', error);
    return [];
  }
};

export const saveFavoriteProvider = (providerKey: string): string[] => {
    try {
        const current = getFavoriteProviders();
        if (!current.includes(providerKey)) {
            const updated = [...current, providerKey];
            localStorage.setItem(FAVORITE_PROVIDERS_KEY, JSON.stringify(updated));
            return updated;
        }
        return current;
    } catch (error) {
        console.error('Failed to save favorite provider', error);
        return [];
    }
};

export const removeFavoriteProvider = (providerKey: string): string[] => {
    try {
        const current = getFavoriteProviders();
        const updated = current.filter(k => k !== providerKey);
        localStorage.setItem(FAVORITE_PROVIDERS_KEY, JSON.stringify(updated));
        return updated;
    } catch (error) {
        console.error('Failed to remove favorite provider', error);
        return [];
    }
}
