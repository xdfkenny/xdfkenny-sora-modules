// comix.to module (comics/manga) for kanzen / Luna / Anymex / Dartotsu (mangas)
//
// The comix.to API (api/v1) is protected by the "X-Scramble" anti-scraping SDK:
// every request needs a deterministic `_` token bound to the exact params, and
// most responses come back encrypted ({"e": "..."}). This module implements
// the whole client in pure JS (no proxy, no browser):
//
//   token   = base64url( S3( S2( S1( utf8( path + '?' + qs ) ) ) ) )
//   decrypt = the inverse chain (S1^-1 -> S2^-1 -> S3^-1)
//
// where S1/S2/S3 are the site's chained substitution ciphers (S-box + rotating
// key stream + chaining) with constants extracted from the secure chunk
// (secure-tjhzks-kfv73cOh.js). Verified byte-exact against the live API on
// both comix.to and comix.ws.

const BASE_URL = 'https://comix.to';

const S1 = 'gbicCvAMzfcXEtGAyjvvhmb2yCWzWhjqcxXZ7ZhpzANOzoQLo3nuPZ2vK9dkb9hJExC0Vni/hdQBceI+mw611gkhQFjBuf4bJg1TxYqM+SL4YDqtwjxiGSdeH7so7Fn1HiRo37Z+RNvl44twXWVhomtMjw+8bemfmv9XEXr7mS82MxaCOJZRR0oHd9PLI5O+gyBGT6hcLoduNa7yCObVVCk3bFWsoD+xcqTrBcP6dNJN/NB1Br2QGhSN2snHAqeRNKVFQiyeAFLPSKGwY8aq9EPgsi17qd4ywPMxiH8w6N1qX1tLKtzhOeemHWeJQfFQ5H23q7qSlJUcjgTEl3x2/Q==';
const D1 = 'rafYl4oSAKQX+GYoic9oW4iGwiYpZzs0';
const SEED1 = 189;
const S2 = '2lQehmgyYFAoWUi0haazZqHy5zZ34NN+VzlfsoB2Y1yY0IuMLjgVcV2xt8t4moH+AP0NMJ5qekW7DFIHEWKkOgIBIMhDdA8lbM6iHKjDlq6IChpb3CnA9NmsvQW/afdt1SfJjTdwcvpKqunCJLxBFmXX9hecm6tGb+HRxD7BC3njoxPxgnX5pdKP1IMSkd4/O3NRfZSE6DVLG2s9uexaipA05cpJzE8Qkv/z5jzHAwlEWOLd3yxA+0cvVbpOoJPFGc8f1lb4vu2HUxjuuEwEQk0GsPCVnyKvfOoh9TG2YYmZLV4I67UU2NsrrakqZ47k/O+ne25/DjPGZCMdnZcmzQ==';
const D2 = '2USAq+VTo5ht4bQn+K9DUcpUQRTtrB56';
const SEED2 = 133;
const S3 = '+mhJSFwzaV+PQPDyKp2scO/S9SdFsy/7e56UWT8XHbK3E2+19nEPwfwOgE9uVCaDtOAWTobCZX+cBCXlIbBqyDyQB1beKLspW6kGPhBCV9x0jf0KUeFhHjmlMf7qMFIB41PfDFprZ3bJiK4YxrZDv+K6dcwJmggVO8f5ktrXTM0cZL4fer0SpnkbvNajPbHxfuTz5lVEBarOI4rdc+2V6zTsjpfQYjgN1MMr6EvA6eehN6dQ1bgUogt9rZOBbQBeNnLYY00uZqSoJBnFi5gthCJsWF33ykosn9v/9KB8udMCz0YRYImrA4VHr5mMgpH4xDXLeEHRd5vZOiAalofuMg==';
const D3 = 'yNHlokVEnuecesDrB/lDhVuUNiheWc3a47VtkwZ2ENg=';
const SEED3 = 32;

