const BASE_URL = 'https://animejara.com';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const CATALOG_URL = `${BASE_URL}/catalogo/?q=`;
const SEARCH_URL = `${BASE_URL}/?s=`;

/* MAIN FUNCTIONS */

async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return [];

        const catalogResults = await searchFromCatalog(query);
        if (catalogResults.length > 0) return JSON.stringify(catalogResults);

        const ajaxResults = await searchFromAjax(query);
        if (ajaxResults.length > 0) return JSON.stringify(ajaxResults);

        const wpResults = await searchFromWordPress(query);
        if (wpResults.length > 0) return JSON.stringify(wpResults);

        return JSON.stringify([]);
    } catch (error) {
        console.error('Search error:', error);
        return JSON.stringify([]);
    }
}

/**
 * Fetches an anime page and extracts its description, airdate, and alternative titles.
 * Attempts multiple fallback selectors and metadata sources to locate each field, cleans the text, and returns the results.
 * @param {string} url - The anime or movie page URL to fetch and parse.
 * @returns {string} A JSON-stringified array containing a single object with `description`, `airdate`, and `aliases` fields.
async function extractDetails(url) {
    try {
        const response = await soraFetch(url);

        const html = await response.text();

        const description = extractFirst(
            html,
            /<div class="anime-sinopsis-contenedor"[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
        ) || extractFirst(
            html,
            /<div[^>]*class="[^"]*sinopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/i
        ) || extractFirst(
            html,
            /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
        );
        const airdate = extractFirst(
            html,
            /<div[^>]*class="[^"]*anime-info-pre-contenedor[^"]*"[\s\S]*?fa-calendar-alt[\s\S]*?<span>([^<]+)<\/span>/i
        ) || extractFirst(
            html,
            /(?:Año|Year|Aired|Estreno)[:\s]*(\d{4})/i
        ) || extractFirst(
            html,
            /<span[^>]*class="[^"]*aired[^"]*"[^>]*>([^<]+)<\/span>/i
        );
        const aliases = extractAliases(html, description);

        return JSON.stringify([{
            description: cleanText(description || 'No description available'),
            airdate: cleanText(airdate || 'Unknown'),
            aliases: cleanText(aliases || 'No alternative titles')
        }]);
    } catch (error) {
        console.error('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            airdate: 'Unknown',
            aliases: 'Unknown'
        }]);
    }
}

/**
 * Extracts episode links and episode numbers from an anime episode-listing page.
 *
 * Parses the provided page to build a deduplicated list of episodes and their canonical URLs,
 * using embedded season/episode data when available and falling back to legacy URL/anchor patterns.
 * If no episodes are found or an error occurs, returns an empty list representation.
 *
 * @param {string} url - The URL of the episode-listing page to parse.
 * @returns {string} A JSON string encoding an array of episode objects, each with:
 *  - `href`: the canonical episode URL,
 *  - `number`: the episode number as an integer. Returns `"[]"` when no episodes are found or on error.
 */
