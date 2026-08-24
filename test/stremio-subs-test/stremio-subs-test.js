// ============================================================================
// Stremio Subs Test — isolated harness for opensubtitles-v3.strem.io
// ----------------------------------------------------------------------------
// Purpose: prove on-device whether the v3 endpoint alone can populate the
// subtitle picker for BOTH movies and series once requests use the standard
// Stremio addon path convention  imdbId:season:episode  instead of query
// parameters (which v3 silently ignores — verified live 2026-08-24).
//
//   OLD (hydrahd.js <=2.2.1):  /subtitles/series/tt0944947.json?season=1&episode=5
//       -> params ignored, random whole-show tracks come back
//   NEW (this file):           /subtitles/series/tt0944947%3A1%3A5.json
//       -> correct English S01E05 tracks (same file ids OS REST returns)
//
// Everything else is stripped: NO OS REST, NO community addon, NO stream
// resolvers, no site scraping. Search/details/episodes ride Cinemeta exactly
// like examples/.archive/comet. One clearly-labeled probe stream keeps the
// player (and its subtitle picker) reachable; flip INCLUDE_TEST_STREAM to
// false if your build renders pickers without streams.
// ============================================================================

const V3_URL = 'https://opensubtitles-v3.strem.io';
const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// Set false only if your app shows the subtitle picker even with zero streams.
const INCLUDE_TEST_STREAM = true;
const TEST_STREAM_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

console.log('[SubTest] module script loaded v0.1.0 (v3-only, colon-path series fix)');

// ---- Response normalization (trimmed from hydrahd.js) ----------------------
// App bridges differ: some resolve with body strings, some reject non-2xx,
// Shirox's .json() is synchronous. Wrap every shape into real promises.
function toResponseLike(value) {
    if (value && typeof value.text === 'function') {
        return {
            status: typeof value.status === 'number' ? value.status : 200,
            ok: value.ok !== false,
            text: async function() {
                return String((await Promise.resolve(value.text())) || '');
            },
            json: async function() {
                if (typeof value.json === 'function') {
                    try {
                        var parsed = await Promise.resolve(value.json());
                        if (parsed != null) return parsed;
                    } catch (e) { /* fall back to body text */ }
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
        text: async function() { return str; },
        json: async function() { return JSON.parse(str); }
    };
}

async function soraFetch(url) {
    const headers = { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity' };
    try {
        const r = await fetchv2(url, headers, 'GET', null);
        if (r) return toResponseLike(r);
    } catch (e) { /* fall through */ }
    try {
        const r = await fetch(url, headers);
        if (r) return toResponseLike(r);
    } catch (e) { /* try options-object signature */ }
    try {
        const r = await fetch(url, { headers: headers, method: 'GET', body: null });
        if (r) return toResponseLike(r);
    } catch (e) { /* give up */ }
    console.log('[SubTest] fetch failed (all attempts): ' + String(url).slice(0, 100));
    return toResponseLike(null);
}

// ---- ID parsing -------------------------------------------------------------
// Accepts the app's flow ("Movie: tt..." / "TV: tt:s:e" hrefs from this
// module's own search/episodes) plus any raw string containing an IMDb id and
// optional /season/X/episode/Y markers, so hand-pasted URLs work too.
function parseTestId(rawId) {
    const decoded = decodeURIComponent(String(rawId == null ? '' : rawId));
    let type = '';
    let rest = decoded;
    if (/^TV:\s*/i.test(rest)) { type = 'series'; rest = rest.replace(/^TV:\s*/i, ''); }
    else if (/^Movie:\s*/i.test(rest)) { type = 'movie'; rest = rest.replace(/^Movie:\s*/i, ''); }

    const imdbMatch = rest.match(/tt\d+/i);
    const imdbId = imdbMatch ? imdbMatch[0] : '';

    let season = '';
    let episode = '';
    // Colon form "tt0944947:1:5" (from our episode list or a Stremio-style id)
    const parts = imdbMatch && imdbId ? rest.slice(rest.indexOf(imdbId) + imdbId.length).split(':').filter(Boolean) : [];
    if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        season = parts[0];
        episode = parts[1];
    }
    // Path form ".../season/1/episode/5"
    const sm = decoded.match(/season\/(\d+)/i);
    const em = decoded.match(/episode\/(\d+)/i);
    if (!season && sm) season = sm[1];
    if (!episode && em) episode = em[1];

    if (!type) type = (season || episode) ? 'series' : 'movie';
    return {
        imdbId: imdbId,
        type: type,
        season: season || '1',
        episode: episode || '1',
        isSeries: type === 'series'
    };
}

function cinemetaMeta(id) {
    const t = parseTestId(id);
    return soraFetch(`${CINEMETA_URL}/meta/${t.type}/${t.imdbId}.json`)
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
}

// ---- Search / details / episodes (Cinemeta-backed, comet pattern) ----------
async function searchResults(keyword) {
    try {
        const results = [];
        const types = ['movie', 'series'];
        for (const t of types) {
            try {
                const response = await soraFetch(
                    `${CINEMETA_URL}/catalog/${t}/top/search=${encodeURIComponent(keyword)}.json`);
                const data = await response.json();
                const metas = (data && data.metas) || [];
                for (const item of metas) {
                    if (!item || !item.id || !String(item.id).match(/^tt\d+$/)) continue;
                    results.push({
                        title: String(item.name || '').trim(),
                        image: String(item.poster || '').trim(),
                        href: (t === 'movie' ? 'Movie: ' : 'TV: ') + item.id
                    });
                }
            } catch (e) { /* one type failing must not kill the other */ }
        }
        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ title: 'Error', image: 'Error', href: 'Error' }]);
    }
}

