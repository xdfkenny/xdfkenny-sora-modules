const BASE_URL = 'https://flixlatam.com';
const MINO_ORIGIN = 'https://minochinos.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

/* ============================================================
   MAIN FUNCTIONS
   ============================================================ */

/**
 * Searches flixlatam.com for movies/series matching the keyword.
 * Returns a JSON string array of {title, image, href}.
 */
async function searchResults(keyword) {
    try {
        const query = String(keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const response = await soraFetch(BASE_URL + '/search?s=' + encodeURIComponent(query));
        if (!response) return JSON.stringify([]);
        const html = await response.text();

        const results = [];
        const seen = new Set();
        const itemRe = /<article class="item">([\s\S]*?)<\/article>/g;
        let match;
        while ((match = itemRe.exec(html)) !== null) {
            const block = match[1];
            const a = block.match(/<h3>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/);
            const img = block.match(/<img[^>]+src="([^"]+)"/);
            if (!a || !a[1]) continue;
            const title = cleanText(a[2]);
            const href = /^https?:/i.test(a[1]) ? a[1].trim() : BASE_URL + a[1].trim();
            if (!title || seen.has(href)) continue;
            seen.add(href);
            results.push({
                title: title,
                image: img ? decodeHtml(img[1].trim()) : '',
                href: href
            });
        }
        return JSON.stringify(results);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Fetches a movie/series page and extracts description, aliases (genres)
 * and airdate. JSON-LD (Movie/TVSeries) is the primary source.
 * @returns {string} JSON array with a single {description, aliases, airdate} object.
 */
async function extractDetails(url) {
    try {
        const fullUrl = /^https?:/i.test(String(url || '')) ? url : BASE_URL + url;
        const response = await soraFetch(fullUrl);
        if (!response) return JSON.stringify([detailsFallback()]);
        const html = await response.text();

        const ld = findSchema(html);
        const description = (ld && ld.description)
            || extractFirst(html, /<meta name="description" content="([^"]*)"/i)
            || 'No description available';
        const aliases = (ld && Array.isArray(ld.genre) && ld.genre.length)
            ? ld.genre.join(', ')
            : 'No alternative titles';
        const airdate = extractFirst(html, /<span class="date">([^<]+)<\/span>/i)
            || (ld && ld.datePublished)
            || 'Unknown';

        return JSON.stringify([{
            description: cleanText(description),
            aliases: aliases,
            airdate: cleanText(airdate)
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
 * Extracts the episode list for a series page.
 * Episode links look like /serie/<slug>/temporada/<n>/capitulo/<m>.
 * @returns {string} JSON string array of {href, number} objects.
 */
async function extractEpisodes(url) {
    try {
        const fullUrl = /^https?:/i.test(String(url || '')) ? url : BASE_URL + url;
        const response = await soraFetch(fullUrl);
        if (!response) return JSON.stringify([]);
        const html = await response.text();

        const episodes = [];
        const seen = new Set();
        const epRe = /href="(\/serie\/[^"]*temporada\/(\d+)\/capitulo\/(\d+))"/g;
        let match;
        while ((match = epRe.exec(html)) !== null) {
            const href = BASE_URL + match[1];
            if (seen.has(href)) continue;
            seen.add(href);
            episodes.push({ href: href, number: parseInt(match[3], 10) });
        }
        episodes.sort(function (a, b) { return a.number - b.number; });
        if (episodes.length === 0) episodes.push({ href: fullUrl, number: 1 });
        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

/**
 * Resolves a movie/series/episode page to playable HLS stream(s).
 *
 * Layer 1 — vidurl: the page embeds <iframe src="/vidurl/<id>/">. That page
 *   protects its embed list with a SHA-256 proof-of-work + AES-256-CBC.
 *   We solve the PoW and decrypt each embed link with pure-JS crypto.
 * Layer 2 — minochinos (VidHide): the embed page is P.A.C.K.E.R.-packed;
 *   we unpack it (no eval) and read the JWPlayer `links` object, then
 *   prefer links.hls4 || links.hls3 || links.hls2.
 *
 * @returns {string} JSON object {stream, streams:[{title, streamUrl, headers}], subtitle, subtitles}.
 */
async function extractStreamUrl(url) {
    const fallback = { stream: null, streams: [], subtitle: '', subtitles: [] };
    try {
        const fullUrl = /^https?:/i.test(String(url || '')) ? url : BASE_URL + url;
        const pageRes = await soraFetch(fullUrl);
        if (!pageRes) return JSON.stringify(fallback);
        const html = await pageRes.text();

        const iframeMatch = html.match(/<iframe[^>]+(?:data-src|src)="([^"]*\/vidurl\/[^"]*)"/);
        if (!iframeMatch) return JSON.stringify(fallback);

        const embeds = await resolveVidurl(iframeMatch[1]);
        if (!embeds || embeds.length === 0) return JSON.stringify(fallback);

        const streams = [];
        const seenLang = new Set();
        // Prefer LAT/ESP (dubbed) over SUB/VOSE (subtitled), keeping both.
        const ordered = embeds.slice().sort(function (a, b) {
            return langPriority(a.lang) - langPriority(b.lang);
        });
        for (let i = 0; i < ordered.length; i++) {
            const e = ordered[i];
            if (e.server !== 'vidhide') continue;   // only VidHide resolves server-side
            const langKey = e.lang || 'lat';
            if (seenLang.has(langKey)) continue;
            const master = await resolveMino(e.link);
            if (!master) continue;
            seenLang.add(langKey);
            streams.push({
                title: (e.lang || 'LAT').toUpperCase() + ' (VidHide)',
                streamUrl: master,
                headers: {
                    'Referer': MINO_ORIGIN + '/',
                    'User-Agent': USER_AGENT
                }
            });
            if (streams.length >= 3) break;
        }

        const primary = streams.length > 0 ? streams[0].streamUrl : null;
        return JSON.stringify({
            stream: primary,
            streams: streams,
            subtitle: '',
            subtitles: []
        });
    } catch (error) {
        console.log('Stream error: ' + error);
        return JSON.stringify(fallback);
    }
}

/* ============================================================
   LAYER 1 — vidurl: proof-of-work + AES-256-CBC decryption
   ============================================================ */

// Fetch a /vidurl/<id>/ page, solve the SHA-256 PoW, decrypt every embed.
async function resolveVidurl(vidurlPath) {
    const vidurl = /^https?:/i.test(vidurlPath) ? vidurlPath : BASE_URL + vidurlPath;
    const response = await soraFetch(vidurl);
    if (!response) return null;
    const text = await response.text();

    const challenge = text.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
    const difficulty = text.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
    const salt = text.match(/POW_SALT\s*=\s*'([^']+)'/);
    if (!challenge || !difficulty || !salt) return null;

    const dataLinkMatch = text.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/);
    if (!dataLinkMatch) return null;
    const dataLink = JSON.parse(dataLinkMatch[1]);

    const aesKey = solvePoW(challenge[1], parseInt(difficulty[1], 10), salt[1]);

    const embeds = [];
    for (let f = 0; f < dataLink.length; f++) {
        const file = dataLink[f];
        const sorted = (file.sortedEmbeds || []);
        for (let i = 0; i < sorted.length; i++) {
            const e = sorted[i];
            embeds.push({
                server: e.servername,
                lang: file.video_language,
                link: flixAesDecrypt(e.link, aesKey)
            });
        }
    }
    return embeds;
}

// SHA-256 proof-of-work: nonce such that sha256(challenge+nonce) starts
// with difficulty zeros. AES key = first 32 bytes of sha256(challenge+nonce+salt).
function solvePoW(challenge, difficulty, salt) {
    let prefix = '';
    for (let i = 0; i < difficulty; i++) prefix += '0';
    let nonce = 0;
    while (true) {
        if (flixSha256Hex(challenge + nonce).indexOf(prefix) === 0) {
            const keyHex = flixSha256Hex(challenge + nonce + salt);
            const keyBytes = [];
            for (let i = 0; i < keyHex.length; i += 2) {
                keyBytes.push(parseInt(keyHex.slice(i, i + 2), 16));
            }
            return keyBytes.slice(0, 32);
        }
        nonce++;
    }
}

/* ============================================================
   LAYER 2 — minochinos (VidHide): P.A.C.K.E.R. unpack + hls pick
   ============================================================ */

async function resolveMino(embedUrl) {
    const res = await soraFetch(embedUrl, { headers: { 'Referer': BASE_URL + '/' } });
    if (!res) return null;
    const text = await res.text();
    const packedStart = text.indexOf('eval(function(p,a,c,k,e,d)');
    if (packedStart === -1) return null;

    const unpacked = unpackPacker(text);
    if (!unpacked) return null;

    const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[^;]*?\});/);
    if (!linksMatch) return null;
    let links;
    try {
        links = JSON.parse(linksMatch[1]);
    } catch (e) {
        return null;
    }
    const hls = links.hls4 || links.hls3 || links.hls2;
    if (!hls) return null;
    return joinUrl(embedUrl, hls);
}

// Pure-JS P.A.C.K.E.R. unpacker (no eval). The packed script is
// eval(function(p,a,c,k,e,d){...}('PAYLOAD',BASE,COUNT,'DICT'.split('|'),0,{})).
// Parse the 6 invocation args after the "}('" delimiter, then substitute every
// \b<base-encoded-index>\b token in PAYLOAD with its dictionary entry.
function unpackPacker(str) {
    const start = str.indexOf('eval(function(p,a,c,k,e,d)');
    if (start === -1) return null;
    const open = str.indexOf("}('", start);
    if (open === -1) return null;
    let j = open + 2;
    const q = str[j];
    if (q !== "'" && q !== '"') return null;
    j++;
    let payload = '';
    while (j < str.length) {
        const ch = str[j];
        if (ch === '\\') { payload += str[j + 1]; j += 2; continue; }
        if (ch === q) { j++; break; }
        payload += ch;
        j++;
    }

    const readNum = function (s) {
        while (s < str.length && (str[s] === ',' || str[s] === ' ')) s++;
        let n = 0;
        while (s < str.length && /\d/.test(str[s])) { n = n * 10 + (str.charCodeAt(s) - 48); s++; }
        return { n: n, s: s };
    };
    const readStr = function (s) {
        while (s < str.length && str[s] !== "'" && str[s] !== '"') s++;
        const qq = str[s]; s++;
        let out = '';
        while (s < str.length) {
            const ch = str[s];
            if (ch === '\\') { out += str[s + 1]; s += 2; continue; }
            if (ch === qq) break;
            out += ch; s++;
        }
        return out;
    };

    const base = readNum(j);
    const count = readNum(base.s);
    const dictStr = readStr(count.s);
    const dict = dictStr.split('|');
    for (let ci = count.n; ci-- > 0;) {
        if (dict[ci]) {
            const word = ci.toString(base.n);
            payload = payload.replace(new RegExp('\\b' + word + '\\b', 'g'), dict[ci]);
        }
    }
    return payload;
}

/* ============================================================
   HELPERS
   ============================================================ */

function langPriority(lang) {
    const key = String(lang || '').toLowerCase();
    if (key === 'lat' || key === 'esp' || key === 'es' || key === 'latino') return 0;
    if (key === 'sub' || key === 'vose' || key === 'vos') return 1;
    return 9;
}

// Manual absolute-URL join (the sandbox has no URL constructor).
function joinUrl(base, rel) {
    rel = String(rel || '');
    if (/^https?:/i.test(rel)) return rel;
    if (/^\//.test(rel)) {
        const m = String(base).match(/^(https?:\/\/[^/]+)/i);
        return (m ? m[1] : MINO_ORIGIN) + rel;
    }
    return base + rel;
}

// Find the Movie/TVSeries JSON-LD block.
function findSchema(html) {
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        try {
            const d = JSON.parse(m[1]);
            if (d && (d['@type'] === 'Movie' || d['@type'] === 'TVSeries')) return d;
        } catch (e) { /* skip malformed block */ }
    }
    return null;
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
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

async function soraFetch(url, options) {
    const opts = options || {};
    const headers = {};
    let k;
    for (k in (opts.headers || {})) if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k];
    if (!headers['User-Agent']) headers['User-Agent'] = USER_AGENT;
    const method = opts.method || 'GET';
    const body = typeof opts.body === 'undefined' ? null : opts.body;
    try {
        return await fetchv2(url, headers, method, body);
    } catch (e) {
        try {
            const text = await fetch(url, { method: method, headers: headers, body: body });
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

/* ============================================================
   PURE-JS CRYPTO (SHA-256 + AES-256-CBC) — no Node deps
   ============================================================ */

function flixSha256Hex(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;

    // Cache the 64 constants/first-8-hash words on the function object.
    let hash = flixSha256Hex.h = flixSha256Hex.h || [];
    const k = flixSha256Hex.k = flixSha256Hex.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (let i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }

    ascii += '\x80';
    while ((ascii.length % 64) - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
        const j = ascii.charCodeAt(i);
        if (j >> 8) return; // ASCII only
        words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);

    for (let j = 0; j < words.length;) {
        const w = words.slice(j, j += 16);
        let oldHash = hash;
        hash = hash.slice(0, 8);
        for (let i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2];
            const a = hash[0], e = hash[4];
            const temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ ((~e) & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0);
            const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        for (let i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }
    for (let i = 0; i < 8; i++) {
        for (let j = 3; j + 1; j--) {
            const b = (hash[i] >> (j * 8)) & 255;
            result += ((b < 16) ? 0 : '') + b.toString(16);
        }
    }
    return result;
}

// AES-256-CBC decrypt (Schwartz-style block cipher), PKCS#7 stripped.
function flixAesDecrypt(b64, keyBytes) {
    const raw = flixB64ToBytes(b64);
    if (!raw || raw.length < 32) return '';
    const iv = raw.slice(0, 16);
    const ct = raw.slice(16);
    const plain = Aes.decryptCbc(ct, keyBytes, iv);
    return flixBytesToUtf8(plain);
}

// Base64 decoder returning a byte array (no Buffer).
function flixB64ToBytes(b64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const out = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < b64.length; i++) {
        const ch = b64.charAt(i);
        if (ch === '=') break;
        const v = chars.indexOf(ch);
        if (v === -1) continue;
        buffer = (buffer << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buffer >> bits) & 0xff);
        }
    }
    return out;
}

function flixBytesToUtf8(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) out += String.fromCharCode(b);
        else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
        else if (b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
        else out += String.fromCharCode(((b & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
    }
    return out;
}

// AES block cipher (Schwartz-style), works for 128/192/256-bit keys.
var Aes = (function () {
    const sBox = [
        0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
        0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
        0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
        0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
        0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
        0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
        0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
        0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
        0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
        0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
        0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
        0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
        0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
        0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
        0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
        0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
    ];
    const invSBox = [
        0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
        0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
        0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
        0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
        0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
        0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
        0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
        0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
        0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
        0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
        0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
        0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
        0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
        0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
        0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
        0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d
    ];
    const Rcon = [0x01000000, 0x02000000, 0x04000000, 0x08000000, 0x10000000,
        0x20000000, 0x40000000, 0x80000000, 0x1b000000, 0x36000000];

    function xtime(a) { return ((a << 1) ^ (((a >>> 7) & 1) * 0x1b)) & 0xff; }
    function gm(a, b) {
        let p = 0;
        for (let i = 0; i < 8; i++) {
            if (b & 1) p ^= a;
            const hi = a & 0x80;
            a = (a << 1) & 0xff;
            if (hi) a ^= 0x1b;
            b >>= 1;
        }
        return p;
    }

    function expandKey(key) {
        const Nk = key.length / 4;
        const Nr = Nk + 6;
        const w = [];
        for (let i = 0; i < Nk; i++) {
            w[i] = ((key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3]) >>> 0;
        }
        for (let i = Nk; i < 4 * (Nr + 1); i++) {
            let temp = w[i - 1];
            if (i % Nk === 0) {
                // SubWord(RotWord(w[i-1])) ^ Rcon — rotation is implicit: byte1 becomes byte0
                temp = ((sBox[(temp >>> 16) & 0xff] << 24) | (sBox[(temp >>> 8) & 0xff] << 16) |
                    (sBox[temp & 0xff] << 8) | sBox[(temp >>> 24) & 0xff]) >>> 0;
                temp = (temp ^ Rcon[i / Nk - 1]) >>> 0;
            } else if (Nk > 6 && i % Nk === 4) {
                // SubWord only (no rotation) — AES-256 mid-key
                temp = ((sBox[(temp >>> 24) & 0xff] << 24) | (sBox[(temp >>> 16) & 0xff] << 16) |
                    (sBox[(temp >>> 8) & 0xff] << 8) | sBox[temp & 0xff]) >>> 0;
            }
            w[i] = (w[i - Nk] ^ temp) >>> 0;
        }
        return { w: w, Nr: Nr };
    }

    function addRoundKey(state, w, round) {
        for (let c = 0; c < 4; c++) {
            const wv = w[round * 4 + c];
            for (let r = 0; r < 4; r++) {
                state[r][c] ^= (wv >>> (24 - 8 * r)) & 0xff;
            }
        }
    }
    function subBytes(state, box) {
        for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
                state[r][c] = box[state[r][c]];
    }
    function shiftRows(state, inv) {
        for (let r = 1; r < 4; r++) {
            const row = [];
            for (let c = 0; c < 4; c++) row[c] = state[r][c];
            for (let c = 0; c < 4; c++) state[r][c] = row[inv ? (c - r + 4) % 4 : (c + r) % 4];
        }
    }
    function mixColumns(state, inv) {
        const m = inv ? [14, 11, 13, 9] : [2, 3, 1, 1];
        for (let c = 0; c < 4; c++) {
            const a = [state[0][c], state[1][c], state[2][c], state[3][c]];
            state[0][c] = gm(a[0], m[0]) ^ gm(a[1], m[1]) ^ gm(a[2], m[2]) ^ gm(a[3], m[3]);
            state[1][c] = gm(a[1], m[0]) ^ gm(a[2], m[1]) ^ gm(a[3], m[2]) ^ gm(a[0], m[3]);
            state[2][c] = gm(a[2], m[0]) ^ gm(a[3], m[1]) ^ gm(a[0], m[2]) ^ gm(a[1], m[3]);
            state[3][c] = gm(a[3], m[0]) ^ gm(a[0], m[1]) ^ gm(a[1], m[2]) ^ gm(a[2], m[3]);
        }
    }
    function bytesToState(block) {
        const state = [[], [], [], []];
        for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
                state[r][c] = block[c * 4 + r];
        return state;
    }
    function stateToBytes(state) {
        const block = [];
        for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
                block[c * 4 + r] = state[r][c];
        return block;
    }
    function decryptBlock(block, w, Nr) {
        let state = bytesToState(block);
        addRoundKey(state, w, Nr);
        for (let round = Nr - 1; round > 0; round--) {
            shiftRows(state, true);
            subBytes(state, invSBox);
            addRoundKey(state, w, round);
            mixColumns(state, true);
        }
        shiftRows(state, true);
        subBytes(state, invSBox);
        addRoundKey(state, w, 0);
        return stateToBytes(state);
    }
    function encryptBlock(block, w, Nr) {
        let state = bytesToState(block);
        addRoundKey(state, w, 0);
        for (let round = 1; round < Nr; round++) {
            subBytes(state, sBox);
            shiftRows(state, false);
            mixColumns(state, false);
            addRoundKey(state, w, round);
        }
        subBytes(state, sBox);
        shiftRows(state, false);
        addRoundKey(state, w, Nr);
        return stateToBytes(state);
    }
    return {
        decryptCbc: function (cipher, key, iv) {
            const ks = expandKey(key);
            const Nr = ks.Nr, w = ks.w;
            const out = [];
            let prev = iv.slice(0, 16);
            const blocks = cipher.length / 16;
            for (let b = 0; b < blocks; b++) {
                const ctBlock = cipher.slice(b * 16, b * 16 + 16);
                const dec = decryptBlock(ctBlock, w, Nr);
                for (let i = 0; i < 16; i++) {
                    out.push(dec[i] ^ prev[i]);
                }
                prev = ctBlock;
            }
            // strip PKCS#7 padding
            const padLen = out.length ? out[out.length - 1] : 0;
            if (padLen && padLen <= 16) out.splice(out.length - padLen, padLen);
            return out;
        },
        encryptCbc: function (plain, key, iv) {
            const ks = expandKey(key);
            const Nr = ks.Nr, w = ks.w;
            // pad PKCS#7
            const padLen = 16 - (plain.length % 16);
            const padded = plain.slice();
            for (let i = 0; i < padLen; i++) padded.push(padLen);
            const out = [];
            let prev = iv.slice(0, 16);
            for (let b = 0; b < padded.length / 16; b++) {
                const block = padded.slice(b * 16, b * 16 + 16);
                for (let i = 0; i < 16; i++) block[i] ^= prev[i];
                prev = encryptBlock(block, w, Nr);
                for (let i = 0; i < 16; i++) out.push(prev[i]);
            }
            return out;
        }
    };
})();
