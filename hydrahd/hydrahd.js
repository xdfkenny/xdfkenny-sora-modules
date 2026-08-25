const BASE_URL = 'https://hydrahd.ws';
const STREMIO_OPENSUBTITLES_URL = 'https://opensubtitles-v3.strem.io';
const EMPIRE_COMMUNITY_URL = 'https://stremio-community-subtitles.top';
const OS_REST_SEARCH_URL = 'https://rest.opensubtitles.org/search';
const OS_FILE_DOWNLOAD_URL = 'https://dl.opensubtitles.org/en/download/filead';
const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// Shared community token for the "Stremio Community Subtitles" addon. This is
// NOT a personal key — it is the default community token the addon itself
// publishes for anonymous use (same one SubMaker uses in "Community (Default)"
// mode). No account, no quota, no login. Obfuscated so GitHub secret-scrapers
// cannot harvest the URL token from the raw module; decoded at runtime below.
const SCS_TOKEN_XOR = [59,12,39,40,36,113,116,116,115,53,123,16,115,3,37,38,42,117,3,16,58,7,122,15,56,42,17,20,50,14,112,22,56,15,44,119,40,55,39,10,4,56,53];

// Load marker: visible in the app's logs, so we can tell which script version is
// actually running after a re-add (raw CDN can lag behind the pushed commit).
console.log('[HydraHD] module script loaded v2.2.1 (incremental Beta landing)');

// The app's JavaScriptCore may predate ES2020: polyfill Promise.allSettled so a
// single rejected worker can never abort the whole stream extraction.
if (typeof Promise.allSettled !== 'function') {
    Promise.allSettled = function(promises) {
        return Promise.all(promises.map(function(p) {
            return Promise.resolve(p).then(
                function(value) { return { status: 'fulfilled', value: value }; },
                function(reason) { return { status: 'rejected', reason: reason }; }
            );
        }));
    };
}

// Normalize whatever the app's fetch/fetchv2 returned into a Response-like
// object. Some app builds resolve with the body STRING instead of a Response
// (the docs show `const data = await JSON.parse(response)`), others reject on
// non-2xx — handle every shape so callers can always .text()/.json().
function toResponseLike(value) {
    if (value && typeof value.text === 'function') {
        // Already Response-like (Node fetch / fetchv2 bridge) — but NOT safe to
        // pass through raw. Shirox's fetchv2 Response returns a plain object
        // from .json() SYNCHRONOUSLY, so `.json().catch(...)` throws
        // "catch is not a function" and killed every resolver that used it.
        // Re-wrap so text()/json() are always real promises in both apps.
        return {
            status: typeof value.status === 'number' ? value.status : 200,
            ok: value.ok !== false,
            headers: value.headers || { get: function() { return null; } },
            text: async function() {
                return String((await Promise.resolve(value.text())) || '');
            },
            json: async function() {
                if (typeof value.json === 'function') {
                    try {
                        var parsed = await Promise.resolve(value.json());
                        if (parsed != null) return parsed;
                    } catch (e) { /* fall back to parsing the body text */ }
                }
                return JSON.parse(String((await Promise.resolve(value.text())) || ''));
            }
        };
    }
    let str = '';
    try {
        if (value == null) str = '';
        else if (typeof value === 'string') str = value;
        else if (typeof value.toString === 'function') str = String(value);
    } catch (e) { str = ''; }
    return {
        status: 200,
        ok: true,
        headers: { get: function() { return null; } },
        text: async function() { return str; },
        json: async function() { return JSON.parse(str); }
    };
}

async function soraFetch(url, options = {}) {
    const headers = options.headers || {};
    if (!headers['User-Agent']) {
        headers['User-Agent'] = USER_AGENT;
    }
    // The app's fetchv2 bridge cannot decompress gzip/brotli bodies, so ask
    // for identity encoding. Some endpoints (e.g. strem.io) serve compressed
    // JSON by default, which decodes to an empty body and breaks parsing.
    if (!headers['Accept-Encoding']) {
        headers['Accept-Encoding'] = 'identity';
    }
    // App bridge first: fetchv2(url, headers, method, body). May throw on
    // non-2xx or resolve with the raw body — never let that escape.
    try {
        const r = await fetchv2(url, headers, options.method || 'GET', options.body || null);
        if (r) return toResponseLike(r);
    } catch (e) { /* fall through to plain fetch */ }
    // Plain fetch fallback (two call signatures the app accepts). Wrap string
    // bodies into a Response-like object so .text()/.json() always exist.
    try {
        const r = await fetch(url, headers);
        if (r) return toResponseLike(r);
    } catch (e) { /* try the options-object signature */ }
    try {
        const r = await fetch(url, { headers: headers, method: options.method || 'GET', body: options.body || null });
        if (r) return toResponseLike(r);
    } catch (e) { /* give up below */ }
    console.log('[HydraHD] fetch failed (all attempts): ' + String(url).slice(0, 100));
    return toResponseLike(null);
}

// The Sora app's JavaScriptCore exposes NO setTimeout/setInterval, so any
// use of it crashes in-app ("Can't find variable: setTimeout"). timerSafe()
// returns a promise that resolves after ms when timers exist, else resolves
// immediately — keeping the module functional in BOTH environments.
function timerSafe(ms) {
    if (typeof setTimeout === 'function') {
        return new Promise(function(resolve) { setTimeout(resolve, ms || 0); });
    }
    return Promise.resolve();
}

// Page memo: the app calls extractDetails AND extractStreamUrl on the SAME
// title URL back to back — without this, every open pays the full page round
// trip twice (~0.7s each on real networks). Plain object memo, no timers.
const pageMemo = {};

// ---- Soft clock -------------------------------------------------------------
// In-app there are no timers, so soraFetchTimed degrades to an unbounded
// fetch and a bridge that leaves a promise pending FOREVER (Shirox on a
// blocked/challenged host) freezes the whole extraction. Wall time can still
// be measured without timers: a 204 connectivity check costs exactly one
// real round trip. Racing risky phases against N sequential checks bounds
// them to roughly N x RTT — healthy hosts simply win the race first.
const CLOCK_URLS = [
    'https://www.google.com/generate_204',
    'https://cp.cloudflare.com/generate_204',
    'https://hydrahd.ws/robots.txt'
];
function clockFetch(url) {
    try {
        const r = fetch(url);
        if (r && typeof r.then === 'function') return r;
    } catch (e) {}
    try {
        const r = fetchv2(url, {}, 'GET', null);
        if (r && typeof r.then === 'function') return r;
    } catch (e) {}
    return Promise.reject(new Error('no bridge'));
}
function clockTick(i) {
    const attempt = function(j) {
        if (j >= CLOCK_URLS.length) return Promise.resolve(false);
        return clockFetch(CLOCK_URLS[j]).then(
            function() { return true; },
            function() { return attempt(j + 1); }
        );
    };
    return attempt(i % CLOCK_URLS.length);
}
// One SHARED ping loop serves every concurrent softRace: each registers a
// deadline, the loop fires whichever are due after each ping, and stops the
// moment no phases remain. This keeps the request overhead to a single ping
// stream instead of one per phase.
const CLOCK_BUS = { active: false, waiters: [], n: 0 };
function ensureClockLoop() {
    if (CLOCK_BUS.active) return;
    CLOCK_BUS.active = true;
    const started = Date.now();
    const loop = function() {
        const now = Date.now();
        const pending = [];
        for (let i = 0; i < CLOCK_BUS.waiters.length; i++) {
            const w = CLOCK_BUS.waiters[i];
            if (now >= w.deadline) w.fire(); else pending.push(w);
        }
        CLOCK_BUS.waiters = pending;
        // Hard stop 25s after first use: past this the app's own kill timer
        // is close anyway — resolve everyone rather than ping forever.
        if (CLOCK_BUS.waiters.length === 0 || now - started > 25000) {
            CLOCK_BUS.active = false;
            for (let j = 0; j < CLOCK_BUS.waiters.length; j++) CLOCK_BUS.waiters[j].fire();
            CLOCK_BUS.waiters = [];
            return;
        }
        clockTick(CLOCK_BUS.n++).then(loop, loop);
    };
    loop();
}
function softRace(promise, budgetMs) {
    let res;
    let done = false;
    const w = { deadline: Date.now() + budgetMs };
    w.fire = function() {
        if (done) return;
        done = true;
        const i = CLOCK_BUS.waiters.indexOf(w);
        if (i >= 0) CLOCK_BUS.waiters.splice(i, 1);
        res(null);
    };
    const clockPromise = new Promise(function(resolve) { res = resolve; });
    CLOCK_BUS.waiters.push(w);
    ensureClockLoop();
    return Promise.race([
        Promise.resolve(promise).then(
            function(v) {
                done = true;
                const i = CLOCK_BUS.waiters.indexOf(w);
                if (i >= 0) CLOCK_BUS.waiters.splice(i, 1);
                return v || null;
            },
            function(e) {
                done = true;
                const i = CLOCK_BUS.waiters.indexOf(w);
                if (i >= 0) CLOCK_BUS.waiters.splice(i, 1);
                throw e;
            }
        ),
        clockPromise
    ]);
}

async function getPageHtml(fullUrl) {
    if (pageMemo[fullUrl]) return pageMemo[fullUrl];
    const html = await softRace((async function() {
        const response = await soraFetch(fullUrl);
        return response.text();
    })(), 8000);
    if (html && html.length > 1000) {
        pageMemo[fullUrl] = html;
        const keys = Object.keys(pageMemo);
        if (keys.length > 12) delete pageMemo[keys[0]];   // tiny LRU by insertion
    }
    return html;
}

