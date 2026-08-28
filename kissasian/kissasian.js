const KISS_BASE = 'https://kissasian.su';
const KISS_AJAX_SEARCH = KISS_BASE + '/ajax/search';
const KISS_AJAX_FILTER = KISS_BASE + '/ajax/filter';
const KISS_AJAX_INFO = KISS_BASE + '/ajax/info';
const KISS_AJAX_EPLIST = KISS_BASE + '/ajax/ep-list';
const KISS_PLAYER_BASE = 'https://player.dramavideo.se/kr';
const KISS_BUILD = '1.0.1';
console.log('[KissAsian] module loaded v' + KISS_BUILD);

/* MAIN FUNCTIONS */

async function searchResults(keyword) {
    try {
        const query = (keyword || '').trim();
        if (!query) return JSON.stringify([]);
        // Primary: ajax/search with query param (lighter, autocomplete style)
        let results = await searchViaSearchAjax(query);
        if (results.length > 0) return JSON.stringify(results);
        // Fallback: ajax/filter with keyword (needs proper referer/origin)
        results = await searchViaFilterAjax(query);
        return JSON.stringify(results);
    } catch (e) {
        console.log('[KissAsian] search error: ' + e);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const slug = getSlugFromUrl(url);
        if (!slug) return JSON.stringify([detailsFallback()]);
        const infoUrl = KISS_AJAX_INFO + '?slug=' + encodeURIComponent(slug);
        const res = await soraFetch(infoUrl, {
            headers: {
                'Referer': KISS_BASE + '/',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (!res) return JSON.stringify([detailsFallback()]);
        const html = await res.text();
        if (!html || html.indexOf('poster') === -1) return JSON.stringify([detailsFallback()]);
        // description: prefer full block
        let description = extractFirst(html, /<div class="full[^"]*"[^>]*>[\s\S]*?<div>([\s\S]*?)<\/div>/i);
        if (!description) description = extractFirst(html, /<div class="short[^"]*"[^>]*>[\s\S]*?<div>([\s\S]*?)<\/div>/i);
        if (!description) description = extractFirst(html, /<div class="description[\s\S]*?<div>([\s\S]*?)<\/div>/i);
        // aliases: alternative title (native) + genres
        let aliases = '';
        const altTitle = extractFirst(html, /<div class="maindata"[\s\S]*?<div><span>([^<]+)<\/span><\/div>/i);
        const genres = [];
        const genreRe = /<a href="\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
        let gm;
        while ((gm = genreRe.exec(html)) !== null) genres.push(gm[1].trim());
        const country = extractFirst(html, /<a href="\/country\/[^"]+"[^>]*>([^<]+)<\/a>/i);
        const cast = extractFirst(html, /<div>\s*<div>Cast:<\/div>\s*<span>([^<]+)<\/span>/i);
        const parts = [];
        if (altTitle) parts.push(altTitle.trim());
        if (genres.length) parts.push(genres.join(', '));
        if (country) parts.push(country.trim());
        if (cast) parts.push(cast.trim());
        aliases = parts.join(' · ');
        // airdate: Released
        let airdate = extractFirst(html, /<div><div>Released:<\/div><span>([^<]+)<\/span>/i);
        if (!airdate) airdate = extractFirst(html, /<span class="release-date">([^<]+)<\/span>/i);
        if (!airdate) airdate = extractFirst(html, /<span class="type">(\d{4})<\/span>/i);
        return JSON.stringify([{
            description: cleanText(description || 'No description available'),
            aliases: cleanText(aliases || 'N/A'),
            airdate: cleanText(airdate || 'Unknown')
        }]);
    } catch (e) {
        console.log('[KissAsian] details error: ' + e);
        return JSON.stringify([detailsFallback()]);
    }
}

async function extractEpisodes(url) {
    try {
        const slug = getSlugFromUrl(url);
        if (!slug) return JSON.stringify([]);
        // Need a starting episode number — default 1
        const startEp = extractEpisodeNumberFromUrl(url) || 1;
        const epUrl = KISS_AJAX_EPLIST + '?slug=' + encodeURIComponent(slug) + '&currentEpisode=' + startEp + '&type=all';
        const res = await soraFetch(epUrl, {
            headers: {
                'Referer': KISS_BASE + '/' + slug + '-episode-' + startEp,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (!res) return JSON.stringify([]);
        const data = await res.json();
        // ep-list returns {html: "...", totalEpisodes: N}
        let html = '';
        if (data && typeof data === 'object' && data.html) html = data.html;
        else if (typeof data === 'string') html = data;
        else {
            // fallback: maybe returned as text/html not json
            try { html = await res.text(); } catch (_) {}
            const parsed = tryParseJson(html);
            if (parsed && parsed.html) html = parsed.html;
        }
        if (!html) return JSON.stringify([]);
        const episodes = [];
        const seen = new Set();
        const re = /<a[^>]+href="([^"]+)"[^>]*data-num="(\d+)"[^>]*>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            let href = m[1].trim();
            const num = parseInt(m[2], 10);
            if (!href) continue;
            if (href.charAt(0) === '/') href = KISS_BASE + href;
            else if (!/^https?:\/\//i.test(href)) href = KISS_BASE + '/' + href;
            if (seen.has(href)) continue;
            seen.add(href);
            episodes.push({ href: href, number: isNaN(num) ? episodes.length + 1 : num });
        }
        // sort by number ascending
        episodes.sort(function(a,b){ return a.number - b.number; });
        // if nothing but totalEpisodes known, synthesize single entry for movies
        if (episodes.length === 0 && data && data.totalEpisodes === 1) {
            episodes.push({ href: KISS_BASE + '/' + slug + '-episode-1', number: 1 });
        }
        return JSON.stringify(episodes);
    } catch (e) {
        console.log('[KissAsian] episodes error: ' + e);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const epUrl = String(url || '').trim();
        if (!epUrl) return JSON.stringify({ streams: [], subtitles: '' });
        // 1. Fetch episode page to get data-ep / data-server
        const res = await soraFetch(epUrl, { headers: { 'Referer': KISS_BASE + '/' } });
        if (!res) return JSON.stringify({ streams: [], subtitles: '' });
        const html = await res.text();
        const servers = collectServers(html);
        if (!servers || servers.length === 0) {
            console.log('[KissAsian] no servers found on episode page');
            return JSON.stringify({ streams: [], subtitles: '' });
        }
        const streams = [];
        for (let i = 0; i < servers.length; i++) {
            const s = servers[i];
            const playerUrl = KISS_PLAYER_BASE + '?ep=' + encodeURIComponent(s.ep) + '&sv=' + encodeURIComponent(s.sv);
            let playerHtml = '';
            try {
                const pr = await soraFetch(playerUrl, { headers: { 'Referer': KISS_BASE + '/', 'Origin': KISS_BASE } });
                if (!pr) continue;
                playerHtml = await pr.text();
            } catch (e) { continue; }
            const encData = extractFirst(playerHtml, /encData\s*=\s*"([^"]+)"/i);
            const keyHex = extractFirst(playerHtml, /keyHex\s*=\s*"([^"]+)"/i);
            const ivHex = extractFirst(playerHtml, /ivHex\s*=\s*"([^"]+)"/i);
            if (!encData || !keyHex || !ivHex) {
                console.log('[KissAsian] missing enc/key/iv for server ' + s.sv);
                continue;
            }
            let decrypted = '';
            try {
                decrypted = kissDecrypt(encData, keyHex, ivHex);
            } catch (e) {
                console.log('[KissAsian] decrypt failed: ' + e);
                continue;
            }
            if (!decrypted) continue;
            // sources JSON inside decrypted html
            const srcMatch = decrypted.match(/sources\s*=\s*JSON\.parse\(`([^`]+)`\)/);
            let srcJson = '';
            if (srcMatch) srcJson = srcMatch[1];
            else {
                // fallback: look for file URL directly in decrypted
                const direct = decrypted.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
                if (direct) srcJson = '[{"file":"' + direct[1] + '","type":"hls"}]';
            }
            if (!srcJson) continue;
            let srcArr = [];
            try { srcArr = JSON.parse(srcJson); } catch (e) { continue; }
            for (let j = 0; j < srcArr.length; j++) {
                const entry = srcArr[j];
                if (!entry || !entry.file) continue;
                const title = 'KissAsian • ' + (entry.label || entry.type || 'HLS') + (servers.length > 1 ? ' • ' + s.sv : '');
                // Avoid duplicates
                let dup = false;
                for (let k = 0; k < streams.length; k++) if (streams[k].streamUrl === entry.file) { dup = true; break; }
                if (dup) continue;
                streams.push({
                    title: title,
                    streamUrl: entry.file,
                    headers: {
                        'Referer': 'https://player.dramavideo.se/',
                        'Origin': 'https://player.dramavideo.se',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
            }
            // tracks for subtitles
            const trackMatch = decrypted.match(/tracks\s*=\s*JSON\.parse\(`([^`]+)`\)/);
            if (trackMatch) {
                try {
                    const tracks = JSON.parse(trackMatch[1]);
                    if (tracks && tracks.length) {
                        // Could attach first vtt as subtitle field later
                    }
                } catch (_) {}
            }
            // If we got at least one stream from first server, we can return early
            if (streams.length > 0) break;
        }
        if (streams.length === 0) return JSON.stringify({ streams: [], subtitles: '' });
        // subtitles currently not extracted from player; return empty
        return JSON.stringify({ streams: streams, subtitles: '' });
    } catch (e) {
        console.log('[KissAsian] stream error: ' + e);
        return JSON.stringify({ streams: [], subtitles: '' });
    }
}

/* HELPERS */

function detailsFallback() {
    return { description: 'No description available', aliases: 'N/A', airdate: 'Unknown' };
}

function getSlugFromUrl(url) {
    try {
        const str = String(url || '');
        const m = str.match(/\/([a-z0-9\-]+)(?:-episode-\d+)?\/?(?:\?.*)?$/i);
        if (!m) return '';
        let slug = m[1];
        // If url contains -episode-, strip that suffix to get base slug
        const epIdx = str.lastIndexOf('-episode-');
        if (epIdx !== -1) {
            const slashIdx = str.lastIndexOf('/', epIdx);
            const base = str.substring(slashIdx + 1, epIdx);
            if (base) slug = base;
        }
        // For slug already without episode, ensure it's not empty
        // Also handle case where href is like /lovely-runner-2024-episode-16
        if (slug.indexOf('-episode-') !== -1) slug = slug.split('-episode-')[0];
        return slug;
    } catch (_) { return ''; }
}

function extractEpisodeNumberFromUrl(url) {
    const m = String(url || '').match(/-episode-(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
}

function collectServers(html) {
    const out = [];
    const seen = new Set();
    // primary embed
    const pem = html.match(/<div[^>]+class="pembed"[^>]*data-ep="([^"]+)"[^>]*data-server="([^"]+)"[^>]*>/i);
    if (pem) {
        const ep = pem[1].trim();
        const sv = pem[2].trim();
        const key = ep + '|' + sv;
        if (ep && sv && !seen.has(key)) { seen.add(key); out.push({ ep: ep, sv: sv }); }
    }
    // additional servers in list
    const re = /<div[^>]+class="server[^"]*"[^>]*data-server="([^"]+)"[^>]*data-ep="([^"]+)"[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const sv = (m[1] || '').trim();
        const ep = (m[2] || '').trim();
        if (!sv || !ep) continue;
        // some templates have reversed order data-ep/data-server, handle alternate
        const key = ep + '|' + sv;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ep: ep, sv: sv });
    }
    // alternate regex where data-ep before data-server
    const re2 = /data-ep="([^"]+)"[^>]*data-server="([^"]+)"|data-server="([^"]+)"[^>]*data-ep="([^"]+)"/gi;
    // already covered, but ensure at least one
    return out;
}

async function searchViaSearchAjax(query) {
    try {
        const res = await soraFetch(KISS_AJAX_SEARCH, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': KISS_BASE + '/home',
                'Origin': KISS_BASE
            },
            body: 'query=' + encodeURIComponent(query)
        });
        if (!res) return [];
        const html = await res.text();
        return parseSearchHtml(html);
    } catch (_) { return []; }
}

