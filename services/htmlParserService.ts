
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
        // Extract all video blocks using a lookahead pattern to capture full content until next video or end
        // matches <div id="video_ID" ...> CONTENT (?= <div id="video_...|$)
        const videoBlockPattern = /<div[^>]+id="video_([a-zA-Z0-9]+)"[^>]*>([\s\S]*?)(?=<div[^>]+id="video_|$)/gi;

        let blockMatch;
        while ((blockMatch = videoBlockPattern.exec(html)) !== null) {
            const block = blockMatch[0];
            const videoId = blockMatch[1];

            // Extract href using flexible quote matching
            const hrefMatch = /href=["'](\/video\.[a-zA-Z0-9]+\/[^"']+)["']/.exec(block);
            if (!hrefMatch) continue;
            const path = hrefMatch[1];

            // Extract title - flexible quotes
            const titleMatch = /title=["']([^"']+)["']/.exec(block);
            if (!titleMatch) continue;
            const title = titleMatch[1];

            // Extract thumbnail - prioritize data-src for lazy loaded images
            let thumb = '';
            const dataSrcMatch = /data-src=["']([^"']+)["']/.exec(block);
            if (dataSrcMatch) {
                thumb = dataSrcMatch[1];
            } else {
                const srcMatch = /src=["']([^"']+)["']/.exec(block);
                if (srcMatch) thumb = srcMatch[1];
            }
            if (!thumb) continue;

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

const brazzParser: SiteParser = {
    name: 'Brazz',
    domains: ['brazz.org'],
    parse: (html: string, baseUrl: string): VideoResult[] => {
        const results: VideoResult[] = [];

        // Brazz.org uses a[title][href*="/video/"] structure
        // Each video link contains title attribute and nested img/spans for metadata
        // Updated regex to handle both relative and absolute URLs
        const videoRegex = /<a[^>]+href="((?:https?:\/\/[^\/]+)?\/video\/[^"]+)"[^>]+title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

        let match;
        while ((match = videoRegex.exec(html)) !== null) {
            const path = match[1];
            const title = match[2];
            const content = match[3];

            // Extract thumbnail from img tag
            const thumbMatch = /<img[^>]+src="([^"]+)"/.exec(content);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            if (title && path) {
                results.push({
                    title: decodeHtmlEntities(title),
                    pageUrl: resolveUrl(baseUrl, path),
                    thumbnailUrl: thumb ? resolveUrl(baseUrl, thumb) : '',
                    source: 'brazz'
                });
            }
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
    } else if (baseUrl.includes('brazz')) {
        results.push(...brazzParser.parse(html, baseUrl));
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
        // Pornhub Pornstars - Actual structure from browser:
        // <li data-value="Name" class="alpha"><a href="/pornstar/slug"><img ...>Name</a></li>
        const itemRegex = /<li[^>]*>([\s\S]*?)<a[^>]+href="(\/pornstar\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = itemRegex.exec(html)) !== null) {
            const linkPath = match[2];
            const content = match[3];

            // Extract name - it's the text content after the img tag
            // Pattern: <img ...> Name  OR  data-value="Name" in parent li
            const textMatch = />\s*([^<]+)\s*$/.exec(content);
            const dataValueMatch = /data-value="([^"]+)"/.exec(match[1]);

            const name = textMatch ? textMatch[1].trim() : (dataValueMatch ? dataValueMatch[1].trim() : null);

            // Extract image
            const imgMatch = /src="([^"]+)"/i.exec(content) || /data-src="([^"]+)"/i.exec(content);

            if (name && linkPath) {
                results.push({
                    name: decodeHtmlEntities(name),
                    pageUrl: resolveUrl(baseUrl, linkPath),
                    thumbnailUrl: imgMatch ? resolveUrl(baseUrl, imgMatch[1]) : '',
                    source: 'pornhub'
                });
            }
        }

    } else if (baseUrl.includes('xvideos')) {
        // XVideos Pornstars
        // Structure: <div class="thumb-block thumb-block-profile "><div class="thumb-inside">...
        const blockRegex = /<div[^>]+class="[^"]*thumb-block-profile[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
        let match;
        const seen = new Set<string>();

        while ((match = blockRegex.exec(html)) !== null) {
            const content = match[1];

            // Link and Name
            const nameMatch = /<p[^>]*class="profile-name"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(content);
            if (!nameMatch) continue;

            const path = nameMatch[1];
            const name = nameMatch[2].replace(/<strong>[^<]*<\/strong>/g, '').replace(/&nbsp;/g, ' ').trim();

            if (seen.has(path)) continue;

            // Thumbnail - often inside a script document.write
            const imgMatch = /<img[^>]+src="([^"]+)"/.exec(content) ||
                /replaceThumbUrl\('([^']+)'/.exec(content) ||
                /src="([^"]+)"/.exec(content);

            let thumb = '';
            if (imgMatch) {
                if (imgMatch[0].includes('replaceThumbUrl')) {
                    const srcInString = /src="([^"]+)"/.exec(imgMatch[1]);
                    thumb = srcInString ? srcInString[1] : '';
                } else {
                    thumb = imgMatch[1];
                }
            }

            if (name && path) {
                seen.add(path);
                results.push({
                    name: decodeHtmlEntities(name),
                    pageUrl: resolveUrl(baseUrl, path),
                    thumbnailUrl: thumb ? resolveUrl(baseUrl, thumb) : '',
                    source: 'xvideos'
                });
            }
        }

    } else if (baseUrl.includes('brazz')) {
        // Brazz Pornstars
        // Structure: <article class="thumb-block"> <a href="..." title="Name"> <img data-src="..."> ...
        const articleRegex = /<article[^>]+class="[^"]*thumb-block[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
        let match;

        while ((match = articleRegex.exec(html)) !== null) {
            const content = match[1];

            // Link and Title
            const linkMatch = /<a[^>]+href="([^"]+)"[^>]+title="([^"]+)"/.exec(content);
            if (!linkMatch) continue;

            const path = linkMatch[1];
            const name = linkMatch[2];

            // Thumbnail - Brazz uses data-src for Lazy Load
            const imgMatch = /<img[^>]+data-src="([^"]+)"/.exec(content) || /<img[^>]+src="([^"]+)"/.exec(content);
            const thumb = imgMatch ? imgMatch[1] : '';

            if (name && path) {
                results.push({
                    name: decodeHtmlEntities(name),
                    pageUrl: resolveUrl(baseUrl, path),
                    thumbnailUrl: thumb ? resolveUrl(baseUrl, thumb) : '',
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

    console.log(`[htmlParser] Extracted ${unique.size} valid pornstars for ${providerName}`);
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