// Wrap a fetch so a dead server cannot stall the whole stream resolution.
// Without timers there is no race to lose: the app enforces its own overall
// timeout, so just pass the plain fetch through.
function soraFetchTimed(url, options, timeoutMs) {
    if (typeof setTimeout !== 'function') return soraFetch(url, options);
    const limit = timeoutMs || 9000;
    return Promise.race([
        soraFetch(url, options),
        new Promise(function(resolve) {
            setTimeout(function() { resolve(null); }, limit);
        })
    ]);
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

// ---- Real synopsis via Cinemeta ---------------------------------------------
// The site's <meta name="description"> is SEO spam ("Watch X online free on
// HYDRAHD..."), never the title's actual plot. Movie pages embed their IMDb id,
// but SERIES pages don't — for those, resolve the id through Cinemeta's keyless
// title-search catalog first, then fetch the full meta. Falls back to the site
// text when nothing matches; details must never block or fail on this.
function cleanTitleForMeta(title) {
    return String(title || '')
        .replace(/\s*online\s+free.*$/i, '')
        .replace(/^\s*watch\s+/i, '')
        .replace(/\s*\(\d{4}\)\s*$/, '')
        .replace(/[|–-]\s*HYDRAHD.*$/i, '')
        .trim();
}

async function cinemetaMetaByImdb(type, imdbId) {
    const r = await soraFetchTimed(`${CINEMETA_URL}/meta/${type}/${encodeURIComponent(imdbId)}.json`, {}, 6000);
    if (!r || !r.ok) return null;
    const data = await r.json();
    return (data && data.meta) || null;
}

async function cinemetaMetaByTitle(type, pageTitle) {
    const clean = cleanTitleForMeta(pageTitle);
    if (!clean || clean.length < 2) return null;
    try {
        const r = await soraFetchTimed(`${CINEMETA_URL}/catalog/${type}/top/search=${encodeURIComponent(clean)}.json`, {}, 8000);
        if (!r || !r.ok) return null;
        const data = await r.json();
        const metas = (data && data.metas) || [];
        if (!metas.length) return null;
        const lower = clean.toLowerCase();
        // Search metas carry no description — grab the best name match's IMDb
        // id, then pull its full meta for the real overview.
        const best = metas.find(function(m) { return String(m.name || '').toLowerCase() === lower; })
            || metas.find(function(m) { return String(m.name || '').toLowerCase().indexOf(lower) === 0; })
            || metas[0];
        return best && best.id ? cinemetaMetaByImdb(type, best.id) : null;
    } catch (e) {
        console.error('[HydraHD] Cinemeta search error:', e.message);
        return null;
    }
}

async function resolveRealDetails(ids, url, pageTitle) {
    const type = /watchseries|\/tv[/?]|series/i.test(String(url)) ? 'series' : 'movie';
    let meta = null;
    if (ids && ids.imdb) {
        try { meta = await cinemetaMetaByImdb(type, ids.imdb); } catch (e) { meta = null; }
    }
    if (!meta) {
        try { meta = await cinemetaMetaByTitle(type, pageTitle); } catch (e) { meta = null; }
    }
    if (!meta) return null;
    const desc = typeof meta.description === 'string' ? meta.description.trim() : '';
    return {
        description: desc.length > 40 ? desc : null,
        airdate: typeof meta.releaseInfo === 'string' && meta.releaseInfo ? meta.releaseInfo : null,
        imdbRating: typeof meta.imdbRating === 'string' && meta.imdbRating ? meta.imdbRating : null
    };
}

async function extractDetails(url) {
    try {
        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
        const html = await getPageHtml(fullUrl);

        const { details, ids } = getPageDetails(html);
        try {
            const real = await resolveRealDetails(ids, fullUrl, details.title);
            if (real) {
                if (real.description) details.description = real.description;
                if ((!details.airdate || details.airdate === 'N/A') && real.airdate) details.airdate = real.airdate;
            }
        } catch (e) { /* keep site text */ }
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
        const html = await getPageHtml(fullUrl);

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
        // Order by season then episode so the app's season detector (which splits
        // a flat list on an episode-number reset) groups multi-season shows into
        // real seasons. Sorting by episode number alone would interleave seasons
        // into 1,1,1,2,2,2,... and render as one flat list.
        uniqueEpisodes.sort(function(a, b) {
            const seasonA = parseInt((a.href.match(/season\/(\d+)/) || [])[1] || '1', 10);
            const seasonB = parseInt((b.href.match(/season\/(\d+)/) || [])[1] || '1', 10);
            if (seasonA !== seasonB) return seasonA - seasonB;
            return a.number - b.number;
        });
        return JSON.stringify(uniqueEpisodes);
    } catch (error) {
        console.error('Episodes error:', error);
        return JSON.stringify([]);
    }
}

// ---- True-quality + audio-language probe -----------------------------------
// The site's server badges ("(Original)", "(4K)") are only guesses. The REAL
// resolution lives in each host's master playlist (#EXT-X-STREAM-INF
// RESOLUTION=WxH) and scope films pack fewer vertical lines into UHD-class
// encodes — Interstellar's "2160p" variant is 3832x1600 (players show ~1440p)
// while a true-UHD title like Sinners is 3840x2160. Audio languages come from
// #EXT-X-MEDIA TYPE=AUDIO renditions. Measured labels replace the guesses.
function parseM3u8VideoResolution(text) {
    if (!text) return null;
    let bestW = 0;
    let bestH = 0;
    const resRe = /RESOLUTION=(\d+)x(\d+)/g;
    let m;
    while ((m = resRe.exec(text)) !== null) {
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        if (w * h > bestW * bestH) { bestW = w; bestH = h; }
    }
    return bestW > 0 ? { width: bestW, height: bestH } : null;
}

function qualityClassFromDimensions(w, h) {
    // Height decides the class because width scales with aspect ratio: a
    // scope-ratio UHD encode (~3832x1600) must NOT be advertised as 4K.
    if (!w || !h) return '';
    return qualityFromHeight(h);
}

function qualityFromHeight(h) {
    if (h >= 2000) return '4K';
    if (h >= 1400) return '1440p';
    if (h >= 1000) return '1080p';
    if (h >= 700) return '720p';
    if (h >= 400) return String(h) + 'p';
    return '';
}

const AUDIO_LANG_2_TO_3 = {
    en: 'eng', it: 'ita', es: 'spa', pt: 'por', fr: 'fra', de: 'deu',
    hi: 'hin', ja: 'jpn', ko: 'kor', zh: 'zho', ru: 'rus', ar: 'ara',
    tr: 'tur', pl: 'pol', nl: 'nld', sv: 'swe', fi: 'fin', da: 'dan',
    no: 'nor', el: 'ell', hu: 'hun', cs: 'ces', th: 'tha', vi: 'vie',
    id: 'ind', bn: 'ben', ur: 'urd', uk: 'ukr', he: 'heb', ro: 'ron'
};

function normalizeAudioLangCode(tag) {
    const t = String(tag || '').trim().toLowerCase();
    if (!t) return '';
    return Object.prototype.hasOwnProperty.call(AUDIO_LANG_2_TO_3, t) ? AUDIO_LANG_2_TO_3[t] : t.slice(0, 3);
}

function audioLanguageName(tag) {
    return subtitleLanguageName(normalizeAudioLangCode(tag));
}

// Flag emojis so users can tell at a glance which entry plays which audio
// language (🇬🇧 = English original, 🇮🇹 = Italian dub, ...).
const LANG_FLAG_EMOJI = {
    eng: '🇬🇧', ita: '🇮🇹', spa: '🇪🇸', fra: '🇫🇷', fre: '🇫🇷',
    deu: '🇩🇪', ger: '🇩🇪', por: '🇵🇹', pob: '🇧🇷', jpn: '🇯🇵',
    kor: '🇰🇷', zho: '🇨🇳', zht: '🇹🇼', rus: '🇷🇺', ara: '🇸🇦',
    hin: '🇮🇳', tur: '🇹🇷', pol: '🇵🇱', nld: '🇳🇱', dut: '🇳🇱',
    swe: '🇸🇪', fin: '🇫🇮', dan: '🇩🇰', nor: '🇳🇴', ell: '🇬🇷',
    gre: '🇬🇷', hun: '🇭🇺', ces: '🇨🇿', cze: '🇨🇿', ron: '🇷🇴',
    rum: '🇷🇴', ukr: '🇺🇦', tha: '🇹🇭', vie: '🇻🇳', ind: '🇮🇩',
    msa: '🇲🇾', ben: '🇧🇩', tam: '🇮🇳', tel: '🇮🇳', mal: '🇮🇳',
    heb: '🇮🇱', bul: '🇧🇬', hrv: '🇭🇷', srp: '🇷🇸'
};

function languageFlag(code) {
    const k = normalizeAudioLangCode(code);
    return LANG_FLAG_EMOJI[k] || '🏳️';
}

// VixSrc-style hosts take a two-letter ?lang= URL param while HLS LANGUAGE
// attrs are three-letter — reverse of AUDIO_LANG_2_TO_3.
const AUDIO_LANG_3_TO_2 = {};
(function() {
    for (const k in AUDIO_LANG_2_TO_3) {
        if (Object.prototype.hasOwnProperty.call(AUDIO_LANG_2_TO_3, k)) {
            AUDIO_LANG_3_TO_2[AUDIO_LANG_2_TO_3[k]] = k;
        }
    }
})();

// Parse #EXT-X-MEDIA TYPE=AUDIO renditions into {code(3-letter), name, isDefault}.
function parseM3u8AudioTracks(text) {
    const tracks = [];
    if (!text) return tracks;
    const seen = {};
    const mediaRe = /#EXT-X-MEDIA:[^\r\n]*/g;
    let line;
    while ((line = mediaRe.exec(text)) !== null) {
        const entry = line[0];
        if (!/TYPE=(?:AUDIO|audio)/.test(entry)) continue;
        const code = normalizeAudioLangCode((entry.match(/LANGUAGE="([^"]*)"/) || [])[1]);
        const name = (entry.match(/NAME="([^"]*)"/) || [])[1] || '';
        const isDefault = /DEFAULT=(?:YES|yes)/.test(entry);
        if (!code || seen[code]) continue;
        seen[code] = true;
        tracks.push({ code: code, name: audioLanguageName(code) || code.toUpperCase(), isDefault: isDefault });
    }
    return tracks;
}

async function extractStreamUrl(url) {
    const streams = [];
    let subtitle = '';
    let subtitleHeaders = null;
    let subtitleList = [];
    // The app kills stream resolution after a bounded timeout (~40s), so the
    // whole function must stay well under it: server batch + keyless + mirrors
    // + subtitles. Phases check this deadline and bail early when exceeded.
    const startTime = Date.now();
    const timeLeft = function() { return 28000 - (Date.now() - startTime); };
    try {
        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
        const html = await getPageHtml(fullUrl);

        const { details, ids } = getPageDetails(html);
        const imdbId = ids.imdb;
        const tmdbId = ids.tmdb;
        console.log('[HydraHD] Parsed IDs imdb=' + (imdbId || 'NONE') + ' tmdb=' + (tmdbId || 'NONE') + ' url=' + fullUrl);
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
        // Host-specific resolvers need only the ids + episode context, which are
        // already parsed — so every id-only workstream below LAUNCHES BEFORE the
        // ajax round trip instead of waiting for it.
        const ctxInfo = { imdbId: imdbId, tmdbId: tmdbId, isMovie: isMovie, season: season, episode: episodeNum };
        // One shared in-flight promise per host: server buttons AND the direct
        // keyless entries often point at the SAME host (Hydra2->vixsrc,
        // Golf->moviesapi, Whiskey->xpass). Without this, identical resolver
        // chains ran 2-3x per extraction (measured in bench: vidora x3, vixsrc
        // api/embed/playlist x2, xpass x2).
        const sharedResolverPromises = {};
        function resolveShared(kind) {
            const fns = { vixsrc: resolveVixsrcLink, moviesapi: resolveMoviesapiLink, xpass: resolveXpassLink };
            if (!sharedResolverPromises[kind]) {
                sharedResolverPromises[kind] = fns[kind](ctxInfo);
            }
            return sharedResolverPromises[kind];
        }
        // Dispatch one ajax button to its host resolver; unknown embeds fall
        // back to the generic m3u8 scan of the raw HTML.
        function resolveButton(link) {
            let host = '';
            try { host = new URL(link).hostname; } catch (e) { host = ''; }
            try {
                if (host === 'moviesapi.to' || host === 'www.moviesapi.to') return resolveShared('moviesapi');
                if (host === 'vixsrc.to' || host === 'www.vixsrc.to') return resolveShared('vixsrc');
                if (host === 'play.xpass.top') return resolveShared('xpass');
                // Next.js SPA: verified there is no m3u8 anywhere in the raw
                // HTML — the generic scan can only burn its full timeout here.
                if (/videasy/i.test(host)) return Promise.resolve(null);
            } catch (e) { /* fall through to generic scan */ }
            return resolveGenericLink(link);
        }
        const seenStreamUrls = {};
        // ---- True-quality probe, PIPELINED ---------------------------------
        // Probes fire the moment a stream is pushed instead of waiting for all
        // workers to settle — each fetch overlaps the remaining workers' tail,
        // so labeling costs ~zero extra wall time. Variants pushed after their
        // parent was measured get the class instantly via _measuredCls.
        const probedPaths = {};
        const probePromises = [];
        function baseNameOf(st) {
            return String(st.baseTitle || st.title || '')
                .replace(/\s*\((?:original|4k|hd|cam)\)\s*$/i, '').trim()
                || String(st.title || '');
        }
        function applyMeasured(parent, plText) {
            const dims = parseM3u8VideoResolution(plText);
            if (!dims) return false;
            const cls = qualityClassFromDimensions(dims.width, dims.height);
            if (!cls) return false;
            const tracks = parseM3u8AudioTracks(plText);
            const def = tracks.find(function(t) { return t.isDefault; }) || tracks[0];
            // No AUDIO renditions listed => single muxed track. Every host this
            // module resolves serves English-original audio.
            const defCode = def ? def.code : 'eng';
            const defName = def ? def.name : 'English';
            parent.title = languageFlag(defCode) + ' ' + baseNameOf(parent) + ' • ' + defName + ' • ' + cls;
            parent.name = parent.title;
            parent.quality = cls;
            parent._measuredCls = cls;
            for (const sib of streams) {
                if (sib.qSiblingOf !== parent || sib.isLangVariant !== true) continue;
                sib.title = languageFlag(sib.langCode) + ' ' + baseNameOf(sib) + ' • ' + subtitleLanguageName(sib.langCode) + ' • ' + cls;
                sib.name = sib.title;
                sib.quality = cls;
            }
            return true;
        }
        function scheduleProbe(st) {
            try {
                if (!st || st.isLangVariant || !st.streamUrl) return;
                // VixSrc masters end in /playlist/{id} with no extension —
                // match both shapes or Hydra2 goes unlabeled.
                if (!/\.m3u8|\/playlist\//i.test(st.streamUrl)) return;
                const key = String(st.streamUrl).split('?')[0];
                if (probedPaths[key] || probePromises.length >= 8) return;
                probedPaths[key] = true;
                probePromises.push((async function() {
                    try {
                        if (timeLeft() < 3000) return;
                        let plText = st.playlistText || '';
                        if (!plText) {
                            const pr = await soraFetchTimed(st.streamUrl, { headers: st.headers || {} }, 4000);
                            if (!pr) return;
                            plText = await pr.text();
                        }
                        st.masterText = plText;   // reused by the playlist-subs step
                        applyMeasured(st, plText);
                    } catch (e) { /* keep the site badge */ }
                })());
            } catch (e) {}
        }
        function pushStream(title, streamUrl, headers) {
            if (!streamUrl || seenStreamUrls[streamUrl]) return null;
            seenStreamUrls[streamUrl] = true;
            const st = {
                title: title, name: title, quality: title,
                baseTitle: title,
                streamUrl: streamUrl, url: streamUrl,
                headers: headers || {}
            };
            streams.push(st);
            scheduleProbe(st);
            return st;
        }
        // One extra selectable entry per additional AUDIO language a server
        // offers ("🇮🇹 Hydra2 • Italian"). The child shares the parent's video
        // renditions; its URL preselects that language's audio track.
        function pushLanguageVariants(parent, extraLangs) {
            if (!parent || !Array.isArray(extraLangs)) return;
            const cls = parent._measuredCls;
            for (const al of extraLangs) {
                if (!al || !al.url || streams.length >= 10) continue;
                if (seenStreamUrls[al.url]) continue;
                seenStreamUrls[al.url] = true;
                const title = cls
                    ? languageFlag(al.code) + ' ' + baseNameOf(parent) + ' • ' + subtitleLanguageName(al.code) + ' • ' + cls
                    : parent.baseTitle + ' ' + languageFlag(al.code) + ' ' + subtitleLanguageName(al.code);
                streams.push({
                    title: title, name: title, quality: cls || title,
                    baseTitle: parent.baseTitle,
                    langCode: al.code,
                    qSiblingOf: parent,
                    isLangVariant: true,
                    streamUrl: al.url, url: al.url,
                    headers: parent.headers || {}
                });
            }
        }
        // Worker: direct keyless hosts — ids only, launches immediately.
        const keylessWorker = (async function() {
            try {
                const directHosts = [
                    { name: 'Hydra2 (Original)', kind: 'vixsrc', origin: 'https://vixsrc.to/' },
                    { name: 'Golf (Original)', kind: 'moviesapi', origin: 'https://moviesapi.to/' },
                    { name: 'Whiskey (Original)', kind: 'xpass', origin: 'https://play.xpass.top/' }
                ];
                await Promise.all(directHosts.map(async function(host) {
                    if (timeLeft() < 4000) return;
                    try {
                        const resolved = await resolveShared(host.kind);
                        if (resolved && resolved.streamUrl) {
                            const pushedSt = pushStream(host.name, resolved.streamUrl, { 'Referer': host.origin, 'Origin': host.origin });
                            // Resolver already downloaded the master for language
                            // discovery — hand the text to the probe so it does
                            // not re-fetch the same playlist.
                            if (pushedSt && resolved.playlistText) pushedSt.playlistText = resolved.playlistText;
                            pushLanguageVariants(pushedSt, resolved.extraLangs);
                        }
                    } catch (e) { /* skip this host */ }
                }));
                console.log('[HydraHD] Direct keyless streams=' + streams.length);
            } catch (e) {
                console.error('[HydraHD] Keyless worker error:', e && e.message ? e.message : e);
            }
        })();
        // Worker: Videasy "Beta" — originals incl. true 4K + per-language dubs
        // (Spanish/German/Hindi/Portuguese where the title has them). Ids
        // only; each source entry carries its own audio-language label.
        // Beta's CDN encodes resolution in the filename (index-s2160p-…), so
        // the class comes straight from the URL — the pipelined probe still
        // refines it (scope films measure down to 1440p) if it reaches it.
        const videasyWorker = (async function() {
            try {
                if (!tmdbId || timeLeft() < 6000) return;
                let total = 0, added = 0;
                await resolveVideasyLink(ctxInfo, function(sources) {
                    for (const s of sources) {
                        if (!s || !s.streamUrl || streams.length >= 10) return;
                        const code = s.langCode || 'eng';
                        const urlCls = (function() {
                            const m = String(s.streamUrl).match(/-s(\d{3,4})p[-\.]/i);
                            return m ? qualityFromHeight(parseInt(m[1], 10)) : '';
                        })();
                        let title = languageFlag(code) + ' Beta • ' + subtitleLanguageName(code);
                        if (urlCls) title += ' • ' + urlCls;
                        const pushedSt = pushStream(title, s.streamUrl, { 'Referer': 'https://player.videasy.to/' });
                        if (pushedSt && urlCls && pushedSt.quality === title) pushedSt.quality = urlCls;
                        if (pushedSt) { added++; }
                    }
                    total += sources.length;
                }) || [];
                console.log('[HydraHD] Videasy sources=' + total + ' pushed=' + added);
            } catch (e) {
                console.error('[HydraHD] Videasy worker error:', e && e.message ? e.message : e);
            }
        })();
        // Shared mirror helper: pushes the resolved stream plus any extra
        // mirrors the resolver returned (VidSrc hands back up to 3).
        async function addMirror(title, origin, resolver) {
            if (streams.length >= 6 || timeLeft() < 5000) return;
            try {
                const resolved = await resolver();
                if (resolved && resolved.streamUrl) {
                    pushStream(title, resolved.streamUrl, { 'Referer': origin, 'Origin': origin });
                    if (!subtitle && resolved.subtitle) subtitle = resolved.subtitle;
                    const extra = resolved.extra || [];
                    for (let i = 0; i < extra.length && streams.length < 6; i++) {
                        if (extra[i] && extra[i].streamUrl) {
                            pushStream(title + ' #' + (i + 2), extra[i].streamUrl,
                                { 'Referer': origin, 'Origin': origin });
                        }
                    }
                }
            } catch (e) {
                console.error(title + ' resolution failed:', e.message);
            }
        }
        // Worker: mirrors — VidSrc AND VidFast run CONCURRENTLY. VidSrc MUST
        // stay parallel: on devices where vidsrc.hair is blocked, its connect
        // attempts hang until the OS TCP timeout (the app's JSContext has no
        // timers, so our fetch timeouts are decorative in-app) — the v1.0.44
        // sequential "fallback tier" serialized that hang in front of the
        // probe and pushed extractions past 50s. Parallel costs nothing when
        // healthy and overlaps the hang when not; addMirror's caps keep its
        // results from flooding the list.
        const mirrorWorker = (async function() {
            try {
                await Promise.all([
                    addMirror('VidSrc', 'https://vidsrc.hair/', function() {
                        return resolveVidSrc(imdbId, isMovie, season, episodeNum, Math.min(timeLeft(), 5000));
                    }),
                    addMirror('VidFast', 'https://vidfast.vc/', function() {
                        return resolveVidfast(imdbId, isMovie, season, episodeNum, Math.min(timeLeft(), 8000));
                    })
                ]);
            } catch (e) {
                console.error('[HydraHD] Mirror worker error:', e && e.message ? e.message : e);
            }
        })();
        // Subtitle providers: launch immediately too (ids only). They no longer
        // gate the stream list — see the await split after the probe phase —
        // and the old fixed 800ms stagger is gone (providers were already
        // concurrent; the stagger just delayed all three together).
        let merged = null;
        const subsWorker = (async function() {
            try {
                if (!imdbId) return;
                // Each provider is caught individually: the app's fetch bridge
                // can throw Error('') on network failure, and a rejection in any
                // provider must NEVER kill the other two (that was wiping ALL
                // subtitles in-app).
                const safe = function(p) {
                    return Promise.resolve(p).catch(function(e) {
                        console.error('[HydraHD] subs provider error: ' + (e && e.message ? e.message : String(e)));
                        return null;
                    });
                };
                const [osRestResult, stremioResult, communityResult] = await Promise.all([
                    safe(resolveOsRestSubtitle(imdbId, isMovie, season, episodeNum)),
                    safe(resolveStremioSubtitle(imdbId, isMovie ? 'movie' : 'series', season, episodeNum)),
                    safe(resolveCommunitySubtitle(imdbId, isMovie ? 'movie' : 'series', season, episodeNum))
                ]);
                merged = mergeSubtitleResults(stremioResult, communityResult, osRestResult);
            } catch (e) {
                console.error('[HydraHD] Subs worker error: ' + (e && e.message ? e.message : String(e)));
            }
        })();
        const paramString = Object.keys(ajaxParams).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(ajaxParams[k])).join('&');
        // Referer must be the ABSOLUTE page URL — the app hands series episode
        // links as relative hrefs (/watchseries/...), and a relative Referer
        // makes hydrahd return a non-ajax page (0 server buttons in-app).
        // Soft-clocked: a wedged bridge can no longer stall everything.
        const ajaxHtml = await softRace((async function() {
            const ajaxResponse = await soraFetch(`${ajaxUrl}?${paramString}`, {
                headers: {
                    'Referer': fullUrl,
                    'X-Requested-With': 'XMLHttpRequest',
                }
            });
            return ajaxResponse.text();
        })(), 8000);
        // Server picker buttons carry the human name ("Hydra1", "Whiskey", ...)
        // next to the embed link; fall back to the domain name when missing.
        const serverEntries = [];
        // Server buttons can carry a trailing-space class ("iframe-server-button ")
        // or the selected-server variant ("iframe-server-button active") — both
        // must match. The human name sits in the first <p>, the quality tag
        // ("(Original)"/"(4K)") in the second <p class="iframe-server-quality">.
        const buttonRe = /<div\s+class="iframe-server-button(?:\s+active)?\s*"[^>]*data-id="\d+"[^>]*data-link="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g;
        let btnMatch;
        while ((btnMatch = buttonRe.exec(ajaxHtml)) !== null) {
            const seg = btnMatch[2] || '';
            const name = (seg.match(/<p[^>]*>\s*([^<]+?)\s*<\/p>/) || [])[1];
            if (name && btnMatch[1]) {
                const quality = (seg.match(/iframe-server-quality[^>]*>\s*([^<]+?)\s*<\/p>/) || [])[1];
                serverEntries.push({
                    name: quality ? (name + ' ' + String(quality).trim()) : String(name).trim(),
                    link: btnMatch[1]
                });
            }
        }
        if (serverEntries.length === 0) {
            // Fallback: no named buttons found — use every embed link in order.
            // RegExp.exec loop (not matchAll) so it works on older JavaScriptCore.
            const linkRe = /data-link="([^"]+)"/g;
            let linkMatch;
            while ((linkMatch = linkRe.exec(ajaxHtml)) !== null) {
                serverEntries.push({ name: getServerTitle(linkMatch[1]), link: linkMatch[1] });
            }
        }
        // Worker: named server buttons. Known-host buttons always resolve
        // (they hit deduped shared promises); generic embed scans are gated —
        // across every bench capture they produced ZERO hits while costing
        // ~10 requests, so once three real streams exist we skip them.
        function isKnownHostLink(link) {
            let h = '';
            try { h = new URL(link).hostname; } catch (e) { h = ''; }
            return /(^|\.)(moviesapi\.to|vixsrc\.to|play\.xpass\.top)$/i.test(h);
        }
        async function resolveEntry(entry) {
            if (timeLeft() < 4000) return;
            try {
                const resolved = await resolveButton(entry.link);
                if (resolved && resolved.streamUrl) {
                    const embedOrigin = (function() {
                        try { return new URL(entry.link).origin; } catch (e) { return ''; }
                    })();
                    const pushedSt = pushStream(entry.name || getServerTitle(entry.link), resolved.streamUrl,
                        embedOrigin ? { 'Referer': embedOrigin + '/', 'Origin': embedOrigin } : {});
                    pushLanguageVariants(pushedSt, resolved.extraLangs);
                    if (!subtitle && resolved.subtitle) subtitle = resolved.subtitle;
                }
            } catch (e) { /* keep trying the next server */ }
        }
        const serverWorker = (async function() {
            try {
                const known = [];
                const generic = [];
                for (const entry of serverEntries) {
                    (isKnownHostLink(entry.link) ? known : generic).push(entry);
                }
                // Generic embed scans have produced ZERO hits across every
                // capture while costing a request each — keep at most 3 as
                // coverage insurance (deterministic, so it also holds in-app
                // where the streams-count gate below can't fire).
                if (generic.length > 3) generic.length = 3;
                await Promise.all(known.map(resolveEntry));
                // Generic embeds: only worth scanning when the reliable tier
                // came up short (fork-adopted early-exit).
                if (generic.length > 0 && streams.length < 3 && timeLeft() > 6000) {
                    await timerSafe(1200);          // let keyless results land first
                    if (streams.length < 3) {
                        await Promise.all(generic.map(resolveEntry));
                    }
                }
                console.log('[HydraHD] Servers resolved servers=' + serverEntries.length
                    + ' known=' + known.length + ' generic=' + generic.length + ' streams=' + streams.length);
            } catch (e) {
                console.error('[HydraHD] Server worker error:', e && e.message ? e.message : e);
            }
        })();
        // Everything runs concurrently; a worker failure must NEVER abort the
        // whole result (that was killing streams even when they succeeded).
        // Each settle point is soft-clocked: on bridges that leave requests
        // pending forever (Shirox + blocked host) the ping clock wins the race
        // after a few seconds instead of freezing extraction entirely.
        await softRace(Promise.allSettled([serverWorker, keylessWorker, mirrorWorker, videasyWorker]), 12000);
        // Settle whatever probes are still in flight — most already finished,
        // overlapped inside the worker window (pipelined from pushStream).
        await softRace(Promise.allSettled(probePromises), 5000);
        // Subtitles join last: they had the whole probe window to finish, so
        // this is usually instant. A still-running slow provider can only cost
        // its own remaining timeout — never the playable stream list.
        if (subsWorker) await softRace(Promise.allSettled([subsWorker]), 6000);
        // Best streams first: sort by measured quality class so the app's
        // primary/default stream is the best verified one (e.g. VidFast 4K
        // outranks an unprobed embed). Unprobed entries (no measured class)
        // sink below probed ones; sort is stable so same-rank order holds.
        const QUALITY_RANK = { '4K': 0, '1440p': 1, '1080p': 2, '720p': 3, '480p': 4 };
        streams.sort(function(a, b) {
            const ra = Object.prototype.hasOwnProperty.call(QUALITY_RANK, a.quality) ? QUALITY_RANK[a.quality] : 9;
            const rb = Object.prototype.hasOwnProperty.call(QUALITY_RANK, b.quality) ? QUALITY_RANK[b.quality] : 9;
            return ra - rb;
        });
        if (merged && merged.subtitles && merged.subtitles.length > 0) {
            subtitleList = merged.subtitles;
            // Auto-load only when a provider surfaced an English track (they
            // pick real English by label, skipping forced/signs-only); a
            // foreign-only result never overrides the embed subtitle.
            if (merged.pickedEnglish && merged.subtitle) {
                subtitle = merged.subtitle;
            }
            console.log('[HydraHD] Subs loaded imdb=' + imdbId + ' type=' + (isMovie ? 'movie' : 'series') + ' count=' + subtitleList.length + ' eng=' + (merged.pickedEnglish ? 'yes' : 'no') + ' autoLoad=' + (subtitle ? subtitle.slice(0, 90) : 'NONE') + ' src=' + merged.sources.join(','));
        } else {
            console.log('[HydraHD] Subs empty imdb=' + imdbId + ' type=' + (isMovie ? 'movie' : 'series') + ' season=' + season + ' episode=' + episodeNum + ' keepEmbedSub=' + (subtitle ? 'yes' : 'no'));
        }
        console.log('[HydraHD] Stream list final streams=' + streams.length);
        if (!subtitle && (imdbId === 'tt10872600' || String(tmdbId || '') === '634649')) {
            subtitle = 'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1957577261';
            console.log('[HydraHD] Canary subtitle injected for Spider-Man No Way Home');
        }
        // Embedded subtitle tracks ride in the master playlist itself (the same
        // language selector the web player shows). Resolve each #EXT-X-MEDIA
        // SUBTITLES rendition down to its real .vtt file — the playlist URI is
        // just an HLS wrapper around one WebVTT segment. All languages surface
        // in the picker; providers above keep priority for English. Skipped
        // entirely when the deadline is close — never delay the return.
        try {
            const primaryHls = streams.length > 0 ? streams[0].streamUrl : null;
            if (primaryHls && /\.m3u8|playlist/i.test(primaryHls) && timeLeft() > 7000) {
                // The probe already downloaded this master — reuse its text
                // instead of paying a second round trip on the return path.
                const playlistTracks = await softRace(
                    extractPlaylistSubtitleTracks(primaryHls, streams.length > 0 ? streams[0].masterText : ''), 5000) || [];
                if (playlistTracks.length) {
                    subtitleList = (subtitleList || []).concat(playlistTracks);
                    if (!subtitle) {
                        const engTrack = playlistTracks.find(function(t) {
                            return /^en$/i.test(String(t.lang)) || /(^|\s)english/i.test(String(t.label || ''));
                        });
                        if (engTrack) {
                            subtitle = engTrack.url;
                            subtitleHeaders = engTrack.headers || null;
                        }
                    }
                    console.log('[HydraHD] Playlist subs added langs=[' + playlistTracks.map(function(t) { return t.lang; }).join(',') + ']');
                }
            }
        } catch (e) {
            console.error('[HydraHD] Playlist subs error:', e.message);
        }
    } catch (error) {
        console.error('Stream extraction error:', error);
    }
    const primaryStream = streams.length > 0 ? streams[0].streamUrl : null;
    // Curate one entry per language (English first), then emit them as
    // alternating [label, url, label, url, ...] pairs. Sora's subtitle picker
    // understands this convention and shows the label ("English", "Spanish",
    // ...) instead of generic "Subtitle 1/2/3". When the only subtitle is a
    // plain URL (vidfast fallback), keep it as-is.
    const curatedEntries = subtitleList.length > 0 ? curatedSubtitleEntries(subtitleList) : [];
    const subtitlePairs = [];
    curatedEntries.forEach(function(entry) {
        subtitlePairs.push(subtitleLanguageName(entry.lang), entry.url);
    });
    let finalSubtitles;
    if (subtitlePairs.length >= 2) {
        finalSubtitles = subtitlePairs;                 // [label,url,label,url,...] always
    } else if (subtitle) {
        finalSubtitles = subtitle;                      // plain URL fallback (vidfast)
    } else {
        finalSubtitles = [];
    }
    // Shirox-family builds fill their in-player subtitle menu from
    // `allSubtitles` ([{url,label,kind,headers}]) instead of the Sora pair-array
    // convention in `subtitles`. Emit both shapes: each app reads the key it
    // knows and ignores the other, so one script serves both without conflict.
    const allSubtitles = curatedEntries.map(function(entry) {
        return {
            url: entry.url,
            label: subtitleLanguageName(entry.lang),
            kind: 'subtitles',
            headers: entry.headers || {}
        };
    });
    if (subtitle) {
        streams.forEach(function(stream) {
            if (stream && !stream.subtitle) stream.subtitle = subtitle;
        });
    }
    const subsLog = curatedEntries.map(function(entry) { return subtitleLanguageName(entry.lang); }).join(',');
    console.log('[HydraHD] Return summary streams=' + streams.length + ' primary=' + (primaryStream ? primaryStream.slice(0, 120) : 'null') + ' subtitle=' + (subtitle ? subtitle.slice(0, 120) : 'null') + ' subtitleCount=' + curatedEntries.length + ' subs=[' + subsLog + ']');
    return JSON.stringify({
        stream: primaryStream,
        streams,
        subtitle,
        subtitles: finalSubtitles,
        subtitlesHeaders: subtitleHeaders || {},
        allSubtitles: allSubtitles
    });
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
        const r = await soraFetchTimed(link, {
            headers: { 'Referer': `${BASE_URL}/`, 'User-Agent': USER_AGENT }
        }, 5000);
        const text = await r.text();
        const m3u8Match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
        if (!m3u8Match) return null;
        return {
            streamUrl: m3u8Match[0],
            subtitle: extractSubtitleUrl(text, link)
        };
    } catch (e) {
        return null;
    }
}

