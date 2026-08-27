const CINEMETA_SEARCH_SERIES = 'https://v3-cinemeta.strem.io/catalog/series/top/search=';
const CINEMETA_SEARCH_MOVIES = 'https://v3-cinemeta.strem.io/catalog/movie/top/search=';
const CINEMETA_META_SERIES = 'https://v3-cinemeta.strem.io/meta/series/';
const CINEMETA_META_MOVIES = 'https://v3-cinemeta.strem.io/meta/movie/';
const TORRENTIO_STREAM_URL = 'https://torrentio.strem.fun/stream/';

/* MAIN FUNCTIONS */

/**
 * Searches Cinemeta for series and movies matching keyword.
 * @param {string} keyword
 * @returns {Promise<string>} JSON string array of {title, image, href} objects.
 */
async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const encoded = encodeURIComponent(query);
        const [seriesRes, movieRes] = await Promise.all([
            fetchJson(`${CINEMETA_SEARCH_SERIES}${encoded}.json`),
            fetchJson(`${CINEMETA_SEARCH_MOVIES}${encoded}.json`)
        ]);

        const seriesList = (seriesRes && Array.isArray(seriesRes.metas)) ? seriesRes.metas : [];
        const movieList = (movieRes && Array.isArray(movieRes.metas)) ? movieRes.metas : [];

        const results = [];
        const seen = new Set();

        // Process series first, then movies
        [...seriesList, ...movieList].forEach(item => {
            if (!item || !item.id || seen.has(item.id)) return;
            seen.add(item.id);

            const isMovie = item.type === 'movie';
            const detailUrl = isMovie 
                ? `${CINEMETA_META_MOVIES}${item.id}.json` 
                : `${CINEMETA_META_SERIES}${item.id}.json`;

            results.push({
                title: cleanText(item.name || 'Unknown Title') + (item.releaseInfo ? ` (${item.releaseInfo})` : ''),
                image: item.poster || item.background || '',
                href: detailUrl
            });
        });

        return JSON.stringify(results);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Extracts metadata details for a show or movie.
 * @param {string} url - Cinemeta meta URL (e.g. https://v3-cinemeta.strem.io/meta/series/tt0944947.json).
 * @returns {Promise<string>} JSON string array containing 1 details object [{description, airdate, aliases}].
 */
async function extractDetails(url) {
    const fallback = [{ description: 'No description available', airdate: 'Unknown', aliases: 'Torrentio Stremio Addon' }];
    try {
        if (!url) return JSON.stringify(fallback);

        const data = await fetchJson(url);
        const meta = data && data.meta;
        if (!meta) return JSON.stringify(fallback);

        const description = cleanText(meta.description || meta.overview || 'No description available');
        const airdate = meta.releaseInfo || meta.year || (meta.released ? meta.released.slice(0, 10) : 'Unknown');
        const genres = Array.isArray(meta.genres) ? meta.genres.join(', ') : '';
        const aliases = genres ? `Genres: ${genres}` : 'Torrentio Stremio Addon';

        return JSON.stringify([{
            description,
            airdate: cleanText(String(airdate)),
            aliases: cleanText(aliases)
        }]);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify(fallback);
    }
}

/**
 * Extracts episodes for a show or movie.
 * @param {string} url - Cinemeta meta URL (e.g. https://v3-cinemeta.strem.io/meta/series/tt0944947.json).
 * @returns {Promise<string>} JSON string array of {href, number} objects.
 */
async function extractEpisodes(url) {
    try {
        if (!url) return JSON.stringify([]);

        const data = await fetchJson(url);
        const meta = data && data.meta;
        if (!meta) return JSON.stringify([]);

        const isMovie = meta.type === 'movie';
        if (isMovie) {
            // Movie stream URL
            const streamUrl = `${TORRENTIO_STREAM_URL}movie/${meta.id}.json`;
            return JSON.stringify([{
                href: streamUrl,
                number: 1
            }]);
        }

        // Series videos processing
        const rawVideos = Array.isArray(meta.videos) ? meta.videos : [];
        if (rawVideos.length === 0) {
            // Fallback for series without video breakdown
            const streamUrl = `${TORRENTIO_STREAM_URL}series/${meta.id}:1:1.json`;
            return JSON.stringify([{ href: streamUrl, number: 1 }]);
        }

        // Sort videos by season and episode number (excluding season 0 unless it's the only season)
        const hasRegularSeasons = rawVideos.some(v => v.season && v.season > 0);
        const filteredVideos = rawVideos.filter(v => {
            if (!v.id) return false;
            if (hasRegularSeasons && v.season === 0) return false; // filter out specials if regular seasons exist
            return true;
        });

        filteredVideos.sort((a, b) => {
            if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
            return (a.episode || a.number || 0) - (b.episode || b.number || 0);
        });

        const episodes = filteredVideos.map((v, index) => {
            const epNum = index + 1;
            const videoId = v.id || `${meta.id}:${v.season || 1}:${v.episode || epNum}`;
            const streamUrl = `${TORRENTIO_STREAM_URL}series/${videoId}.json`;
            return {
                href: streamUrl,
                number: epNum
            };
        });

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Extracts streams for a given episode or movie Torrentio stream URL.
 * @param {string} url - Torrentio stream endpoint (e.g. https://torrentio.strem.fun/stream/series/tt0944947:1:1.json).
 * @returns {Promise<string>} JSON string {streams:[{title, streamUrl, headers}], subtitle: ""}
 */
async function extractStreamUrl(url) {
    const fallback = JSON.stringify({ streams: [], subtitle: '' });
    try {
        if (!url) return fallback;

        // Ensure URL ends in .json for Torrentio stream endpoint
        let endpoint = url;
        if (!endpoint.endsWith('.json') && !endpoint.includes('?')) {
            endpoint += '.json';
        }

        const data = await fetchJson(endpoint);
        const rawStreams = data && Array.isArray(data.streams) ? data.streams : [];
        if (rawStreams.length === 0) return fallback;

        const streams = rawStreams.map(s => {
            let streamUrl = '';
            if (s.url) {
                streamUrl = s.url;
            } else if (s.infoHash) {
                streamUrl = `magnet:?xt=urn:btih:${s.infoHash}`;
                if (s.behaviorHints && s.behaviorHints.filename) {
                    streamUrl += `&dn=${encodeURIComponent(s.behaviorHints.filename)}`;
                } else if (s.title) {
                    const firstLine = s.title.split('\n')[0].trim();
                    if (firstLine) streamUrl += `&dn=${encodeURIComponent(firstLine)}`;
                }
                if (s.fileIdx !== undefined && s.fileIdx !== null) {
                    streamUrl += `&ix=${s.fileIdx}`;
                }
            }

            if (!streamUrl) return null;

            // Formulate clean title
            const nameHeader = (s.name || 'Torrentio').replace(/\n/g, ' • ');
            const titleDetails = (s.title || '').replace(/\n/g, ' | ');
            const displayTitle = `${nameHeader} — ${titleDetails}`.trim();

            return {
                title: displayTitle,
                streamUrl: streamUrl,
                headers: makeStreamHeaders()
            };
        }).filter(Boolean);

        return JSON.stringify({
            streams: streams,
            subtitle: ''
        });
    } catch (error) {
        console.log('Stream error: ' + error);
        return fallback;
    }
}

/* HELPERS */

function cleanText(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function makeStreamHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };
}

async function soraFetch(url, options) {
    const opts = options || {};
    const headers = opts.headers || {};
    if (!headers['User-Agent']) {
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }
    const method = opts.method || 'GET';
    const body = opts.body || null;

    try {
        return await fetchv2(url, headers, method, body);
    } catch (e) {
        try {
            const res = await fetch(url, { method, headers, body });
            return {
                text: async () => await res.text(),
                json: async () => await res.json(),
                headers: res.headers || {}
            };
        } catch (error) {
            console.log('soraFetch error: ' + error);
            return null;
        }
    }
}

async function fetchJson(url) {
    try {
        const response = await soraFetch(url);
        if (!response) return null;
        return await response.json();
    } catch (e) {
        console.log('fetchJson error for ' + url + ': ' + e);
        return null;
    }
}
