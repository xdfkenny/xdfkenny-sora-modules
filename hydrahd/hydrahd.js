const BASE_URL = 'https://hydrahd.ru';
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
        try {
            const streamUrl = await resolveVidfast(imdbId, isMovie, season, episodeNum);
            if (streamUrl) {
                streams.push({
                    title: 'VidFast',
                    streamUrl: streamUrl,
                    headers: {
                        'Referer': 'https://vidfast.vc/',
                        'Origin': 'https://vidfast.vc',
                    }
                });
                return JSON.stringify({ streams, subtitle: '' });
            }
        } catch (e) {
            // Continue to try other servers
        }
        for (const link of serverLinks) {
            if (link.includes('vidfast') || link.includes('videasy')) {
                const streamUrl = await resolveVidfast(imdbId, isMovie, season, episodeNum);
                if (streamUrl) {
                    streams.push({
                        title: 'VidFast',
                        streamUrl: streamUrl,
                        headers: {
                            'Referer': 'https://vidfast.vc/',
                            'Origin': 'https://vidfast.vc',
                        }
                    });
                    return JSON.stringify({ streams, subtitle: '' });
                }
            }
        }
        for (const link of serverLinks) {
            const resolvedUrl = await resolveGenericLink(link);
            if (resolvedUrl) {
                streams.push({
                    title: getServerTitle(link),
                    streamUrl: resolvedUrl,
                    headers: {}
                });
            }
            if (streams.length >= 3) break;
        }
    } catch (error) {
        console.error('Stream extraction error:', error);
    }
    return JSON.stringify({ streams, subtitle: '' });
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
        const m3u8Match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]/);
        if (m3u8Match) return m3u8Match[0];
        return null;
    } catch (e) {
        return null;
    }
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
                return decStreamData.result.url;
            }
        } catch (e) {
            continue;
        }
    }
    throw new Error('No working stream found');
}
