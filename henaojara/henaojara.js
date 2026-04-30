var DEBUG = false;
var BASE_URL = 'https://animejara.com';
var AJAX_URL = BASE_URL + '/wp-admin/admin-ajax.php';
var CATALOG_URL = BASE_URL + '/catalogo/?q=';
var SEARCH_URL = BASE_URL + '/?s=';
var FETCH_TIMEOUT = 15000;

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
        if (DEBUG) console.error('Search error:', error);
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
        if (DEBUG) console.error('Details error:', error);
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
        let slug = slugMatch ? slugMatch[1] : '';
        if (!slug) {
            const urlMatch = url.match(/\/(anime|movie)\/([^\/]+)/);
            if (urlMatch) slug = urlMatch[2];
        }

        // Extract TEMPORADAS_DATA - Robust extraction
        const dataJson = balancedJsonExtract(html, 'TEMPORADAS_DATA');
        if (dataJson) {
            try {
                const seasons = JSON.parse(dataJson);
                seasons.forEach((season) => {
                    const numTemp = season.numero_temporada;
                    const items = season.episodios || [];
                    items.forEach((ep) => {
                        const numEp = ep.numero_episodio;
                        // URL pattern: https://animejara.com/episode/${slug}-${numTemp}x${numEp}/
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
                if (DEBUG) console.error('Error parsing TEMPORADAS_DATA:', jsonError);
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
        if (DEBUG) console.error('Episodes error:', error);
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

        // Parse the embed URLs from the enlaces array (handles escaped slashes \/).
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

        if (embedUrls.length > 0) {
            let globalDownloadUrl = null;

            // Parallel embed resolution with batching to avoid timeouts
            const embedResults = await Promise.all(embedUrls.map(async (embedUrl, i) => {
                const rawLang = langNames[i] || ('Lang ' + (i + 1));
                const langMap = { 'LATINO': 'LAT', 'JAPONES': 'JAP', 'CASTELLANO': 'CAS', 'ENGLISH': 'ENG', 'INGLES': 'ENG' };
                const langLabel = langMap[rawLang.toUpperCase()] || rawLang;

                const embedResult = await extractDirectServerFromEmbed(embedUrl);
                if (!embedResult) return [];

                if (embedResult.downloadUrl && !globalDownloadUrl) {
                    globalDownloadUrl = embedResult.downloadUrl;
                }

                if (embedResult.servers && embedResult.servers.length > 0) {
                    const serverPromises = embedResult.servers.map(async (server) => {
                        const result = await resolveServerToDirectUrl(server.url, server.name);
                        if (result) {
                            return {
                                title: langLabel + ' · ' + result.title,
                                url: result.streamUrl,
                                streamUrl: result.streamUrl,
                                headers: result.headers
                            };
                        }
                        return null;
                    });
                    return await Promise.all(serverPromises);
                }
                return [];
            }));

            var allStreams = [];
            embedResults.forEach(function(results) {
                if (Array.isArray(results)) {
                    results.forEach(function(rs) {
                        if (rs) allStreams.push(rs);
                    });
                }
            });

            if (allStreams.length > 0) {
                const payload = { streams: allStreams, subtitles: null };
                if (globalDownloadUrl) {
                    const directDownload = await extractRealDownloadUrl(globalDownloadUrl);
                    if (directDownload) payload.downloadUrl = directDownload;
                }
                return JSON.stringify(payload);
            }

            // Fallback for no resolved streams but embeds found
            return JSON.stringify({
                streams: [{ title: 'Embed Fallback', url: embedUrls[0], streamUrl: embedUrls[0] }],
                subtitles: null
            });
        }

        const iframe = extractFirst(
            html,
            /<iframe[^>]+id="iframe-video"[^>]+src="([^"]+)"/i
        ) || extractFirst(
            html,
            /<div[^>]+id="reproductor-wrapper"[\s\S]*?<iframe[^>]+src="([^"]+)"/i
        );

        if (iframe) {
            const iframeUrl = decodeHtml(iframe).trim();
            const embedResult = await extractDirectServerFromEmbed(iframeUrl);

            if (embedResult && embedResult.servers && Array.isArray(embedResult.servers) && embedResult.servers.length > 0) {
                const serverPromises = embedResult.servers.map(async (server) => {
                    const result = await resolveServerToDirectUrl(server.url, server.name);
                    if (result) {
                        return {
                            title: result.title,
                            url: result.streamUrl,
                            streamUrl: result.streamUrl,
                            headers: result.headers
                        };
                    }
                    return null;
                });

                const streams = (await Promise.all(serverPromises)).filter(Boolean);

                if (streams.length > 0) {
                    const payload = { streams: streams, subtitles: null };
                    if (embedResult.downloadUrl) {
                        const directDownload = await extractRealDownloadUrl(embedResult.downloadUrl);
                        if (directDownload) payload.downloadUrl = directDownload;
                    }
                    return JSON.stringify(payload);
                }
            }

            return JSON.stringify({
                streams: [{ title: 'Direct Iframe', url: iframeUrl, streamUrl: iframeUrl }],
                subtitles: null
            });
        }

        const m3u8 = extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8) {
            const cleanM3u8 = decodeHtml(m3u8).trim();
            return JSON.stringify({
                streams: [{ title: 'Direct M3U8', url: cleanM3u8, streamUrl: cleanM3u8 }],
                subtitles: null
            });
        }

        return JSON.stringify({ streams: [], subtitles: null });
    } catch (error) {
        if (DEBUG) console.error('Stream error:', error);
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
        const displayName = prettifyServerName(serverName, serverUrl);

        // Skip servers that don't serve standard HLS
        if (/streamtape\.com/i.test(serverUrl)) return null;  // anti-hotlink
        if (/netuplayer\.top|netu\./i.test(serverUrl)) return null;  // non-standard

        // Get the origin/referer from the embed URL
        const urlObj = serverUrl.match(/^(https?:\/\/[^\/]+)/);
        const referer = urlObj ? urlObj[1] + '/' : '';

        const resp = await soraFetch(serverUrl);
        if (!resp) return null;
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

        return null;
    } catch (e) {
        return null;
    }
}