const CIPHERS = [
    { S: S1, D: D1, seed: SEED1 },
    { S: S2, D: D2, seed: SEED2 },
    { S: S3, D: D3, seed: SEED3 },
];

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(b64) {
    const s = String(b64).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
    const out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
        const v = B64_CHARS.indexOf(s[i]);
        if (v < 0) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buf >>> bits) & 0xff);
            buf = buf & ((1 << bits) - 1);
        }
    }
    return new Uint8Array(out);
}

function bytesToB64url(bytes) {
    let out = '';
    const pad = bytes.length % 3;
    for (let i = 0; i + 3 <= bytes.length; i += 3) {
        const t = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += B64_CHARS[(t >> 18) & 63] + B64_CHARS[(t >> 12) & 63] + B64_CHARS[(t >> 6) & 63] + B64_CHARS[t & 63];
    }
    if (pad === 1) {
        out += B64_CHARS[(bytes[bytes.length - 1] >> 2) & 63] + B64_CHARS[(bytes[bytes.length - 1] << 4) & 63] + '==';
    } else if (pad === 2) {
        const t = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
        out += B64_CHARS[(t >> 10) & 63] + B64_CHARS[(t >> 4) & 63] + B64_CHARS[(t << 2) & 63] + '=';
    }
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8Encode(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const c2 = str.charCodeAt(i + 1);
            if (c2 >= 0xdc00 && c2 <= 0xdfff) {
                const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
                out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
                i++;
            } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
}

function utf8Decode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) out += String.fromCharCode(b);
        else if (b < 0xe0) out += String.fromCharCode(((b & 31) << 6) | (bytes[++i] & 63));
        else if (b < 0xf0) out += String.fromCharCode(((b & 15) << 12) | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63));
        else {
            const cp = ((b & 7) << 18) | ((bytes[++i] & 63) << 12) | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63);
            out += String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 1023));
        }
    }
    return out;
}

function chain(data, S, D, seed) {
    const out = new Uint8Array(data.length);
    let prev = seed;
    const dLen = D.length;
    for (let i = 0; i < data.length; i++) {
        const x = S[(data[i] ^ D[i % dLen] ^ prev) & 255];
        out[i] = x;
        prev = x;
    }
    return out;
}

function invChain(data, S, D, seed) {
    const inv = new Uint8Array(256);
    for (let i = 0; i < 256; i++) inv[S[i]] = i;
    const out = new Uint8Array(data.length);
    let prev = seed;
    const dLen = D.length;
    for (let i = 0; i < data.length; i++) {
        out[i] = (inv[data[i]] ^ D[i % dLen] ^ prev) & 255;
        prev = data[i];
    }
    return out;
}

// mirror of the site's url normalizer (α_): strip origin, query and /api/v1
function normalizeUrl(url) {
    return url
        .replace(/^https?:\/\/[^/]+/, '')
        .split('?')[0]
        .replace(/^\/api\/v1/, '');
}

// mirror of the site's params serializer (А5): sorted keys, bracket notation
function buildQuery(params) {
    const parts = [];
    function rec(prefix, value) {
        if (value == null) return;
        if (Array.isArray(value)) {
            value.forEach((item, i) => rec(`${prefix}[${i}]`, item));
        } else if (typeof value !== 'object') {
            parts.push(`${prefix}=${value}`);
        } else {
            Object.keys(value).sort().forEach(k => rec(prefix ? `${prefix}[${k}]` : k, value[k]));
        }
    }
    Object.keys(params).sort().forEach(k => { if (k !== '_') rec(k, params[k]); });
    return parts.join('&');
}

function generateToken(url, params) {
    const canonical = (() => {
        const q = buildQuery(params);
        return q ? normalizeUrl(url) + '?' + q : normalizeUrl(url);
    })();
    let data = utf8Encode(canonical);
    for (const { S, D, seed } of CIPHERS) {
        data = chain(data, b64ToBytes(S), b64ToBytes(D), seed);
    }
    return bytesToB64url(data);
}

function decryptBody(e) {
    let data = b64ToBytes(e);
    for (let i = CIPHERS.length - 1; i >= 0; i--) {
        const { S, D, seed } = CIPHERS[i];
        data = invChain(data, b64ToBytes(S), b64ToBytes(D), seed);
    }
    return utf8Decode(data);
}