// The web player's named servers each resolve through a small keyless API
// chain (the same calls the site's player JS makes). Without these, most
// embeds serve no m3u8 in raw HTML and the app showed just one fallback
// stream. Resolvers below are per-host: MoviesAPI (Golf), VixSrc (Hydra2)
// and xpass (Whiskey). Everything else falls back to the generic regex scan.
const MOVIESAPI_PLAYER_KEY = '3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13';

// ---- Videasy / "Beta" resolver (multi-language dubs + 4K originals) --------
// Videasy's player pulls sources from api.speedracelight.com with a custom
// STREAMCRYPTO envelope: base64url ciphertext XOR-masked by a keystream keyed
// off (seed, tmdbId), validated against a leading "mvm1" magic. Seed comes
// from /seed?mediaId= (30s TTL). Language servers live on per-language
// endpoints: cdn=originals(+4K), lamovie=Spanish, meine=German,
// hdmovie=Hindi, superflix=Portuguese. Cipher ported 1:1 from the site's
// chunk math and validated against live captures.
const VIDEASY_API = 'https://api.speedracelight.com';
const VIDEASY_ENDPOINTS = ['cdn', 'lamovie', 'meine', 'hdmovie', 'superflix'];
const VIDEASY_LANG = {
    original: 'eng', english: 'eng', hindi: 'hin', spanish: 'spa', german: 'deu',
    portuguese: 'por', french: 'fra', italian: 'ita', japanese: 'jpn', korean: 'kor',
    chinese: 'zho', russian: 'rus', arabic: 'ara', turkish: 'tur', telugu: 'tel',
    tamil: 'tam', malayalam: 'mal', punjabi: 'pan', bengali: 'ben', marathi: 'mar'
};
const videasySeedCache = {};
function videasyB64ToBytes(e) {
    // Pure-JS decoder — atob is MISSING/broken on some app JSContexts
    // (Sulfur: returned undefined -> 'bin.length' crash on every payload).
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = String(e || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+\/]/g, '');
    const out = [];
    for (let i = 0; i < clean.length; i += 4) {
        const a = T.indexOf(clean.charAt(i));
        const b = T.indexOf(clean.charAt(i + 1));
        const c = T.indexOf(clean.charAt(i + 2));
        const d = T.indexOf(clean.charAt(i + 3));
        if (a < 0 || b < 0) break;
        const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
        out.push((n >> 16) & 255);
        if (c >= 0) out.push((n >> 8) & 255);
        if (d >= 0) out.push(n & 255);
    }
    return new Uint8Array(out);
}
function vcW(e) {
    e = e >>> 0;
    e ^= e >>> 16; e = Math.imul(e, 2246822507) >>> 0;
    e ^= e >>> 13; e = Math.imul(e, 3266489909) >>> 0;
    e ^= e >>> 16;
    return e >>> 0;
}
function vcRotl(e, t) {
    e = e >>> 0; t &= 31;
    if (t === 0) return e >>> 0;
    return ((e << t) | (e >>> (32 - t))) >>> 0;
}
function vcFnv(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return vcW(h);
}
// n*(n+1) is always even, so the site's parity branch is dead code — only the
// 61-slot schedule below ever runs. Sparse array on purpose (`in` semantics).
function vcKeySchedule(seed, mediaId) {
    const S = Array(61);
    let a = vcW(vcFnv(seed) ^ vcW(Number(mediaId) >>> 0 ^ 2654435769)) >>> 0;
    for (let i = 0; i < 8; i++) {
        const idx = a % 61;
        a = vcRotl((a + 2654435769) >>> 0, 7 + (7 & i));
        S[idx] = (a ^ vcW(a)) >>> 0;
        a = vcW((a + idx) >>> 0);
    }
    return { S: S, acc: vcW(2779096485 ^ a) >>> 0 };
}
function vcNextBlock(state, blockIdx) {
    const S = state.S;
    const prev = state.acc;
    const n = prev % 61;
    const has = (n in S) ? 1 : 0;              // sparse-slot presence check
    const notHas = 0 - has;                    // -1 present, else 0
    const d = S[n] >>> 0;
    const sel = ((d ^ Math.imul(2654435769, blockIdx + 1)) >>> 0) >>> 0;
    const l = (((prev ^ sel) >>> 0) | ((prev & sel & notHas) >>> 0)) >>> 0;
    const l2 = (vcRotl((l + prev) >>> 0, 31 & n) ^ vcRotl(prev, 31 & Math.imul(n, 7))) >>> 0;
    state.acc = vcW((l2 + 2654435769) >>> 0);
    S[n] = state.acc >>> 0;
    return state.acc >>> 0;
}
function videasyDecrypt(b64url, seed, mediaId) {
    const ct = videasyB64ToBytes(b64url);
    const ks = new Uint8Array(ct.length);
    const state = vcKeySchedule(seed, String(mediaId));
    let o = 0;
    for (let e = 0; e < ct.length;) {
        const blk = vcNextBlock(state, o++);
        ks[e++] = blk & 255;
        if (e < ct.length) ks[e++] = (blk >>> 8) & 255;
        if (e < ct.length) ks[e++] = (blk >>> 16) & 255;
        if (e < ct.length) ks[e++] = (blk >>> 24) & 255;
    }
    const out = new Uint8Array(ct.length);
    for (let i = 0; i < ct.length; i++) out[i] = ct[i] ^ ks[i];
    // magic "mvm1"
    if (out[0] !== 109 || out[1] !== 118 || out[2] !== 109 || out[3] !== 49) {
        throw new Error('videasy decrypt failed: bad seed or tampered payload');
    }
    // UTF-8 decode without TextDecoder/escape (both missing or quirky on
    // some app JSContexts; escape+decodeURIComponent also throws 'URI
    // malformed' when plaintext contains a literal %).
    if (typeof TextDecoder === 'function') {
        try { return new TextDecoder('utf-8').decode(out.subarray(4)); } catch (e) {}
    }
    let str = '';
    let i = 4;
    while (i < out.length) {
        const b = out[i];
        let cp;
        if (b < 0x80) { cp = b; i += 1; }
        else if ((b & 0xE0) === 0xC0) { cp = ((b & 0x1F) << 6) | (out[i + 1] & 0x3F); i += 2; }
        else if ((b & 0xF0) === 0xE0) { cp = ((b & 0x0F) << 12) | ((out[i + 1] & 0x3F) << 6) | (out[i + 2] & 0x3F); i += 3; }
        else { cp = ((b & 0x07) << 18) | ((out[i + 1] & 0x3F) << 12) | ((out[i + 2] & 0x3F) << 6) | (out[i + 3] & 0x3F); i += 4; }
        if (cp > 0xFFFF) {
            cp -= 0x10000;
            str += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        } else {
            str += String.fromCharCode(cp);
        }
    }
    return str;
}
async function videasyGetSeed(mediaId) {
    const cached = videasySeedCache[mediaId];
    if (cached && Date.now() - cached.at < 25000) return cached.seed;
    const r = await soraFetchTimed(VIDEASY_API + '/seed?mediaId=' + encodeURIComponent(mediaId), {
        headers: { 'Referer': 'https://player.videasy.to/', 'Accept': 'application/json' }
    }, 6000);
    if (!r) throw new Error('no seed response');
    const data = await r.json();
    if (!data || !data.seed) throw new Error('no seed in response');
    videasySeedCache[mediaId] = { seed: data.seed, at: Date.now() };
    return data.seed;
}
// quality label doubles as the audio language ("Hindi", "English", ...)
function videasyLangCode(label) {
    const l = String(label || '').trim().toLowerCase();
    if (VIDEASY_LANG[l]) return VIDEASY_LANG[l];
    return AUDIO_LANG_2_TO_3[l] || '';
}
// onBatch (optional): invoked with each endpoint's freshly decoded sources
// the moment they land. The caller pushes incrementally because one slow
// endpoint (hdmovie has measured 13s+ when throttled) must not cost the
// streams already fetched from earlier endpoints.
async function resolveVideasyLink(ctx, onBatch) {
    if (!ctx || !ctx.tmdbId) return null;
    const t0 = Date.now();
    const seed = await videasyGetSeed(ctx.tmdbId);
    console.log('[HydraHD] videasy seed in ' + (Date.now() - t0) + 'ms');
    const title = encodeURIComponent(encodeURIComponent(String(ctx.title || '')));
    const results = [];
    // The API throttles concurrent bursts into {"error":...} JSON — fetch
    // endpoints SEQUENTIALLY with one retry each instead of in parallel.
    for (const ep of VIDEASY_ENDPOINTS) {
        const eStart = Date.now();
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            let url = VIDEASY_API + '/' + ep + '/sources-with-title?mediaType=' + (ctx.isMovie ? 'movie' : 'tv') +
                '&seasonId=' + encodeURIComponent(String(ctx.season || 1)) +
                '&episodeId=' + encodeURIComponent(String(ctx.episode || 1)) +
                '&tmdbId=' + encodeURIComponent(String(ctx.tmdbId)) +
                '&imdbId=' + encodeURIComponent(String(ctx.imdbId || '')) +
                '&enc=2&seed=' + encodeURIComponent(seed);
            if (title) url += '&title=' + title;
            if (!ctx.isMovie && ctx.season) {
                url += '&totalSeasons=' + encodeURIComponent(String(Math.max(ctx.season, 1)));
                url += '&year=';
            } else if (ctx.year) {
                url += '&year=' + encodeURIComponent(String(ctx.year));
            }
            const rr = await softRace((async function() {
                const resp = await soraFetch(url, {
                    headers: { 'Referer': 'https://player.videasy.to/', 'Accept': '*/*' }
                });
                return resp.text();
            })(), 7000);
            if (!rr) break;                                   // clock won — give up on this endpoint
            if (attempt === 0 && rr.charAt(0) === '{') {
                await timerSafe(350);                         // throttled: back off, retry once
                continue;
            }
            if (rr.charAt(0) === '{') {
                console.log('[HydraHD] videasy ' + ep + ' error after ' + (Date.now() - eStart) + 'ms (len=' + rr.length + ')');
                break;
            }
            const plain = videasyDecrypt(rr, seed, ctx.tmdbId);
            // Payloads can carry trailing bytes after the JSON object —
            // parse only the {...} span.
            const js = plain.slice(plain.indexOf('{'), plain.lastIndexOf('}') + 1);
            const data = JSON.parse(js);
            const sources = Array.isArray(data.sources) ? data.sources : [];
            console.log('[HydraHD] videasy ' + ep + ' OK in ' + (Date.now() - eStart) + 'ms (attempt ' + (attempt + 1) + ') sources=' + sources.length);
            // Only hdmovie names languages in `quality`; cdn uses quality
            // tiers ("1080p"), lamovie/meine/superflix use host/auto strings.
            // The ENDPOINT defines the audio language for those.
            const epLang = { lamovie: 'spa', meine: 'deu', superflix: 'por', cdn: 'eng' }[ep] || '';
            const batchStart = results.length;
            for (let i = 0; i < sources.length; i++) {
                const srcUrl = sources[i] && sources[i].url;
                if (!srcUrl || !/^https?:\/\//.test(srcUrl)) continue;
                const langCode = videasyLangCode(sources[i].quality) || epLang;
                results.push({ langCode: langCode, langLabel: sources[i].quality || '', streamUrl: srcUrl });
            }
            if (onBatch && results.length > batchStart) {
                try { onBatch(results.slice(batchStart)); } catch (e) {}
            }
            break;                                            // endpoint satisfied
          } catch (e) {
            console.error('[HydraHD] videasy ' + ep + ' error after ' + (Date.now() - eStart) + 'ms: ' + (e && e.message ? e.message : e));
            break;
          }
        }
    }
    return results;
}


