const BASE_URL = 'https://anidb.app';
const BROWSE_URL = `${BASE_URL}/browse?q=`;
const SUGGEST_URL = `${BASE_URL}/search/suggestions?q=`;
const EPISODES_API = `${BASE_URL}/api/frontend/anime/%s/episodes`;
const LANGUAGES_API = `${BASE_URL}/api/frontend/episode/%s/languages`;

/* MAIN FUNCTIONS */

/**
 * Searches anidb.app for anime titles matching the given keyword.
 * Returns a JSON string array of {title, image, href} objects.
 */
async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const browseSrc = await fetchText(`${BROWSE_URL}${encodeURIComponent(query)}`);
        const fromBrowse = parseBrowseCards(browseSrc);
        if (fromBrowse.length > 0) return JSON.stringify(fromBrowse);

        const suggestSrc = await fetchText(`${SUGGEST_URL}${encodeURIComponent(query)}`);
        const fromSuggest = parseBrowseCards(suggestSrc);
        if (fromSuggest.length > 0) return JSON.stringify(fromSuggest);

        return JSON.stringify([]);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Fetches the anime watch page and extracts description, airdate and alternative titles.
 * @param {string} url - The anidb.app anime page URL.
 * @returns {string} JSON array with a single {description, airdate, aliases} object.
 */
async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        if (!response) return JSON.stringify([detailsFallback()]);
        const html = await response.text();

        const description = extractFirst(html, /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
            || extractFirst(html, /<meta[^>]*name="description"[^>]*content="([^"]+)"/i)
            || extractFirst(html, /<p\s+class="[^"]*(?:leading-relaxed|description|plot|summary)[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
            || extractFirst(html, /<div\s+class="[^"]*(?:description|plot|summary|synopsis)[^"]*">([\s\S]*?)<\/div>/i)
            || 'No description available';

        const airdate = extractDt(html, 'Aired')
            || extractDt(html, 'Season')
            || extractDt(html, 'Released')
            || extractFirst(html, /<div class="text-sm"><dt[^>]*name="(?:Year|Airdate|Date)"[^>]*>([^<]+)<\/dt>/i)
            || 'Unknown';

        const aliases = extractDt(html, 'Synonyms')
            || extractDt(html, 'Alternative')
            || extractDt(html, 'Titles')
            || 'No alternative titles';

        return JSON.stringify([{
            description: cleanText(description),
            airdate: cleanText(airdate),
            aliases: cleanText(aliases)
        }]);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([detailsFallback()]);
    }
}

function detailsFallback() {
    return {
        description: 'No description available',
        airdate: 'Unknown',
        aliases: 'No alternative titles'
    };
}

/**
 * Extracts the list of episodes for an anime using the public JSON API.
 * The anime numeric ID is read from the tail of the passed URL.
 * @param {string} url - The anidb.app anime page URL (e.g. https://anidb.app/anime/frieren-beyond-journeys-end-1663).
 * @returns {string} JSON string array of {href, number} objects.
 */