async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        const episodes = [];

        // Extract ANIME_SLUG
        const slugMatch = html.match(/ANIME_SLUG\s*=\s*['"]([^'"]+)['"]/);
        const slug = slugMatch ? slugMatch[1] : '';

        // Extract TEMPORADAS_DATA - More robust regex
        const dataMatch = html.match(/TEMPORADAS_DATA\s*=\s*(\[[\s\S]*?\])(?:\s*;|\s*$|\s*<\/script>)/);
        if (dataMatch && dataMatch[1]) {
            try {
                const seen = new Set();
                const seasons = JSON.parse(dataMatch[1]);
                seasons.forEach((season) => {
                    const numTemp = season.numero_temporada;
                    const items = season.episodios || [];
                    items.forEach((ep) => {
                        const numEp = ep.numero_episodio;
                        // URL pattern: https://animejara.com/episode/${ANIME_SLUG}-${numTemp}x${numEp}/
                        const href = `https://animejara.com/episode/${slug}-${numTemp}x${numEp}/`;
                        if (seen.has(href)) return;
                        seen.add(href);
                        
                        // Fix for "Episode 0" - Use integer parsing and fallback
                        let episodeNumber = parseInt(numEp, 10);
                        if (isNaN(episodeNumber)) episodeNumber = 0;

                        episodes.push({
                            href,
                            number: episodeNumber
                        });
                    });
                });
            } catch (jsonError) {
                console.error('Error parsing TEMPORADAS_DATA:', jsonError);
            }
        }

        // Fallback or additional check: if episodes is still empty, let's try the old regex just in case
        if (episodes.length === 0) {
            const seen = new Set();
            const regexArr = [
                /<a[^>]+href="(https:\/\/animejara\.com\/episode\/[^"]+)"[^>]*class="[^"]*episodio-link[^"]*"[\s\S]*?<div[^>]*>\s*(\d+)x(\d+)\s*<\/div>/gi,
                /href="(https:\/\/animejara\.com\/episode\/([^"-]+)-(\d+)x(\d+)\/)"/gi
            ];

            regexArr.forEach((regex) => {
                let match;
                while ((match = regex.exec(html)) !== null) {
                    const href = normalizeUrl(match[1]);
                    if (seen.has(href)) continue;
                    seen.add(href);

                    let season, episode;
                    if (match.length === 4) {
                        season = parseInt(match[2], 10);
                        episode = parseInt(match[3], 10);
                    } else if (match.length === 5) {
                        season = parseInt(match[3], 10);
                        episode = parseInt(match[4], 10);
                    }

                    if (!isNaN(season) && !isNaN(episode)) {
                        episodes.push({
                            href,
                            number: episode
                        });
                    }
                }
            });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error('Episodes error:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        
        // STEP 1: Check for direct m3u8 in the episode page itself
        const directM3u8 = extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (directM3u8) {
            return JSON.stringify({
                streams: [{
                    title: 'Direct HLS',
                    streamUrl: decodeHtml(directM3u8).trim(),
                    headers: {
                        "Referer": BASE_URL + '/',
                        "Origin": BASE_URL,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                }],
                subtitles: null
            });
        }
        
        // STEP 2: Extract language URLs from the enlaces array
        const enlacesMatch = html.match(/(?:const|var|let)?\s*enlaces\s*=\s*\[([\s\S]*?)\]/);
        const langNames = [];
        const langNameRegex = /<div\s+class="lang-name">([^<]+)<\/div>/gi;
        let langMatch;
        while ((langMatch = langNameRegex.exec(html)) !== null) {
            langNames.push(langMatch[1].trim());
        }
        
        // Parse the embed URLs from the enlaces array (handles escaped slashes \/)
        const embedUrls = [];
        if (enlacesMatch) {
            const urlRegex = /["'](https?:[^"']+)["']/g;
            let urlMatch;
            while ((urlMatch = urlRegex.exec(enlacesMatch[1])) !== null) {
                const cleanUrl = urlMatch[1].replace(/\\\//g, '/');
                embedUrls.push(decodeHtml(cleanUrl).trim());
            }
        }
        
        // STEP 3: Process embed URLs with language labels
        if (embedUrls.length > 0) {
            const langMap = { 'LATINO': 'LAT', 'JAPONES': 'JAP', 'CASTELLANO': 'CAS', 'ENGLISH': 'ENG', 'INGLES': 'ENG' };

            const embedPromises = embedUrls.map(async (embedUrl, i) => {
                if (!embedUrl || embedUrl.trim() === '') return [];
                
                const rawLang = langNames[i] || ('Lang ' + (i + 1));
                const langLabel = langMap[rawLang.toUpperCase()] || rawLang;
                
                const servers = await extractDirectServerFromEmbed(embedUrl);
                if (!servers || servers.length === 0) return [];
                
                const serverPromises = servers.map(async (server) => {
                    if (!server.url || server.url.trim() === '') return null;
                    
                    const result = await resolveServerToDirectUrl(server.url, server.name);
                    if (result && result.streamUrl) {
                        return {
                            title: `${langLabel} - ${result.title}`,
                            streamUrl: result.streamUrl,
                            headers: result.headers
                        };
                    }
                    return null;
                });
                
                const resolvedServers = await Promise.all(serverPromises);
                return resolvedServers.filter(s => s && s.streamUrl);
            });
            
            const results = await Promise.all(embedPromises);
            const finalList = results.reduce((acc, curr) => acc.concat(curr), []);

            if (finalList.length > 0) {
                return JSON.stringify({ streams: finalList, subtitles: null });
            }
        }
        
        // STEP 4: Fallback - single iframe without language buttons
        const iframe = extractFirst(html, /<iframe[^>]+id="iframe-video"[^>]+src="([^"]+)"/i)
            || extractFirst(html, /<div[^>]+id="reproductor-wrapper"[\s\S]*?<iframe[^>]+src="([^"]+)"/i)
            || extractFirst(html, /<iframe[^>]+src="([^"]+)"[^>]*>/i);

        if (iframe) {
            const iframeUrl = decodeHtml(iframe).trim();
            const servers = await extractDirectServerFromEmbed(iframeUrl);
            
            if (servers && Array.isArray(servers) && servers.length > 0) {
                const results = await Promise.all(servers.map(s => resolveServerToDirectUrl(s.url, s.name)));
                const streams = results.filter(r => r && r.streamUrl);

                if (streams.length > 0) {
                    return JSON.stringify({
                        streams: streams,
                        subtitles: null
                    });
                }
            }
        }

        // STEP 5: Last resort - return empty streams array with valid JSON
        return JSON.stringify({ streams: [], subtitles: null });
    } catch (error) {
        console.error('Stream error:', error);
        return JSON.stringify({ streams: [], subtitles: null });
    }
}

