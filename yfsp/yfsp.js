const YFSP_BASE = 'https://www.yfsp.tv';
const YFSP_API_DETAIL = 'https://m10.yfsp.tv/v3/video/detail';
const YFSP_API_EPISODES = 'https://m10.yfsp.tv/v3/video/languagesplaylist';
const YFSP_API_PLAY = 'https://m10.yfsp.tv/v3/video/play';
const YFSP_API_SEARCH = 'https://rankv21.yfsp.tv/v3/list/briefsearch';
const YFSP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

/* MAIN FUNCTIONS */

/**
 * Searches yfsp.tv for movies/shows matching the keyword.
 * The briefsearch endpoint answers without a signature.
 * Returns a JSON string array of {title, image, href} objects.
 */
async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const enc = encodeURIComponent(query);
        const url = `${YFSP_API_SEARCH}?tags=${enc}&orderby=4&page=1&size=36&desc=1&isserial=-1`;
        const response = await soraFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Accept': 'application/json, text/plain, */*',
                'Origin': YFSP_BASE,
                'Referer': `${YFSP_BASE}/search/${enc}`,
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: `tags=${enc}`
        });
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const info = (data && data.data && Array.isArray(data.data.info) && data.data.info[0]) || null;
        const list = (info && Array.isArray(info.result)) ? info.result : [];

        const results = [];
        const seen = new Set();
        for (const item of list) {
            const key = item.contxt || item.key;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            results.push({
                title: item.title || key,
                image: item.imgPath || item.image || '',
                href: `${YFSP_BASE}/play/${key}`
            });
        }
        return JSON.stringify(results);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Fetches the yfsp.tv play page API and extracts description, year and category metadata.
 * @param {string} url - The yfsp.tv play page URL (e.g. https://www.yfsp.tv/play/<key>).
 * @returns {string} JSON array with a single {description, airdate, aliases} object.
 */
async function extractDetails(url) {
    try {
        const movieKey = extractMovieKey(url);
        if (!movieKey) return JSON.stringify([detailsFallback()]);

        const cfg = await getConfig();
        if (!cfg) return JSON.stringify([detailsFallback()]);

        const signed = buildSignedUrl(YFSP_API_DETAIL, {
            cinema: 1, device: 1, player: 'CkPlayer', tech: 'HLS',
            country: 'HU', lang: 'cns', v: 1, id: movieKey, region: 'GL.'
        });
        const response = await soraFetch(signed, { headers: jsonApiHeaders(movieKey) });
        if (!response) return JSON.stringify([detailsFallback()]);
        const data = await response.json();

        const info = (data && data.data && Array.isArray(data.data.info) && data.data.info[0]) || {};

        const description = info.contxt || 'No description available';
        const aliases = [info.channel, info.videoType, info.language, info.regional]
            .filter(Boolean).join(' · ') || 'N/A';
        let airdate = info.post_Year || '';
        if (!airdate && info.addTime) airdate = String(info.addTime).slice(0, 4);

        return JSON.stringify([{
            description: cleanText(description),
            aliases: cleanText(aliases),
            airdate: airdate || 'Unknown'
        }]);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([detailsFallback()]);
    }
}

/**
 * Lists the episodes of a yfsp.tv title using the signed languagesplaylist API.
 * The video's category id (cid) is pulled from the detail endpoint first.
 * @param {string} url - The yfsp.tv play page URL.
 * @returns {string} JSON string array of {href, number} objects.
 */