async function extractEpisodes(url) {
    try {
        const animeId = parseAnimeId(url);
        if (!animeId) return JSON.stringify([]);

        const response = await soraFetch(EPISODES_API.replace('%s', animeId));
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const rawEpisodes = (data && (Array.isArray(data.episodes) ? data.episodes : Array.isArray(data.data) ? data.data : Array.isArray(data.list) ? data.list : [])) || [];
        if (!Array.isArray(rawEpisodes)) return JSON.stringify([]);

        const episodes = rawEpisodes
            .map((ep, index) => {
                const number = ep.number !== undefined ? parseInt(ep.number, 10) : index + 1;
                const epId = ep.id || ep.episode_id || ep.episodeId;
                if (isNaN(number) || !epId) return null;
                return {
                    href: `${BASE_URL}/episode/${epId}`,
                    number: number
                };
            })
            .filter(Boolean);

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Resolves an anime episode to its playable HLS stream(s).
 * The embed page exposes a JWPlayer config with a "file" master playlist.
 * @param {string} url - The episode href emitted by extractEpisodes (https://anidb.app/episode/{id}).
 * @returns {string} JSON object {streams:[{title, streamUrl, headers}], subtitle}.
 */
async function extractStreamUrl(url) {
    const fallback = JSON.stringify({ streams: [], subtitle: '' });
    try {
        const episodeMatch = String(url || '').match(/\/episode\/(\d+)/);
        if (!episodeMatch) return fallback;

        const epId = episodeMatch[1];
        const response = await soraFetch(LANGUAGES_API.replace('%s', epId));
        if (!response) return fallback;
        const data = await response.json();

        const rawLangs = (data && (Array.isArray(data.languages) ? data.languages : Array.isArray(data.data) ? data.data : Array.isArray(data.streams) ? data.streams : [])) || [];
        if (!Array.isArray(rawLangs)) return fallback;

        const languages = rawLangs
            .map((lang) => ({
                code: (lang.code || lang.language || '').toLowerCase(),
                name: lang.name || lang.label,
                embed_url: lang.embed_url || lang.url || lang.file
            }))
            .filter((l) => l.code && l.embed_url);

        const streams = [];
        const seenLang = new Set();

        // Resolve each language embed to its master playlist.
        // Prefer SUB (jpn) first, then DUB (eng), keeping every language as a
        // selectable stream in Sora's server picker.
        const preferred = languages.slice().sort((a, b) => {
            const ord = { jpn: 0, eng: 1, 'es': 2, 'pt-br': 3 };
            return (ord[a.code] ?? 9) - (ord[b.code] ?? 9);
        });

        const resolved = await Promise.all(preferred.map(async (lang) => {
            try {
                const master = await resolveEmbedMaster(lang.embed_url);
                if (!master) return null;
                return {
                    title: prettifyLangLabel(lang),
                    streamUrl: master,
                    headers: makeStreamHeaders(),
                    language: lang.code
                };
            } catch (e) {
                console.log('Embed resolve error: ' + (lang.code || lang.name) + ' -> ' + e);
                return null;
            }
        }));

        resolved.forEach((s) => {
            if (!s || !s.streamUrl) return;
            const key = s.language || s.streamUrl;
            if (seenLang.has(key)) return;
            seenLang.add(key);
            streams.push(s);
        });

        return JSON.stringify({ streams: streams, subtitle: '' });
    } catch (error) {
        console.log('Stream error: ' + error);
        return fallback;
    }
}

/* HELPERS */

// Resolve an anidb.app/embed/<token> page to its HLS master playlist URL.
async function resolveEmbedMaster(embedUrl) {
    if (!embedUrl) return null;

    // If the embed URL already points at media (m3u8), return as-is.
    if (/\.m3u8/i.test(embedUrl)) return embedUrl;

    const response = await soraFetch(embedUrl);
    if (!response) return null;
    const html = await response.text();

    const master = extractFirst(html, /sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
        || extractFirst(html, /file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'']*)['"]/i)
        || extractFirst(html, /'(https?:\/\/[^']+\.m3u8(?:[^']*))'/i)
        || extractFirst(html, /["']file["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i)
        || extractFirst(html, /playlist\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
        || extractFirst(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);

    return master ? decodeHtml(master) : null;
}

function prettifyLangLabel(lang) {
    const map = {
        jpn: 'Japanese (SUB)',
        eng: 'English (DUB)',
        'ch-s': 'Chinese (SUB)',
        'pt-br': 'Portuguese (SUB)',
        'es': 'Spanish (SUB)'
    };
    if (map[lang.code]) return map[lang.code];
    if (lang.name) return lang.name;
    return (lang.code || 'Unknown').toUpperCase();
}

function parseBrowseCards(html) {
    const results = [];
    const seen = new Set();

    // Multiple resilient regex patterns to support DOM/class changes.
    const regexes = [
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[^>]*class="[^"]*anime-card[^"]*"[^>]*title="([^"]*)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<\/a>/gi,
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<\/a>/gi,
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<\/a>/gi,
        /<a[^>]*href="(https?:\/\/anidb\.app\/anime\/[^"]+)"[\s\S]*?<\/a>/gi
    ];

    for (const rx of regexes) {
        let cardMatch;
        while ((cardMatch = rx.exec(html)) !== null) {
            const href = cardMatch[1];
            let title = cleanText(cardMatch[2] || cardMatch[3] || '');
            let image = decodeHtml(cardMatch[3] || cardMatch[2] || '').trim();

            // Handle the image/title capture swap in some patterns.
            if (image && !image.startsWith('http') && title && title.startsWith('http')) {
                const temp = title;
                title = image;
                image = temp;
            }

            if (!title) {
                const slugMatch = href.match(/\/([^/]+)$/);
                title = slugMatch ? slugMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ') : 'Unknown Anime';
            }

            if (!href || seen.has(href)) continue;
            seen.add(href);
            results.push({
                title: cleanText(title),
                image: image.startsWith('http') ? image : '',
                href
            });
        }
        if (results.length > 0) break;
    }

    return results;
}

// anidb.app anime URLs are /anime/<slug>-<numericId>. Return the numeric id.
function parseAnimeId(url) {
    const m = String(url || '').match(/\/anime\/[^/]+-(\d+)\/?$/i);
    if (m && m[1]) return m[1];
    const fallback = String(url || '').match(/-(\d+)\/?$/);
    return fallback ? fallback[1] : '';
}

// Helper to grab the <dd> value following a <dt> with the given label
// inside the "Details" <dl> block, with fallback patterns.
function extractDt(html, label) {
    const re = new RegExp(`<dt[^>]*>[^<]*${label}[^<]*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`, 'i');
    const m = (html || '').match(re);
    if (m && m[1]) return cleanText(m[1]);

    const altRe = new RegExp(`(?:<dt[^>]*>|<span[^>]*>)\\s*${label}\\s*(?:<\\/dt>|<\\/span>)\\s*(?:<dd[^>]*>|<span[^>]*>)([\\s\\S]*?)(?:<\\/dd>|<\\/span>)`, 'i');
    const altM = (html || '').match(altRe);
    if (altM && altM[1]) return cleanText(altM[1]);

    return '';
}

function extractFirst(text, regex) {
    const match = (text || '').match(regex);
    return match ? match[1] : '';
}

function decodeHtml(text) {
    return String(text || '')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&#038;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
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

// Stream headers that match the anidb.app playback origin.
function makeStreamHeaders() {
    return {
        "Referer": BASE_URL + '/',
        "Origin": BASE_URL,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    };
}

async function soraFetch(url, options) {
    const opts = options || {};
    const mergedHeaders = mergeHeaders(url, opts);
    const method = opts.method || 'GET';
    const body = typeof opts.body === 'undefined' ? null : opts.body;

    try {
        return await fetchv2(url, mergedHeaders, method, body);
    } catch (e) {
        try {
            const text = await fetch(url, {
                method: method,
                headers: mergedHeaders,
                body: body
            });
            return {
                text: async () => text,
                json: async () => JSON.parse(text)
            };
        } catch (error) {
            console.log('soraFetch error: ' + error);
            return null;
        }
    }
}

async function fetchText(url) {
    const response = await soraFetch(url);
    if (!response) return '';
    return await response.text();
}

function mergeHeaders(url, opts) {
    const base = opts.headers || {};
    const defaults = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };

    const host = String(url || '').replace(/^https?:\/\//, '').split('/')[0] || '';
    if (/anidb\.app|hls\.anidb\.app/i.test(host)) {
        defaults['Accept'] = '*/*';
        defaults['Accept-Language'] = 'en-US,en;q=0.9';
        defaults['Referer'] = BASE_URL + '/';
        defaults['Origin'] = BASE_URL;
    }

    const out = {};
    let k;
    for (k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    return out;
}