async function extractDetails(ID) {
    try {
        const meta = await cinemetaMeta(ID);
        if (meta && meta.meta) {
            return JSON.stringify([{
                description: meta.meta.description || 'N/A',
                aliases: 'N/A',
                airdate: meta.meta.released || meta.meta.releaseInfo || 'N/A'
            }]);
        }
        return JSON.stringify([{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
    } catch (err) {
        return JSON.stringify([{ description: 'Error', aliases: 'Error', airdate: 'Error' }]);
    }
}

async function extractEpisodes(ID) {
    const t = parseTestId(ID);
    const results = [];
    try {
        if (!t.isSeries) {
            return JSON.stringify([{ href: 'Movie: ' + t.imdbId, number: 1 }]);
        }
        const meta = await cinemetaMeta(ID);
        const videos = (meta && meta.meta && meta.meta.videos) || [];
        // Some shows list specials as season 0 — shift so the app groups them.
        const shouldAdjust = videos.length > 0 && videos[0].season === 0;
        let currentSeason = 0;
        let episodeCounter = 0;
        for (const video of videos) {
            const adjustedSeason = shouldAdjust ? video.season + 1 : video.season;
            if (adjustedSeason !== currentSeason) {
                currentSeason = adjustedSeason;
                episodeCounter = 0;
            }
            episodeCounter++;
            results.push({ href: `TV: ${t.imdbId}:${adjustedSeason}:${episodeCounter}`, number: episodeCounter });
        }
        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ href: ID, number: 1 }]);
    }
}