async function extractRealDownloadUrl(downloadPageUrl) {
    try {

        var idAnime = '';
        var idCapitulo = null;
        var idMatch = downloadPageUrl.match(/idanime=([^&]+)/i);
        if (idMatch) idAnime = idMatch[1];
        var capMatch = downloadPageUrl.match(/idcapitulo=(\d+)/i);
        if (capMatch) idCapitulo = parseInt(capMatch[1], 10);

        if (!idAnime || isNaN(idCapitulo)) return null;

        const tokenUrl = `https://descargas.henaojara.com/player/multiplayer/apimultiplayer/generar_token_descarga.php?idanime=${encodeURIComponent(idAnime)}`;
        const tokenResp = await soraFetch(tokenUrl, { headers: { "Referer": downloadPageUrl } });
        if (!tokenResp || !tokenResp.ok) return null;
        const tokenData = await tokenResp.json();

        if (!tokenData || !tokenData.token) return null;

        const apiUrl = `https://descargas.henaojara.com/player/multiplayer/apimultiplayer/api.php?token=${encodeURIComponent(tokenData.token)}`;
        const apiResp = await soraFetch(apiUrl, { headers: { "Referer": downloadPageUrl } });
        if (!apiResp || !apiResp.ok) return null;
        const chaptersData = await apiResp.json();

        if (!Array.isArray(chaptersData)) return null;

        let targetChapter = null;
        for (const chap of chaptersData) {
            let num = null;
            if (chap.id_capitulo !== undefined && chap.id_capitulo !== null) {
                num = parseInt(chap.id_capitulo, 10);
            }
            if (num === null && chap.nombre) {
                const match = chap.nombre.match(/[Cc]ap[íi]tulo\s+(\d+)|[Cc]ap\s+(\d+)|[Ee]p[íi]sodio\s+(\d+)|\b(\d+)\.?$/);
                if (match) {
                    for (let i = 1; i < match.length; i++) {
                        if (match[i]) {
                            num = parseInt(match[i], 10);
                            break;
                        }
                    }
                }
                if (num === null) {
                    const firstNum = chap.nombre.match(/\d+/);
                    if (firstNum) num = parseInt(firstNum[0], 10);
                }
            }
            if (num === idCapitulo) {
                targetChapter = chap;
                break;
            }
        }

        if (!targetChapter) return null;

        const ordenServidores = ['mediafire', 'filemoon', 'vidhide', 'streamtape', 'mp4upload', 'mega', 'mixdrop', 'voe'];
        for (const server of ordenServidores) {
            if (targetChapter[server]) {
                return ajustarEnlace(server, targetChapter[server]);
            }
        }

        return null;
    } catch (e) {
        if (DEBUG) console.error("Download extraction error", e);
        return null;
    }
}