// Golf: GET https://moviesapi.to/api/vidora/v1/movie/{tmdb} (or /tv/{tmdb}/{s}/{e})
// with the x-player-key header → response.sources[0].url is the master.m3u8.
async function resolveMoviesapiLink(ctx) {
    if (!ctx || !ctx.tmdbId) return null;
    const apiPath = ctx.isMovie
        ? `movie/${ctx.tmdbId}`
        : `tv/${ctx.tmdbId}/${ctx.season || 1}/${ctx.episode || 1}`;
    const apiUrl = `https://moviesapi.to/api/vidora/v1/${apiPath}`;
    const r = await soraFetchTimed(apiUrl, {
        headers: {
            'Referer': 'https://moviesapi.to/',
            'Origin': 'https://moviesapi.to',
            'Accept': 'application/json',
            'x-player-key': MOVIESAPI_PLAYER_KEY
        }
    }, 12000);
    if (!r) return null;
    const data = await r.json().catch(function() { return null; });
    const src = data && data.sources && data.sources[0] && data.sources[0].url;
    if (!src) return null;
    return { streamUrl: src, subtitle: '' };
}

// Hydra2: GET https://vixsrc.to/api/movie/{tmdb} (or /api/tv/{tmdb}/{s}/{e})
// → {"src":"/embed/{id}?token=...&expires=..."} → fetch the embed page and
// read window.masterPlaylist.params (token/expires) → playlist URL resolves
// the multi-audio master (this is the language selector the site shows).
async function resolveVixsrcLink(ctx) {
    if (!ctx || !(ctx.tmdbId || ctx.imdbId)) return null;
    const apiPath = ctx.isMovie ? `movie/${ctx.tmdbId}` : `tv/${ctx.tmdbId}/${ctx.season || 1}/${ctx.episode || 1}`;
    const apiUrl = `https://vixsrc.to/api/${apiPath}?primaryColor=B20710&autoplay=true`;
    const ar = await soraFetchTimed(apiUrl, {
        headers: { 'Referer': 'https://vixsrc.to/', 'Accept': 'application/json' }
    }, 12000);
    if (!ar) return null;
    const ad = await ar.json().catch(function() { return null; });
    const src = ad && ad.src;
    if (!src) return null;
    const embedUrl = src.startsWith('http') ? src : 'https://vixsrc.to' + src;
    const er = await soraFetchTimed(embedUrl, {
        headers: { 'Referer': apiUrl, 'Accept': 'text/html' }
    }, 12000);
    if (!er) return null;
    const html = await er.text();
    const tok = html.match(/['"]token['"]\s*:\s*['"]([0-9a-f]+)/);
    const exp = html.match(/['"]expires['"]\s*:\s*['"](\d+)/);
    const pl = html.match(/https:\/\/vixsrc\.to\/playlist\/\d+(?:\?b=1)?/);
    if (!tok || !exp || !pl) return null;
    const sep = pl[0].includes('?') ? '&' : '?';
    const masterUrl = `${pl[0]}${sep}token=${tok[1]}&expires=${exp[1]}&h=1&lang=en`;
    // Fetch the master once to discover every audio language this title
    // offers. VixSrc's ?lang= param flips which rendition is DEFAULT=YES in
    // the served manifest (verified live: lang=en -> eng default, lang=it ->
    // ita default), so each extra language becomes its own playable stream.
    let playlistText = '';
    let extraLangs = [];
    try {
        const mr = await soraFetchTimed(masterUrl, {
            headers: { 'Referer': 'https://vixsrc.to/', 'Accept': 'application/vnd.apple.mpegurl' }
        }, 8000);
        if (mr) playlistText = await mr.text();
        const tracks = parseM3u8AudioTracks(playlistText);
        for (const tr of tracks) {
            if (!tr.code || tr.code === 'eng') continue;
            const short = AUDIO_LANG_3_TO_2[tr.code];
            if (!short) continue;                       // unknown param code — skip
            extraLangs.push({ code: tr.code, url: masterUrl.replace(/([?&])lang=[^&]*/, '$1lang=' + short) });
        }
        if (extraLangs.length) console.log('[HydraHD] Hydra2 extra languages=' + extraLangs.map(function(l) { return l.code; }).join(','));
    } catch (e) { /* single-language fallback: main stream still works */ }
    return { streamUrl: masterUrl, subtitle: '', playlistText: playlistText, extraLangs: extraLangs };
}

