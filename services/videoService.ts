
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
    pornstarSearchPath?: string;
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
        pornstarSearchPath: '/pornstars/search?search=',
        trendingPath: '/video?o=ht', // Hot/Trending
        pornstarPath: '/pornstars?o=t' // Trending pornstars
    },
    {
        key: 'xvideos',
        name: 'XVideos',
        baseUrl: 'https://www.xvideos.com',
        searchPath: '/?k=',
        pornstarSearchPath: '/pornstars-index/?k=',
        trendingPath: '/best', // Best/Trending
        pornstarPath: '/pornstars-index' // Top 100 pornstars
    },
    {
        key: 'brazz',
        name: 'Brazz',
        baseUrl: 'https://brazz.org',
        searchPath: '/search/',
        // Brazz doesn't have a clear searchable pornstar index, so we omit pornstarSearchPath to fallback or skip
        trendingPath: '/videos/sortby/beingwatched/', // "Being watched" is the trending equivalent
        pornstarPath: '/pornstars/sortby/views/' // Most viewed pornstars
    },
];

const genericSearchProvider = async (config: ProviderConfig, q: string, page: number = 1): Promise<VideoResult[]> => {
    // If no baseUrl is configured (like for generic direct links), we can't search.
    if (!config.baseUrl) {
        return [];
    }

    let url = `${config.baseUrl}${config.searchPath}${encodeURIComponent(q)}`;

    // Pagination Logic
    if (page > 1) {
        if (config.key === 'pornhub') {
            url += `&page=${page}`;
        } else if (config.key === 'xvideos') {
            url += `&p=${page}`;
        } else if (config.key === 'brazz') {
            // Brazz: /search/query/page/2/
            // Note: Current searchPath is '/search/', so url is already /search/query.
            // We need to inject /page/2/
            url = `${config.baseUrl}${config.searchPath}${encodeURIComponent(q)}/page/${page}/`;
        }
    }

    console.log(`[videoService:${config.name}] Searching page ${page} with HTML parser for: "${q}"`);
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
    search: (q: string, page?: number) => Promise<VideoResult[]>;
    stream: (pageUrl: string) => Promise<string>;
    getTrending: (page?: number) => Promise<VideoResult[]>;
    getPornstars: (page?: number) => Promise<PornstarResult[]>;
    searchPornstars?: (q: string, page?: number) => Promise<PornstarResult[]>;
    name: string;
};

const genericGetTrending = async (config: ProviderConfig, page: number = 1): Promise<VideoResult[]> => {
    if (!config.baseUrl || !config.trendingPath) return [];

    let url = `${config.baseUrl}${config.trendingPath}`;

    // Pagination
    if (page > 1) {
        if (config.key === 'pornhub') {
            url += `&page=${page}`;
        } else if (config.key === 'xvideos') {
            // Remove trailing slash if checks
            url = `${config.baseUrl}/best/${page}`;
        } else if (config.key === 'brazz') {
            url = `${config.baseUrl}${config.trendingPath}page/${page}/`;
        }
    }

    console.log(`[videoService:${config.name}] Fetching Trending Page ${page}: ${url}`);
    try {
        const html = await fetchSource(url);
        // Reuse video extraction logic, it works for lists usually
        return await extractVideoResultsFromHtml(html, config.name, config.baseUrl, config.key);
    } catch (e) {
        console.error(`[videoService] Trending fetch failed for ${config.name}`, e);
        return [];
    }
};

const genericGetPornstars = async (config: ProviderConfig, page: number = 1): Promise<PornstarResult[]> => {
    if (!config.baseUrl || !config.pornstarPath) return [];

    let url = `${config.baseUrl}${config.pornstarPath}`;

    // Pagination
    if (page > 1) {
        if (config.key === 'pornhub') {
            url += `&page=${page}`;
        } else if (config.key === 'xvideos') {
            const xvPage = page - 1;
            url = `${config.baseUrl}/pornstars-index/${xvPage}`;
        } else if (config.key === 'brazz') {
            url = `${config.baseUrl}${config.pornstarPath}page/${page}/`;
        }
    }

    console.log(`[videoService:${config.name}] Fetching Pornstars Page ${page}: ${url}`);
    try {
        const html = await fetchSource(url);
        return await extractPornstarResultsFromHtml(html, config.name, config.baseUrl, config.key);
    } catch (e) {
        console.error(`[videoService] Pornstar fetch failed for ${config.name}`, e);
        return [];
    }
}