function ajustarEnlace(servidor, enlace) {
    if (!enlace) return '';
    let link = enlace;

    const mapping = [
        { from: /https:\/\/(flaswish|obeywish|embedwish|flastwish|cdnwish|asnwish|jodwish|swhoi|swdyu|strwish|playerwish|hlswish|swishsrv|iplayerhls|ghbrisk)\.com\/e\//, to: 'https://swhoi.com/f/' },
        { from: 'https://streamwish.to/e/', to: 'https://swhoi.com/f/' },
        { from: 'https://streamwish.top/e/', to: 'https://swhoi.com/f/' },
        { from: 'https://wishonly.site/e/', to: 'https://swhoi.com/f/' },
        { from: /https:\/\/(filelions\.site|vidhidepro\.com|vidhidevip\.com|vidhidepre\.com|filelions\.top|vidhideplus\.com|vidhidehub\.com|dhtpre\.com|ryderjet\.com)\/v\//, to: 'https://filelions.top/d/' },
        { from: /https:\/\/(filemoon\.sx|filemooon\.top|filemoon\.to|embedmoon\.xyz|embedmoon\.pro|embedme\.xyz|moonembed\.xyz|bysekoze\.com)\/e\//, to: 'https://bysekoze.com/d/' },
        { from: 'https://streamtape.com/e/', to: 'https://streamtape.com/v/' },
        { from: 'https://www.mp4upload.com/embed-', to: 'https://www.mp4upload.com/' },
        { from: 'https://streamvid.net/embed-', to: 'https://streamvid.net/' },
        { from: 'https://mixdrop.to/e/', to: 'https://mixdrop.to/f/' },
        { from: 'https://mega.nz/embed#', to: 'https://mega.nz/' },
        { from: 'https://mega.nz/embed', to: 'https://mega.nz/file' },
        { from: /https:\/\/(mixdropjmk\.pw|mixdrop\.nu|mixdrop\.is)\/e\//, to: 'https://mixdropjmk.pw/f/' },
        { from: /https:\/\/(luluvdo|lulu)\.(com|st)\/e\//, to: 'https://luluvdo.com/d/' },
        { from: 'https://voe.sx/e/', to: 'https://voe.sx/' },
        { from: 'https://www.yourupload.com/embed/', to: 'https://www.yourupload.com/watch/' },
        { from: 'https://mxdrop.to/e/', to: 'https://mxdrop.to/f/' },
        { from: 'https://vip.henaojara.com/player/multiplayer/hls/jwplayer.php', to: 'https://vip.henaojara.com/player/multiplayer/hls/descarga.php' },
        { from: 'https://nyuu.henaojara.com/player/vip/go.php', to: 'https://nyuu.streamhj.top/player/multiplayer/hls/download-nyuu.php' },
        { from: 'https://savefiles.top/e/', to: 'https://savefiles.top/' }
    ];

    mapping.forEach(m => {
        link = link.replace(m.from, m.to);
    });

    return link;
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
        if (DEBUG) console.error('AJAX search error:', error);
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
        // Broaden the check to avoid missing other multiplayer domains or directly returning null
        if (!/multiplayer|streamhj|reproductor|animejara/i.test(embedUrl)) {
            // It might be a direct embed URL like mega, mp4upload, etc.
            // We just return null so it falls back to the direct URL in extractStreamUrl.
            return null;
        }

        const response = await soraFetch(embedUrl);
        if (!response) return null;
        const html = await response.text();

        let downloadUrl = null;
        const dlMatch = html.match(/window\.open\(\s*['"](https?:\/\/descargas[^'"]+)['"]/i);
        if (dlMatch) downloadUrl = dlMatch[1];

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

        return {
            servers: (servers.length > 0) ? servers : null,
            downloadUrl: downloadUrl
        };
    } catch (error) {
        console.error('Embed server extraction error:', error);
        return null;
    }
}

function buildAnimeHref(slug, tipo) {
    if (!slug) return '';
    var section = (tipo || '').toLowerCase().indexOf('pelicula') !== -1 ? 'movie' : 'anime';
    return BASE_URL + '/' + section + '/' + slug + '/';
}

function extractAliases(html, description) {
    var fromDescription = (description || '').split(/<br\s*\/?>/i).map(function(line) { return cleanText(line); }).filter(Boolean);
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

/**
 * Extracts a balanced JSON array or object starting from a given keyword.
 * Handles nested brackets/braces to avoid premature termination.
 */
function balancedJsonExtract(html, keyword) {
    const startIdx = html.indexOf(keyword);
    if (startIdx === -1) return null;

    const afterKeyword = html.substring(startIdx + keyword.length);
    const firstBracket = afterKeyword.match(/[\[\{]/);
    if (!firstBracket) return null;

    const opener = firstBracket[0];
    const closer = opener === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escape = false;
    const jsonStart = afterKeyword.indexOf(opener);

    for (let i = jsonStart; i < afterKeyword.length; i++) {
        const char = afterKeyword[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === opener) depth++;
            else if (char === closer) {
                depth--;
                if (depth === 0) {
                    return afterKeyword.substring(jsonStart, i + 1);
                }
            }
        }
    }
    return null;
}

function decodeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&amp;/g, '&')
        .replace(/&#038;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code, 10)); })
        .replace(/&#x([0-9a-f]+);/gi, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
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

    const fetchPromise = (async () => {
        try {
            return await fetchv2(url, mergedHeaders, method, body);
        } catch (e) {
            return await fetch(url, {
                method: method,
                headers: mergedHeaders,
                body: body
            });
        }
    })();

    var timeoutPromise = new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('Timeout fetching ' + url)); }, FETCH_TIMEOUT);
    });

    try {
        var response = await Promise.race([fetchPromise, timeoutPromise]);
        if (response && typeof response.ok !== 'undefined' && !response.ok) {
            if (DEBUG) console.error('HTTP error! status: ' + response.status + ' for ' + url);
        }
        return response;
    } catch (error) {
        if (DEBUG) console.error('Fetch error for ' + url + ':', error);
        return null;
    }
}

function mergeHeaders(url, opts) {
    const base = opts.headers || {};
    const urlStr = String(url || '');
    
    var method = opts.method || 'GET';
    var isAjaxPost = method === 'POST' && urlStr.indexOf('/wp-admin/admin-ajax.php') !== -1;
    var referer = BASE_URL + '/';
    if (isAjaxPost) referer = CATALOG_URL;

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

function Unbaser(base) {
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
        this.unbase = function(value) { return parseInt(value, base); };
    } else {
        try {
            var alpha = this.ALPHABET[base];
            for (var i = 0; i < alpha.length; i++) {
                this.dictionary[alpha[i]] = i;
            }
        } catch (er) {
            throw Error("Unsupported base encoding.");
        }
        this.unbase = this._dictunbaser;
    }
}
Unbaser.prototype._dictunbaser = function(value) {
    var ret = 0;
    var reversed = value.split('').reverse();
    for (var i = 0; i < reversed.length; i++) {
        ret = ret + ((Math.pow(this.base, i)) * this.dictionary[reversed[i]]);
    }
    return ret;
};

function detect(source) {
    return source.replace(" ", "").indexOf("eval(function(p,a,c,k,e,") === 0;
}

function unpack(source) {
    function _filterargs(source) {
        var juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'.split\('\|'\)/,
        ];
        for (var i = 0; i < juicers.length; i++) {
            var args = juicers[i].exec(source);
            if (args) {
                try {
                    return {
                        payload: args[1],
                        symtab: args[4].split("|"),
                        radix: parseInt(args[2]),
                        count: parseInt(args[3]),
                    };
                } catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }

    function _replacestrings(source) {
        return source.replace(/\\'/g, "'").replace(/\\"/g, '"');
    }

    var args = _filterargs(source);
    var payload = args.payload;
    var symtab = args.symtab;
    var radix = args.radix;
    var count = args.count;

    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    var unbase;
    try {
        unbase = new Unbaser(radix);
    } catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        var word = match;
        var word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        } else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    var unpacked = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(unpacked);
}