async function extractEpisodes(url) {
    try {
        const movieKey = extractMovieKey(url);
        if (!movieKey) return JSON.stringify([]);

        const cfg = await getConfig();
        if (!cfg) return JSON.stringify([]);

        const cid = await fetchCid(movieKey, cfg);
        if (!cid) return JSON.stringify([]);

        const signed = buildSignedUrl(YFSP_API_EPISODES, {
            cinema: 1, vid: movieKey, lsk: 1, taxis: 0, cid: cid
        });
        const response = await soraFetch(signed, { headers: jsonApiHeaders(movieKey) });
        if (!response) return JSON.stringify([]);
        const data = await response.json();

        const info = (data && data.data && Array.isArray(data.data.info) && data.data.info[0]) || {};
        const playList = (info && Array.isArray(info.playList)) ? info.playList : [];

        const episodes = playList
            .filter((ep) => ep && ep.key)
            .map((ep, index) => ({
                href: `${YFSP_BASE}/play/${movieKey}?id=${ep.key}`,
                number: episodeNumber(ep.name, index)
            }));

        if (episodes.length === 0) {
            episodes.push({ href: `${YFSP_BASE}/play/${movieKey}`, number: 1 });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Resolves a yfsp.tv episode to its playable HLS/MP4 stream(s) via the signed play API.
 * The play API answers with id=<episodeKey>&a=0 for specific episodes and
 * id=<movieKey>&a=1 when only the title key is known.
 * @param {string} url - The episode href emitted by extractEpisodes.
 * @returns {string} JSON object {streams:[{title, streamUrl, headers}], subtitle}.
 */
async function extractStreamUrl(url) {
    const fallback = JSON.stringify({ streams: [], subtitle: '' });
    try {
        const urlStr = String(url || '');
        const epMatch = urlStr.match(/[?&]id=([^&]+)/);
        const episodeKey = epMatch ? decodeURIComponent(epMatch[1]) : '';
        const movieKey = extractMovieKey(urlStr);
        const useKey = episodeKey || movieKey;
        if (!useKey) return fallback;

        const cfg = await getConfig();
        if (!cfg) return fallback;

        const signed = buildSignedUrl(YFSP_API_PLAY, {
            cinema: 1, id: useKey, a: episodeKey ? 0 : 1,
            usersign: 1, region: 'GL.', device: 1, isMasterSupport: 1
        });
        const response = await soraFetch(signed, { headers: jsonApiHeaders(useKey) });
        if (!response) return fallback;
        const data = await response.json();

        const info = (data && data.data && Array.isArray(data.data.info) && data.data.info[0]) || {};
        const flvList = (info && Array.isArray(info.flvPathList)) ? info.flvPathList : [];

        // The non-HLS flvPathList entry is a shared placeholder; the real
        // playback is always the HLS chunklist, so prefer HLS sources.
        const hlsSources = flvList.filter((f) => f && f.isHls && f.result);
        const sources = hlsSources.length > 0 ? hlsSources : flvList.filter((f) => f && f.result);

        const streams = [];
        const seen = new Set();
        for (const f of sources) {
            if (!f || !f.result || seen.has(f.result)) continue;
            seen.add(f.result);
            streams.push({
                title: f.isHls ? 'HLS' : 'MP4',
                streamUrl: signStreamUrl(f.result),
                headers: makeStreamHeaders()
            });
        }

        return JSON.stringify({ streams: streams, subtitle: '' });
    } catch (error) {
        console.log('Stream error: ' + error);
        return fallback;
    }
}

/* HELPERS */

function detailsFallback() {
    return {
        description: 'No description available',
        airdate: 'Unknown',
        aliases: 'N/A'
    };
}

// Pull the title key out of a /play/<key> or /play/<key>?id=... URL.
function extractMovieKey(url) {
    const m = String(url || '').match(/\/play\/([^/?#]+)/i);
    return m ? m[1] : '';
}

// Series playList names are plain numbers ("01", "10") while movies carry the
// quality label ("720P"); fall back to the list position in that case.
function episodeNumber(name, index) {
    const raw = String(name || '').trim();
    return /^\d+$/.test(raw) ? parseInt(raw, 10) : index + 1;
}

// Fetch the video's category id (cid) needed by the languagesplaylist API.
async function fetchCid(movieKey, cfg) {
    try {
        const signed = buildSignedUrl(YFSP_API_DETAIL, {
            cinema: 1, device: 1, player: 'CkPlayer', tech: 'HLS',
            country: 'HU', lang: 'cns', v: 1, id: movieKey, region: 'GL.'
        });
        const response = await soraFetch(signed, { headers: jsonApiHeaders(movieKey) });
        if (!response) return '';
        const data = await response.json();
        const info = (data && data.data && Array.isArray(data.data.info) && data.data.info[0]) || {};
        return info.cid || '';
    } catch (e) {
        console.log('Cid error: ' + e);
        return '';
    }
}

/* SIGNING — yfsp.tv URI signature */
// Each page render embeds a fresh key pair in its pConfig JSON. The API
// rejects unsigned requests, so we scrape the current keys and compute:
//   vv = MD5(publicKey + "&" + lowercasedQuery + "&" + privateKey)

let yfspConfig = null;

async function getConfig() {
    if (yfspConfig && Date.now() - yfspConfig.ts < 5 * 60 * 1000) return yfspConfig;
    try {
        const response = await soraFetch(`${YFSP_BASE}/`, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            }
        });
        if (!response || typeof response.text !== 'function') return yfspConfig || null;
        const html = await response.text();
        const match = typeof html === 'string' && html.match(/"pConfig":\{"publicKey":"([^"]+)","privateKey":\["([^"]+)"\]\}/);
        if (match && match[1] && match[2]) {
            yfspConfig = { pub: match[1], priv: match[2], ts: Date.now() };
        }
    } catch (e) {
        console.log('Config error: ' + e);
    }
    return yfspConfig || null;
}

function buildSignedUrl(base, params) {
    const pub = yfspConfig.pub;
    const priv = yfspConfig.priv;
    const query = Object.keys(params)
        .map((k) => `${k}=${params[k]}`)
        .join('&');
    const vv = md5(`${pub}&${query.toLowerCase()}&${priv}`);
    return `${base}?${query}&vv=${vv}&pub=${pub}`;
}

// The CDN serves segment URLs signed with the same vv scheme only when the
// master playlist request carries a valid vv/pub pair; without it the segment
// host drops the connection. Sign the stream URL over its own query string.
function signStreamUrl(url) {
    if (!url || !yfspConfig) return url;
    const qIndex = url.indexOf('?');
    const qs = qIndex >= 0 ? url.slice(qIndex + 1) : '';
    if (!qs) return url;
    const vv = md5(`${yfspConfig.pub}&${qs.toLowerCase()}&${yfspConfig.priv}`);
    return `${url}&vv=${vv}&pub=${yfspConfig.pub}`;
}

/* NETWORK */

async function soraFetch(url, options) {
    const opts = options || {};
    const mergedHeaders = mergeHeaders(url, opts);
    const method = opts.method || 'GET';
    const body = typeof opts.body === 'undefined' ? null : opts.body;

    try {
        return await fetchv2(url, mergedHeaders, method, body);
    } catch (e) {
        try {
            const resp = await fetch(url, {
                method: method,
                headers: mergedHeaders,
                body: body
            });
            if (!resp || typeof resp.text !== 'function') return null;
            return {
                ok: !!resp.ok,
                status: resp.status || 0,
                text: async () => await resp.text(),
                json: async () => {
                    if (typeof resp.json === 'function') return await resp.json();
                    return JSON.parse(await resp.text());
                }
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
        'User-Agent': YFSP_UA
    };
    const host = String(url || '').replace(/^https?:\/\//, '').split('/')[0] || '';
    if (/(m10|rankv21)\.yfsp\.tv/i.test(host)) {
        defaults['Accept'] = 'application/json, text/plain, */*';
        defaults['Referer'] = YFSP_BASE + '/';
    }
    const out = {};
    let k;
    for (k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    return out;
}

function jsonApiHeaders(key) {
    return {
        'Accept': 'application/json, text/plain, */*',
        'Referer': `${YFSP_BASE}/play/${key}`,
        'X-Requested-With': 'XMLHttpRequest'
    };
}

function makeStreamHeaders() {
    return {
        'Referer': YFSP_BASE + '/',
        'Origin': YFSP_BASE,
        'User-Agent': YFSP_UA
    };
}

function cleanText(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function utf8Encode(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0x800) {
            out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const c2 = str.charCodeAt(i + 1);
            if (c2 >= 0xdc00 && c2 <= 0xdfff) {
                const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
                out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
                i++;
            } else {
                out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
            }
        } else {
            out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
    }
    return out;
}

/* MD5 (RFC 1321) — compact public-domain implementation */

function md5(input) {
    const bytes = utf8Encode(String(input));
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    const K = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
        0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
        0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
        0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
        0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
        0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
        0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
        0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
        0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
        0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
        0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
        0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
        0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
        0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
        0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
    ];
    const S = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];

    const bitLen = bytes.length * 8;
    const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
    const buf = new Uint8Array(paddedLen);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(paddedLen - 8, bitLen >>> 0, true);
    dv.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

    let a0 = state[0], b0 = state[1], c0 = state[2], d0 = state[3];

    for (let off = 0; off < paddedLen; off += 64) {
        const M = new Array(16);
        for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);

        let A = a0, B = b0, C = c0, D = d0;

        for (let i = 0; i < 64; i++) {
            let F, g;
            if (i < 16) { F = (B & C) | (~B & D); g = i; }
            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * i) % 16; }

            F = (F + A + K[i] + M[g]) >>> 0;
            const oldD = D;
            D = C;
            C = B;
            B = (B + rotateLeft(F, S[i])) >>> 0;
            A = oldD;
        }

        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }

    const out = new Uint8Array(16);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, a0, true);
    odv.setUint32(4, b0, true);
    odv.setUint32(8, c0, true);
    odv.setUint32(12, d0, true);

    let hex = '';
    for (let i = 0; i < 16; i++) hex += (out[i] < 16 ? '0' : '') + out[i].toString(16);
    return hex;
}

function rotateLeft(x, n) {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}