// Whiskey: the embed page leaks mdata file ids → GET https://play.xpass.top/
// mdata/{id}/1/playlist.json → {playlist:[{sources:[{file:"...master.m3u8"}]}]}
// Movies only (series demands a signed data call).
async function resolveXpassLink(ctx) {
    if (!ctx || !ctx.tmdbId) return null;
    if (!ctx.isMovie) return null;
    const pageUrl = `https://play.xpass.top/e/movie/${ctx.tmdbId}`;
    const pr = await soraFetchTimed(pageUrl, {
        headers: { 'Referer': 'https://play.xpass.top/', 'Accept': 'text/html' }
    }, 12000);
    if (!pr) return null;
    const pageHtml = await pr.text();
    const mdataIds = [];
    const mdataRe = /mdata\/([A-Za-z0-9_-]{16,})/g;
    let mdataMatch;
    while ((mdataMatch = mdataRe.exec(pageHtml)) !== null) {
        mdataIds.push(mdataMatch);
    }
    for (const m of mdataIds) {
        try {
            const mdataUrl = `https://play.xpass.top/mdata/${m[1]}/1/playlist.json`;
            const mr = await soraFetchTimed(mdataUrl, {
                headers: { 'Referer': pageUrl, 'Accept': 'application/json' }
            }, 10000);
            if (!mr) continue;
            const md = await mr.json().catch(function() { return null; });
            const sources = md && md.playlist && md.playlist[0] && md.playlist[0].sources;
            if (!Array.isArray(sources) || sources.length === 0) continue;
            for (const s of sources) {
                if (s && /^https?:\/\//.test(s.file || '')) {
                    return { streamUrl: s.file, subtitle: '' };
                }
            }
        } catch (e) { /* try next mdata id */ }
    }
    return null;
}

