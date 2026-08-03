const BASE_URL = 'https://hydrahd.ru';
const STREMIO_OPENSUBTITLES_URL = 'https://opensubtitles-v3.strem.io';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function soraFetch(url, options = {}) {
    const headers = options.headers || {};
    if (!headers['User-Agent']) {
        headers['User-Agent'] = USER_AGENT;
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        const opts = options || {};
        opts.headers = headers;
        return await fetch(url, opts);
    }
}

async function searchResults(keyword) {
    try {
        const response = await soraFetch(`${BASE_URL}/index.php?menu=search&query=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        const results = [];
        const figureRegex = /<figure class="figured">[\s\S]*?<\/figure>/g;
        let match;
        while ((match = figureRegex.exec(html)) !== null) {
            const figureHtml = match[0];
            const hrefMatch = figureHtml.match(/href="(\/[^"]+)"/);
            const titleMatch = figureHtml.match(/title="([^"]+)"/);
            const imgMatch = figureHtml.match(/data-src="([^"]+)"/);
            if (hrefMatch && titleMatch) {
                results.push({
                    title: titleMatch[1].trim().replace(/\s+online\s+free$/i, ''),
                    image: imgMatch ? imgMatch[1].trim() : '',
                    href: `${BASE_URL}${hrefMatch[1].trim()}`,
                });
            }
        }
        return JSON.stringify(results);
    } catch (error) {
        console.error('Search error:', error);
        return JSON.stringify([]);
    }
}

function getPageDetails(html) {
    const details = {};
    const titleMatch = html.match(/<h1[^>]*>([^<]+)/);
    details.title = titleMatch ? titleMatch[1].trim() : '';
    const yearMatch = html.match(/Year:<\/b>\s*<span[^>]*>(\d{4})<\/span>/);
    details.airdate = yearMatch ? yearMatch[1] : 'N/A';
    const descMeta = html.match(/<meta name="description" content="([^"]+)"/);
    details.description = descMeta ? descMeta[1] : 'N/A';
    const genres = [];
    const genreRegex = /href="\/genres\/watch-[a-z-]+-movies-online-free"[^>]*>([^<]+)<\/a>/g;
    let genreMatch;
    while ((genreMatch = genreRegex.exec(html)) !== null) {
        genres.push(genreMatch[1].trim());
    }
    details.aliases = genres.join(', ') || 'N/A';
    const ids = { imdb: null, tmdb: null };
    const imdbMatch = html.match(/"i"\s*:\s*"(tt\d+)"/);
    if (imdbMatch) ids.imdb = imdbMatch[1];
    const tmdbMatch = html.match(/"t"\s*:\s*"(\d+)"/);
    if (tmdbMatch) ids.tmdb = tmdbMatch[1];
    return { details, ids };
}

async function extractDetails(url) {
    try {
        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        const { details, ids } = getPageDetails(html);
        const result = [{
            description: details.description || 'N/A',
            aliases: details.aliases || 'N/A',
            airdate: details.airdate || 'N/A',
            imdbId: ids.imdb || '',
            tmdbId: ids.tmdb || '',
        }];
        return JSON.stringify(result);
    } catch (error) {
        console.error('Details error:', error);
        return JSON.stringify([{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
    }
}

async function extractEpisodes(url) {
    try {
        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
        const episodes = [];
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        const epRegex = /<a[^>]*data-slug="([^"]*)"[^>]*data-season="(\d+)"[^>]*data-episode="(\d+)"/g;
        let match;
        while ((match = epRegex.exec(html)) !== null) {
            const episodeSlug = match[1];
            const season = match[2];
            const episode = match[3];
            episodes.push({
                href: `/watchseries/${episodeSlug}-online-free/season/${season}/episode/${episode}`,
                number: parseInt(episode),
            });
        }
        const seen = new Set();
        const uniqueEpisodes = [];
        for (const ep of episodes) {
            if (!seen.has(ep.href)) {
                seen.add(ep.href);
                uniqueEpisodes.push(ep);
            }
        }
        if (uniqueEpisodes.length === 0) {
            uniqueEpisodes.push({ href: fullUrl, number: 1 });
        }
        uniqueEpisodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(uniqueEpisodes);
    } catch (error) {
        console.error('Episodes error:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    const streams = [];
    let subtitle = '';
    try {
        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        const { details, ids } = getPageDetails(html);
        const imdbId = ids.imdb;
        const tmdbId = ids.tmdb;
        if (!imdbId && !tmdbId) {
            throw new Error('No IMDb or TMDB ID found');
        }
        const isMovie = url.includes('/movie/');
        let season = '1';
        let episodeNum = '1';
        let ajaxUrl = '';
        let ajaxParams = {};
        if (isMovie) {
            ajaxUrl = `${BASE_URL}/ajax/mov_0.php`;
            ajaxParams = { i: imdbId, t: tmdbId };
        } else {
            const seasonMatch = url.match(/season\/(\d+)/);
            const episodeMatch = url.match(/episode\/(\d+)/);
            season = seasonMatch ? seasonMatch[1] : '1';
            episodeNum = episodeMatch ? episodeMatch[1] : '1';
            ajaxUrl = `${BASE_URL}/ajax/tv_0.php`;
            ajaxParams = { i: imdbId, t: tmdbId, s: season, e: episodeNum };
        }
        const paramString = Object.keys(ajaxParams).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(ajaxParams[k])).join('&');
        const ajaxResponse = await soraFetch(`${ajaxUrl}?${paramString}`, {
            headers: {
                'Referer': url,
                'X-Requested-With': 'XMLHttpRequest',
            }
        });
        const ajaxHtml = await ajaxResponse.text();
        const serverLinks = [...ajaxHtml.matchAll(/data-link="([^"]+)"/g)].map(m => m[1]);
        for (const link of serverLinks) {
            const resolved = await resolveGenericLink(link);
            if (resolved && resolved.streamUrl) {
                streams.push({
                    title: getServerTitle(link),
                    streamUrl: resolved.streamUrl,
                    headers: {}
                });
                if (!subtitle && resolved.subtitle) subtitle = resolved.subtitle;
                if (streams.length >= 3) break;
            }
        }
        if (streams.length === 0) {
            try {
                const vidfastResult = await resolveVidfast(imdbId, isMovie, season, episodeNum);
                if (vidfastResult && vidfastResult.streamUrl) {
                    streams.push({
                        title: 'VidFast',
                        streamUrl: vidfastResult.streamUrl,
                        headers: {
                            'Referer': 'https://vidfast.vc/',
                            'Origin': 'https://vidfast.vc',
                        }
                    });
                    if (!subtitle && vidfastResult.subtitle) subtitle = vidfastResult.subtitle;
                }
            } catch (e) {
                console.error('VidFast resolution failed:', e.message);
            }
        }
        if (!subtitle && imdbId) {
            subtitle = await resolveStremioSubtitle(imdbId, isMovie ? 'movie' : 'series', season, episodeNum);
        }
    } catch (error) {
        console.error('Stream extraction error:', error);
    }
    const primaryStream = streams.length > 0 ? streams[0].streamUrl : null;
    return JSON.stringify({ stream: primaryStream, streams, subtitle, subtitles: subtitle });
}

function getServerTitle(link) {
    if (link.includes('vidfast') || link.includes('videasy')) return 'VidFast';
    if (link.includes('vidsrc')) return 'VidSrc';
    if (link.includes('vidlink')) return 'VidLink';
    if (link.includes('vidjoy')) return 'VidJoy';
    if (link.includes('moviesapi')) return 'MoviesAPI';
    if (link.includes('primewire')) return 'Primewire';
    if (link.includes('autoembed')) return 'AutoEmbed';
    if (link.includes('kllamrd')) return 'Kllamrd';
    if (link.includes('frembed')) return 'Frembed';
    if (link.includes('hydrahd')) return 'Hydra';
    if (link.includes('hyhd')) return 'Bravo';
    return 'Embed';
}

async function resolveGenericLink(link) {
    try {
        const r = await soraFetch(link, {
            headers: { 'Referer': `${BASE_URL}/`, 'User-Agent': USER_AGENT }
        });
        const text = await r.text();
        const m3u8Match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
        if (!m3u8Match) return null;
        return {
            streamUrl: m3u8Match[0],
            subtitle: extractSubtitleUrl(text, link)
        };
    } catch (e) {
        return null;
    }
}

function extractSubtitleUrl(text, baseUrl) {
    const html = text || '';
    const patterns = [
        /<track[^>]+(?:src|file)=["']([^"']+)["'][^>]*(?:kind=["'](?:captions|subtitles)["']|label=["'][^"']*(?:English|EN|eng)[^"']*["'])/i,
        /<track[^>]+(?:kind=["'](?:captions|subtitles)["']|label=["'][^"']*(?:English|EN|eng)[^"']*["'])[^>]+(?:src|file)=["']([^"']+)["']/i,
        /["'](?:file|src|url)["']\s*:\s*["']([^"']+\.(?:vtt|srt)(?:\?[^"']*)?)["']/i,
        /["'](?:subtitle|subtitles|captions|tracks?)["']\s*:\s*["']([^"']+\.(?:vtt|srt)(?:\?[^"']*)?)["']/i,
        /(https?:\/\/[^\s"'<>]+\.(?:vtt|srt)(?:\?[^\s"'<>]*)?)/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) return normalizeSubtitleUrl(match[1], baseUrl);
    }
    return '';
}

function normalizeSubtitleUrl(url, baseUrl) {
    const clean = decodeHtml(String(url || '').replace(/\\\//g, '/').trim());
    if (!clean) return '';
    try {
        return new URL(clean, baseUrl || BASE_URL).href;
    } catch (e) {
        return clean;
    }
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

function getVidfastSubtitle(result) {
    if (!result) return '';
    const containers = [
        result.subtitles,
        result.subtitle,
        result.captions,
        result.tracks,
        result.sources
    ];

    for (const container of containers) {
        const subtitle = pickSubtitleFromContainer(container);
        if (subtitle) return subtitle;
    }
    return '';
}

async function resolveStremioSubtitle(imdbId, type, season, episode) {
    try {
        const params = [];
        if (type === 'series') {
            if (season) params.push('season=' + encodeURIComponent(String(season)));
            if (episode) params.push('episode=' + encodeURIComponent(String(episode)));
        }
        const query = params.length ? ('?' + params.join('&')) : '';
        const response = await soraFetch(`${STREMIO_OPENSUBTITLES_URL}/subtitles/${type}/${imdbId}.json${query}`, {
            headers: {
                'Accept': 'application/json',
                'Referer': 'https://app.strem.io/'
            }
        });
        if (!response) return '';
        const data = await response.json();
        const subtitles = (data && data.subtitles) || [];
        if (!Array.isArray(subtitles) || subtitles.length === 0) return '';

        const preferred = subtitles.find(isEnglishStremioSubtitle)
            || subtitles.find(item => item && item.url);
        return preferred && preferred.url ? preferred.url : '';
    } catch (e) {
        return '';
    }
}

function isEnglishStremioSubtitle(item) {
    const lang = String((item && item.lang) || '').toLowerCase();
    return lang === 'eng' || lang === 'en' || lang === 'english';
}

function pickSubtitleFromContainer(container) {
    if (!container) return '';
    if (typeof container === 'string') {
        return /\.(?:vtt|srt)(?:\?|$)/i.test(container) ? normalizeSubtitleUrl(container, 'https://vidfast.vc/') : '';
    }
    if (Array.isArray(container)) {
        const preferred = container.find(item => isEnglishSubtitle(item)) || container.find(item => getSubtitleFile(item));
        return preferred ? normalizeSubtitleUrl(getSubtitleFile(preferred), 'https://vidfast.vc/') : '';
    }
    if (typeof container === 'object') {
        if (container.en) return normalizeSubtitleUrl(container.en, 'https://vidfast.vc/');
        if (container.eng) return normalizeSubtitleUrl(container.eng, 'https://vidfast.vc/');
        return normalizeSubtitleUrl(getSubtitleFile(container), 'https://vidfast.vc/');
    }
    return '';
}

function isEnglishSubtitle(item) {
    const label = String((item && (item.label || item.lang || item.language || item.srclang || item.name)) || '').toLowerCase();
    return /^(en|eng|english)$/.test(label) || label.includes('english');
}

function getSubtitleFile(item) {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return item.file || item.url || item.src || item.link || '';
}

async function resolveVidfast(imdbId, isMovie = true, season = null, episode = null) {
    let baseUrl;
    if (isMovie) {
        baseUrl = `https://vidfast.vc/movie/${imdbId}`;
    } else {
        baseUrl = `https://vidfast.vc/tv/${imdbId}/${season}/${episode}`;
    }
    const headers = {
        "Accept": "*/*",
        "User-Agent": USER_AGENT,
        "Referer": baseUrl,
        "X-Requested-With": "XMLHttpRequest"
    };
    const pageResponse = await soraFetch(baseUrl, { headers });
    const pageText = await pageResponse.text();
    let match = pageText.match(/\\"en\\":\\"([^"]+)\\"/) ||
        pageText.match(/"en":"([^"]+)"/) ||
        pageText.match(/["']en["']:\s*["']([^"']+)["']/) ||
        pageText.match(/"en"\\?:"?([^"]+)"?/);
    if (!match) {
        throw new Error('Could not find encrypted data in vidfast page');
    }
    const rawData = match[1];
    const apiUrl = `https://enc-dec.app/api/enc-vidfast?text=${encodeURIComponent(rawData)}&version=1`;
    const apiResponse = await soraFetch(apiUrl, { headers });
    const apiData = await apiResponse.json();
    if (apiData.status !== 200 || !apiData.result) {
        throw new Error('Failed to decrypt data via enc-dec.app API');
    }
    const apiServers = apiData.result.servers;
    const streamBase = apiData.result.stream;
    const csrfToken = apiData.result.token;
    if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
    }
    const serversResponse = await soraFetch(apiServers, { method: 'POST', headers });
    const serversEncrypted = await serversResponse.text();
    const decServersResponse = await soraFetch('https://enc-dec.app/api/dec-vidfast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: serversEncrypted, version: "1" })
    });
    const decServersData = await decServersResponse.json();
    if (decServersData.status !== 200 || !decServersData.result || decServersData.result.length === 0) {
        throw new Error('No servers available or failed to decrypt servers');
    }
    for (const serverObj of decServersData.result) {
        try {
            const server = serverObj.data;
            const apiStream = streamBase + '/' + server;
            const streamResponse = await soraFetch(apiStream, { method: 'POST', headers });
            const streamEncrypted = await streamResponse.text();
            if (!streamEncrypted || streamEncrypted.includes('Attention Required') || streamEncrypted.includes('Cloudflare')) {
                continue;
            }
            const decStreamResponse = await soraFetch('https://enc-dec.app/api/dec-vidfast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: streamEncrypted, version: "1" })
            });
            const decStreamData = await decStreamResponse.json();
            if (decStreamData.status === 200 && decStreamData.result && decStreamData.result.url) {
                return {
                    streamUrl: decStreamData.result.url,
                    subtitle: getVidfastSubtitle(decStreamData.result)
                };
            }
        } catch (e) {
            continue;
        }
    }
    throw new Error('No working stream found');
}