const genericSearchPornstars = async (config: ProviderConfig, q: string, page: number = 1): Promise<PornstarResult[]> => {
    if (!config.baseUrl || !config.pornstarSearchPath) {
        console.warn(`[videoService] No pornstar search path for ${config.name}`);
        return [];
    }

    // Basic URL construction
    let url = `${config.baseUrl}${config.pornstarSearchPath}${encodeURIComponent(q)}`;

    // Pagination for Search
    if (page > 1) {
        if (config.key === 'pornhub') {
            url += `&page=${page}`;
        } else if (config.key === 'xvideos') {
            // XVideos structure: /pornstars-index/?k=query&p=Number
            url += `&p=${page - 1}`;
        }
        // Brazz doesn't support specific pornstar search via this method likely
    }

    console.log(`[videoService:${config.name}] Searching Pornstars "${q}" Page ${page}: ${url}`);
    try {
        const html = await fetchSource(url);
        // Use the existing pornstar extractor as result lists are likely similar
        return await extractPornstarResultsFromHtml(html, config.name, config.baseUrl, config.key);
    } catch (e) {
        console.error(`[videoService] Pornstar search failed for ${config.name}`, e);
        return [];
    }
}

// Dynamically build the PROVIDERS object from the configuration
export const PROVIDERS = PROVIDER_CONFIG.reduce((acc, config) => {
    acc[config.key] = {
        search: (q: string, page: number = 1) => genericSearchProvider(config, q, page),
        stream: genericGetStream,
        getTrending: (page: number = 1) => genericGetTrending(config, page),
        getPornstars: (page: number = 1) => genericGetPornstars(config, page),
        searchPornstars: (q: string, page: number = 1) => genericSearchPornstars(config, q, page),
        name: config.name,
    };
    return acc;
}, {} as Record<ProviderKey, Provider>);

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

export const searchPornstars = async (query: string, providers: ProviderKey[], page: number = 1): Promise<PornstarResult[]> => {
    if (providers.length === 0) return [];

    // Filter generic
    const validProviders = providers.filter(p => PROVIDERS[p].name !== 'Direct Link');

    console.log(`[videoService] Searching Pornstars in [${validProviders.join(', ')}] for "${query}"`);

    const searchPromises = validProviders.map(key =>
        PROVIDERS[key].searchPornstars ? PROVIDERS[key].searchPornstars!(query, page).catch(e => []) : Promise.resolve([])
    );

    const results = await Promise.all(searchPromises);
    const flatResults = results.flat();

    // Sort by relevance to query
    const lowerQuery = query.toLowerCase().trim();
    return flatResults.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();

        // Exact match check
        const exactA = nameA === lowerQuery;
        const exactB = nameB === lowerQuery;
        if (exactA && !exactB) return -1;
        if (!exactA && exactB) return 1;

        // Starts with match check
        const startsA = nameA.startsWith(lowerQuery);
        const startsB = nameB.startsWith(lowerQuery);
        if (startsA && !startsB) return -1;
        if (!startsA && startsB) return 1;

        // Contains match check
        const containsA = nameA.includes(lowerQuery);
        const containsB = nameB.includes(lowerQuery);
        if (containsA && !containsB) return -1;
        if (!containsA && containsB) return 1;

        // Alphabetical as fallback
        return nameA.localeCompare(nameB);
    });
};