// Format server name for display in Sora's server picker
function prettifyServerName(name, url) {
    if (!name && !url) return 'Unknown';
    const raw = (name || '').trim().toLowerCase();
    
    // Map known server names to readable labels
    const nameMap = {
        'nyuu': '🟢 Nyuu (Direct)',
        'streamhg': '🔵 StreamHG',
        'vidhide': '🟡 VidHide',
        'netu': '🟠 Netu',
        'filemoon': '🟣 Filemoon',
        'filelions': '🟣 FileLions',
        'streamtape': '🔴 StreamTape',
        'uqload': '🔵 UqLoad',
    };
    
    if (nameMap[raw]) return nameMap[raw];
    
    // Try to identify from URL if name is generic
    if (url) {
        const host = url.match(/\/\/([^\/]+)/)?.[1] || '';
        if (/nyuu/i.test(host)) return '🟢 Nyuu (Direct)';
        if (/hgcloud/i.test(host)) return '🔵 HGCloud';
        if (/filelions/i.test(host)) return '🟣 FileLions';
        if (/filemoon/i.test(host)) return '🟣 Filemoon';
        if (/netu/i.test(host)) return '🟠 Netu';
        if (/vidhide/i.test(host)) return '🟡 VidHide';
        if (/uqload/i.test(host)) return '🔵 UqLoad';
        // Use the hostname as a fallback
        const shortHost = host.replace(/\..+$/, '');
        return shortHost.charAt(0).toUpperCase() + shortHost.slice(1);
    }
    
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Resolve an embed/server URL to a {title, streamUrl, headers} object (HLS only)
async function resolveServerToDirectUrl(serverUrl, serverName) {
    try {
        if (!serverUrl || serverUrl.trim() === '') return null;
        
        const displayName = prettifyServerName(serverName, serverUrl);
        
        // Skip known problematic servers
        if (/streamtape\.com/i.test(serverUrl)) return null;  // anti-hotlink
        
        // Get the origin/referer from the embed URL
        const urlObj = serverUrl.match(/^(https?:\/\/[^\/]+)/);
        const referer = urlObj ? urlObj[1] + '/' : '';
        
        const resp = await soraFetch(serverUrl);
        if (!resp) return null;
        const html = await resp.text();
        
        // 1. Try multiple patterns to find m3u8 in the HTML
        let m3u8 = extractFirst(html, /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i)
            || extractFirst(html, /src\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i)
            || extractFirst(html, /"hls2"\s*:\s*"([^"]+)"/i)
            || extractFirst(html, /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/i)
            || extractFirst(html, /sources\s*:\s*\[\s*{[^}]*file\s*:\s*["']([^"']+\.m3u8[^"']*)/i)
            || extractFirst(html, /var\s+source\s*=\s*["']([^"']+\.m3u8[^"']*)/i);
        
        // 2. Look for m3u8 in JSON data structures
        if (!m3u8) {
            const jsonMatch = html.match(/"?(?:file|src|source)"?\s*[:=]\s*"(https?:[^"]*\.m3u8[^"]*)"/i);
            if (jsonMatch) m3u8 = jsonMatch[1];
        }
        
        // 3. If not found, try unpacking P.A.C.K.E.R. obfuscated JS
        if (!m3u8) {
            const packedMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?\)[\s\S]*?)<\/script>/);
            if (packedMatch) {
                try {
                    const unpacked = unpack(packedMatch[1]);
                    m3u8 = extractFirst(unpacked, /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i)
                        || extractFirst(unpacked, /"hls2"\s*:\s*"([^"]+)"/i)
                        || extractFirst(unpacked, /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/i)
                        || extractFirst(unpacked, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                } catch (e) {
                    // Unpacker failed, continue
                }
            }
        }
        
        // 4. Broad regex match for m3u8 URLs anywhere in the document
        if (!m3u8) {
            m3u8 = extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        }
        
        // 5. Check for JWPlayer or other player configurations
        if (!m3u8) {
            const jwMatch = html.match(/jwplayer\("[^"]+"\)\.setup\(\{[^}]*file\s*:\s*["']([^"']+)["']/i);
            if (jwMatch && jwMatch[1] && jwMatch[1].includes('.m3u8')) {
                m3u8 = jwMatch[1];
            }
        }
        
        if (m3u8) {
            const cleanM3u8 = decodeHtml(m3u8).trim();
            // Verify it's actually an m3u8 URL
            if (!cleanM3u8.includes('.m3u8')) return null;
            
            return {
                title: displayName,
                streamUrl: cleanM3u8,
                headers: {
                    "Referer": referer,
                    "Origin": referer.replace(/\/$/, ''),
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            };
        }
        
        return null;
    } catch (e) {
        console.error('resolveServerToDirectUrl error for ' + serverName + ':', e);
        return null;
    }
}



