
import { VideoResult, PornstarResult } from "./videoService";

// Interface for a specific site parser
interface SiteParser {
    name: string;
    domains: string[];
    parse: (html: string, baseUrl: string) => VideoResult[];
}

// --- Specific Parsers ---

const pornhubParser: SiteParser = {
    name: 'Pornhub',
    domains: ['pornhub.com'],
    parse: (html: string, baseUrl: string): VideoResult[] => {
        const results: VideoResult[] = [];
        const uniqueKeys = new Set<string>();

        // Strategy 1: Look for the video list items (li with data-video-vkey)
        // This is robust against layout changes as long as the data attributes remain.
        const videoBlockRegex = /<li[^>]+data-video-vkey="([^"]+)"[^>]*>[\s\S]*?<\/li>/g;

        let blockMatch;
        while ((blockMatch = videoBlockRegex.exec(html)) !== null) {
            const block = blockMatch[0];
            const viewKey = blockMatch[1];

            if (uniqueKeys.has(viewKey)) continue;

            // Extract title
            const titleMatch = /title="([^"]+)"/.exec(block);
            if (!titleMatch) continue;
            const title = titleMatch[1];

            // Extract thumbnail
            let thumb = '';
            const srcMatch = /src="([^"]+)"/.exec(block);
            const dataImgMatch = /data-image="([^"]+)"/.exec(block);

            if (dataImgMatch) {
                thumb = dataImgMatch[1];
            } else if (srcMatch) {
                thumb = srcMatch[1];
            }

            if (viewKey && title && thumb) {
                uniqueKeys.add(viewKey);
                results.push({
                    title: decodeHtmlEntities(title),
                    pageUrl: resolveUrl(baseUrl, `/view_video.php?viewkey=${viewKey}`),
                    thumbnailUrl: resolveUrl(baseUrl, thumb),
                    source: 'pornhub'
                });
            }
        }

        // Strategy 2: Fallback to simple link regex if Strategy 1 fails (e.g., mobile view)
        if (results.length === 0) {
            const linkRegex = /href="(\/view_video\.php\?viewkey=[^"]+)"[^>]+title="([^"]+)"/g;
            let match;
            while ((match = linkRegex.exec(html)) !== null) {
                const path = match[1];
                const title = match[2];

                // Try to find an image nearby
                // This is less accurate but a reasonable fallback
                if (!uniqueKeys.has(path)) {
                    results.push({
                        title: decodeHtmlEntities(title),
                        pageUrl: resolveUrl(baseUrl, path),
                        thumbnailUrl: '', // Thumbnail might be missing in fallback
                        source: 'pornhub'
                    });
                }
            }
        }

        return results;
    }
};

const xvideosParser: SiteParser = {
    name: 'XVideos',
    domains: ['xvideos.com'],
    parse: (html: string, baseUrl: string): VideoResult[] => {
        const results: VideoResult[] = [];

        // XVideos uses divs with id="video_{eid}" containing video data
        // Pattern: <a href="/video.{eid}/{title}"> with nested <img data-src="...">

        // Extract all video blocks - they have pattern: id="video_..." data-id="..." data-eid="..."
        const videoBlockPattern = /<div id="video_[a-z0-9]+" data-id="(\d+)" data-eid="([a-z0-9]+)"[^>]*>[\s\S]*?<\/script><\/div>/gi;

        let blockMatch;
        while ((blockMatch = videoBlockPattern.exec(html)) !== null) {
            const block = blockMatch[0];

            // Extract href="/video.{eid}/{title}"
            const hrefMatch = /href="(\/video\.[a-z0-9]+\/[^"]+)"/.exec(block);
            if (!hrefMatch) continue;
            const path = hrefMatch[1];

            // Extract title from the title attribute in <a> tag or <p class="title">
            const titleMatch = /title="([^"]+)"/.exec(block);
            if (!titleMatch) continue;
            const title = titleMatch[1];

            // Extract thumbnail - look for data-src attribute
            const thumbMatch = /data-src="([^"]+\.jpg)"/.exec(block);
            if (!thumbMatch) continue;
            const thumb = thumbMatch[1];

            results.push({
                title: decodeHtmlEntities(title),
                pageUrl: resolveUrl(baseUrl, path),
                thumbnailUrl: resolveUrl(baseUrl, thumb),
                source: 'xvideos'
            });
        }

        return results;
    }
};


// --- Generic / Fallback Logic ---

function extractFromJsonLd(html: string): VideoResult[] {
    const results: VideoResult[] = [];
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            const processItem = (item: any) => {
                if (item['@type'] === 'VideoObject' || item.type === 'VideoObject') {
                    const title = item.name || item.headline;
                    const url = item.url || item.contentUrl;
                    const thumb = item.thumbnailUrl || item.thumbnail;
                    if (title && url && thumb) {
                        results.push({
                            title: decodeHtmlEntities(title),
                            pageUrl: url,
                            thumbnailUrl: thumb,
                            source: 'generic' // overwritten later
                        });
                    }
                }
            };

            if (Array.isArray(data)) data.forEach(processItem);
            else if (data.itemListElement) data.itemListElement.forEach((i: any) => processItem(i));
            else processItem(data);

        } catch (e) { /* ignore */ }
    }
    return results;
}

