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
                const validServers = servers.filter(s => s && s.url && s.url.trim() !== '');
                const results = await Promise.all(validServers.map(s => resolveServerToDirectUrl(s.url, s.name)));
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
            // Verify it's actually an m3u8 URL
            if (!cleanM3u8.includes('.m3u8') && !cleanM3u8.includes('.mp4')) return null;
            
            return {
                title: displayName,
                streamUrl: cleanM3u8,
                headers: {
                    "Referer": referer,
                    "Origin": origin,
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
            // Extract hls URLs from links object
            const hlsMatch = linksMatch[0].match(/"hls[234]"\s*:\s*"([^"]+)"/gi);
            if (hlsMatch) {
                // Get the first hls URL (prefer hls2, then hls3, then hls4)
                for (const hls of hlsMatch) {
                    const urlMatch = hls.match(/"hls[234]"\s*:\s*"([^"]+)"/i);
                    if (urlMatch && urlMatch[1]) {
                        const url = urlMatch[1].trim();
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
            }
        }
        
        // Step 3: Look for jwplayer setup with sources
        const jwMatch = html.match(/sources\s*:\s*\[\s*\{[^}]*file\s*:\s*(["'][^"']+["']|links\.\w+)/i);
        if (jwMatch) {
            const fileRef = jwMatch[1].trim();
            let url = '';
            
            if (fileRef.startsWith('links.')) {
                const linkKey = fileRef.replace('links.', '');
                const linkMatch = html.match(new RegExp(`"${linkKey}"\\s*:\\s*"([^"]+)"`));
                if (linkMatch) url = linkMatch[1];
            } else {
                url = fileRef.replace(/["']/g, '');
            }
            
            if (url && (url.includes('.m3u8') || url.includes('.mp4'))) {
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
        if (!embedUrl || embedUrl.trim() === '') return null;
        
        // List of known embed providers we can extract from
        const supportedHosts = [
            'multiplayer.streamhj.top',
            'streamhg', 'hgcloud',
            'vidhide', 'filemoon', 'filelions',
            'streamtape', 'streamtape.com',
            'uqload', 'mp4upload', 'mixdrop',
            'voe', 'netu', 'netuplayer',
            'wolfstream', 'hexupload',
            'fastream', 'upstream',
            'dood', 'doodstream',
            'evoload',
            'ok.ru',
            'mega.nz',
            'burstcloud',
            'embedwish'
        ];
        
        // Check if this is a supported host or contains m3u8 directly
        const isSupported = supportedHosts.some(host => embedUrl.toLowerCase().includes(host));
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
                    // Recursively try to extract from nested iframe
                    const nested = await extractDirectServerFromEmbed(nestedUrl);
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

// Resolve a single selected server (called by the app when the user picks one).
async function resolveSelectedServer(serverUrl) {
    try {
        if (!serverUrl) return null;
        const res = await resolveServerToDirectUrl(serverUrl, '');
        if (!res) return null;
        return JSON.stringify(res);
    } catch (e) {
        console.error('resolveSelectedServer error:', e);
        return null;
    }
}