/* HELPERS */

async function searchFromAjax(keyword) {
    try {
        const catalogHtml = await fetchCatalogHtmlForNonce(keyword);
        const nonce = extractWpNonce(catalogHtml);
        let body = `action=live_search&s=${encodeURIComponent(keyword)}`;
        if (nonce) body += `&nonce=${encodeURIComponent(nonce)}`;

        const response = await soraFetch(AJAX_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body
        });

        if (!response) return [];
        const json = await response.json();
        const animes = (((json || {}).data || {}).animes) || [];

        return animes.map((item) => ({
            title: cleanText(item.titulo || ''),
            image: item.poster || '',
            href: buildAnimeHref(item.slug, item.tipo)
        })).filter((item) => item.title && item.href);
    } catch (error) {
        console.error('AJAX search error:', error);
        return [];
    }
}

async function searchFromCatalog(keyword) {
    try {
        const urls = [
            `${CATALOG_URL}${encodeURIComponent(keyword)}`,
            `${BASE_URL}/catalogo?q=${encodeURIComponent(keyword)}`
        ];

        for (let u = 0; u < urls.length; u++) {
            const response = await soraFetch(urls[u]);
            if (!response) continue;
            const html = await response.text();
            const parsed = parseAnimeCardsFromHtml(html);
            if (parsed.length > 0) return parsed;
        }

        return [];
    } catch (error) {
        console.error('Catalog search error:', error);
        return [];
    }
}

