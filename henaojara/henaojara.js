const BASE_URL = 'https://animejara.com';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const CATALOG_URL = `${BASE_URL}/catalogo/?q=`;
const SEARCH_URL = `${BASE_URL}/?s=`;

/* MAIN FUNCTIONS */

async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

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

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);

        const html = await response.text();

        const description = extractFirst(
            html,
            /<div class="anime-sinopsis-contenedor"[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
        );
        const airdate = extractFirst(
            html,
            /<div[^>]*class="[^"]*anime-info-pre-contenedor[^"]*"[\s\S]*?fa-calendar-alt[\s\S]*?<span>([^<]+)<\/span>/i
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
                const seasons = JSON.parse(dataMatch[1]);
                seasons.forEach((season) => {
                    const numTemp = season.numero_temporada;
                    const items = season.episodios || [];
                    items.forEach((ep) => {
                        const numEp = ep.numero_episodio;
                        // URL pattern: https://animejara.com/episode/${ANIME_SLUG}-${numTemp}x${numEp}/
                        const href = `https://animejara.com/episode/${slug}-${numTemp}x${numEp}/`;
                        
                        // Fix for "Episode 0" - Use integer parsing and fallback
                        let episodeNumber = parseInt(numEp, 10);
                        if (isNaN(episodeNumber)) episodeNumber = 0;

                        episodes.push({
                            href,
                            number: episodeNumber,
                            season: parseInt(numTemp, 10),
                            episode: episodeNumber,
                            image: ep.poster_episodio || '' // Adding image/thumbnail
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
                            number: episode,
                            season,
                            episode
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
        
        // Extract language URLs from the enlaces array (can be const, var, let, or bare)
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
                // Unescape \/ to / and decode HTML entities
                const cleanUrl = urlMatch[1].replace(/\\\//g, '/');
                embedUrls.push(decodeHtml(cleanUrl).trim());
            }
        }
        
        // If we found multiple language embeds, process all of them
        if (embedUrls.length > 0) {
            const allStreams = [];
            
            for (let i = 0; i < embedUrls.length; i++) {
                const rawLang = langNames[i] || ('Lang ' + (i + 1));
                // Shorten language names for cleaner display
                const langMap = { 'LATINO': 'LAT', 'JAPONES': 'JAP', 'CASTELLANO': 'CAS', 'ENGLISH': 'ENG', 'INGLES': 'ENG' };
                const langLabel = langMap[rawLang.toUpperCase()] || rawLang;
                const embedUrl = embedUrls[i];
                
                const servers = await extractDirectServerFromEmbed(embedUrl);
                if (!servers || servers.length === 0) {
                    allStreams.push({
                        title: langLabel + ' · ' + prettifyServerName('', embedUrl),
                        streamUrl: embedUrl,
                        headers: {}
                    });
                    continue;
                }
                
                for (const server of servers) {
                    const result = await resolveServerToDirectUrl(server.url, server.name);
                    if (result) {
                        // Prefix the stream title with the language
                        result.title = langLabel + ' · ' + result.title;
                        allStreams.push(result);
                    }
                }
            }
            
            if (allStreams.length > 0) {
                return JSON.stringify({
                    streams: allStreams,
                    subtitles: null
                });
            }
            
            // Fallback to first embed URL
            return embedUrls[0];
        }
        
        // Fallback: single iframe (no language buttons)
        const iframe = extractFirst(
            html,
            /<iframe[^>]+id="iframe-video"[^>]+src="([^"]+)"/i
        ) || extractFirst(
            html,
            /<div[^>]+id="reproductor-wrapper"[\s\S]*?<iframe[^>]+src="([^"]+)"/i
        );

        if (iframe) {
            const iframeUrl = decodeHtml(iframe).trim();
            const servers = await extractDirectServerFromEmbed(iframeUrl);
            
            if (servers && Array.isArray(servers) && servers.length > 0) {
                const streams = [];
                for (const server of servers) {
                    const result = await resolveServerToDirectUrl(server.url, server.name);
                    if (result) streams.push(result);
                }
                
                if (streams.length > 0) {
                    return JSON.stringify({
                        streams: streams,
                        subtitles: null
                    });
                }
                
                return servers[0].url;
            }
            
            return iframeUrl;
        }

        const m3u8 = extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8) return decodeHtml(m3u8).trim();

        return null;
    } catch (error) {
        console.error('Stream error:', error);
        return null;
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
        const displayName = prettifyServerName(serverName, serverUrl);
        
        // Get the origin/referer from the embed URL
        const urlObj = serverUrl.match(/^(https?:\/\/[^\/]+)/);
        const referer = urlObj ? urlObj[1] + '/' : '';
        
        const resp = await soraFetch(serverUrl);
        if (!resp) {
            return {
                title: displayName,
                streamUrl: serverUrl,
                headers: {}
            };
        }
        const html = await resp.text();
        
        // 1. Try to find m3u8 directly in the HTML
        let m3u8 = extractFirst(html, /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i)
            || extractFirst(html, /src\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i)
            || extractFirst(html, /"hls2"\s*:\s*"([^"]+)"/i);
        
        // 2. If not found, try unpacking P.A.C.K.E.R. obfuscated JS
        if (!m3u8) {
            const packedMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?\)[\s\S]*?)<\/script>/);
            if (packedMatch) {
                try {
                    const unpacked = unpack(packedMatch[1]);
                    m3u8 = extractFirst(unpacked, /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i)
                        || extractFirst(unpacked, /"hls2"\s*:\s*"([^"]+)"/i)
                        || extractFirst(unpacked, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                } catch (e) {
                    // Unpacker failed, continue
                }
            }
        }
        
        // 3. Last resort: broad regex match for m3u8 URLs
        if (!m3u8) {
            m3u8 = extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        }
        
        if (m3u8) {
            return {
                title: displayName,
                streamUrl: decodeHtml(m3u8).trim(),
                headers: {
                    "Referer": referer,
                    "Origin": referer.replace(/\/$/, ''),
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                }
            };
        }
        
        return {
            title: displayName,
            streamUrl: serverUrl,
            headers: {}
        };
    } catch (e) {
        console.error('resolveServerToDirectUrl error for ' + serverName + ':', e);
        return {
            title: prettifyServerName(serverName, serverUrl),
            streamUrl: serverUrl,
            headers: {}
        };
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

async function extractDirectServerFromEmbed(embedUrl) {
    try {
        if (!/multiplayer\.streamhj\.top/i.test(embedUrl)) return null;

        const response = await soraFetch(embedUrl);
        if (!response) return null;
        const html = await response.text();

        const servers = [];
        // More flexible regex to match playVideo('...') or playVideo("&quot;...&quot;")
        const regex = /<li[^>]*onclick="[^"]*playVideo\((?:&quot;|'|")\s*([^"&']+(?:&amp;[^"&']*)*)\s*(?:&quot;|'|")\)[^"]*"[\s\S]*?<span[^>]*class="nombre-server"[^>]*>([^<]+)<\/span>/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            servers.push({
                url: normalizeExternalUrl(match[1]),
                name: cleanText(match[2])
            });
        }

        if (servers.length === 0) {
            // Fallback for different HTML structures
            const fallbackRegex = /playVideo\((?:&quot;|'|")\s*(https?:\/\/[^"&']+(?:&amp;[^"&']*)*)\s*(?:&quot;|'|")\)/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                servers.push({ url: normalizeExternalUrl(match[1]), name: 'Server' });
            }
        }

        return (servers.length > 0) ? servers : null;
    } catch (error) {
        console.error('Embed server extraction error:', error);
        return null;
    }
}

function pickPreferredServer(servers) {
    if (!Array.isArray(servers) || servers.length === 0) return null;
    const cleanServers = servers.filter((item) => item && item.url);
    if (cleanServers.length === 0) return null;

    const preferredHosts = [
        'streamtape',
        'filelions',
        'vidhide',
        'voe',
        'uqload',
        'mp4upload',
        'mixdrop',
        'streamhg',
        'filemoon',
        'netu'
    ];

    for (const host of preferredHosts) {
        const found = cleanServers.find((item) => {
            const haystack = `${item.name} ${item.url}`.toLowerCase();
            return haystack.includes(host);
        });
        if (found) return found.url;
    }

    return cleanServers[0].url;
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
    const normalized = decodeHtml(url || '').trim();
    if (!normalized) return '';
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
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
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized.replace(/^\/+/, '')}`;
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
        const res = await fetchv2(url, mergedHeaders, method, body);
        if (res) return res;
    } catch (e) {
        // Fallback to fetchv1 (deprecated)
    }

    try {
        const raw = await fetch(url, mergedHeaders);
        return {
            text: async () => String(raw),
            json: async () => JSON.parse(raw)
        };
    } catch (e) {
        return null;
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