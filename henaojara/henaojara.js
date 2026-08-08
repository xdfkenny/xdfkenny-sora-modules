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
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Fetches an anime page and extracts its description, airdate, and alternative titles.
 * Attempts multiple fallback selectors and metadata sources to locate each field, cleans the text, and returns the results.
 * @param {string} url - The anime or movie page URL to fetch and parse.
 * @returns {string} A JSON-stringified array containing a single object with `description`, `airdate`, and `aliases` fields.
 */
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
            /<i[^>]*fa-calendar-alt[^>]*>[^<]*<\/i>\s*<span>([^<]+)<\/span>/i
        ) || extractFirst(
            html,
            /<div[^>]*class="[^"]*stat-item[^"]*"[\s\S]*?fa-calendar-alt[\s\S]*?<span>([^<]+)<\/span>/i
        ) || extractFirst(
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
        console.log('Details error: ' + error);
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
                console.log('Error parsing TEMPORADAS_DATA: ' + jsonError);
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

        // Movie fallback: movies have no TEMPORADAS_DATA, just a movieLinks array.
        // Return a single "episode" pointing to the movie page itself.
        if (episodes.length === 0) {
            const movieLinksMatch = html.match(/(?:const|var|let)?\s*movieLinks\s*=\s*\[[\s\S]*?\]/);
            if (movieLinksMatch) {
                episodes.push({
                    href: url,
                    number: 1
                });
            }
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
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
                subtitle: ""
            });
        }
        
        // STEP 2: Extract language URLs from the enlaces array (or movieLinks for movies)
        const enlacesMatch = html.match(/(?:const|var|let)?\s*(?:enlaces|movieLinks)\s*=\s*\[([\s\S]*?)\]/);
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
                
                // Cap servers per embed: embed pages often list 8-9 hosts,
                // many of them browser-only junk. The first ones are the
                // reliable ones; resolving the tail just wastes fetches.
                const candidateServers = servers.slice(0, 6);
                const serverPromises = candidateServers.map(async (server) => {
                    if (!server.url || server.url.trim() === '') return null;
                    
                    // Cap each server at ~4s so one slow/junk host (e.g. a
                    // black-holed dood clone) can't delay the whole embed.
                    const resolve = (async () => {
                        const result = await resolveServerToDirectUrl(server.url, server.name);
                        if (result && result.streamUrl) {
                            return {
                                title: `${langLabel} - ${result.title}`,
                                streamUrl: result.streamUrl,
                                headers: result.headers
                            };
                        }
                        return null;
                    })();
                    return await withTimeout(resolve, 4000);
                });
                
                const resolvedServers = await Promise.all(serverPromises);
                return resolvedServers.filter(s => s && s.streamUrl);
            });
            
            const results = await Promise.all(embedPromises);
            const finalList = results.reduce((acc, curr) => acc.concat(curr), []);

            if (finalList.length > 0) {
                return JSON.stringify({ streams: finalList, subtitle: "" });
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
                const validServers = servers.filter(s => s && s.url && s.url.trim() !== '').slice(0, 6);
                const results = await Promise.all(validServers.map(s => withTimeout(resolveServerToDirectUrl(s.url, s.name), 4000)));
                const streams = results.filter(r => r && r.streamUrl);

                if (streams.length > 0) {
                    return JSON.stringify({
                        streams: streams,
                        subtitle: ""
                    });
                }
            }
        }

        // STEP 5: Last resort - return empty streams array with valid JSON
        return JSON.stringify({ streams: [], subtitle: "" });
    } catch (error) {
        console.log('Stream error: ' + error);
        return JSON.stringify({ streams: [], subtitle: "" });
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
        'voe': '🟠 VOE',
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
        if (/voe/i.test(host)) return '🟠 VOE';
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
        if (/dood\.(so|re|stream|la)/i.test(serverUrl)) return null;  // token API, browser-only
        
        // Get the origin/referer from the embed URL
        const urlObj = serverUrl.match(/^(https?:\/\/[^\/]+)/);
        const referer = urlObj ? urlObj[1] + '/' : '';
        const origin = referer.replace(/\/$/, '');
        
        // ========== SPECIAL HANDLERS ==========
        
        // --- Handler 1: Nyuu (multi-layer redirect) ---
        if (/nyuu\.(streamhj\.top|henaojara\.com)/i.test(serverUrl)) {
            const nyuuResult = await resolveNyuuServer(serverUrl, displayName, referer, origin);
            if (nyuuResult) return nyuuResult;
        }
        
        // --- Handler 2: Filelions / VidHide (eval obfuscation) ---
        if (/filelions\.|vidhide\./i.test(serverUrl)) {
            const filelionsResult = await resolveFilelionsServer(serverUrl, displayName, referer, origin);
            if (filelionsResult) return filelionsResult;
        }
        
        // --- Handler 2b: Voe (Altcha PoW challenge gate) ---
        if (/voe\.sx|jessicachoosemake\.com/i.test(serverUrl)) {
            const voeResult = await resolveVoeServer(serverUrl, displayName, referer, origin);
            if (voeResult) return voeResult;
        }
        
        // --- Handler 3: StreamHG / HGCloud ---
        if (/hgcloud\.|streamhg/i.test(serverUrl)) {
            const hgResult = await resolveHgcloudServer(serverUrl, displayName, referer, origin);
            if (hgResult) return hgResult;
        }
        
        // ========== GENERIC HANDLER ==========
        const resp = await soraFetch(serverUrl);
        if (!resp) return null;
        const html = await resp.text();
        
        let m3u8 = null;
        
        // 1. Try multiple patterns to find m3u8 in the HTML
        m3u8 = extractFirst(html, /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i)
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
        
        // 4. Check for JWPlayer or other player configurations
        if (!m3u8) {
            const jwMatch = html.match(/jwplayer\("[^"]+"\)\.setup\(\{[^}]*file\s*:\s*["']([^"']+)["']/i);
            if (jwMatch && jwMatch[1] && jwMatch[1].includes('.m3u8')) {
                m3u8 = jwMatch[1];
            }
        }
        
        // 5. Check for DPlayer config with relative URLs
        if (!m3u8) {
            const dpMatch = html.match(/video:\s*\{\s*url:\s*['"]([^'"]+)['"]/i);
            if (dpMatch && dpMatch[1]) {
                const relativeUrl = dpMatch[1].trim();
                if (relativeUrl.includes('.m3u8') || relativeUrl.includes('.mp4')) {
                    // Resolve relative URL against server base
                    try {
                        const baseUrl = serverUrl.match(/^(https?:\/\/[^\/]+\/[^\/]+\/)/)?.[1] || serverUrl;
                        const resolved = new URL(relativeUrl, baseUrl).href;
                        m3u8 = resolved;
                    } catch (e) {
                        m3u8 = relativeUrl;
                    }
                }
            }
        }
        
        if (m3u8) {
            const cleanM3u8 = decodeHtml(m3u8).trim();
            const resolvedM3u8 = toAbsoluteUrl(serverUrl, cleanM3u8);
            // Verify it's actually an m3u8 URL
            if (!resolvedM3u8.includes('.m3u8') && !resolvedM3u8.includes('.mp4')) return null;
            
            return {
                title: displayName,
                streamUrl: resolvedM3u8,
                headers: {
                    "Referer": referer,
                    "Origin": origin,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            };
        }
        
        return null;
    } catch (e) {
        console.log('resolveServerToDirectUrl error for ' + serverName + ': ' + e);
        return null;
    }
}

// ========== SPECIALIZED SERVER RESOLVERS ==========

// Resolve Nyuu server: follows go.php -> ody_go.php -> extracts DPlayer config
async function resolveNyuuServer(serverUrl, displayName, referer, origin) {
    try {
        // Step 1: Fetch the go.php page
        const goResp = await soraFetch(serverUrl);
        if (!goResp) return null;
        const goHtml = await goResp.text();
        
        // Extract the encoded 'v' parameter and redirect target
        const vMatch = goHtml.match(/var\s+enlace\s*=\s*['"]([^'"]+)['"]/i) || 
                       serverUrl.match(/[?&]v=([^&]+)/);
        const vParam = vMatch ? vMatch[1] : '';
        
        const inicioMatch = serverUrl.match(/[?&]inicio=([^&]+)/);
        const finalMatch = serverUrl.match(/[?&]final=([^&]+)/);
        const inicio = inicioMatch ? inicioMatch[1] : '0';
        const final = finalMatch ? finalMatch[1] : '0';
        
        // Build ody_go.php URL
        const baseMatch = serverUrl.match(/^(https?:\/\/[^\/]+\/[^\/]+\/[^\/]+\/)/);
        const basePath = baseMatch ? baseMatch[1] : serverUrl.replace(/\/[^\/]*$/, '/');
        const odyUrl = `${basePath}ody_go.php?v=${vParam}&inicio=${inicio}&final=${final}`;
        
        // Step 2: Fetch ody_go.php
        const odyResp = await soraFetch(odyUrl);
        if (!odyResp) return null;
        const odyHtml = await odyResp.text();
        
        // Step 3: Extract DPlayer config (video URL is relative)
        const dpMatch = odyHtml.match(/video:\s*\{\s*url:\s*['"]([^'"]+)['"]/i);
        if (!dpMatch || !dpMatch[1]) return null;
        
        const relativeUrl = dpMatch[1].trim();
        let finalUrl = relativeUrl;
        
        // Resolve relative URL
        if (!/^https?:\/\//i.test(relativeUrl)) {
            try {
                const odyBase = odyUrl.match(/^(https?:\/\/[^\/]+\/[^\/]+\/[^\/]+\/)/)?.[1] || odyUrl;
                finalUrl = new URL(relativeUrl, odyBase).href;
            } catch (e) {
                finalUrl = relativeUrl;
            }
        }
        
        // The URL might be another redirect (e.g., 1/a1b2c3d4e5.php), follow it
        if (!/\.m3u8/i.test(finalUrl) && !/\.mp4/i.test(finalUrl)) {
            try {
                const redirectResp = await soraFetch(finalUrl);
                if (redirectResp) {
                    // Check if we got a redirect response
                    // If the URL changed after redirects, use the effective URL
                    const effectiveUrl = redirectResp.url || finalUrl;
                    if (/\.m3u8/i.test(effectiveUrl) || /\.mp4/i.test(effectiveUrl)) {
                        finalUrl = effectiveUrl;
                    }
                }
            } catch (e) {
                // Keep original URL
            }
        }
        
        if (!finalUrl || (!finalUrl.includes('.m3u8') && !finalUrl.includes('.mp4'))) return null;
        
        return {
            title: displayName,
            streamUrl: finalUrl,
            headers: {
                "Referer": origin + '/',
                "Origin": origin,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        };
    } catch (e) {
        console.error('resolveNyuuServer error:', e);
        return null;
    }
}

// Resolve Filelions/VidHide server: deobfuscate eval -> extract m3u8 from decoded code
async function resolveFilelionsServer(serverUrl, displayName, referer, origin) {
    try {
        const resp = await soraFetch(serverUrl);
        if (!resp) return null;
        let html = await resp.text();
        
        // Step 1: Look for eval() obfuscation and deobfuscate
        const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\s*\('/i);
        if (evalMatch) {
            try {
                // Extract the full eval block
                const evalStart = evalMatch.index;
                const evalEndMarker = "'.split('|')))";
                const evalEnd = html.indexOf(evalEndMarker, evalStart);
                if (evalEnd !== -1) {
                    const fullEval = html.substring(evalStart, evalEnd + evalEndMarker.length);
                    const deobfuscated = deobfuscateSimpleEval(fullEval);
                    if (deobfuscated) {
                        html = deobfuscated;
                    }
                }
            } catch (e) {
                // Deobfuscation failed, continue with original
            }
        }
        
        // Step 2: Look for 'links' object with hls2/hls3/hls4
        const linksMatch = html.match(/links\s*=\s*\{[\s\S]*?\}/i);
        if (linksMatch) {
            // Prefer the same-origin proxy wrapper (hls4): it relays the CDN
            // server-side, so the app's player gets HTTP 200 with no special
            // headers. The direct-CDN hls2 URL is IP/token-bound and 403s
            // in-app ("No tienes autorización"); hls3 is a .txt anti-HLS
            // rename. Same priority as flixlatam's resolveMino.
            const hlsPriority = ['hls4', 'hls2', 'hls3'];
            for (const key of hlsPriority) {
                const km = linksMatch[0].match(new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"'));
                if (!km || !km[1]) continue;
                // VidHide serves the hls keys as same-origin relative paths
                // (e.g. /stream/xxxx/.../master.m3u8), resolve against the embed host
                const url = toAbsoluteUrl(serverUrl, km[1]);
                if (url.includes('.m3u8')) {
                    return {
                        title: displayName,
                        streamUrl: url,
                        headers: {
                            "Referer": referer,
                            "Origin": origin,
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }
                    };
                }
            }
        }
        
        // Step 3: Look for jwplayer setup with sources
        const jwMatch = html.match(/sources\s*:\s*\[\s*\{[^}]*file\s*:\s*(["'][^"']+["']|links\.\w+)/i);
        if (jwMatch) {
            const fileRef = jwMatch[1].trim();
            let url = '';
            
            if (fileRef.startsWith('links.')) {
                // Prefer the same-origin wrapper key (hls4) over the direct
                // CDN — same reasoning as Step 2 (hls2 403s in-app).
                const requestedKey = fileRef.replace('links.', '');
                const keys = ['hls4', 'hls2', 'hls3'].indexOf(requestedKey) !== -1
                    ? ['hls4', 'hls2', 'hls3']
                    : [requestedKey];
                for (const key of keys) {
                    const linkMatch = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
                    if (linkMatch && linkMatch[1]) {
                        url = linkMatch[1];
                        break;
                    }
                }
            } else {
                url = fileRef.replace(/["']/g, '');
            }
            
            if (url && (url.includes('.m3u8') || url.includes('.mp4'))) {
                return {
                    title: displayName,
                    streamUrl: toAbsoluteUrl(serverUrl, url),
                    headers: {
                        "Referer": referer,
                        "Origin": origin,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                };
            }
        }
        
        // Step 4: Fallback - look for any m3u8 or mp4 URL
        const directMatch = html.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/i);
        if (directMatch && directMatch[1]) {
            return {
                title: displayName,
                streamUrl: directMatch[1].trim(),
                headers: {
                    "Referer": referer,
                    "Origin": origin,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            };
        }
        
        return null;
    } catch (e) {
        console.error('resolveFilelionsServer error:', e);
        return null;
    }
}

// Resolve HGCloud/StreamHG server
async function resolveHgcloudServer(serverUrl, displayName, referer, origin) {
    try {
        const resp = await soraFetch(serverUrl);
        if (!resp) return null;
        const html = await resp.text();
        
        // Look for m3u8 or mp4
        const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/i) ||
                         html.match(/sources\s*:\s*\[\s*\{[^}]*file\s*:\s*["']([^"']+)["']/i) ||
                         html.match(/"?(?:file|src|source)"?\s*[:=]\s*"(https?:[^"]*\.(?:m3u8|mp4)[^"]*)"/i);
        
        if (m3u8Match && m3u8Match[1]) {
            return {
                title: displayName,
                streamUrl: m3u8Match[1].trim(),
                headers: {
                    "Referer": referer,
                    "Origin": origin,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            };
        }
        
        return null;
    } catch (e) {
        console.error('resolveHgcloudServer error:', e);
        return null;
    }
}

// Deobfuscate eval(function(p,a,c,k,e,d){...}) pattern used by Filelions/VidHide
// This is different from P.A.C.K.E.R. - it's a simpler obfuscation
function deobfuscateSimpleEval(source) {
    try {
        // The pattern is: eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(...)}('payload',radix,count,'word1|word2'.split('|'),0,{}))
        
        // Find the function body end
        const funcEnd = source.indexOf("}('");
        if (funcEnd === -1) return null;
        
        const argsStr = source.substring(funcEnd + 2);
        
        // Extract payload (first single-quoted string)
        const firstQuote = argsStr.indexOf("'");
        if (firstQuote === -1) return null;
        
        let payloadEnd = -1;
        for (let i = firstQuote + 1; i < argsStr.length; i++) {
            if (argsStr.charAt(i) === "'" && argsStr.charAt(i - 1) !== '\\') {
                const rest = argsStr.substring(i + 1).trim();
                if (rest.charAt(0) === ',') {
                    payloadEnd = i;
                    break;
                }
            }
        }
        
        if (payloadEnd === -1) return null;
        
        const payload = argsStr.substring(firstQuote + 1, payloadEnd);
        
        // Extract radix and count
        let rest = argsStr.substring(payloadEnd + 1).trim();
        rest = rest.substring(1).trim(); // skip comma
        const radixEnd = rest.indexOf(',');
        const radix = parseInt(rest.substring(0, radixEnd));
        rest = rest.substring(radixEnd + 1).trim();
        const countEnd = rest.indexOf(",");
        const count = parseInt(rest.substring(0, countEnd));
        
        // Extract keywords
        const kwStart = rest.indexOf("'") + 1;
        const kwEnd = rest.indexOf("'", kwStart);
        const keywords = rest.substring(kwStart, kwEnd).split('|');
        
        if (count !== keywords.length) {
            // Some implementations have count as a hint, not strict
            console.log('Warning: keyword count mismatch', count, 'vs', keywords.length);
        }
        
        // Decode the payload
        function decodeWord(word) {
            if (radix === 1) {
                const idx = parseInt(word);
                return (idx >= 0 && idx < keywords.length) ? keywords[idx] : word;
            }
            const index = parseInt(word, radix);
            return (index >= 0 && index < keywords.length) ? keywords[index] : word;
        }
        
        const decoded = payload.replace(/\b\w+\b/g, function(word) {
            return decodeWord(word);
        });
        
        return decoded;
    } catch (e) {
        console.error('deobfuscateSimpleEval error:', e);
        return null;
    }
}

/* ============================================================
   VOE RESOLVER — voe.sx → jessicachoosemake.com Altcha gate
   Ported from flixlatam: the voe embed JS-redirects to the gate
   host, which blocks the player behind an Altcha v4 PBKDF2/SHA-256
   "confirm you're human" challenge, then serves the HLS source in
   an obfuscated JSON config blob. Full chain solved in pure JS.
   ============================================================ */

async function resolveVoeServer(serverUrl, displayName, referer, origin) {
    try {
        const master = await resolveVoe(serverUrl);
        if (!master) return null;
        return {
            title: displayName,
            streamUrl: master,
            headers: {
                "Referer": (referer || 'https://voe.sx/'),
                "Origin": (origin || 'https://voe.sx'),
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        };
    } catch (e) {
        console.error('resolveVoeServer error:', e);
        return null;
    }
}

async function resolveVoe(embedUrl) {
    const voeUrl = /^https?:/i.test(String(embedUrl || '')) ? embedUrl : 'https://voe.sx/' + String(embedUrl).replace(/^\/+/, '');

    // 1) voe.sx serves a JS redirect (no localStorage → the gate host).
    let gateUrl = voeUrl;
    let gateHtml = '';
    const voeRes = await soraFetch(voeUrl);
    if (voeRes) {
        const voeText = await voeRes.text();
        if (voeText.indexOf('altcha-widget') !== -1) {
            gateHtml = voeText; // already the gate page
        } else {
            const redir = voeText.match(/window\.location\.href\s*=\s*'([^']+)'/);
            if (redir) gateUrl = redir[1].split('#')[0];
        }
    }

    // 2) gate HTML: _token input + altcha challenge URL
    if (!gateHtml) {
        const gateRes = await soraFetch(gateUrl);
        if (!gateRes) return null;
        gateHtml = await gateRes.text();
    }
    if (gateHtml.indexOf('altcha-widget') === -1) return null;
    const tokenMatch = gateHtml.match(/name="_token" value="([^"]+)"/);
    const chalMatch = gateHtml.match(/challenge="([^"]+)"/);
    if (!tokenMatch || !chalMatch) return null;

    // 3) challenge JSON — fresh PBKDF2 parameters on every fetch
    const chalRes = await soraFetch(chalMatch[1], { headers: { 'Referer': gateUrl } });
    if (!chalRes) return null;
    let chal;
    try { chal = JSON.parse(await chalRes.text()); } catch (e) { return null; }
    const p = chal && chal.parameters;
    if (!p || !p.nonce || !p.salt || !p.cost || !p.keyLength || !p.keyPrefix) return null;

    const sol = solveAltcha(p);
    if (!sol) return null;

    // 4) POST the solved challenge — same payload the widget submits
    const payload = voeB64FromBytes(voeStrToBytes(JSON.stringify({
        challenge: { parameters: p, signature: chal.signature },
        solution: { counter: sol.counter, derivedKey: sol.derivedKey, time: 0 }
    })));
    const origin = gateUrl.match(/^https?:\/\/[^/]+/i);
    const postBody = '_token=' + encodeURIComponent(tokenMatch[1]) + '&access=0&altcha=' + encodeURIComponent(payload);
    const postRes = await soraFetch(gateUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': origin ? origin[0] : '',
            'Referer': gateUrl
        },
        body: postBody
    });
    if (!postRes) return null;
    const playerHtml = await postRes.text();
    if (playerHtml.indexOf('altcha-widget') !== -1 || playerHtml.indexOf('Confirm you') !== -1) return null;

    // 5) player page: decrypt the embedded config, read the HLS source
    const blobMatch = playerHtml.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (!blobMatch) return null;
    let blobStr;
    try { blobStr = JSON.parse(blobMatch[1])[0]; } catch (e) { return null; }
    if (typeof blobStr !== 'string' || blobStr.length < 8) return null;
    const cfg = decryptVoeConfig(blobStr);
    if (!cfg) return null;
    return cfg.source || cfg.direct_access_url || null;
}

// Altcha v4 PBKDF2/SHA-256 solve. password = nonceBytes || uint32-be(counter),
// salt = saltBytes, iterations = cost, dkLen = keyLength. Return the first
// counter whose derived key starts with keyPrefix (00...). Bound the solve:
// a 1-byte prefix needs ~256 iterations on average (~1s); abort past ~6s so
// a pathological challenge can't stall the whole stream loading.
function solveAltcha(p) {
    const cost = p.cost;
    const prefix = parseInt(p.keyPrefix, 16);
    const nonceBytes = voeHexToBytesArr(p.nonce);
    const saltBytes = voeHexToBytesArr(p.salt);
    const pass = new Array(nonceBytes.length + 4);
    for (let i = 0; i < nonceBytes.length; i++) pass[i] = nonceBytes[i];
    const start = Date.now();
    for (let counter = 0; counter < 100000; counter++) {
        if ((counter & 63) === 0 && Date.now() - start > 4500) return null;
        pass[nonceBytes.length] = (counter >>> 24) & 0xff;
        pass[nonceBytes.length + 1] = (counter >>> 16) & 0xff;
        pass[nonceBytes.length + 2] = (counter >>> 8) & 0xff;
        pass[nonceBytes.length + 3] = counter & 0xff;
        const dk = voePbkdf2Sha256Fast(pass, saltBytes, cost);
        if (dk[0] === prefix) {
            return { counter: counter, derivedKey: voeBytesArrToHex(dk) };
        }
    }
    return null;
}

/* Fast SHA-256 for the Altcha PoW: typed-array block compressor + HMAC
   mid-state precomputation make a full PBKDF2(10000) cost ~4ms in V8
   (vs ~500ms string-based), keeping every solve under ~2s. */

const VOE_SHA_INIT = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
const VOE_SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

// h: Uint32Array[8] (state, mutated in place). w: Uint32Array[16] input block.
// sched: Uint32Array[16] reusable message-schedule scratch.
function voeCompress(h, w, sched) {
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    const s = sched;
    for (let i = 0; i < 64; i++) {
        if (i < 16) {
            s[i] = w[i];
        } else {
            const x2 = s[(i + 14) & 15], x15 = s[(i + 1) & 15], x7 = s[(i + 9) & 15], x16 = s[i & 15];
            const s0 = (((x15 >>> 7) | (x15 << 25)) ^ ((x15 >>> 18) | (x15 << 14)) ^ (x15 >>> 3)) >>> 0;
            const s1 = (((x2 >>> 17) | (x2 << 15)) ^ ((x2 >>> 19) | (x2 << 13)) ^ (x2 >>> 10)) >>> 0;
            s[i & 15] = (s1 + x7 + s0 + x16) | 0;
        }
        const x = s[i & 15];
        const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + VOE_SHA_K[i] + x) | 0;
        const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

// Pack a 64-byte buffer (Uint8Array) into 16 big-endian words.
function voeWordsFromBytes(src, w) {
    for (let i = 0; i < 16; i++) {
        const j = i * 4;
        w[i] = ((src[j] << 24) | (src[j + 1] << 16) | (src[j + 2] << 8) | src[j + 3]) >>> 0;
    }
}

// PBKDF2-HMAC-SHA256, single dkLen block (32 bytes). password/salt are
// number arrays (0-255). HMAC mid-states (ipad/opad xor key) compressed once
// per call; every iteration then compresses only the extra message block.
function voePbkdf2Sha256Fast(password, salt, cost) {
    const key = new Uint8Array(64);
    for (let i = 0; i < password.length && i < 64; i++) key[i] = password[i];
    const ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { ipad[i] = key[i] ^ 0x36; opad[i] = key[i] ^ 0x5c; }

    const w = new Uint32Array(16), sched = new Uint32Array(16);
    const innerMid = new Uint32Array(VOE_SHA_INIT);
    voeWordsFromBytes(ipad, w); voeCompress(innerMid, w, sched);
    const outerMid = new Uint32Array(VOE_SHA_INIT);
    voeWordsFromBytes(opad, w); voeCompress(outerMid, w, sched);

    // U_1 = HMAC(password, salt || 0x00000001); inner block2 = salt + 1 + pad.
    // The SHA-256 length field counts the WHOLE message (64-byte ipad block +
    // salt + 4-byte counter), so word layout depends on the salt length.
    const saltWords = salt.length >> 2;
    const b2 = new Uint32Array(16);
    for (let i = 0; i < saltWords; i++) {
        const j = i * 4;
        b2[i] = ((salt[j] << 24) | (salt[j + 1] << 16) | (salt[j + 2] << 8) | salt[j + 3]) >>> 0;
    }
    b2[saltWords] = 1;                    // 0x00000001 counter suffix
    b2[saltWords + 1] = 0x80000000;       // 0x80 padding
    b2[15] = (64 + salt.length + 4) * 8;  // message bit length
    const ob2 = new Uint32Array(16);
    ob2[8] = 0x80000000; ob2[15] = 96 * 8;

    const u = new Uint32Array(VOE_SHA_INIT);
    u.set(innerMid); voeCompress(u, b2, sched);
    for (let j = 0; j < 8; j++) ob2[j] = u[j];
    u.set(outerMid); voeCompress(u, ob2, sched);
    const T = new Uint32Array(u);
    for (let i = 1; i < cost; i++) {
        for (let j = 0; j < 8; j++) b2[j] = u[j];
        b2[8] = 0x80000000; b2[9] = 0; b2[15] = 96 * 8;
        u.set(innerMid); voeCompress(u, b2, sched);
        for (let j = 0; j < 8; j++) ob2[j] = u[j];
        u.set(outerMid); voeCompress(u, ob2, sched);
        for (let j = 0; j < 8; j++) T[j] = (T[j] ^ u[j]) | 0;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
        out[i * 4] = (T[i] >>> 24) & 255;
        out[i * 4 + 1] = (T[i] >>> 16) & 255;
        out[i * 4 + 2] = (T[i] >>> 8) & 255;
        out[i * 4 + 3] = T[i] & 255;
    }
    return out;
}

function voeHexToBytesArr(hex) {
    const out = [];
    for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
    return out;
}

function voeBytesArrToHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i] & 0xff;
        out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
}

// Obfuscated player-config blob → JSON (mirrors the voe loader.js decoder):
// ROT13 → token-substitute → strip _ → b64 → -3 → reverse → b64 → JSON.
function decryptVoeConfig(blob) {
    try {
        let s = String(blob);
        s = s.replace(/[a-zA-Z]/g, function (c) {
            const base = c <= 'Z' ? 65 : 97;
            return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
        });
        const tokens = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
        for (let i = 0; i < tokens.length; i++) s = s.split(tokens[i]).join('_');
        s = s.split('_').join('');
        let b = voeB64ToStr(s);
        let c = '';
        for (let i = 0; i < b.length; i++) c += String.fromCharCode(b.charCodeAt(i) - 3);
        let r = '';
        for (let i = c.length - 1; i >= 0; i--) r += c.charAt(i);
        return JSON.parse(voeB64ToStr(r));
    } catch (e) {
        return null;
    }
}

function voeStrToBytes(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
}

function voeB64FromBytes(bytes) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        out += chars[b0 >> 2];
        out += chars[((b0 & 3) << 4) | ((b1 >>> 4) & 0x0f)];
        out += (b1 !== undefined) ? chars[((b1 & 0x0f) << 2) | ((b2 >>> 6) & 3)] : '=';
        out += (b2 !== undefined) ? chars[b2 & 0x3f] : '=';
    }
    return out;
}

function voeB64ToStr(b64) {
    const bytes = voeB64ToBytes(b64);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
}

function voeB64ToBytes(b64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const out = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < b64.length; i++) {
        const ch = b64.charAt(i);
        if (ch === '=') break;
        const v = chars.indexOf(ch);
        if (v === -1) continue;
        buffer = (buffer << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buffer >> bits) & 0xff);
        }
    }
    return out;
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
        console.log('AJAX search error: ' + error);
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
        console.log('Catalog search error: ' + error);
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
        console.log('WordPress search error: ' + error);
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
        const regex = /<li[^>]*onclick="[^"]*playVideo\((?:&quot;|'|")\s*([^"]*)\s*(?:&quot;|'|")\)[^"]*"[\s\S]*?<span[^>]*class=['"]nombre-server['"][^>]*>([^<]+)<\/span>/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            servers.push({
                url: normalizeExternalUrl(match[1]),
                name: cleanText(match[2])
            });
        }

        // Pattern 2: Generic playVideo fallback
        if (servers.length === 0) {
            const fallbackRegex = /playVideo\((?:&quot;|'|")\s*(https?:\/\/[^"]*)\s*(?:&quot;|'|")\)/gi;
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
        console.log('Embed server extraction error: ' + error);
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

// Resolve a possibly-relative media URL against the embed/server base URL.
// VidHide and similar hosts expose hls keys as same-origin relative paths
// (e.g. /stream/xxx/master.m3u8); absolute URLs are returned untouched.
function toAbsoluteUrl(base, url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return 'https:' + raw;
    if (/^\//.test(raw)) {
        const m = String(base).match(/^(https?:\/\/[^/]+)/i);
        return (m ? m[1] : BASE_URL) + raw;
    }
    try {
        return new URL(raw, base).href;
    } catch (e) {
        return raw;
    }
}

// Race a promise against a deadline. Some targets (Sora sandbox) expose no
// setTimeout — there the cap is skipped rather than crashing the module.
// Resolves `fallback` (default null) when the deadline wins.
function withTimeout(promise, ms, fallback) {
    if (typeof setTimeout === 'undefined') return promise;
    const fb = typeof fallback === 'undefined' ? null : fallback;
    return Promise.race([
        promise,
        new Promise(function (resolve) {
            setTimeout(function () { resolve(fb); }, ms);
        })
    ]);
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

    const attempt = async function () {
        try {
            return await fetchv2(url, mergedHeaders, method, body);
        } catch (e) {
            try {
                // fetchv2 failed (e.g. network error) — fall back to plain fetch.
                // Read the body once and cache it: returning the raw Response
                // object as "text" made callers crash with "text.match is not a
                // function" whenever this fallback ran.
                const response = await fetch(url, {
                    method: method,
                    headers: mergedHeaders,
                    body: body
                });
                let cached = null;
                const bodyOf = async function () {
                    if (cached === null) cached = await response.text();
                    return cached;
                };
                return {
                    text: bodyOf,
                    json: async function () { return JSON.parse(await bodyOf()); }
                };
            } catch (error) {
                console.log('soraFetch error: ' + error);
                return null;
            }
        }
    };

    // Cap every HTML/JSON fetch so a black-holed embed server can't stall
    // the whole stream resolution (Promise.all waits for the slowest). Media
    // segments are downloaded by the app, never through soraFetch.
    return await withTimeout(attempt(), 8000);
}

function mergeHeaders(url, opts) {
    const base = opts.headers || {};
    const method = opts.method || 'GET';
    
    // Default headers for all requests
    const defaults = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    // AnimeJara-specific headers
    if (String(url || '').indexOf('animejara.com') !== -1) {
        const isAjaxPost = method === 'POST' && String(url || '').indexOf('/wp-admin/admin-ajax.php') !== -1;
        let referer = 'https://animejara.com/';
        if (isAjaxPost) referer = 'https://animejara.com/catalogo/';
        
        defaults['Accept'] = isAjaxPost ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
        defaults['Accept-Language'] = 'es-ES,es;q=0.9,en-US,en;q=0.8';
        defaults['Referer'] = referer;
        defaults['Origin'] = 'https://animejara.com';
    }
    
    // External embed site headers - add referer if not present
    if (String(url || '').indexOf('animejara.com') === -1 && !base['Referer']) {
        try {
            const urlObj = new URL(url);
            defaults['Referer'] = urlObj.origin + '/';
            defaults['Origin'] = urlObj.origin;
        } catch (e) {
            // Invalid URL, skip
        }
    }

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