// ---- THE TEST: v3 with the colon-path convention ---------------------------
async function resolveV3Subtitles(t) {
    try {
        // Fixed shape: season/episode INSIDE the path (URL-encode the colons).
        const contentId = t.isSeries
            ? `${t.imdbId}:${t.season}:${t.episode}`
            : t.imdbId;
        const fixedUrl = `${V3_URL}/subtitles/${t.type}/${encodeURIComponent(contentId)}.json`;

        // Old broken shape fetched ONLY for the comparison log line — it never
        // contributes tracks, so the picker stays clean while the app log shows
        // exactly what the pre-fix code used to receive.
        const legacyUrl = t.isSeries
            ? `${V3_URL}/subtitles/${t.type}/${t.imdbId}.json?season=${encodeURIComponent(t.season)}&episode=${encodeURIComponent(t.episode)}`
            : null;

        const fixedPromise = soraFetch(fixedUrl).then(function(r) { return r.json(); }).catch(function() { return null; });
        const legacyPromise = legacyUrl
            ? soraFetch(legacyUrl).then(function(r) { return r.json(); }).catch(function() { return null; })
            : Promise.resolve(null);

        const data = await fixedPromise;
        const legacyData = await legacyPromise;

        const items = (data && data.subtitles) || [];
        const legacyItems = (legacyData && legacyData.subtitles) || [];
        console.log('[SubTest] v3 ' + (t.isSeries ? `series ${t.imdbId}:S${t.season}E${t.episode}` : 'movie ' + t.imdbId)
            + ' colon-shape=' + items.length + ' tracks, legacy-query-shape=' + legacyItems.length + ' tracks');

        const seen = {};
        const candidates = [];
        for (const item of items) {
            if (!item || !item.url) continue;
            const url = String(item.url);
            if (seen[url]) continue;
            seen[url] = true;
            candidates.push({
                url: url,
                lang: String(item.lang || '').toLowerCase(),
                label: subtitleLanguageName(item.lang)
            });
        }
        return candidates;
    } catch (e) {
        console.log('[SubTest] v3 error: ' + (e && e.message ? e.message : e));
        return [];
    }
}

// ---- Output shaping ---------------------------------------------------------
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
    heb: 'Hebrew', est: 'Estonian', lav: 'Latvian', lit: 'Lithuanian'
};

function subtitleLanguageName(lang) {
    const l = String(lang || '').toLowerCase();
    if (SUB_LANG_NAMES[l]) return SUB_LANG_NAMES[l];
    return l ? l.toUpperCase() : 'Subtitle';
}

function isEnglish(item) {
    const l = String(item.lang || '').toLowerCase();
    return l === 'eng' || l === 'en' || l.indexOf('english') !== -1;
}

async function extractStreamUrl(ID) {
    const t = parseTestId(ID);
    let candidates = [];
    try {
        if (t.imdbId) {
            candidates = await resolveV3Subtitles(t);
        } else {
            console.log('[SubTest] no IMDb id parsed from: ' + String(ID).slice(0, 120));
        }
    } catch (e) {
        console.log('[SubTest] subs pipeline error: ' + (e && e.message ? e.message : e));
    }

    // English auto-load default: first real English track, skipping forced /
    // signs variants — same policy as hydrahd.
    const english = candidates.filter(isEnglish);
    const preferred = english.find(function(s) { return !/forced|signs|sdh/i.test(s.label); }) || english[0];
    const subtitle = preferred ? preferred.url : '';

    // Sora pair-array: alternating [label, url, ...]
    const pairs = [];
    candidates.forEach(function(c) {
        pairs.push(c.label, c.url);
    });

    // Shirox-family menu shape.
    const allSubtitles = candidates.map(function(c) {
        return { url: c.url, label: c.label, kind: 'subtitles', headers: {} };
    });

    // One labeled probe stream keeps the player reachable; its video has
    // nothing to do with the title — it exists purely so the subtitle picker
    // renders. Judge the test by the PICKER CONTENTS, not the picture.
    const streams = [];
    if (INCLUDE_TEST_STREAM) {
        streams.push({
            title: '[SUB-TEST] probe stream (ignore video, check subtitles)',
            baseTitle: '[SUB-TEST] probe stream',
            qualityLabel: 'TEST',
            streamUrl: TEST_STREAM_URL,
            subtitle: subtitle,
            headers: {}
        });
    }

    console.log('[SubTest] return streams=' + streams.length
        + ' subtitle=' + (subtitle ? subtitle.slice(0, 80) : 'null')
        + ' trackCount=' + candidates.length
        + ' langs=[' + candidates.map(function(c) { return c.lang; }).join(',') + ']');

    return JSON.stringify({
        stream: streams.length ? streams[0].streamUrl : '',
        streams: streams,
        subtitle: subtitle,
        subtitles: pairs.length >= 2 ? pairs : (subtitle || []),
        subtitlesHeaders: {},
        allSubtitles: allSubtitles
    });
}