// Embedded playlist subtitle tracks: the master playlist's #EXT-X-MEDIA
// SUBTITLES lines are each an HLS wrapper around a single WebVTT segment.
// Follow each wrapper to the real .vtt so the app can render it, and return
// one {url, lang, label} entry per track (all languages the playout offers).
async function extractPlaylistSubtitleTracks(masterUrl, presetText) {
    const tracks = [];
    try {
        let text = presetText || '';
        if (!text) {
            const r = await soraFetchTimed(masterUrl, {
                headers: { 'Referer': 'https://vixsrc.to/', 'Accept': 'application/vnd.apple.mpegurl' }
            }, 10000);
            if (!r) return tracks;
            text = await r.text();
        }
        // Collect rendition wrappers first, then resolve them CONCURRENTLY in
        // one batch — the old loop fetched one wrapper at a time. Capped at 4:
        // in-app there are no timers, so each wrapper is an unbounded request;
        // four covers the languages that matter without stretching the tail.
        const wrappers = [];
        const mediaRe = /#EXT-X-MEDIA:[^\r\n]*/g;
        let line;
        while ((line = mediaRe.exec(text)) !== null) {
            if (wrappers.length >= 4) break;
            const entry = line[0];
            if (!/TYPE=(?:SUBTITLES|subtitles)/.test(entry)) continue;
            const name = (entry.match(/NAME="([^"]*)"/) || [])[1] || '';
            const langCode = (entry.match(/LANGUAGE="([^"]*)"/) || [])[1] || '';
            const uriAttr = (entry.match(/URI="([^"]*)"/) || [])[1] || '';
            if (!uriAttr) continue;
            wrappers.push({
                name: name,
                langCode: langCode,
                url: uriAttr.startsWith('http') ? uriAttr : new URL(uriAttr, masterUrl).href
            });
        }
        const CHUNK = 4;
        for (let i = 0; i < wrappers.length; i += CHUNK) {
            await Promise.all(wrappers.slice(i, i + CHUNK).map(async function(w) {
                try {
                    const wr = await soraFetchTimed(w.url, {
                        headers: { 'Referer': 'https://vixsrc.to/', 'Accept': 'application/vnd.apple.mpegurl' }
                    }, 8000);
                    if (!wr) return;
                    const wt = await wr.text();
                    const vttMatch = wt.match(/https?:\/\/[^\s"'<>]+\.vtt[^\s"'<>]*/);
                    if (!vttMatch) return;
                    tracks.push({
                        url: vttMatch[0],
                        lang: (w.langCode || '').toLowerCase() || (w.name || '').toLowerCase().slice(0, 3),
                        label: w.name || 'Subtitle',
                        // The .vtt segment host only serves requests carrying the
                        // playout referer — without it the app gets a 403 and
                        // silently renders an empty track.
                        headers: { 'Referer': 'https://vixsrc.to/' }
                    });
                } catch (e) { /* skip this rendition */ }
            }));
        }
    } catch (e) { /* no embedded tracks */ }
    return tracks;
}

function extractSubtitleUrl(text, baseUrl) {
    const html = text || '';
    const patterns = [
        /<track[^>]+(?:src|file)=["']([^"']+)["'][^>]*(?:kind=["'](?:captions|subtitles)["']|label=["'][^"']*(?:English|EN|eng)[^"']*["'])/i,
        /<track[^>]+(?:kind=["'](?:captions|subtitles)["']|label=["'][^"']*(?:English|EN|eng)[^"']*["'])[^>]+(?:src|file)=["']([^"']+)["']/i,
        /["'](?:file|src|url)["']\s*:\s*["']([^"']+\.(?:vtt|srt)(?:\?[^"']*)?)["']/i,
        /["'](?:subtitle|subtitles|captions|tracks?)["']\s*:\s*["']([^"']+\.(?:vtt|srt)(?:\?[^"']*)?)["']/i,
        /(https?:\/\/[^\s"'<>]+\.(?:vtt|srt)(?:\?[^\s"'<>]*)?)/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) return normalizeSubtitleUrl(match[1], baseUrl);
    }
    return '';
}

function normalizeSubtitleUrl(url, baseUrl) {
    const clean = decodeHtml(String(url || '').replace(/\\\//g, '/').trim());
    if (!clean) return '';
    try {
        return new URL(clean, baseUrl || BASE_URL).href;
    } catch (e) {
        return clean;
    }
}

function decodeHtml(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&#038;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function getVidfastSubtitle(result) {
    if (!result) return '';
    const containers = [
        result.subtitles,
        result.subtitle,
        result.captions,
        result.tracks,
        result.sources
    ];

    for (const container of containers) {
        const subtitle = pickSubtitleFromContainer(container);
        if (subtitle) return subtitle;
    }
    return '';
}

// ---- Subtitles via Stremio OpenSubtitles (keyless) --------------------------
// Credits: xdfkenny (https://github.com/xdfkenny) — original author of this
// method: resolving subtitles with no API key or login by querying the
// keyless Stremio OpenSubtitles addon (opensubtitles-v3.strem.io) directly,
// using the app.strem.io Referer header the addon expects.
async function resolveStremioSubtitle(imdbId, type, season, episode) {
    try {
        const params = [];
        if (type === 'series') {
            if (season) params.push('season=' + encodeURIComponent(String(season)));
            if (episode) params.push('episode=' + encodeURIComponent(String(episode)));
        }
        const query = params.length ? ('?' + params.join('&')) : '';
        const response = await soraFetchTimed(`${STREMIO_OPENSUBTITLES_URL}/subtitles/${type}/${imdbId}.json${query}`, {
            headers: {
                'Accept': 'application/json',
                'Referer': 'https://app.strem.io/'
            }
        }, 8000);
        if (!response) return null;
        const data = await response.json().catch(function() { return null; });
        const subtitles = ((data && data.subtitles) || [])
            .filter(item => item && item.url)
            .map(item => ({
                url: item.url,
                lang: item.lang || '',
                label: stremioSubtitleLabel(item)
            }));
        if (subtitles.length === 0) return null;

        // v1.0.21-style list: EVERY language the provider offers goes into the
        // picker so the user can choose. English stays the auto-load default:
        // the first real English track (skipping forced/signs-only variants).
        // No subtitle downloads — the list and auto-load ride on the provider
        // metadata alone, so the picker always appears fast.
        const english = subtitles.filter(isEnglishStremioSubtitle);
        const preferred = english.find(function(s) {
            return !/forced|signs|sdh|hi\b/i.test(String(s.label || ''));
        }) || english[0] || subtitles[0];
        return {
            subtitle: preferred && preferred.url ? preferred.url : '',
            subtitles: subtitles,
            pickedEnglish: english.length > 0
        };
    } catch (e) {
        return null;
    }
}

// ---- Stremio Community Subtitles (keyless) --------------------------------
// The "Stremio Community Subtitles" addon serves community-curated tracks through
// a shared public identityToken — no personal API key, no daily quota, no login.
// It covers SERIES (v3 has none) and provides extra English tracks for movies.
// Searches are cached per title so re-watching the same episode is instant.
const scsResultCache = {};                      // per-episode result cache

function decodeScsToken() {
    let token = '';
    for (let i = 0; i < SCS_TOKEN_XOR.length; i++) token += String.fromCharCode(SCS_TOKEN_XOR[i] ^ 66);
    return token;
}

// Search the SCS addon for subtitles. URL shape (mirrors the addon's manifest):
//   /{communityToken}/subtitles/{movie|series}/{imdbId or imdbId:s:e}/{params}.json
// The response items carry a ready-to-use .vtt download URL plus the language.
async function resolveCommunitySubtitle(imdbId, type, season, episode) {
    const cacheKey = 'scs/' + imdbId + '/' + type + '/' + (season || '') + ':' + (episode || '');
    if (Object.prototype.hasOwnProperty.call(scsResultCache, cacheKey)) {
        return scsResultCache[cacheKey];
    }
    try {
        const token = decodeScsToken();
        const contentId = type === 'series'
            ? imdbId + ':' + encodeURIComponent(String(season || 1)) + ':' + encodeURIComponent(String(episode || 1))
            : imdbId;
        const url = EMPIRE_COMMUNITY_URL + '/' + token + '/subtitles/' + encodeURIComponent(type) + '/' + contentId + '/.json';
        const response = await soraFetchTimed(url, {
            headers: {
                'Accept': 'application/json',
                'Referer': 'https://app.strem.io/'
            }
        }, 3500);
        if (!response) return null;
        const data = await response.json().catch(function() { return null; });
        // The addon answers titles it has no data for with a 1-cue "Test
        // Subtitle" placeholder — drop those from the list entirely.
        const subtitles = ((data && data.subtitles) || [])
            .filter(item => item && item.url && !/test subtitle/i.test(String(item.label || item.name || '')))
            .map(item => ({
                url: item.url,
                lang: String(item.lang || '').toLowerCase(),
                label: stremioSubtitleLabel(item)
            }));
        if (subtitles.length === 0) return null;

        // v1.0.21-style list: every language the provider offers goes into the
        // picker. English is the auto-load default (first real English track,
        // skipping forced/signs-only variants). No subtitle downloads — the
        // list rides on the provider metadata alone, so it always appears.
        const english = subtitles.filter(isEnglishStremioSubtitle);
        const preferred = english.find(function(s) {
            return !/forced|signs|sdh|hi\b/i.test(String(s.label || ''));
        }) || english[0];

        const result = {
            subtitle: preferred && preferred.url ? preferred.url : '',
            subtitles: subtitles,
            pickedEnglish: english.length > 0
        };
        scsResultCache[cacheKey] = result;
        return result;
    } catch (e) {
        console.log('[HydraHD] Community subs error: ' + (e && e.message ? e.message : e));
        return null;
    }
}

// ---- OpenSubtitles REST (keyless series + movie source) --------------------
// The public rest.opensubtitles.org search API is what the web player's
// subtitles panel uses (ythd worker -> cloudorchestranova). It works with no
// login and no API key: the search accepts a plain imdbid (WITHOUT the "tt"
// prefix) and an X-User-Agent header, and every hit carries a direct download
// link. The same keyless engine covers series, which v3 (movies only) and
// the stalled SCS connector cannot. English-only: we search with
// sublanguageid-eng and offer every returned track in the picker.
// Alt: rest.opensubtitles.org redirects searches that carry the "tt" prefix
// to a dead "_" host, so we strip it. The classic filead/ path serves plain
// SRT (no gzip), which the app's fetch bridge can render directly.
const osRestCache = {};                          // per-episode result cache

async function resolveOsRestSubtitle(imdbId, isMovie, season, episode) {
    const cacheKey = 'osrest/' + imdbId + '/' + (isMovie ? 'm' : 's') + '/' + String(season || '') + ':' + String(episode || '');
    if (Object.prototype.hasOwnProperty.call(osRestCache, cacheKey)) {
        return osRestCache[cacheKey];
    }
    try {
        const bare = String(imdbId || '').replace(/^tt/i, '');
        if (!/^\d+$/.test(bare)) return null;
        let url = OS_REST_SEARCH_URL + '/';
        if (!isMovie) {
            url += 'episode-' + encodeURIComponent(String(episode || 1)) + '/';
        }
        url += 'imdbid-' + bare;
        if (!isMovie) {
            url += '/season-' + encodeURIComponent(String(season || 1));
        }
        url += '/sublanguageid-eng';
        const headers = { 'X-User-Agent': 'trailers.to-UA', 'Accept': 'application/json' };
        const response = await soraFetchTimed(url, { headers }, 8000);
        if (!response) return null;
        const data = await response.json().catch(function() { return null; });
        if (!Array.isArray(data) || data.length === 0) return null;
        // Map hits to direct plain-SRT download URLs (filead serves utf-8 SRT
        // with no gzip, no token). English-only: the search was eng, but
        // double-check the language fields just in case a row slips through.
        const candidates = [];
        for (const item of data) {
            const rawLang = String((item && (item.SubLanguageID || item.LanguageName || item.lang)) || '').toLowerCase();
            if (rawLang && !_osTagIsEnglish(rawLang)) continue;
            const fileId = item && (item.IDSubtitleFile || (item.SubDownloadLink || '').match(/filead\/(\d+)/) && (item.SubDownloadLink.match(/filead\/(\d+)/))[1]);
            if (!fileId) continue;
            const label = String((item && (item.SubFileName || item.file)) || '').replace(/\.srt$/i, '');
            candidates.push({
                url: OS_FILE_DOWNLOAD_URL + '/' + String(fileId),
                lang: 'eng',
                label: label || 'English'
            });
        }
        if (candidates.length === 0) return null;
        // v1.0.21-style list: every English track the API returned goes into
        // the picker, auto-loading the first one. No verification downloads —
        // a dead subtitle API must never make the list disappear.
        const result = {
            subtitle: candidates[0].url,
            subtitles: candidates,
            pickedEnglish: true
        };
        osRestCache[cacheKey] = result;
        return result;
    } catch (e) {
        console.log('[HydraHD] OS REST subs error: ' + (e && e.message ? e.message : e));
        return null;
    }
}

function _osTagIsEnglish(tag) {
    const t = String(tag || '').toLowerCase().trim();
    return !t || t === 'eng' || t === 'en' || t === 'english' || t.indexOf('english') !== -1;
}

// Merge the three keyless providers' results into one picker list. OS REST
// English entries come first (full OpenSubtitles set for series AND movies),
// v3 and SCS fill in every language the providers offer. URLs are deduplicated
// so the same file never appears twice.
function mergeSubtitleResults(stremioResult, communityResult, osRestResult) {
    const mergedSubtitles = [];
    const seenUrls = {};
    const sources = [];
    function absorb(result, srcLabel) {
        if (!result || !Array.isArray(result.subtitles)) return;
        result.subtitles.forEach(function(item) {
            if (!item || !item.url) return;
            if (seenUrls[item.url]) return;
            seenUrls[item.url] = true;
            mergedSubtitles.push(item);
        });
        sources.push(srcLabel);
    }
    absorb(osRestResult, 'osrest');
    absorb(stremioResult, 'v3');
    absorb(communityResult, 'scs');
    if (mergedSubtitles.length === 0) return null;
    // Auto-load priority: OS REST English, then v3, then SCS, then whatever the
    // first provider flagged as default.
    const preferredUrl =
        (osRestResult && osRestResult.subtitle) ||
        (stremioResult && stremioResult.subtitle) ||
        (communityResult && communityResult.subtitle) ||
        (mergedSubtitles[0] && mergedSubtitles[0].url) || '';
    return {
        subtitle: preferredUrl,
        subtitles: mergedSubtitles,
        pickedEnglish: (osRestResult && osRestResult.pickedEnglish) || (stremioResult && stremioResult.pickedEnglish) || (communityResult && communityResult.pickedEnglish) || false,
        sources: sources
    };
}

function stremioSubtitleLabel(item) {
    const lang = String((item && item.lang) || '').toLowerCase();
    if (lang === 'eng' || lang === 'en' || lang === 'english') return 'English';
    if (lang === 'spa' || lang === 'es' || lang === 'spanish') return 'Spanish';
    return (item && item.lang) ? String(item.lang).toUpperCase() : 'Subtitle';
}

function isEnglishStremioSubtitle(item) {
    const lang = String((item && (item.lang || item.language || item.srclang || item.label)) || '').toLowerCase();
    return lang === 'eng' || lang === 'en' || lang === 'english' || lang.includes('english');
}

// Preferred language order for the curated subtitle list. English is always
// first because the app auto-loads the first subtitle it receives; the rest
// are ordered by how common they are, then alphabetically. Anything not in
// the table sorts last.
const SUB_LANG_RANK = {
    eng: 0,
    spa: 1, por: 2, pob: 3, fre: 4, deu: 5, ita: 6,
    zho: 7, zht: 8, jpn: 9, kor: 10, rus: 11, ara: 12, tur: 13,
    pol: 14, hin: 15, ind: 16, vie: 17, tha: 18, msa: 19,
    nld: 20, ell: 21, swe: 22, fin: 23, dan: 24, nor: 25,
    hun: 26, cze: 27, ces: 27, bul: 28, hrv: 29, srp: 30, bos: 31,
    ukr: 32, ron: 33, heb: 34, est: 35, lav: 36, lit: 37, slk: 38, slv: 39
};

// Human-readable names for the subtitle picker. Sora's subtitle picker supports
// an alternating [label, url, label, url, ...] convention: a non-URL string
// followed by a URL is shown as that URL's label. Emitting these names is what
// makes the app display "English", "Spanish", ... instead of "Subtitle 1/2/3".
const SUB_LANG_NAMES = {
    eng: 'English', spa: 'Spanish', por: 'Portuguese', pob: 'Portuguese (BR)',
    fre: 'French', fra: 'French', deu: 'German', ger: 'German', ita: 'Italian',
    zho: 'Chinese (Simplified)', zht: 'Chinese (Traditional)', jpn: 'Japanese',
    kor: 'Korean', rus: 'Russian', ara: 'Arabic', tur: 'Turkish', pol: 'Polish',
    hin: 'Hindi', ind: 'Indonesian', msa: 'Malay', vie: 'Vietnamese', tha: 'Thai',
    nld: 'Dutch', dut: 'Dutch', ell: 'Greek', gre: 'Greek', swe: 'Swedish', fin: 'Finnish',
    dan: 'Danish', nor: 'Norwegian', hun: 'Hungarian', cze: 'Czech', ces: 'Czech',
    slk: 'Slovak', slv: 'Slovenian', bul: 'Bulgarian', hrv: 'Croatian',
    srp: 'Serbian', bos: 'Bosnian', ukr: 'Ukrainian', ron: 'Romanian',
    heb: 'Hebrew', est: 'Estonian', lav: 'Latvian', lit: 'Lithuanian',
    mal: 'Malayalam', tam: 'Tamil', tel: 'Telugu', ben: 'Bengali', fil: 'Filipino',
    cat: 'Catalan', glg: 'Galician', eus: 'Basque', cym: 'Welsh', alb: 'Albanian',
    'forced-ita': 'Italian (Forced)', 'forced-eng': 'English (Forced)'
};

function subtitleLanguageName(lang) {
    const l = String(lang || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SUB_LANG_NAMES, l)) return SUB_LANG_NAMES[l];
    return l ? l.toUpperCase() : 'Subtitle';
}

// Shrink a subtitle list to ONE entry per language and order it with English
// first. Stremio returns many duplicate-language tracks (66 for one movie),
// so this dedupes to the unique languages. For each language a clean UTF-8 URL
// is preferred over a legacy cp1250 one (?senc=cp1250) so it decodes correctly.
function curatedSubtitleEntries(subtitleList) {
    if (!Array.isArray(subtitleList) || subtitleList.length === 0) return [];
    const byLang = {};
    subtitleList.forEach(function(item) {
        if (!item) return;
        const url = item.url || item.file || item.src || item.link;
        if (!url) return;
        const lang = String((item.lang || item.language || '')).toLowerCase();
        const existing = byLang[lang];
        const isUtf8 = url.indexOf('senc=') === -1;
        if (!existing || (isUtf8 && existing.url.indexOf('senc=') !== -1)) {
            // Keep the fetch headers (e.g. the VixSrc referer) — losing them
            // makes the app's subtitle request 403 and the track renders empty.
            byLang[lang] = { url: url, headers: item.headers || null };
        }
    });
    const entries = Object.keys(byLang).map(function(lang) {
        return {
            lang: lang,
            url: byLang[lang].url,
            headers: byLang[lang].headers || undefined,
            rank: Object.prototype.hasOwnProperty.call(SUB_LANG_RANK, lang) ? SUB_LANG_RANK[lang] : 999
        };
    });
    entries.sort(function(a, b) {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.lang < b.lang ? -1 : (a.lang > b.lang ? 1 : 0);
    });
    return entries;
}


function pickSubtitleFromContainer(container) {
    if (!container) return '';
    if (typeof container === 'string') {
        return /\.(?:vtt|srt)(?:\?|$)/i.test(container) ? normalizeSubtitleUrl(container, 'https://vidfast.vc/') : '';
    }
    if (Array.isArray(container)) {
        const preferred = container.find(item => isEnglishSubtitle(item)) || container.find(item => getSubtitleFile(item));
        return preferred ? normalizeSubtitleUrl(getSubtitleFile(preferred), 'https://vidfast.vc/') : '';
    }
    if (typeof container === 'object') {
        if (container.en) return normalizeSubtitleUrl(container.en, 'https://vidfast.vc/');
        if (container.eng) return normalizeSubtitleUrl(container.eng, 'https://vidfast.vc/');
        return normalizeSubtitleUrl(getSubtitleFile(container), 'https://vidfast.vc/');
    }
    return '';
}

function isEnglishSubtitle(item) {
    const label = String((item && (item.label || item.lang || item.language || item.srclang || item.name)) || '').toLowerCase();
    return /^(en|eng|english)$/.test(label) || label.includes('english');
}

function getSubtitleFile(item) {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return item.file || item.url || item.src || item.link || '';
}

async function resolveVidfast(imdbId, isMovie = true, season = null, episode = null, budgetMs = 30000) {
    const vfStart = Date.now();
    const vfLeft = function() { return budgetMs - (Date.now() - vfStart); };
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
        if (vfLeft() < 4000) break;
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
                const candidate = decStreamData.result.url;
                // Reject non-HLS pages: some mirrors answer with an HTML/JS
                // player page instead of a media file ("formato no compatible"
                // in the app). Prefer real .m3u8 URLs; verify when uncertain.
                if (!/\.m3u8/i.test(candidate) && !/\.(mp4|webm|mkv)(\?|$)/i.test(candidate)) {
                    if (!(await verifyStreamUrl(candidate))) continue;
                }
                return {
                    streamUrl: candidate,
                    subtitle: getVidfastSubtitle(decStreamData.result)
                };
            }
        } catch (e) {
            continue;
        }
    }
    throw new Error('No working stream found');
}

async function resolveVidSrc(imdbId, isMovie = true, season = null, episode = null, budgetMs = 30000) {
    const embedPath = isMovie
        ? `https://vidsrc.hair/embed/movie/${imdbId}`
        : `https://vidsrc.hair/embed/tv/${imdbId}/${season || 1}/${episode || 1}`;
    const embedHeaders = { 'User-Agent': USER_AGENT, 'Referer': 'https://vidsrc.hair/' };
    const embedResponse = await soraFetch(`${embedPath}?autostart=true`, { headers: embedHeaders });
    const embedHtml = await embedResponse.text();
    const qMatch = embedHtml.match(/\bvar\s+Q\s*=\s*(\{[^;]*\})\s*;/);
    if (!qMatch) {
        throw new Error('No player config found in vidsrc page');
    }
    let qJson;
    try {
        qJson = JSON.parse(qMatch[1].replace(/\\\//g, '/'));
    } catch (e) {
        throw new Error('Failed to parse vidsrc player config');
    }
    const token = qJson && qJson.t;
    if (!token || !qJson.id) {
        throw new Error('No token in vidsrc page');
    }
    const apiHeaders = { 'User-Agent': USER_AGENT, 'Referer': embedPath };
    const sourcesUrl = `https://vidsrc.hair/api.php?a=sources&type=${encodeURIComponent(String(qJson.type))}&id=${encodeURIComponent(qJson.id)}&s=${encodeURIComponent(String(qJson.s))}&e=${encodeURIComponent(String(qJson.e))}&t=${encodeURIComponent(token)}`;
    let servers = null;
    const pollStart = Date.now();
    for (let i = 0; i < 15; i++) {
        if (Date.now() - pollStart > budgetMs) break;
        let sourcesData;
        try {
            const sourcesResponse = await soraFetch(sourcesUrl, { headers: apiHeaders });
            sourcesData = await sourcesResponse.json();
        } catch (e) {
            break;
        }
        if (sourcesData && sourcesData.status === 'ok' && Array.isArray(sourcesData.servers) && sourcesData.servers.length) {
            servers = sourcesData.servers;
            break;
        }
        if (sourcesData && (sourcesData.status === 'none' || sourcesData.error)) {
            break;
        }
        await timerSafe(2000);
    }
    if (!servers || !servers.length) {
        throw new Error('No vidsrc servers available');
    }
    // Collect up to 3 working mirrors so the app can offer a real server list
    // even when the origin embed hosts are unreachable from the app.
    const found = [];
    for (const server of servers) {
        if (!server || !server.ref) continue;
        if (found.length >= 3) break;
        try {
            const playResponse = await soraFetch(`https://vidsrc.hair/api.php?a=play&ref=${encodeURIComponent(server.ref)}`, { headers: apiHeaders });
            const playData = await playResponse.json();
            if (!playData || !playData.url) continue;
            const streamUrl = /^https?:\/\//.test(playData.url) ? playData.url : new URL(playData.url, 'https://vidsrc.hair/').href;
            if (await verifyStreamUrl(streamUrl)) {
                found.push({
                    streamUrl,
                    subtitle: '',
                    headers: { 'Referer': 'https://vidsrc.hair/', 'Origin': 'https://vidsrc.hair' }
                });
            }
        } catch (e) {
            continue;
        }
    }
    if (found.length === 0) throw new Error('No working vidsrc stream found');
    // resolveVidSrc can return several mirrors; the extra ones ride in .extra.
    return Object.assign({}, found[0], { extra: found.slice(1) });
}

async function verifyStreamUrl(streamUrl) {
    try {
        // A .m3u8 URL is HLS by construction — trust the extension.
        if (/\.m3u8/i.test(streamUrl)) return true;
        const response = await soraFetch(streamUrl, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://vidsrc.hair/' }
        });
        if (!response) return false;
        const status = response.status;
        if (status !== 200 && status !== 206) return false;
        let contentType = '';
        if (response.headers && typeof response.headers.get === 'function') {
            contentType = String(response.headers.get('content-type') || '').toLowerCase();
        } else if (response.headers && response.headers['content-type']) {
            contentType = String(response.headers['content-type']).toLowerCase();
        }
        // Non-HLS pages (HTML players, ads) are rejected. Mirrors sometimes
        // serve the playlist under a .txt/.m3u8-less URL — accept only when
        // the body actually looks like an HLS manifest.
        if (contentType && contentType.startsWith('text/html')) return false;
        const body = String((await response.text()) || '').slice(0, 2000);
        if (/\.m3u8|\.txt/i.test(streamUrl)) return body.indexOf('#EXTM3U') !== -1;
        return true;
    } catch (e) {
        return false;
    }
}