const API_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

async function apiGet(path, params = {}) {
    const q = buildQuery(params);
    const url = `${BASE_URL}/api/v1${path}?${q}${q ? '&' : ''}_=${generateToken(path, params)}`;
    const resp = await soraFetch(url, { headers: API_HEADERS });
    if (!resp) throw new Error('request failed');
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('bad response: ' + text.slice(0, 120)); }
    if (data && typeof data === 'object' && typeof data.e === 'string') {
        data = JSON.parse(decryptBody(data.e));
    }
    if (data.status !== 'ok') throw new Error('api error: ' + JSON.stringify(data).slice(0, 200));
    return data.result;
}

function cleanText(s) {
    if (!s) return 'N/A';
    return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchResults(keyword, page = 0) {
    try {
        const result = await apiGet('/manga', {
            order: { chapter_updated_at: 'desc' },
            page: 1, limit: 28,
            content_rating: ['safe', 'suggestive'],
            keyword,
        });
        return (result.items || []).map(it => ({
            id: 'https://comix.to' + (it.url || `/title/${it.hid}`),
            title: it.title || '',
            imageURL: (it.poster && (it.poster.large || it.poster.medium)) || '',
        }));
    } catch (e) {
        console.log('comix searchResults error: ' + e.message);
        return [];
    }
}

async function extractDetails(idOrUrl) {
    try {
        const hid = (idOrUrl.match(/comix\.(?:to|ws)\/title\/([^/?#]+)/) || [])[1]?.split('-')[0];
        if (!hid) return { description: 'N/A', tags: [] };
        const m = await apiGet('/manga/' + hid, {});
        let tags = (m.genres || []).map(g => cleanText(typeof g === 'string' ? g : (g.name || g.title || ''))).filter(Boolean);
        if (!tags.length && Array.isArray(m.altTitles)) {
            tags = m.altTitles.slice(0, 8).map(t => cleanText(typeof t === 'string' ? t : (t.name || t.title || ''))).filter(Boolean);
        }
        return {
            description: cleanText(m.synopsis || m.synopsisHtml) || 'N/A',
            tags,
        };
    } catch (e) {
        console.log('comix extractDetails error: ' + e.message);
        return { description: 'Error extracting details', tags: [] };
    }
}

async function extractChapters(idOrUrl) {
    try {
        const hid = (idOrUrl.match(/comix\.(?:to|ws)\/title\/([^/?#]+)/) || [])[1]?.split('-')[0];
        if (!hid) throw new Error('no hid in ' + idOrUrl);
        const chapters = [];
        for (let page = 1; page <= 20; page++) {
            const result = await apiGet(`/manga/${hid}/chapters`, {
                page, limit: 100, order: { number: 'desc' },
            });
            const items = result.items || [];
            items.forEach(it => {
                const lang = (it.language || 'en').toUpperCase();
                chapters.push({
                    id: 'https://comix.to' + it.url,
                    title: `Ch.${it.number}${it.name ? ' - ' + it.name : ''} [${lang}]${it.group ? ' @' + it.group.name : ''}`,
                    chapter: it.number,
                    scanlation_group: (it.group && it.group.name) || '',
                });
            });
            if (!result.meta || !result.meta.hasNext) break;
        }
        chapters.sort((a, b) => a.chapter - b.chapter);
        return { en: chapters.map(ch => [String(ch.chapter), [ch]]) };
    } catch (e) {
        console.log('comix extractChapters error: ' + e.message);
        return { en: [] };
    }
}

async function extractImages(chapterId) {
    try {
        const id = (chapterId.match(/\/title\/[^/]+\/(\d+)-chapter/) || [])[1];
        if (!id) throw new Error('no chapter id in ' + chapterId);
        const m = await apiGet('/chapters/' + id, {});
        const pages = (m.pages && m.pages.items) || [];
        return pages.map(p => p.url).filter(Boolean);
    } catch (e) {
        console.log('comix extractImages error: ' + e.message);
        return [];
    }
}