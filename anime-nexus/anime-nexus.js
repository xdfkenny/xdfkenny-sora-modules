const BASE_URL = 'https://anime.nexus';
const API_URL = 'https://api.anime.nexus/api';
const ASSETS_URL = 'https://assets.anime.nexus';

const SEARCH_PATH = '/anime/shows';
const DETAILS_PATH = '/anime/details';
const EPISODES_PATH = '/anime/details/episodes';
const STREAM_PATH = '/anime/details/episode/stream';

async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const params = 'search=' + encodeURIComponent(query) +
            '&page=1&sortBy=' + encodeURIComponent('name asc') +
            '&hasVideos=1&includes[]=poster&includes[]=genres';
        const response = await soraFetch(API_URL + SEARCH_PATH + '?' + params);
        if (!response) return JSON.stringify([]);

        const json = safeJson(await response.text());
        const list = (json && Array.isArray(json.data)) ? json.data : [];
        const results = [];

        for (const item of list) {
            const title = cleanLabel(item.name);
            if (!title) continue;
            const image = pickPoster(item.poster);
            if (!item.id) continue;
            const href = `${BASE_URL}/series/${item.id}/${item.slug || ''}`;
            results.push({ title, image, href });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log('AnimeNexus search error: ' + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const id = parseIdFromUrl(url, 'series');
        if (!id) {
            return JSON.stringify([{ description: 'No description available', airdate: 'Unknown', aliases: 'No alternative titles' }]);
        }

        const response = await soraFetch(`${API_URL}${DETAILS_PATH}?id=${id}`);
        if (!response) return fallbackDetails();

        const json = safeJson(await response.text());
        const detail = unwrapEnvelope(json) || {};

        const description = cleanLabel(detail.description) || 'No description available';
        const airdate = cleanLabel(detail.release_date || detail.premiered) || 'Unknown';
        const aliases = cleanLabel(detail.name_alt || detail.name) || 'No alternative titles';

        return JSON.stringify([{ description, airdate, aliases }]);
    } catch (error) {
        console.log('AnimeNexus details error: ' + error);
        return fallbackDetails();
    }
}

async function extractEpisodes(url) {
    try {
        const id = parseIdFromUrl(url, 'series');
        if (!id) return JSON.stringify([]);

        const episodes = [];
        const seen = new Set();
        const perPage = 50;
        const maxPages = 300;

        for (let page = 1; page <= maxPages; page++) {
            const params = `id=${id}&page=${page}&perPage=${perPage}&order=asc&fillers=true&recaps=true`;
            const response = await soraFetch(`${API_URL}${EPISODES_PATH}?${params}`);
            if (!response) break;

            const json = safeJson(await response.text());
            const list = (json && Array.isArray(json.data)) ? json.data : [];
            if (list.length === 0) break;

            for (const ep of list) {
                if (!ep || !ep.id) continue;
                const number = parseInt(ep.number, 10);
                if (isNaN(number)) continue;
                const href = `${BASE_URL}/watch/${ep.id}/${ep.slug || ''}`;
                if (seen.has(href)) continue;
                seen.add(href);
                episodes.push({ href, number });
            }

            if (list.length < perPage) break;
        }

        episodes.sort(function (a, b) { return a.number - b.number; });
        return JSON.stringify(episodes);
    } catch (error) {
        console.log('AnimeNexus episodes error: ' + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const episodeId = parseIdFromUrl(url, 'watch');
        if (!episodeId) return emptyStream();

        const hls = await fetchStreamHls(episodeId);
        if (!hls) return emptyStream();

        const streams = [{
            title: 'Auto (HLS)',
            streamUrl: hls,
            headers: {
                'Referer': BASE_URL + '/',
                'Origin': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }];

        return JSON.stringify({ streams: streams, subtitles: [] });
    } catch (error) {
        console.log('AnimeNexus stream error: ' + error);
        return emptyStream();
    }
}

async function fetchStreamHls(episodeId) {
    const params = `id=${episodeId}&fillers=true&recaps=true`;
    const response = await soraFetch(`${API_URL}${STREAM_PATH}?${params}`, {
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Referer': BASE_URL + '/',
            'Origin': BASE_URL
        }
    });
    if (!response) return '';
    const json = safeJson(await response.text());
    if (!json) return '';
    const data = (json && json.data) ? json.data : json;
    if (!data && typeof data !== 'object') return '';
    return pickHls(data);
}

function pickHls(data) {
    if (data && typeof data === 'object' && data.hls) {
        const hls = String(data.hls);
        return (hls && (hls.indexOf('http') === 0 || hls.indexOf('//') === 0)) ? promiseHttps(hls) : '';
    }
    const variants = first(Array, data, ['streams', 'sources', 'videos', 'versions']);
    if (Array.isArray(variants) && variants.length > 0) {
        const url = first(String, variants[0], ['url', 'hls', 'hlsUrl', 'playlist', 'src']);
        if (url) return promiseHttps(url);
    }
    const envelopeUrl = first(String, data, ['url', 'hls', 'hlsUrl', 'playlist', 'src', 'video', 'manifest']);
    if (envelopeUrl) return promiseHttps(envelopeUrl);
    return '';
}

function first(type, source, keys) {
    if (!source || typeof source !== 'object') return type === Array ? [] : '';
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && value !== '') {
            if (type === Array) {
                if (Array.isArray(value)) return value;
            } else if (typeof value === 'string' || typeof value === 'number') {
                return value;
            }
        }
    }
    return type === Array ? [] : '';
}

