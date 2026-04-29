const BASE_URL = 'https://animejara.com';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const CATALOG_URL = `${BASE_URL}/catalogo/?q=`;

/* MAIN FUNCTIONS */

async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const catalogResults = await searchFromCatalog(query);
        if (catalogResults.length > 0) return JSON.stringify(catalogResults);

        return JSON.stringify([]);
    } catch (error) {
        console.error('Search error:', error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const html = await response.text();

        const description = extractFirst(
            html,
            /<div class="anime-sinopsis-contenedor"[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
        );
        const airdate = extractFirst(
            html,
            /fa-calendar-alt[\s\S]*?<span>([^<]+)<\/span>/i
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
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const html = await response.text();
        const episodes = [];
        const seen = new Set();
        const regex = /<a[^>]+href="(https:\/\/animejara\.com\/episode\/[^"]+)"[^>]*class="[^"]*episodio-link[^"]*"[\s\S]*?<div[^>]*>\s*(\d+)x(\d+)\s*<\/div>/gi;

        for (const match of html.matchAll(regex)) {
            const href = normalizeUrl(match[1]);
            if (seen.has(href)) continue;
            seen.add(href);

            const season = parseInt(match[2], 10);
            const episode = parseInt(match[3], 10);

            episodes.push({
                href,
                number: `S${season}E${episode}`,
                season,
                episode
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
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const html = await response.text();
        const iframe = extractFirst(
            html,
            /<iframe[^>]+id="iframe-video"[^>]+src="([^"]+)"/i
        ) || extractFirst(
            html,
            /<div[^>]+id="reproductor-wrapper"[\s\S]*?<iframe[^>]+src="([^"]+)"/i
        );

        if (iframe) {
            const iframeUrl = decodeHtml(iframe).trim();
            const directFromEmbed = await extractDirectServerFromEmbed(iframeUrl);
            if (directFromEmbed) return { stream: directFromEmbed };
            return { stream: iframeUrl };
        }

        const m3u8 = extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8) return { stream: decodeHtml(m3u8).trim() };

        return { stream: null };
    } catch (error) {
        console.error('Stream error:', error);
        return { stream: null };
    }
}

/* HELPERS */

async function searchFromAjax(keyword) {
    try {
        const body = `action=live_search&s=${encodeURIComponent(keyword)}`;

        const response = await fetch(AJAX_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body
        });

        if (!response.ok) return [];
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
        const response = await fetch(`${CATALOG_URL}${encodeURIComponent(keyword)}`);
        if (!response.ok) return [];
        const html = await response.text();

        const results = [];
        const seen = new Set();
        const cardRegex = /<a[^>]*anime-card[^>]*>[\s\S]*?<\/a>/gi;
        let cardMatch;
        while ((cardMatch = cardRegex.exec(html)) !== null) {
            const cardHtml = cardMatch[0];
            const href = normalizeUrl(extractFirst(cardHtml, /href=(?:"|')(.*?)(?:"|')/i));
            if (!href || !/\/(anime|movie)\//i.test(href) || seen.has(href)) continue;

            let title = cleanText(extractFirst(cardHtml, /<h3[^>]*card-title[^>]*>([\s\S]*?)<\/h3>/i));
            let image = decodeHtml(extractFirst(cardHtml, /<img[^>]*card-poster[^>]*src=(?:"|')(.*?)(?:"|')/i)).trim();

            if (!title || !image) {
                const dataAnimeEncoded = extractFirst(cardHtml, /data-anime=(?:"|')(.*?)(?:"|')/i);
                const dataAnime = decodeHtml(dataAnimeEncoded);
                if (!title) title = cleanText(extractFirst(dataAnime, /"titulo"\s*:\s*"([^"]+)"/i));
                if (!image) image = decodeHtml(extractFirst(dataAnime, /"poster"\s*:\s*"([^"]+)"/i)).replace(/\\\//g, '/').trim();
            }

            if (!title || !image) continue;
            seen.add(href);
            results.push({ title, image, href });
        }

        return results;
    } catch (error) {
        console.error('Catalog search error:', error);
        return [];
    }
}

async function extractDirectServerFromEmbed(embedUrl) {
    try {
        if (!/multiplayer\.streamhj\.top/i.test(embedUrl)) return null;

        const response = await fetch(embedUrl);
        if (!response.ok) return null;
        const html = await response.text();

        const servers = [];
        const regex = /<li[^>]*onclick="[^"]*playVideo\(&quot;\s*([^"&]+(?:&amp;[^"&]*)*)&quot;\)[^"]*"[\s\S]*?<span[^>]*class="nombre-server"[^>]*>([^<]+)<\/span>/gi;
        for (const match of html.matchAll(regex)) {
            servers.push({
                url: normalizeExternalUrl(match[1]),
                name: cleanText(match[2]).toLowerCase()
            });
        }

        if (servers.length === 0) {
            const fallbackRegex = /playVideo\(['"]\s*(https?:\/\/[^'"]+)['"]\)/gi;
            for (const match of html.matchAll(fallbackRegex)) {
                servers.push({ url: normalizeExternalUrl(match[1]), name: '' });
            }
        }

        const preferred = pickPreferredServer(servers);
        return preferred || null;
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