
import { extractVideoResultsFromHtml, extractStreamUrlFromHtml, extractPornstarResultsFromHtml } from './htmlParserService';

export type ProviderKey = 'pornhub' | 'xvideos' | 'brazz' | 'generic';

export interface VideoResult {
    id?: string;
    title: string;
    pageUrl: string;
    thumbnailUrl: string;
    source: ProviderKey;
}

export interface PornstarResult {
    name: string;
    pageUrl: string;
    thumbnailUrl: string;
    source: ProviderKey;
}
// --- PROXY ROTATION SYSTEM ---
// REPLACEMENT: Local Vite Proxy (server-side forwarding)
// This bypasses CORS and external rate limits by using the local Node server.
const PROXY_BASE = '/proxy?url=';

const fetchSource = async (url: string): Promise<string> => {
    // Determine current origin (e.g. http://localhost:3000) to verify we are hitting our own server
    const proxyFetchUrl = `${PROXY_BASE}${encodeURIComponent(url)}`;

    console.log(`[videoService:fetchSource] Fetching via Local Proxy: ${proxyFetchUrl}`);

    try {
        const response = await fetch(proxyFetchUrl);
        if (!response.ok) {
            throw new Error(`Local Proxy fetch failed with status: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();

        // --- Block Detection ---
        if (text.length < 2500 && (text.includes('Just a moment') || text.includes('Verify that you are a human') || text.includes('Access denied'))) {
            throw new Error(`Detected Cloudflare Block (Length: ${text.length})`);
        }

        if (text.length < 500) {
            throw new Error(`Content too short (${text.length} chars). Likely an error.`);
        }

        console.log(`[videoService:fetchSource] Success via Local Proxy. Length: ${text.length}`);
        return text;

    } catch (e) {
        console.error(`[videoService:fetchSource] Failed via Local Proxy for ${url}:`, e);
        throw e;
    }
}

// NEW: Function to dig into an Embed/Iframe URL and find the actual .mp4 file
export const resolvePlayableUrl = async (embedUrl: string): Promise<string | null> => {
    try {
        console.log(`[videoService:resolvePlayableUrl] Digging into embed: ${embedUrl}`);
        const html = await fetchSource(embedUrl);

        // --- STRATEGY 1: XVideos / Generic HTML5 Player Specific Keys ---
        // XVideos uses html5player.setVideoUrlHigh('...') or Low
        const xvHigh = html.match(/setVideoUrlHigh\(['"]([^'"]+)['"]\)/);
        if (xvHigh && xvHigh[1]) {
            console.log(`[videoService] Found XVideos HIGH match`);
            return xvHigh[1];
        }

        const xvLow = html.match(/setVideoUrlLow\(['"]([^'"]+)['"]\)/);
        if (xvLow && xvLow[1]) {
            console.log(`[videoService] Found XVideos LOW match`);
            return xvLow[1];
        }

        // --- STRATEGY 2: Generic MP4 Regex with Filtering ---
        // 1. Direct file regex strategy (mp4, webm, mov)
        const mp4Regex = /(https?:\\?\/\\?\/[^"'\s<>]+\.(?:mp4|webm|mov))/gi;
        const matches = html.match(mp4Regex);

        if (matches && matches.length > 0) {
            // Filter out obviously wrong files (previews, thumbnails, ads)
            const validMatches = matches.filter(url => {
                const lower = url.toLowerCase();
                return !lower.includes('preview') &&
                    !lower.includes('thumb') &&
                    !lower.includes('ad_') &&
                    !lower.includes('doubleclick');
            });

            if (validMatches.length > 0) {
                // Clean up the URL (remove backslashes from JSON escaping)
                let bestMatch = validMatches[0].replace(/\\/g, '');

                // Prefer matches that have high resolution indicators
                const highResMatch = validMatches.find(m => m.includes('1080') || m.includes('720') || m.includes('hd') || m.includes('high'));
                if (highResMatch) {
                    bestMatch = highResMatch.replace(/\\/g, '');
                }

                console.log(`[videoService:resolvePlayableUrl] Found file via Regex: ${bestMatch}`);
                return bestMatch;
            }
        }

        // 3. HLS Fallback (m3u8) - We return it, but download logic might need to handle it or fail gracefully
        const m3u8Regex = /(https?:\\?\/\\?\/[^"'\s<>]+\.m3u8)/gi;
        const m3u8Matches = html.match(m3u8Regex);
        if (m3u8Matches && m3u8Matches.length > 0) {
            // Filter hls previews if any (unlikely for m3u8 but possible)
            const validHls = m3u8Matches.filter(u => !u.includes('preview'));
            if (validHls.length > 0) {
                console.log(`[videoService:resolvePlayableUrl] Found HLS stream (fallback): ${validHls[0]}`);
                return validHls[0].replace(/\\/g, '');
            }
        }

        return null;
    } catch (e) {
        console.error("[videoService:resolvePlayableUrl] Failed to resolve", e);
        return null;
    }
};

export const fetchMetadata = async (url: string): Promise<{ title: string; thumbnailUrl: string }> => {
    try {
        console.log(`[videoService] Fetching metadata for ${url}`);
        const html = await fetchSource(url);

        let title = "";
        let thumbnailUrl = "";

        // Title Extraction
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        const twitterTitle = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
        const tagTitle = html.match(/<title>(.*?)<\/title>/i);

        if (ogTitle && ogTitle[1]) title = ogTitle[1];
        else if (twitterTitle && twitterTitle[1]) title = twitterTitle[1];
        else if (tagTitle && tagTitle[1]) title = tagTitle[1];

        // Clean title
        if (title) {
            title = title.replace(/&amp;/g, '&')
                .replace(/&#039;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s*-\s*Pornhub\.com/i, '')
                .replace(/\s*-\s*XVideos\.com/i, '')
                .replace(/\s*-\s*XNXX\.COM/i, '')
                .replace(/\s*\|\s*.*$/i, '') // Remove generic pipe suffixes
                .trim();
        }

        // Thumbnail Extraction
        const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        const twitterImage = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
        const linkImage = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);

        if (ogImage && ogImage[1]) thumbnailUrl = ogImage[1];
        else if (twitterImage && twitterImage[1]) thumbnailUrl = twitterImage[1];
        else if (linkImage && linkImage[1]) thumbnailUrl = linkImage[1];

        console.log(`[videoService] Extracted metadata: ${title}, ${thumbnailUrl}`);
        return { title, thumbnailUrl };

    } catch (error) {
        console.warn(`[videoService] Failed to fetch metadata for ${url}`, error);
        return { title: "", thumbnailUrl: "" };
    }
};

const shuffleArray = (array: any[]) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

interface ProviderConfig {
    key: ProviderKey;
    name: string;
    baseUrl: string;
    searchPath: string; // e.g., '/search?q=' or '/s/'
    trendingPath?: string;
    pornstarPath?: string;
}

// RESTRICTED Provider List (As requested)
const PROVIDER_CONFIG: ProviderConfig[] = [
    { key: 'generic', name: 'Direct Link', baseUrl: '', searchPath: '' }, // Keep generic for direct URL entry
    {
        key: 'pornhub',
        name: 'PornHub',
        baseUrl: 'https://www.pornhub.com',
        searchPath: '/video/search?search=',
        trendingPath: '/video?o=ht', // Hot/Trending
        pornstarPath: '/pornstars'
    },
    {
        key: 'xvideos',
        name: 'XVideos',
        baseUrl: 'https://www.xvideos.com',
        searchPath: '/?k=',
        trendingPath: '/best', // Best/Trending
        pornstarPath: '/pornstars'
    },
    {
        key: 'brazz',
        name: 'Brazz',
        baseUrl: 'https://brazz.org',
        searchPath: '/search/',
        trendingPath: '/', // Homepage usually has latest/trending
        pornstarPath: '/pornstars/' // Guessed, will verify
    },
];


const genericSearchProvider = async (config: ProviderConfig, q: string): Promise<VideoResult[]> => {
    // If no baseUrl is configured (like for generic direct links), we can't search.
    if (!config.baseUrl) {
        return [];
    }
    const url = `${config.baseUrl}${config.searchPath}${encodeURIComponent(q)}`;
    console.log(`[videoService:${config.name}] Searching with HTML parser for: "${q}"`);
    const html = await fetchSource(url);
    // Pass config.key to force specific parser if available
    const results = await extractVideoResultsFromHtml(html, config.name, config.baseUrl, config.key);
    return results.map(r => ({ ...r, source: config.key }));
};

const applyFallbackHeuristics = (pageUrl: string): string | null => {
    try {
        const urlObj = new URL(pageUrl);
        const hostname = urlObj.hostname.replace('www.', '');
        const path = urlObj.pathname;

        // XVideos
        // Pattern: xvideos.com/video12345/ or xvideos.com/video.12345/
        if (hostname.includes('xvideos.com')) {
            const match = path.match(/\/video(\.|)([a-z0-9]+)/i);
            if (match && match[2]) {
                return `https://www.xvideos.com/embedframe/${match[2]}`;
            }
        }

        // Pornhub
        // Pattern: view_video.php?viewkey=ph...
        if (hostname.includes('pornhub.com')) {
            const viewkey = urlObj.searchParams.get('viewkey');
            if (viewkey) return `https://www.pornhub.com/embed/${viewkey}`;
        }

        // XNXX
        // Pattern: xnxx.com/video-12345/title
        if (hostname.includes('xnxx.com')) {
            const match = path.match(/\/video-([a-z0-9]+)\//i);
            if (match && match[1]) {
                return `https://www.xnxx.com/embedframe/${match[1]}`;
            }
        }

    } catch (e) {
        return null;
    }
    return null;
}

const genericGetStream = async (pageUrl: string): Promise<string> => {
    console.log(`[videoService:genericGetStream] Getting stream for page: ${pageUrl}`);

    // 0. Direct file check (Optimization)
    // If the URL is already a video file, return it directly.
    if (pageUrl.match(/\.(mp4|webm|mov|m3u8)(\?|$)/i)) {
        console.log(`[videoService] URL is already a direct video link: ${pageUrl}`);
        return pageUrl;
    }

    // 1. Try Heuristics first
    const heuristicUrl = applyFallbackHeuristics(pageUrl);
    if (heuristicUrl) {
        console.log(`[videoService] Heuristic match found: ${heuristicUrl}.`);
        return heuristicUrl;
    }

    // 2. Fallback to HTML parsing if no heuristic matched
    const html = await fetchSource(pageUrl);
    return extractStreamUrlFromHtml(html, pageUrl);
};

// --- Master Exported Functions ---

type Provider = {
    search: (q: string) => Promise<VideoResult[]>;
    stream: (pageUrl: string) => Promise<string>;
    getTrending: () => Promise<VideoResult[]>;
    getPornstars: () => Promise<PornstarResult[]>;
    name: string;
};

// Placeholder for new parser functions (will be implemented in htmlParserService and imported)


const genericGetTrending = async (config: ProviderConfig): Promise<VideoResult[]> => {
    if (!config.baseUrl || !config.trendingPath) return [];

    const url = `${config.baseUrl}${config.trendingPath}`;
    console.log(`[videoService:${config.name}] Fetching Trending: ${url}`);
    try {
        const html = await fetchSource(url);
        // Reuse video extraction logic, it works for lists usually
        return await extractVideoResultsFromHtml(html, config.name, config.baseUrl, config.key);
    } catch (e) {
        console.error(`[videoService] Trending fetch failed for ${config.name}`, e);
        return [];
    }
};

const genericGetPornstars = async (config: ProviderConfig): Promise<PornstarResult[]> => {
    if (!config.baseUrl || !config.pornstarPath) return [];

    const url = `${config.baseUrl}${config.pornstarPath}`;
    console.log(`[videoService:${config.name}] Fetching Pornstars: ${url}`);
    try {
        const html = await fetchSource(url);
        return await extractPornstarResultsFromHtml(html, config.name, config.baseUrl, config.key);
    } catch (e) {
        console.error(`[videoService] Pornstar fetch failed for ${config.name}`, e);
        return [];
    }
}
// Dynamically build the PROVIDERS object from the configuration
export const PROVIDERS = PROVIDER_CONFIG.reduce((acc, config) => {
    acc[config.key] = {
        search: (q: string) => genericSearchProvider(config, q),
        stream: genericGetStream,
        getTrending: () => genericGetTrending(config),
        getPornstars: () => genericGetPornstars(config),
        name: config.name,
    };
    return acc;
}, {} as Record<ProviderKey, Provider>);

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

export const searchVideos = async (query: string, providers: ProviderKey[]): Promise<VideoResult[]> => {
    if (providers.length === 0) {
        console.warn("Search initiated with no providers selected.");
        return [];
    }

    // Filter out 'generic' from search providers as it has no search capability
    const validProviders = providers.filter(p => PROVIDERS[p].name !== 'Direct Link');

    // removed the random subset limit!
    // We launch all requests parallel (capped by browser usually, but let's hope it handles 20 requests OK)
    const selectedProviders = validProviders;

    console.log(`Searching providers [${selectedProviders.length}] for "${query}"`);

    const searchPromises = selectedProviders.map(key =>
        PROVIDERS[key].search(query).catch(err => {
            console.error(`Search failed for provider ${key}:`, err);
            return [];
        })
    );

    const results = await Promise.all(searchPromises);
    const allVideos = results.flat();
    console.log(`[videoService:searchVideos] Total videos found across selected providers: ${allVideos.length}`);

    if (allVideos.length === 0) {
        console.warn("[videoService:searchVideos] No results from any provider for this query.");
    }

    // Shuffle final results for serendipity
    return shuffleArray(allVideos);
};

export const getVideoStreamUrl = async (video: VideoResult): Promise<string> => {
    if (!video?.source || !video.pageUrl) throw new Error("Invalid video object provided");
    const streamFetcher = PROVIDERS[video.source]?.stream;
    if (!streamFetcher) throw new Error(`Unknown video source: ${video.source}`);

    try {
        console.log(`[videoService:getVideoStreamUrl] Attempting to fetch stream from ${video.source} for "${video.title}"`);
        const url = await streamFetcher(video.pageUrl);
        console.log(`[videoService:getVideoStreamUrl] Successfully got stream URL: ${url}`);
        return url;
    } catch (error) {
        console.error(`[videoService:getVideoStreamUrl] Error getting video stream for source ${video.source} and url ${video.pageUrl}:`, error);
        throw error;
    }
};

export const getProviderKeyFromUrl = (url: string): ProviderKey => {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        // Check exact keys first
        if (PROVIDER_KEYS.includes(hostname as ProviderKey)) return hostname as ProviderKey;

        // Check config baseUrls
        const found = PROVIDER_CONFIG.find(config => {
            if (!config.baseUrl) return false;
            const configHost = new URL(config.baseUrl).hostname.toLowerCase();
            return hostname.includes(configHost.replace('www.', ''));
        });

        if (found) return found.key;

        // Check keys in hostname
        const keyMatch = PROVIDER_KEYS.find(key => hostname.includes(key));
        if (keyMatch) return keyMatch;

    } catch (e) {
        console.warn("Invalid URL passed to provider matching", e);
    }
    return 'generic'; // Fallback to generic direct link handler
};
<<<<<<< HEAD

export const getTrendingVideos = async (providerKey: ProviderKey): Promise<VideoResult[]> => {
    if (!PROVIDERS[providerKey]?.getTrending) return [];
    return PROVIDERS[providerKey].getTrending();
};

export const getTrendingPornstars = async (providerKey: ProviderKey): Promise<PornstarResult[]> => {
    if (!PROVIDERS[providerKey]?.getPornstars) return [];
    return PROVIDERS[providerKey].getPornstars();
};
=======
>>>>>>> 71ff8c9ad8084b891fde8c4ac51229da259d3bbc