function pickPoster(poster) {
    try {
        const resized = (poster && poster.resized) ? poster.resized : {};
        let best = '';
        let bestWidth = 0;
        for (const key in resized) {
            const width = parseInt(String(key).split('x')[0], 10) || 0;
            if (width > bestWidth) {
                bestWidth = width;
                best = resized[key];
            }
        }
        return decodeImgSource(best) || absAssets(best);
    } catch (e) {
        return '';
    }
}

function decodeImgSource(transformPath) {
    try {
        const path = String(transformPath || '');
        const match = path.match(/(?:^|\/)h:\d+\/([\s\S]*)$/);
        if (!match) return '';
        let b64 = match[1].replace(/\.(avif|webp|jpeg|jpg|png|gif)$/i, '');
        b64 = b64.replace(/\//g, '').replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        const text = bytesToUtf8(base64ToBytes(b64 + pad));
        return (/^https?:/i.test(text)) ? text : '';
    } catch (e) {
        return '';
    }
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(input) {
    const out = [];
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charAt(i);
        if (ch === '=') break;
        const value = B64_ALPHABET.indexOf(ch);
        if (value === -1) continue;
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buffer >> bits) & 0xff);
        }
    }
    return out;
}

function bytesToUtf8(bytes) {
    const chars = [];
    for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i];
        if (c < 0x80) {
            chars.push(String.fromCharCode(c));
        } else if ((c & 0xe0) === 0xc0 && i + 1 < bytes.length) {
            chars.push(String.fromCharCode(((c & 0x1f) << 6) | (bytes[++i] & 0x3f)));
        } else if ((c & 0xf0) === 0xe0 && i + 2 < bytes.length) {
            chars.push(String.fromCharCode(((c & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f)));
        } else if ((c & 0xf8) === 0xf0 && i + 3 < bytes.length) {
            const cp = ((c & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f);
            chars.push(String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)));
        }
    }
    return chars.join('');
}

function absAssets(path) {
    if (!path) return '';
    if (/^https?:/i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    if (path.charAt(0) === '/') return ASSETS_URL + path;
    return ASSETS_URL + '/' + path;
}

function parseIdFromUrl(url, section) {
    const raw = String(url || '');
    const marker = '/' + section + '/';
    const start = raw.indexOf(marker);
    if (start === -1) return '';
    const rest = raw.slice(start + marker.length);
    const id = rest.split('/')[0] || '';
    return /^[0-9a-fA-F-]{8,}$/.test(id) ? id : '';
}

function unwrapEnvelope(json) {
    if (!json || typeof json !== 'object') return null;
    if (json.data !== undefined) return json.data;
    if (json.results !== undefined) return json.results;
    if (json.items !== undefined) return json.items;
    if (Array.isArray(json) || typeof json === 'object') return json;
    return null;
}

function safeJson(text) {
    if (typeof text !== 'string') return null;
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function cleanLabel(text) {
    return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function promiseHttps(url) {
    const raw = String(url || '').trim();
    if (/^\/\//.test(raw)) return 'https:' + raw;
    return raw;
}

function emptyStream() {
    return JSON.stringify({ streams: [], subtitles: [] });
}

function fallbackDetails() {
    return JSON.stringify([{
        description: 'Error loading description',
        airdate: 'Unknown',
        aliases: 'Unknown'
    }]);
}

async function soraFetch(url, options) {
    const opts = options || {};
    const headers = mergeHeaders(url, opts.headers || {});
    const method = opts.method || 'GET';
    const body = typeof opts.body === 'undefined' ? null : opts.body;

    const attempt = async function () {
        try {
            return await fetchv2(url, headers, method, body);
        } catch (e) {
            try {
                const response = await fetch(url, {
                    method: method,
                    headers: headers,
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
                console.log('AnimeNexus fetch error: ' + error);
                return null;
            }
        }
    };

    return await withTimeout(attempt(), 12000);
}

function mergeHeaders(url, base) {
    const defaults = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': BASE_URL + '/',
        'Origin': BASE_URL
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

function withTimeout(promise, ms) {
    if (typeof setTimeout === 'undefined') return promise;
    return Promise.race([
        promise,
        new Promise(function (resolve) {
            setTimeout(function () { resolve(null); }, ms);
        })
    ]);
}