async function searchFromWordPress(keyword) {
    try {
        const response = await soraFetch(`${SEARCH_URL}${encodeURIComponent(keyword)}`);
        if (!response) return [];
        const html = await response.text();
        return parseAnimeCardsFromHtml(html);
    } catch (error) {
        console.error('WordPress search error:', error);
        return [];
    }
}

async function fetchCatalogHtmlForNonce(keyword) {
    try {
        const response = await soraFetch(`${CATALOG_URL}${encodeURIComponent(keyword)}`);
        if (!response) return '';
        return await response.text();
    } catch (e) {
        return '';
    }
}

function extractWpNonce(html) {
    const raw = html || '';
    const scoped = raw.match(/animejara_ajax\s*=\s*\{[\s\S]*?"nonce"\s*:\s*"([^"]+)"/i);
    if (scoped && scoped[1]) return scoped[1];
    const fallback = raw.match(/"nonce"\s*:\s*"([a-f0-9]+)"/i);
    return fallback ? fallback[1] : '';
}

/**
 * Parse anime/movie card elements from an HTML document and extract title, poster image, and normalized href.
 * @param {string} html - HTML string containing one or more elements with class `anime-card`.
 * @returns {{title: string, image: string, href: string}[]} An array of objects with `title`, `image`, and `href`; entries missing title or image are omitted and duplicate hrefs are de-duplicated.
 */