async function searchViaFilterAjax(query) {
    try {
        const res = await soraFetch(KISS_AJAX_FILTER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': KISS_BASE + '/filter?keyword=' + encodeURIComponent(query),
                'Origin': KISS_BASE
            },
            body: 'keyword=' + encodeURIComponent(query) + '&page=1'
        });
        if (!res) return [];
        const html = await res.text();
        return parseFilterHtml(html);
    } catch (_) { return []; }
}

function parseSearchHtml(html) {
    const results = [];
    const seen = new Set();
    // format: <a class="unit" href=xxx> <img src="..."> <div class="name">Title</div>
    const re = /<a[^>]+class="unit"[^>]*href=([^\s>]+)[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<div[^>]+class="name"[^>]*>([^<]+)<\/div>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        let href = (m[1] || '').trim();
        href = href.replace(/^["']|["']$/g, '');
        let image = (m[2] || '').trim();
        let title = cleanText(m[3] || '');
        if (!href || !title) continue;
        if (href.charAt(0) === '/') href = KISS_BASE + href;
        else if (!/^https?:\/\//i.test(href)) href = KISS_BASE + '/' + href;
        if (seen.has(href)) continue;
        seen.add(href);
        if (!image) image = KISS_BASE + '/assets/img/social.webp';
        results.push({ title: title, image: image, href: href });
    }
    return results;
}

function parseFilterHtml(html) {
    const results = [];
    const seen = new Set();
    // poster link and image, title in <div class='name'><a href='...'>Title</a>
    const re = /<a[^>]+class='poster'[^>]+href='([^']+)'[\s\S]*?<img[^>]+src='([^']+)'[^>]*>[\s\S]*?<div class='name'>\s*<a[^>]+>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        let href = (m[1] || '').trim();
        let image = (m[2] || '').trim();
        let title = cleanText(m[3] || '');
        if (!href || !title) continue;
        if (href.charAt(0) === '/') href = KISS_BASE + href;
        else if (!/^https?:\/\//i.test(href)) href = KISS_BASE + '/' + href;
        if (seen.has(href)) continue;
        seen.add(href);
        results.push({ title: title, image: image, href: href });
    }
    // dedup by slug base (strip episode) to avoid listing same drama multiple times with different episodes
    const bySlug = {};
    const deduped = [];
    for (let i = 0; i < results.length; i++) {
        const slug = getSlugFromUrl(results[i].href);
        if (!bySlug[slug]) { bySlug[slug] = true; deduped.push(results[i]); }
    }
    return deduped.length ? deduped : results;
}

function tryParseJson(str) {
    try { return JSON.parse(str); } catch (_) { return null; }
}

function extractFirst(html, regex) {
    const m = String(html || '').match(regex);
    return m ? (m[1] || '').trim() : '';
}

function cleanText(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeHtml(str) {
    return cleanText(str);
}

/* NETWORK */

async function soraFetch(url, options) {
    options = options || {};
    const headers = options.headers || {};
    if (!headers['User-Agent']) headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    if (!headers['Accept']) headers['Accept'] = '*/*';
    const method = options.method || 'GET';
    const body = typeof options.body !== 'undefined' ? options.body : null;
    try {
        return await fetchv2(url, headers, method, body);
    } catch (e) {
        try {
            const resp = await fetch(url, { method: method, headers: headers, body: body });
            if (!resp) return null;
            return {
                ok: !!resp.ok,
                status: resp.status || 0,
                text: async function() { return await resp.text(); },
                json: async function() {
                    if (typeof resp.json === 'function') return await resp.json();
                    return JSON.parse(await resp.text());
                }
            };
        } catch (err) {
            console.log('[KissAsian] soraFetch error: ' + err);
            return null;
        }
    }
}

/* CRYPTO — AES-128-CBC decrypt (same Aes impl as flixlatam) */

function kissDecrypt(b64, keyHex, ivHex) {
    const ct = kissB64ToBytes(b64);
    const key = kissHexToBytes(keyHex);
    const iv = kissHexToBytes(ivHex);
    const plain = Aes.decryptCbc(ct, key, iv);
    return kissBytesToUtf8(plain);
}

function kissHexToBytes(hex) {
    const out = [];
    const h = String(hex || '').trim();
    for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16));
    return out;
}

function kissB64ToBytes(b64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const out = [];
    let buffer = 0, bits = 0;
    const s = String(b64 || '');
    for (let i = 0; i < s.length; i++) {
        const ch = s.charAt(i);
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

function kissBytesToUtf8(bytes) {
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

var Aes = (function () {
    const sBox = [0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];
    const invSBox = [0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d];
    const Rcon = [0x01000000,0x02000000,0x04000000,0x08000000,0x10000000,0x20000000,0x40000000,0x80000000,0x1b000000,0x36000000];
    function gm(a,b){let p=0;for(let i=0;i<8;i++){if(b&1)p^=a;const hi=a&0x80;a=(a<<1)&0xff;if(hi)a^=0x1b;b>>=1;}return p;}
    function expandKey(key){
        const Nk=key.length/4;const Nr=Nk+6;const w=[];
        for(let i=0;i<Nk;i++) w[i]=((key[4*i]<<24)|(key[4*i+1]<<16)|(key[4*i+2]<<8)|key[4*i+3])>>>0;
        for(let i=Nk;i<4*(Nr+1);i++){
            let temp=w[i-1];
            if(i%Nk===0){
                temp=((sBox[(temp>>>16)&0xff]<<24)|(sBox[(temp>>>8)&0xff]<<16)|(sBox[temp&0xff]<<8)|sBox[(temp>>>24)&0xff])>>>0;
                temp=(temp^Rcon[i/Nk-1])>>>0;
            } else if(Nk>6&&i%Nk===4){
                temp=((sBox[(temp>>>24)&0xff]<<24)|(sBox[(temp>>>16)&0xff]<<16)|(sBox[(temp>>>8)&0xff]<<8)|sBox[temp&0xff])>>>0;
            }
            w[i]=(w[i-Nk]^temp)>>>0;
        }
        return {w:w,Nr:Nr};
    }
    function bytesToState(block){const s=[[],[],[],[]];for(let r=0;r<4;r++)for(let c=0;c<4;c++)s[r][c]=block[c*4+r];return s;}
    function stateToBytes(s){const b=[];for(let r=0;r<4;r++)for(let c=0;c<4;c++)b[c*4+r]=s[r][c];return b;}
    function addRoundKey(s,w,round){for(let c=0;c<4;c++){const wv=w[round*4+c];for(let r=0;r<4;r++)s[r][c]^=(wv>>>(24-8*r))&0xff;}}
    function subBytes(s,box){for(let r=0;r<4;r++)for(let c=0;c<4;c++)s[r][c]=box[s[r][c]];}
    function shiftRows(s,inv){for(let r=1;r<4;r++){const row=[];for(let c=0;c<4;c++)row[c]=s[r][c];for(let c=0;c<4;c++)s[r][c]=row[inv?(c-r+4)%4:(c+r)%4];}}
    function mixColumns(s,inv){const m=inv?[14,11,13,9]:[2,3,1,1];for(let c=0;c<4;c++){const a=[s[0][c],s[1][c],s[2][c],s[3][c]];s[0][c]=gm(a[0],m[0])^gm(a[1],m[1])^gm(a[2],m[2])^gm(a[3],m[3]);s[1][c]=gm(a[1],m[0])^gm(a[2],m[1])^gm(a[3],m[2])^gm(a[0],m[3]);s[2][c]=gm(a[2],m[0])^gm(a[3],m[1])^gm(a[0],m[2])^gm(a[1],m[3]);s[3][c]=gm(a[3],m[0])^gm(a[0],m[1])^gm(a[1],m[2])^gm(a[2],m[3]);}}
    function decryptBlock(block,w,Nr){let s=bytesToState(block);addRoundKey(s,w,Nr);for(let round=Nr-1;round>0;round--){shiftRows(s,true);subBytes(s,invSBox);addRoundKey(s,w,round);mixColumns(s,true);}shiftRows(s,true);subBytes(s,invSBox);addRoundKey(s,w,0);return stateToBytes(s);}
    return {
        decryptCbc: function(cipher,key,iv){
            const ks=expandKey(key);const Nr=ks.Nr,w=ks.w;const out=[];let prev=iv.slice(0,16);
            const blocks=cipher.length/16;
            for(let b=0;b<blocks;b++){const ctBlock=cipher.slice(b*16,b*16+16);const dec=decryptBlock(ctBlock,w,Nr);for(let i=0;i<16;i++)out.push(dec[i]^prev[i]);prev=ctBlock;}
            const padLen=out.length?out[out.length-1]:0;
            if(padLen&&padLen<=16) out.splice(out.length-padLen,padLen);
            return out;
        }
    };
})();
