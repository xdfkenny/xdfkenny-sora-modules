const KISSASIAN_BASE = 'https://kissasian.su';
const KISSASIAN_SEARCH = 'https://kissasian.su/search/';

/* MAIN FUNCTIONS */

/**
 * Searches kissasian.su for drama titles matching the given keyword.
 * Returns a JSON string array of {title, image, href} objects.
 */
async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const url = `${KISSASIAN_SEARCH}${encodeURIComponent(query)}`;
        const response = await soraFetch(url);
        if (!response) return JSON.stringify([]);

        const html = await response.text();
        const results = parseSearchResults(html);

        if (results.length === 0) return JSON.stringify([]);

        return JSON.stringify(results);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Parses the search results HTML and extracts drama cards.
 * @param {string} html - The HTML content from the search page.
 * @returns {Array} Array of {title, image, href} objects.
 */
function parseSearchResults(html) {
    const results = [];
    const seen = new Set();

    // Pattern: drama card links with title and image
    const regex = /<a[^>]*class="[^"]*[Ee]pisode[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>\s*<h3[^>]*>([^<]+)<\/h3>/gi;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const image = match[1];
        let title = cleanText(match[2]);

        // Skip if no title or already seen
        if (!title || seen.has(title)) continue;
        seen.add(title);

        // Extract href from the anchor tag context
        const contextStart = html.lastIndexOf('<a', match.index);
        if (contextStart < 0) continue;
        const context = html.substring(contextStart, match.index + 100);
        const hrefMatch = context.match(/href="([^"]+)"/);
        const href = hrefMatch ? hrefMatch[1] : '';

        if (!href) continue;
        const absoluteHref = href.startsWith('http') ? href : `${KISSASIAN_BASE}${href}`;

        results.push({
            title: title,
            image: image.startsWith('http') ? image : '',
            href: absoluteHref
        });
    }

    return results;
}

/**
 * Fetches the drama detail page and extracts metadata.
 * @param {string} url - The drama detail page URL.
 * @returns {string} JSON array with a single {description, airdate, aliases} object.
 */
async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        if (!response) return JSON.stringify([detailsFallback()]);

        const html = await response.text();
        const info = parseDramaDetails(html);

        if (!info) return JSON.stringify([detailsFallback()]);

        return JSON.stringify([{
            description: cleanText(info.description) || 'No description available',
            airdate: cleanText(info.airdate) || 'Unknown',
            aliases: cleanText(info.aliases) || 'N/A'
        }]);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([detailsFallback()]);
    }
}

/**
 * Parses the drama detail page HTML to extract description, airdate and aliases.
 * @param {string} html - The HTML content of the drama page.
 * @returns {Object} Parsed drama info or null.
 */
function parseDramaDetails(html) {
    // Try to extract description from meta tags or common patterns
    const description = extractFirst(html, /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
        || extractFirst(html, /<meta[^>]*name="description"[^>]*content="([^"]+)"/i)
        || extractFirst(html, /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || extractFirst(html, /<span[^>]*class="[^"]*[Dd]esc[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
        || '';

    const airdate = extractFirst(html, /<span[^>]*>[^<]*?(?:Aired|Release|Date)[^<]*<\/span>[^<]*<[^>]*>([^<]+)<\/[^>]*>/i)
        || extractFirst(html, /<div[^>]*class="[^"]*[Aa]ir[^"]*"[^>]*>([^<]+)<\/div>/i)
        || extractFirst(html, /<p[^>]*>([^<]*(?:20[0-9]{2}|[0-9]{4})[^<]*)<\/p>/i)
        || '';

    // Extract aliases/alternative titles
    const aliases = extractFirst(html, /<span[^>]*>[^<]*?(?:Alias|Also Known|Alternative)[^<]*<\/span>[^<]*<[^>]*>([^<]+)<\/[^>]*>/i)
        || extractFirst(html, /<a[^>]*rel="[^"]*alternate[^"]*"[^>]*>([^<]+)<\/a>/i)
        || '';

    return { description, airdate, aliases };
}

/**
 * Extracts the list of episodes for a given drama.
 * @param {string} url - The drama detail page URL.
 * @returns {string} JSON string array of {href, number} objects.
 */
async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        if (!response) return JSON.stringify([]);

        const html = await response.text();
        const episodes = parseEpisodeList(html);

        if (episodes.length === 0) {
            // Fallback: push a single episode entry
            episodes.push({ href: url, number: 1 });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Parses the episode list from the drama page HTML.
 * @param {string} html - The HTML content of the drama page.
 * @returns {Array} Array of {href, number} objects.
 */
function parseEpisodeList(html) {
    const episodes = [];
    const seen = new Set();

    // Pattern: episode links in the episode listing
    const regex = /<a[^>]*href="([^"]+)"[^>]*>[^<]*<\/a>/gi;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const href = match[1];

        // Filter out non-episode links (navigation, etc.)
        if (href.includes('/drama/') || href.includes('/movie/')) {
            // Extract episode number from the link text or href
            const episodeNum = extractEpisodeNumber(match[0]);

            if (episodeNum !== null && !seen.has(href)) {
                seen.add(href);
                const absoluteHref = href.startsWith('http') ? href : `${KISSASIAN_BASE}${href}`;
                episodes.push({
                    href: absoluteHref,
                    number: episodeNum
                });
            }
        }
    }

    // If no episodes found, return empty array (will trigger fallback in extractEpisodes)
    return episodes;
}