function parseAnimeCardsFromHtml(html) {
    const results = [];
    const seen = new Set();
    const cardRegex = /<a[^>]*\banime-card\b[^>]*>[\s\S]*?<\/a>/gi;
    let cardMatch;
    while ((cardMatch = cardRegex.exec(html)) !== null) {
        const cardHtml = cardMatch[0];
        const href = normalizeUrl(extractFirst(cardHtml, /href=(?:"|')(.*?)(?:"|')/i));
        if (!href || !/\/(anime|movie)\//i.test(href) || seen.has(href)) continue;

        let title = cleanText(extractFirst(cardHtml, /<h3[^>]*\bcard-title\b[^>]*>([\s\S]*?)<\/h3>/i));
        let image = decodeHtml(extractFirst(cardHtml, /<img[^>]*\bcard-poster\b[^>]*src=(?:"|')(.*?)(?:"|')/i)).trim();
        if (!image) {
            image = decodeHtml(extractFirst(cardHtml, /<img[^>]*src=(?:"|')(.*?)(?:"|')[^>]*\bcard-poster\b/i)).trim();
        }

        if (!title || !image) {
            let dataAnimeEncoded = extractFirst(cardHtml, /data-anime="([^"]*)"/i);
            if (!dataAnimeEncoded) dataAnimeEncoded = extractFirst(cardHtml, /data-anime='([^']*)'/i);
            const dataAnime = decodeHtml(dataAnimeEncoded);
            if (!title) title = cleanText(extractFirst(dataAnime, /"titulo"\s*:\s*"([^"]+)"/i));
            if (!image) image = decodeHtml(extractFirst(dataAnime, /"poster"\s*:\s*"([^"]+)"/i)).replace(/\\\//g, '/').trim();
        }

        if (!title || !image) continue;
        seen.add(href);
        results.push({ title, image, href });
    }

    return results;
}

/**
 * Extracts direct server endpoints from an embed URL, including nested iframe traversal up to a recursion depth of 3.
 * @param {string} embedUrl - The embed page URL or direct media URL to inspect.
 * @param {number} [depth=0] - Current recursion depth used for nested iframe extraction; callers should not set this normally.
 * @returns {Array<{url: string, name: string}>|null} An array of server objects each with `url` and `name` when one or more servers are found, or `null` if no servers were extracted or on error.
 */
async function extractDirectServerFromEmbed(embedUrl, depth = 0) {
    try {
        if (!embedUrl || embedUrl.trim() === '') return null;
        if (depth > 3) return null;
        
        // Check if embed contains m3u8 directly
        const isDirectM3u8 = /\.m3u8/i.test(embedUrl);
        
        // If it's a direct m3u8, return it as-is
        if (isDirectM3u8) {
            return [{ url: embedUrl, name: 'Direct HLS' }];
        }
        
        // If it's not a known multiplayer embed, try to extract anyway
        // Many providers use similar structures
        const response = await soraFetch(embedUrl);
        if (!response) return null;
        const html = await response.text();

        const servers = [];
        
        // Pattern 1: AnimeJara multiplayer.streamhj.top style
        const regex = /<li[^>]*onclick="[^"]*playVideo\((?:&quot;|'|")\s*([^"&']+(?:&amp;[^"&']*)*)\s*(?:&quot;|'|")\)[^"]*"[\s\S]*?<span[^>]*class="nombre-server"[^>]*>([^<]+)<\/span>/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            servers.push({
                url: normalizeExternalUrl(match[1]),
                name: cleanText(match[2])
            });
        }

        // Pattern 2: Generic playVideo fallback
        if (servers.length === 0) {
            const fallbackRegex = /playVideo\((?:&quot;|'|")\s*(https?:\/\/[^"&']+(?:&amp;[^"&']*)*)\s*(?:&quot;|'|")\)/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                servers.push({ url: normalizeExternalUrl(match[1]), name: 'Server' });
            }
        }
        
        // Pattern 3: Direct source/src tags
        if (servers.length === 0) {
            const sourceRegex = /<source[^>]+src="([^"]+)"/gi;
            while ((match = sourceRegex.exec(html)) !== null) {
                const url = normalizeExternalUrl(match[1]);
                if (url && !servers.some(s => s.url === url)) {
                    servers.push({ url, name: 'Direct Source' });
                }
            }
        }
        
        // Pattern 4: iframe within iframe (nested embeds)
        if (servers.length === 0) {
            const iframeRegex = /<iframe[^>]+src="([^"]+)"/i;
            const iframeMatch = html.match(iframeRegex);
            if (iframeMatch && iframeMatch[1]) {
                const nestedUrl = normalizeExternalUrl(iframeMatch[1]);
                if (nestedUrl && nestedUrl !== embedUrl) {
                    // Recursively try to extract from nested iframe (max depth: 3)
                    const nested = await extractDirectServerFromEmbed(nestedUrl, depth + 1);
                    if (nested && nested.length > 0) {
                        return nested;
                    }
                }
            }
        }
        
        // Pattern 5: video tag with src
        if (servers.length === 0) {
            const videoRegex = /<video[^>]+src="([^"]+)"/i;
            const videoMatch = html.match(videoRegex);
            if (videoMatch && videoMatch[1]) {
                servers.push({ 
                    url: normalizeExternalUrl(videoMatch[1]), 
                    name: 'HTML5 Video' 
                });
            }
        }

        return (servers.length > 0) ? servers : null;
    } catch (error) {
        console.error('Embed server extraction error:', error);
        return null;
    }
}

function buildAnimeHref(slug, tipo) {
    if (!slug) return '';
    const section = (tipo || '').toLowerCase().includes('pelicula') ? 'movie' : 'anime';
    return `${BASE_URL}/${section}/${slug}/`;
}

function extractAliases(html, description) {
    const fromDescription = (description || '').split('<br>').map((line) => cleanText(line)).filter(Boolean);
    if (fromDescription.length >= 2) {
        return fromDescription.slice(-2).join(' | ');
    }

    const title = extractFirst(html, /<h1[^>]*class="[^"]*anime-title-desktop[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
        || extractFirst(html, /<h1[^>]*class="[^"]*anime-title-mobile[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    return title || '';
}

function normalizeUrl(url) {
    const raw = decodeHtml(url || '').trim();
    if (!raw) return '';
    // Avoid double slashes when caller concatenates paths
    try {
        const u = new URL(raw, BASE_URL);
        // replace multiple slashes (except in protocol part) with a single slash
        return u.href.replace(/([^:])\/\/+/g, '$1/');
    } catch (e) {
        // fallback: ensure single trailing slash
        const normalized = raw.replace(/\/+/g, '/');
        return normalized.endsWith('/') ? normalized : `${normalized}/`;
    }
}

function extractFirst(text, regex) {
    const match = text.match(regex);
    return match ? match[1] : '';
}

function decodeHtml(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&#038;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function normalizeExternalUrl(url) {
    let normalized = decodeHtml(url || '').trim();
    if (!normalized) return '';
    if (/^\/\//.test(normalized)) normalized = `https:${normalized}`;
    // If it's a relative path, resolve against BASE_URL
    if (!/^https?:\/\//i.test(normalized)) {
        try {
            const u = new URL(normalized, BASE_URL);
            return u.href;
        } catch (e) {
            return `https://${normalized.replace(/^\/+/, '')}`;
        }
    }
    return normalized;
}

function cleanText(text) {
    return decodeHtml(String(text || ''))
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

async function soraFetch(url, options) {
    const opts = options || {};
    const mergedHeaders = mergeHeaders(url, opts);
    const method = opts.method || 'GET';
    const body = typeof opts.body === 'undefined' ? null : opts.body;

    try {
        const resp = await fetchv2(url, mergedHeaders, method, body);
        // ensure response has .text()/.json()
        if (resp && (typeof resp.text === 'function' || typeof resp.json === 'function')) return resp;
        return resp;
    } catch (e) {
        const fallback = await fetch(url, {
            method: method,
            headers: mergedHeaders,
            body: body
        });
        return fallback;
    }
}

function mergeHeaders(url, opts) {
    const base = opts.headers || {};
    if (String(url || '').indexOf('animejara.com') === -1) return base;

    const method = opts.method || 'GET';
    const isAjaxPost = method === 'POST' && String(url || '').indexOf('/wp-admin/admin-ajax.php') !== -1;
    let referer = 'https://animejara.com/';
    if (isAjaxPost) referer = 'https://animejara.com/catalogo/';

    const defaults = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: isAjaxPost ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en-US,en;q=0.8',
        Referer: referer,
        Origin: 'https://animejara.com'
    };

    const out = {};
    let k;
    for (k in defaults) {
        if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    }
    for (k in base) {
        if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    }
    return out;
}

/***********************************************************
 * UNPACKER MODULE
 * Credit to GitHub user "mnsrulz" for Unpacker Node library
 * https://github.com/mnsrulz/unpacker
 ***********************************************************/
class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        } else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            } catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function detect(source) {
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

/**
 * Unpacks JavaScript code compressed with the P.A.C.K.E.R. packer format.
 *
 * Parses the packed payload, symbol table, and radix from the input and replaces
 * packed identifiers with their original values.
 *
 * @param {string} source - Packed JavaScript source produced by the P.A.C.K.E.R. packer.
 * @returns {string} The unpacked JavaScript source with identifiers restored.
 * @throws {Error} If the symbol table length does not match the count ("Malformed p.a.c.k.e.r. symtab.").
 * @throws {Error} If the radix encoding is unsupported ("Unknown p.a.c.k.e.r. encoding.").
 * @throws {Error} If the packed data cannot be parsed ("Corrupted p.a.c.k.e.r. data.").
 * @throws {Error} If the source structure is unexpected and arguments cannot be extracted ("Could not make sense of p.a.c.k.e.r data (unexpected code structure)").
 */
function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    } catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        } else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                } catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    function _replacestrings(source) {
        return source;
    }
}