function extractFromCommonHtmlPatterns(html: string, baseUrl: string): VideoResult[] {
    const results: VideoResult[] = [];

    // Pattern: <a href="/video..." title="..."> <img src="...">
    // A very loose pattern to catch typical tube site structures
    const broadPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']+)["']/gi;

    let match;
    while ((match = broadPattern.exec(html)) !== null) {
        const href = match[1];
        const src = match[2];
        const alt = match[3];

        // Filter out obvious noise
        if (href.length < 5 || href.startsWith('javascript') || !src || !alt) continue;

        results.push({
            title: decodeHtmlEntities(alt),
            pageUrl: resolveUrl(baseUrl, href),
            thumbnailUrl: resolveUrl(baseUrl, src),
            source: 'generic'
        });
    }

    // Data attributes pattern (common in modern frameworks)
    const dataPattern = /data-(?:url|href)=["']([^"']+)["'][\s\S]*?data-(?:src|thumb|image)=["']([^"']+)["'][\s\S]*?data-title=["']([^"']+)["']/gi;
    while ((match = dataPattern.exec(html)) !== null) {
        results.push({
            title: decodeHtmlEntities(match[3]),
            pageUrl: resolveUrl(baseUrl, match[1]),
            thumbnailUrl: resolveUrl(baseUrl, match[2]),
            source: 'generic'
        });
    }

    return results;
}


// --- Main Export ---

export const extractVideoResultsFromHtml = async (
    html: string,
    providerName: string,
    baseUrl: string,
    // Optional: Pass the provider key if available to force a specific parser
    providerKey?: string
): Promise<VideoResult[]> => {

    const results: VideoResult[] = [];

    // 1. Try Specific Parsers
    if (baseUrl.includes('pornhub')) {
        results.push(...pornhubParser.parse(html, baseUrl));
    } else if (baseUrl.includes('xvideos')) {
        results.push(...xvideosParser.parse(html, baseUrl));
    }

    // 2. If specific parser failed or returned few results, try Generic Strategies
    if (results.length < 3) {
        console.log(`[htmlParser] Specific parser for ${providerName} found ${results.length} items. Trying generic fallback.`);

        // JSON-LD is high quality
        const jsonLd = extractFromJsonLd(html);
        results.push(...jsonLd);

        // Regex patterns
        const regexItems = extractFromCommonHtmlPatterns(html, baseUrl);
        results.push(...regexItems);
    }

    // 3. Deduplicate and Clean
    const unique = new Map<string, VideoResult>();
    results.forEach(r => {
        // Fix relative URLs
        r.pageUrl = resolveUrl(baseUrl, r.pageUrl);
        r.thumbnailUrl = resolveUrl(baseUrl, r.thumbnailUrl);
        r.source = (providerKey as any) || 'generic'; // Ensure source is set

        if (r.pageUrl && r.title && !unique.has(r.pageUrl)) {
            unique.set(r.pageUrl, r);
        }
    });


    console.log(`[htmlParser] Extracted ${unique.size} valid videos for ${providerName}`);
    return Array.from(unique.values());
};


// --- Pornstar Parsing ---