/**
 * Extracts the episode number from an HTML anchor string.
 * @param {string} htmlStr - The HTML string of the anchor tag.
 * @returns {number|null} The episode number, or null if not found.
 */
function extractEpisodeNumber(htmlStr) {
    // Try to find number in the anchor text
    const textMatch = htmlStr.match(/>\s*(\d+)\s*<\/a>/i);
    if (textMatch && textMatch[1]) {
        return parseInt(textMatch[1], 10);
    }

    // Try to find episode number in href
    const hrefMatch = htmlStr.match(/href="[^"]*episode[^"]*|[^"]*ep[^"]*|[^"]*[0-9]+[^"]*"/i);
    if (hrefMatch) {
        const numMatch = hrefMatch[0].match(/(\d+)/);
        if (numMatch) return parseInt(numMatch[1], 10);
    }

    return null;
}

/**
 * Resolves an episode to its playable stream URL(s).
 * @param {string} url - The episode page URL.
 * @returns {string} JSON object {streams:[{title, streamUrl, headers}], subtitle}.
 */
async function extractStreamUrl(url) {
    const fallback = JSON.stringify({ streams: [], subtitle: '' });

    try {
        const response = await soraFetch(url);
        if (!response) return fallback;

        const html = await response.text();
        const streamInfo = parseStreamPage(html);

        if (!streamInfo) return fallback;

        return JSON.stringify(streamInfo);
    } catch (error) {
        console.log('Stream error: ' + error);
        return fallback;
    }
}

/**
 * Parses the episode stream page to extract HLS stream URL and subtitles.
 * @param {string} html - The HTML content of the episode stream page.
 * @returns {Object} Stream details or null.
 */
function parseStreamPage(html) {
    // Try to extract HLS playlist URL
    const m3u8Match = html.match(/['"]([^"']+\.m3u8[^"']*)['"]/i);
    if (m3u8Match) {
        const streamUrl = m3u8Match[1];
        if (streamUrl) {
            return {
                streams: [{
                    title: 'HLS',
                    streamUrl: streamUrl,
                    headers: makeStreamHeaders()
                }],
                subtitle: ''
            };
        }
    }

    // Try to extract video source from script tags or inline code
    const scriptMatch = html.match(/file\s*:\s*['"]([^"']+)['"]/i);
    if (scriptMatch) {
        const streamUrl = scriptMatch[1];
        if (streamUrl) {
            return {
                streams: [{
                    title: 'MP4',
                    streamUrl: streamUrl,
                    headers: makeStreamHeaders()
                }],
                subtitle: ''
            };
        }
    }

    // Try to extract from source tags
    const sourceMatch = html.match(/<source[^>]*src="([^"]+)"[^>]*>/i);
    if (sourceMatch) {
        const streamUrl = sourceMatch[1];
        if (streamUrl && /\.m3u8/i.test(streamUrl)) {
            return {
                streams: [{
                    title: 'HLS',
                    streamUrl: streamUrl,
                    headers: makeStreamHeaders()
                }],
                subtitle: ''
            };
        }
    }

    return null;
}

/* HELPERS */

/**
 * Extracts the first match of a regex from text.
 * @param {string} text - The text to search in.
 * @param {RegExp} regex - The regex pattern.
 * @returns {string} The matched group or empty string.
 */
function extractFirst(text, regex) {
    const match = (text || '').match(regex);
    return match ? match[1] : '';
}

/**
 * Cleans text by removing HTML tags and normalizing whitespace.
 * @param {string} text - The text to clean.
 * @returns {string} Cleaned text.
 */
function cleanText(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&/g, '&')
        .replace(/"/g, '"')
        .replace(/'/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Creates stream headers for playback.
 * @returns {Object} Headers object with Referer, Origin, and User-Agent.
 */
function makeStreamHeaders() {
    return {
        'Referer': KISSASIAN_BASE + '/',
        'Origin': KISSASIAN_BASE,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
}

/* SORA FETCH WRAPPER */

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
                text: async () => await text.text(),
                json: async () => await text.json()
            };
        } catch (error) {
            console.log('soraFetch error: ' + error);
            return null;
        }
    }
}

function mergeHeaders(url, opts) {
    const base = opts.headers || {};
    const defaults = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const host = String(url || '').replace(/^https?:\/\//, '').split('/')[0] || '';
    if (/kissasian\.su/i.test(host)) {
        defaults['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
        defaults['Accept-Language'] = 'en-US,en;q=0.5';
        defaults['Referer'] = KISSASIAN_BASE + '/';
        defaults['Origin'] = KISSASIAN_BASE;
    }

    const out = {};
    let k;
    for (k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    return out;
}