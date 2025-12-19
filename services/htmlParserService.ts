
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

        // Strategy 2: Fallback to simple link regex if Strategy 1 fails (e.g., pornstar pages, mobile view)
        if (results.length === 0) {
            // For pornstar pages, we need to be more selective to avoid picking up sidebar/promotional videos
            // Look for video links with titles and nearby thumbnails
            const linkRegex = /href="(\/view_video\.php\?viewkey=[^"]+)"[^>]*>[\s\S]{0,500}?<img[^>]+(?:src|data-src|data-thumb_url)="([^"]+)"[\s\S]{0,500}?title="([^"]+)"/gi;

            let match;
            const seenKeys = new Set<string>();

            while ((match = linkRegex.exec(html)) !== null) {
                const path = match[1];
                const thumb = match[2];
                const title = match[3];

                // Extract viewkey for deduplication
                const viewkeyMatch = /viewkey=([^&"]+)/.exec(path);
                if (!viewkeyMatch) continue;
                const viewkey = viewkeyMatch[1];

                if (seenKeys.has(viewkey)) continue;
                seenKeys.add(viewkey);

                // Filter out obvious promotional content
                // Skip videos with generic/spam titles or missing essential data
                if (!title || title.length < 5 || !thumb) continue;

                results.push({
                    title: decodeHtmlEntities(title),
                    pageUrl: resolveUrl(baseUrl, path),
                    thumbnailUrl: resolveUrl(baseUrl, thumb),
                    source: 'pornhub'
                });

                // Limit results to avoid picking up too many sidebar videos
                if (results.length >= 50) break;
            }

            // If still no results, try even simpler pattern (last resort)
            if (results.length === 0) {
                const simpleLinkRegex = /href="(\/view_video\.php\?viewkey=[^"]+)"[^>]+title="([^"]+)"/g;
                while ((match = simpleLinkRegex.exec(html)) !== null) {
                    const path = match[1];
                    const title = match[2];

                    if (!uniqueKeys.has(path) && title && title.length > 5) {
                        uniqueKeys.add(path);
                        results.push({
                            title: decodeHtmlEntities(title),
                            pageUrl: resolveUrl(baseUrl, path),
                            thumbnailUrl: '', // Thumbnail might be missing in fallback
                            source: 'pornhub'
                        });
                    }

                    if (results.length >= 30) break;
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

const threeDPornDudeParser: SiteParser = {
    name: '3dPornDude',
    domains: ['3dporndude.com'],
    parse: (html: string, baseUrl: string): VideoResult[] => {
        const results: VideoResult[] = [];

        // 3dporndude uses div.video-item or .col-lg-3 for containers
        const videoBlockRegex = /<(?:div|article)[^>]+class="[^"]*(?:video-item|col-lg-3)[^"]*"[^>]*>([\s\S]*?)(?=<(?:div|article)[^>]+class="[^"]*(?:video-item|col-lg-3)|$)/gi;

        let match;
        while ((match = videoBlockRegex.exec(html)) !== null) {
            const content = match[1];

            // Link and Title
            const linkMatch = /<a[^>]+href="([^"]*\/video\/[^"]+)"[^>]*title="([^"]+)"/i.exec(content) ||
                /<a[^>]+href="([^"]*\/video\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(content);

            if (!linkMatch) continue;

            const path = linkMatch[1];
            const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();

            // Thumbnail - 3dporndude uses data-original for lazy loading
            const thumbMatch = /<img[^>]+(?:data-original|data-src|src|data-webp)="([^"]+)"/i.exec(content);
            const thumb = thumbMatch ? thumbMatch[1] : '';

            if (path && title) {
                results.push({
                    title: decodeHtmlEntities(title),
                    pageUrl: resolveUrl(baseUrl, path),
                    thumbnailUrl: thumb ? resolveUrl(baseUrl, thumb) : '',
                    source: '3dporndude' as any
                });
            }
        }

        // Fallback for list items if blocks didn't match
        if (results.length === 0) {
            const simpleRegex = /<a[^>]+href="([^"]*\/video\/[^"]+)"[^>]+title="([^"]+)"/gi;
            while ((match = simpleRegex.exec(html)) !== null) {
                results.push({
                    title: decodeHtmlEntities(match[2]),
                    pageUrl: resolveUrl(baseUrl, match[1]),
                    thumbnailUrl: '',
                    source: '3dporndude' as any
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
    } else if (baseUrl.includes('3dporndude')) {
        results.push(...threeDPornDudeParser.parse(html, baseUrl));
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
        // Pornhub Pornstars & Models
        // Container pattern: <li class="performerCard" ...>, <div class="pornstarMiniature" ...>, or <li ...><div class="wrap">
        // We look for name/link first then find image.
        const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>|<div[^>]+class="[^"]*(?:performerCard|pornstarMiniature|wrap)[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
        let match;
        while ((match = itemRegex.exec(html)) !== null) {
            const content = match[1] || match[2];

            // Link and Name
            // Paths: /pornstar/name or /model/name
            const linkMatch = /<a[^>]+href="(\/(?:pornstar|model)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(content);
            if (!linkMatch) continue;

            const path = linkMatch[1];
            const nameContent = linkMatch[2];

            // Extract Name: Look for the best match in order of specificity
            // 1. Look for <a class="title">NAME</a> (most reliable for search results)
            const titleLinkMatch = /<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/.exec(content);
            // 2. Look for class="name" or similar
            const specificNameMatch = /class="[^"]*\bname\b[^"]*"[^>]*>([^<]+)</.exec(content);
            // 3. Image alt attribute
            const altMatch = /<img[^>]+alt="([^"]*)"/i.exec(content);

            let name = '';
            if (titleLinkMatch) {
                // Most reliable for search results - the <a class="title"> link
                name = titleLinkMatch[1].trim();
            } else if (specificNameMatch) {
                name = specificNameMatch[1].trim();
            } else if (altMatch && altMatch[1] && !/pornstar|model/i.test(altMatch[1])) {
                name = altMatch[1].trim();
            } else {
                name = nameContent.replace(/<[^>]+>/g, '').trim();
            }

            // Clean name from "Rank: X" or extra stuff if still messy
            name = name.replace(/Rank:\s*\d+/i, '').trim();

            // If name is still just a number (rank), try to find the actual name elsewhere
            if (/^\d+$/.test(name) || !name) {
                const betterNameMatch = /<a[^>]+href="[^"]+"[^>]*>([^<0-9][^<]+)<\/a>/.exec(content);
                if (betterNameMatch) name = betterNameMatch[1].trim();
            }

            // Extract Thumbnail: support lazy loading attributes
            const imgMatch = /<img[^>]+(?:src|data-image|data-medium-thumb|data-thumb_url)="([^"]+)"/i.exec(content);
            const thumb = imgMatch ? imgMatch[1] : '';

            if (name && path) {
                results.push({
                    name: decodeHtmlEntities(name),
                    pageUrl: resolveUrl(baseUrl, path),
                    thumbnailUrl: thumb ? resolveUrl(baseUrl, thumb) : '',
                    source: 'pornhub'
                });
            }
        }

        // Generic fallback for PH if blocks didn't match (simpler links)
        if (results.length === 0) {
            const fallbackRegex = /<a[^>]+href="(\/(?:pornstar|model)\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
            let m;
            while ((m = fallbackRegex.exec(html)) !== null) {
                results.push({
                    name: decodeHtmlEntities(m[2].trim()),
                    pageUrl: resolveUrl(baseUrl, m[1]),
                    thumbnailUrl: '',
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
    } else if (baseUrl.includes('3dporndude')) {
        // 3dporndude Artists (sites)
        // Structure: <div class="site-item"> <a href="..."> <img src="..."> <span>Name</span>
        const siteBlockRegex = /<(?:div|article)[^>]+class="[^"]*(?:site-item|col-lg-3)[^"]*"[^>]*>([\s\S]*?)(?=<(?:div|article)[^>]+class="[^"]*(?:site-item|col-lg-3)|$)/gi;
        let match;
        while ((match = siteBlockRegex.exec(html)) !== null) {
            const content = match[1];

            const nameMatch = /<span>([\s\S]*?)<\/span>/.exec(content) ||
                /<a[^>]*>([\s\S]*?)<\/a>/.exec(content);
            const linkMatch = /<a[^>]+href="([^"]*\/sites\/[^"]+)"/.exec(content);
            const thumbMatch = /<img[^>]+(?:data-original|data-src|src)="([^"]+)"/.exec(content);

            if (nameMatch && linkMatch) {
                results.push({
                    name: decodeHtmlEntities(nameMatch[1].replace(/<[^>]+>/g, '').trim()),
                    pageUrl: resolveUrl(baseUrl, linkMatch[1]),
                    thumbnailUrl: thumbMatch ? resolveUrl(baseUrl, thumbMatch[1]) : '',
                    source: '3dporndude' as any
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