export const searchVideos = async (query: string, providers: ProviderKey[], page: number = 1): Promise<VideoResult[]> => {
    if (providers.length === 0) {
        console.warn("Search initiated with no providers selected.");
        return [];
    }

    // Filter out 'generic' from search providers as it has no search capability
    const validProviders = providers.filter(p => PROVIDERS[p].name !== 'Direct Link');

    const selectedProviders = validProviders;

    console.log(`Searching providers [${selectedProviders.length}] for "${query}" (Page ${page})`);

    const searchPromises = selectedProviders.map(key =>
        PROVIDERS[key].search(query, page).catch(err => {
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

export const getTrendingVideos = async (providerKey: ProviderKey, page: number = 1): Promise<VideoResult[]> => {
    if (!PROVIDERS[providerKey]?.getTrending) return [];
    return PROVIDERS[providerKey].getTrending(page);
};

export const getTrendingPornstars = async (providerKey: ProviderKey, page: number = 1): Promise<PornstarResult[]> => {
    if (!PROVIDERS[providerKey]?.getPornstars) return [];
    return PROVIDERS[providerKey].getPornstars(page);
};

export const getActorVideos = async (actor: PornstarResult, page: number = 1): Promise<VideoResult[]> => {
    console.log(`[videoService:getActorVideos] Fetching videos for ${actor.name} from ${actor.source}, page ${page}`);

    // XVideos uses a JSON API for pagination
    if (actor.source === 'xvideos') {
        try {
            // Extract actor name from pageUrl (e.g., "violet-myers" from "https://www.xvideos.com/pornstars/violet-myers")
            const actorName = actor.pageUrl.split('/').pop() || actor.name.toLowerCase().replace(/\s+/g, '-');
            // XVideos uses 0-based page indexing (page 1 = index 0)
            const pageIndex = page - 1;
            const apiUrl = `https://www.xvideos.com/pornstars/${actorName}/videos/best/straight/${pageIndex}`;

            console.log(`[videoService:getActorVideos] Fetching XVideos JSON API: ${apiUrl}`);
            const response = await fetch(`/proxy?url=${encodeURIComponent(apiUrl)}`);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[videoService:getActorVideos] XVideos API returned ${data.videos?.length || 0} videos (total: ${data.nb_videos}, page: ${data.current_page})`);

            // Convert JSON video objects to VideoResult format
            const videos: VideoResult[] = (data.videos || []).map((v: any) => ({
                title: v.t || '',
                // CRITICAL FIX: Prefer 'v.eid' to construct standard URL. 'v.u' often contains redirected 'prof-video-click' URLs which break embed extraction.
                pageUrl: v.eid ? `https://www.xvideos.com/video${v.eid}/${v.t?.toLowerCase().replace(/[^a-z0-9]+/g, '_')}` : `https://www.xvideos.com${v.u}`,
                thumbnailUrl: v.i || '',
                source: 'xvideos' as ProviderKey
            }));

            return videos;
        } catch (e) {
            console.error(`[videoService:getActorVideos] XVideos API failed, falling back to HTML:`, e);
            // Fall through to HTML parsing as fallback
        }
    }

    // For Pornhub, Brazz, or as fallback: fetch HTML and parse
    let pageUrl = actor.pageUrl;

    // Construct pagination URL based on provider
    if (page > 1) {
        if (actor.source === 'pornhub') {
            // Pornhub: https://www.pornhub.com/pornstar/name/videos?page=2
            // Ensure we are hitting the /videos endpoint
            const baseUrl = actor.pageUrl.includes('/videos') ? actor.pageUrl : `${actor.pageUrl}/videos`;
            pageUrl = `${baseUrl}?page=${page}`;
        } else if (actor.source === 'brazz') {
            // Brazz: https://brazz.org/videos/models/ID/name/page/2/
            // Ensure trailing slash on base then append page/N/
            const baseUrl = actor.pageUrl.endsWith('/') ? actor.pageUrl : `${actor.pageUrl}/`;
            pageUrl = `${baseUrl}page/${page}/`;
        }
    }

    console.log(`[videoService:getActorVideos] Fetching channel page: ${pageUrl}`);

    try {
        const html = await fetchSource(pageUrl);
        const config = PROVIDER_CONFIG.find(c => c.key === actor.source);
        if (!config) return [];

        const videos = await extractVideoResultsFromHtml(html, config.name, config.baseUrl, actor.source);
        console.log(`[videoService:getActorVideos] Found ${videos.length} videos from channel`);
        return videos;
    } catch (e) {
        console.error(`[videoService:getActorVideos] Failed to fetch channel videos for ${actor.name}`, e);
        return [];
    }
};