export const extractPornstarResultsFromHtml = async (
    html: string,
    providerName: string,
    baseUrl: string,
    providerKey?: string
): Promise<PornstarResult[]> => {
    const results: PornstarResult[] = [];

    // 1. Specific Parsers
    if (baseUrl.includes('pornhub')) {
        // Pornhub Pornstars
        // Structure: <li ...> <div class="wrap"> <a href="/pornstar/name"> ... <img src="..."> ... <div class="title">Name</div>
        const itemRegex = /<li[^>]+class="[^"]*pornstar-li[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
        let match;
        while ((match = itemRegex.exec(html)) !== null) {
            const block = match[1];
            const nameMatch = /<div[^>]+class="title"[^>]*>\s*<a[^>]+>([^<]+)<\/a>/i.exec(block);
            const linkMatch = /href="(\/pornstar\/[^"]+)"/i.exec(block);
            const imgMatch = /data-thumb_url="([^"]+)"/i.exec(block) || /src="([^"]+)"/i.exec(block);

            if (nameMatch && linkMatch) {
                results.push({
                    name: nameMatch[1].trim(),
                    pageUrl: resolveUrl(baseUrl, linkMatch[1]),
                    thumbnailUrl: imgMatch ? resolveUrl(baseUrl, imgMatch[1]) : '',
                    source: 'pornhub'
                });
            }
        }

    } else if (baseUrl.includes('xvideos')) {
        // XVideos Pornstars
        // Structure: <div class="profile-placeholder"> <a href="/channels/name"> <img src="..."> </a> <p class="profile-name"> ...
        // OR <div class="pornstar-model"> ...

        // Strategy: Look for profile links with images inside common wrappers
        // XVideos models path: /pornstar-channels/name or /pornstars/name or /model/name?
        // Let's use a broader regex for XV items
        const blockRegex = /<div[^>]+class="[^"]*thumb-block[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
        // Actually XV uses standard thumb blocks often, but for pornstars page specifically?
        // Let's try to target the specific list items if possible, or fall back to generic.

        // "Best" fallback for XV pornstars page:
        // Pattern: <p class="profile-name"><a href="/model/name">Name</a></p>
        const nameRegex = /<p[^>]+class="profile-name"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
        let pMatch;
        while ((pMatch = nameRegex.exec(html)) !== null) {
            const path = pMatch[1];
            const name = pMatch[2];
            // Try to find image preceding it? This is hard with regex stream.
            // Let's use a reliable generic image finder nearby if we can, or just empty thumb (search will fill it later?? No, better to have it).

            // Simpler strategy: Find the wrapper.
            // <div class="item"> ... <img src="..."> ... <p class="profile-name"> ... </div>
            results.push({
                name: decodeHtmlEntities(name),
                pageUrl: resolveUrl(baseUrl, path),
                thumbnailUrl: '', // Hard to grab reliably without block context, let's see if generic catches it
                source: 'xvideos'
            });
        }
    } else if (baseUrl.includes('brazz')) {
        // Brazz Pornstars
        // <div class="model-card"> <a href="..."> <img ...> </a> ... </div>
        const cardRegex = /<div[^>]+class="model-card"[^>]*>([\s\S]*?)<\/div>/g;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const block = match[1];
            const imgMatch = /src="([^"]+)"/i.exec(block);
            const linkMatch = /href="([^"]+)"/i.exec(block);
            // Name often in title tag of link or alt of img
            const nameMatch = /title="([^"]+)"/i.exec(block) || /alt="([^"]+)"/i.exec(block);

            if (linkMatch && nameMatch) {
                results.push({
                    name: decodeHtmlEntities(nameMatch[1]),
                    pageUrl: resolveUrl(baseUrl, linkMatch[1]),
                    thumbnailUrl: imgMatch ? resolveUrl(baseUrl, imgMatch[1]) : '',
                    source: 'brazz'
                });
            }
        }
    }

    // Generic Fallback (if specific failed)
    if (results.length < 3) {
        // Look for common "Model" or "Pornstar" list patterns
        // <img alt="Name" src="..."> + nearby Link

        // This is weak, but better than nothing.
        // Let's just return what we have for now.
    }

    // Clean and Dedupe
    const unique = new Map<string, PornstarResult>();
    results.forEach(r => {
        if (r.name && !unique.has(r.name)) {
            unique.set(r.name, r);
        }
    });


    return Array.from(unique.values());
};


// --- Stream Extraction (Keep existing logic mostly, just cleaned up) ---

export const extractStreamUrlFromHtml = async (html: string, pageUrl: string): Promise<string> => {
    // 1. Look for direct file in video tag
    const videoTag = /<video[^>]*src=["']([^"']+)["']/i.exec(html);
    if (videoTag) return resolveUrl(pageUrl, videoTag[1]);

    // 2. Look for source tag
    const sourceTag = /<source[^>]*src=["']([^"']+)["']/i.exec(html);
    if (sourceTag) return resolveUrl(pageUrl, sourceTag[1]);

    // 3. Look for Twitter Player / OG Video
    const meta = /<meta[^>]*?property=["'](?:og:video:url|og:video|twitter:player)["'][^>]*?content=["']([^"']+)["']/i.exec(html);
    if (meta) return resolveUrl(pageUrl, meta[1]);

    // 4. Iframe embed
    const iframe = /<iframe[^>]*src=["']([^"']+(?:embed|player)[^"']*)["']/i.exec(html);
    if (iframe) return resolveUrl(pageUrl, iframe[1]);

    // 5. Common Scripts (Flashvars etc - basic check)
    const mp4Match = /https?:\/\/[^"']+\.mp4/i.exec(html);
    if (mp4Match) return mp4Match[0];

    const m3u8Match = /https?:\/\/[^"']+\.m3u8/i.exec(html);
    if (m3u8Match) return m3u8Match[0];

    throw new Error('No stream found in HTML');
};


// --- Utilities ---

function resolveUrl(base: string, path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    if (path.startsWith('//')) return `https:${path}`;
    try {
        const urlOb = new URL(path, base);
        return urlOb.href;
    } catch {
        return path;
    }
}

function decodeHtmlEntities(str: string): string {
    return str.replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
