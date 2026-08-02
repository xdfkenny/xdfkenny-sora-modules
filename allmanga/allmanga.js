const BASE_URL = 'https://allmanga.to';
const API_URLS = [
    'https://api.mkissa.net/api',
    'https://api.allanime.day/api'
];
const API_URL = API_URLS[0];
const CDN_BASE = 'https://allanimenews.com';
const CLOCK_BASE = 'https://allanime.day';

const KEYGEN_URLS = [
    'https://raw.githubusercontent.com/sdaqo/anipy-cli/refs/heads/key-gen/scripts/keygen/keygen.json',
    'https://raw.githubusercontent.com/sdaqo/anipy-cli/key-gen/scripts/keygen/keygen.json'
];

const EPISODE_QUERY = 'query(\n$showId: String!\n$translationType: VaildTranslationTypeEnumType!\n$episodeString: String!\n) {\nepisode(\nshowId: $showId\ntranslationType: $translationType\nepisodeString: $episodeString\n) {\nepisodeString\nuploadDate\nsourceUrls\nthumbnail\nnotes\nshow{\n\n\n_id\nname\nenglishName\nnativeName\nslugTime\n\nthumbnail\n\ntbObj {\n  u\n  sm\n  md\n  ts\n}\n\nlastEpisodeInfo\nlastEpisodeDate\ntype\nseason\nscore\nairedStart\navailableEpisodes\nepisodeDuration\nepisodeCount\n# lastUpdateStart\nlastUpdateEnd\ncharacterCount\n\ndescription\nbroadcastInterval\nbanner\ncharacters\navailableEpisodesDetail\nnameOnlyString\ncharacters\nisAdult\nrelatedShows\nrelatedMangas\naltNames\ndisqusIds\n}\npageStatus{\n_id\nnotes\npageId\nshowId\n\n# ranks:[Object]\nviews\nlikesCount\ncommentCount\ndislikesCount\nboostsCount\nreviewCount\nuserScoreCount\nuserScoreTotalValue\nuserScoreAverValue\nviewers{\nfirstViewers{\nviewCount\nlastWatchedDate\nuser{\n\n  \n  \n  _id\n  username\n  displayName\n  createdAt\n  picture\n  reputation\n  roleLevel\n\n  \n  followerCount\n  followingCount\n\n  hideMe\n  brief\n\n}\n}\nrecViewers{\nviewCount\nlastWatchedDate\nuser{\n\n  \n  \n  _id\n  username\n  displayName\n  createdAt\n  picture\n  reputation\n  roleLevel\n\n  \n  followerCount\n  followingCount\n\n  hideMe\n  brief\n\n}\n}\n}\n\n}\nepisodeInfo{\nnotes\nthumbnails\n\ntbObj {\n  u\n  sm\n  md\n  ts\n}\n\nvidInforssub\nuploadDates\nvidInforsdub\nvidInforsraw\ndescription\n}\nversionFix\n}\n}\n';

const SOURCE_PRIORITY = ['Default', 'Yt-mp4', 'S-Mp4', 'Ak', 'Uv-mp4', 'Luf-Mp4', 'Mp4'];

const FALLBACK_KEYGEN = {
    build_id: '81',
    epoch: 6888,
    lane: 'k7',
    key: 'bf44b51b82ef0736c06e62a4b889dc5b8494f8cb6fe7e8b820dd33494b99c540',
    static_key: 'Xot36i3lK3:v1'
};

let aaKeyCache = { keys: null, ts: 0 };

if (typeof console !== 'undefined') console.log('allmanga module v1.3.0');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const API_HEADERS = {
    'Origin': BASE_URL,
    'Referer': BASE_URL + '/',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': UA
};

const STREAM_HEADERS = {
    'Referer': CDN_BASE + '/',
    'Origin': CDN_BASE,
    'User-Agent': UA
};

/* MAIN FUNCTIONS */

async function searchResults(keyword) {
    try {
        const query = String(keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const data = await gql(`{shows(search:{sortBy:Trending,query:${JSON.stringify(query)}},limit:26,page:1){edges{_id name englishName nativeName thumbnail}}}`);
        const shows = (((data || {}).shows || {}).edges) || [];

        const results = [];
        const seen = new Set();
        shows.forEach(show => {
            const href = `${BASE_URL}/bangumi/${show._id}`;
            const title = cleanText(show.englishName || show.name || '');
            if (!title || !show._id || seen.has(href)) return;
            seen.add(href);
            results.push({ title, image: show.thumbnail || '', href });
        });

        return JSON.stringify(results);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const showId = extractShowId(url);
        if (!showId) return JSON.stringify([]);

        const data = await gql(`{show(_id:${JSON.stringify(showId)}){description englishName name altNames season airedStart}}`);
        const show = (data || {}).show;
        if (!show) return JSON.stringify([]);

        const aliases = (show.altNames || [])
            .filter(name => name && cleanText(name))
            .map(name => cleanText(name))
            .join(' | ') || cleanText(show.englishName || show.name || 'Unknown');
        const airdate = (show.season && show.season.year) ? String(show.season.year) : cleanText(show.airedStart || 'Unknown');

        return JSON.stringify([{
            description: cleanText(show.description || 'No description available'),
            aliases,
            airdate
        }]);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: 'Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const showId = extractShowId(url);
        if (!showId) return JSON.stringify([]);

        const data = await gql(`{episodeInfos(showId:${JSON.stringify(showId)},episodeNumStart:0,episodeNumEnd:999999){episodeIdNum}}`);
        const eps = (((data || {}).episodeInfos) || []);

        const episodes = eps
            .filter(ep => ep.episodeIdNum !== undefined && ep.episodeIdNum !== null)
            .map(ep => ({
                href: `${BASE_URL}/bangumi/${showId}/p-${ep.episodeIdNum}`,
                number: ep.episodeIdNum
            }))
            .sort((a, b) => a.number - b.number);

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const parsed = parseEpisodeUrl(url);
        if (!parsed) return JSON.stringify({ streams: [], subtitle: '' });

        const { showId, episode } = parsed;
        const keys = await aaGetKeys();

        const jobs = await Promise.all([
            aaResolveTranslation(keys, showId, episode, 'sub'),
            aaResolveTranslation(keys, showId, episode, 'dub')
        ]);

        const streams = [];
        let subtitle = '';
        jobs.forEach(result => {
            if (!result || !result.streams || !result.streams.length) return;
            streams.push(...result.streams);
            if (!subtitle && result.subtitle) subtitle = result.subtitle;
        });

        if (streams.length === 0) return aaLegacyStreams(showId, episode);

        return JSON.stringify({ streams, subtitle });
    } catch (error) {
        console.log('Stream error: ' + error);
        return JSON.stringify({ streams: [], subtitle: '' });
    }
}

/* ALLANIME STREAM FLOW */

async function aaGetKeys() {
    const now = Date.now();
    if (aaKeyCache.keys && now - aaKeyCache.ts < 90000) return aaKeyCache.keys;

    for (let i = 0; i < KEYGEN_URLS.length; i++) {
        try {
            const resp = await soraFetch(KEYGEN_URLS[i], {
                headers: { 'User-Agent': UA, 'Accept': 'application/json' }
            });
            if (resp) {
                const json = await resp.json();
                if (json && json.build_id && json.key && json.epoch !== undefined && json.lane) {
                    const keys = {
                        build_id: String(json.build_id),
                        epoch: String(json.epoch),
                        lane: String(json.lane),
                        key: String(json.key),
                        static_key: String(json.static_key || FALLBACK_KEYGEN.static_key)
                    };
                    aaKeyCache.keys = keys;
                    aaKeyCache.ts = now;
                    return keys;
                }
            }
        } catch (error) {
            console.log('Keygen fetch error: ' + error);
        }
    }
    return {
        build_id: FALLBACK_KEYGEN.build_id,
        epoch: String(FALLBACK_KEYGEN.epoch),
        lane: FALLBACK_KEYGEN.lane,
        key: FALLBACK_KEYGEN.key,
        static_key: FALLBACK_KEYGEN.static_key
    };
}

function aaBuildToken(keys, qh, ts) {
    const payload = '{"v":1,"ts":' + ts + ',"epoch":' + keys.epoch + ',"buildId":"' + keys.build_id + '","qh":"' + qh + '","k":"' + keys.lane + '"}';
    const iv = aaSha256(aaAscii(keys.epoch + ':' + qh + ':' + ts)).slice(0, 12);
    const sealed = aaGcmSeal(aaHexToBytes(keys.key), iv, aaAscii(payload));
    const blob = new Uint8Array(1 + 12 + sealed.out.length + 16);
    blob[0] = 1;
    blob.set(iv, 1);
    blob.set(sealed.out, 13);
    blob.set(sealed.tag, 13 + sealed.out.length);
    return aaB64(blob);
}

async function aaEpisodeQuery(keys, showId, tt, episode) {
    const ts = Math.floor(Date.now() / 300000) * 300000;
    const qh = aaHex(aaSha256(aaAscii(EPISODE_QUERY)));
    const variables = { showId, translationType: tt, episodeString: String(episode) };
    const extensions = {
        persistedQuery: { version: 1, sha256Hash: qh },
        aaReq: aaBuildToken(keys, qh, ts),
        k: keys.lane
    };
    const body = JSON.stringify({ query: EPISODE_QUERY, variables, extensions });
    for (let i = 0; i < API_URLS.length; i++) {
        const resp = await soraFetch(API_URLS[i], {
            method: 'POST',
            headers: aaEpisodeHeaders(keys),
            body: body
        });
        if (!resp) continue;
        try {
            const json = await resp.json();
            if (json && typeof json === 'object') return json;
        } catch (error) {
            continue;
        }
    }
    return null;
}

function aaEpisodeHeaders(keys) {
    return {
        'Content-Type': 'application/json',
        'Referer': 'https://mkissa.to',
        'Origin': 'https://mkissa.to',
        'x-build-id': keys.build_id,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': UA
    };
}

async function aaResolveTranslation(keys, showId, episode, tt) {
    const json = await aaEpisodeQuery(keys, showId, tt, episode);
    const parsed = aaParseEpisodeResponse(json, keys);
    if (!parsed) {
        console.log('No sources for ' + tt + ' (encrypted episode query failed)');
        return { streams: [], subtitle: '' };
    }
    console.log('Decrypted sources for ' + tt);
    return aaResolveSources(parsed, tt);
}

function aaParseEpisodeResponse(json, keys) {
    if (!json || !json.data || !json.data.tobeparsed) return null;
    const msg = (json.errors && json.errors[0] && json.errors[0].message) || '';
    if (msg) console.log('Episode query warning: ' + msg.slice(0, 80));
    return aaDecrypt(keys, json.data.tobeparsed);
}

function aaDecrypt(keys, tobeparsed) {
    const raw = aaUnb64(tobeparsed);
    if (!raw || raw.length < 30) return null;
    const iv = raw.slice(1, 13);
    const ct = raw.slice(13, raw.length - 16);
    const tag = raw.slice(raw.length - 16);
    const attempts = [aaHexToBytes(keys.key), aaAscii(keys.static_key)];
    for (let i = 0; i < attempts.length; i++) {
        const plain = aaGcmOpen(attempts[i], iv, ct, tag);
        if (plain) {
            try {
                return JSON.parse(aaUtf8ToStr(plain));
            } catch (error) {
                return null;
            }
        }
    }
    return null;
}

async function aaResolveSources(parsed, tt) {
    const sources = (parsed.episode && parsed.episode.sourceUrls) || [];
    const cdn = [];
    sources.forEach(s => {
        if (s && s.sourceName && typeof s.sourceUrl === 'string' && s.sourceUrl.indexOf('--') === 0) {
            cdn.push(s);
        }
    });
    const ordered = [];
    SOURCE_PRIORITY.forEach(name => {
        const hit = cdn.find(s => s.sourceName === name);
        if (hit) ordered.push(hit);
    });
    cdn.forEach(s => {
        if (SOURCE_PRIORITY.indexOf(s.sourceName) < 0) ordered.push(s);
    });

    for (let i = 0; i < ordered.length; i++) {
        const src = ordered[i];
        try {
            const clockUrl = CLOCK_BASE + aaXor56(src.sourceUrl.slice(2)).replace('clock', 'clock.json');
            const resp = await soraFetch(clockUrl, {
                headers: { 'Referer': CLOCK_BASE + '/', 'User-Agent': UA }
            });
            if (!resp) {
                console.log('Source ' + (src.sourceName || '?') + ': no response');
                continue;
            }
            const json = await resp.json();
            const links = (json && json.links) || [];
            if (!links.length) {
                console.log('Source ' + (src.sourceName || '?') + ': no links');
                continue;
            }

            const streams = [];
            let subtitle = '';
            links.forEach(l => {
                if (!l || !l.link) return;
                const res = l.resolution || (l.hls ? 'HLS' : 'MP4');
                streams.push({
                    title: tt.toUpperCase() + ' ' + (src.sourceName || 'Source') + (res ? ' ' + res : ''),
                    streamUrl: l.link,
                    headers: {
                        'Referer': (l.headers && l.headers.Referer) || CLOCK_BASE + '/',
                        'User-Agent': UA
                    }
                });
                if (!subtitle && l.subtitles && l.subtitles[0] && l.subtitles[0].src) {
                    subtitle = l.subtitles[0].src;
                }
            });
            if (streams.length) return { streams, subtitle };
        } catch (error) {
            console.log('Source ' + (src.sourceName || '?') + ' error: ' + error);
        }
    }
    return { streams: [], subtitle: '' };
}

async function aaLegacyStreams(showId, episode) {
    try {
        const data = await gql(`{episodeInfos(showId:${JSON.stringify(showId)},episodeNumStart:${episode},episodeNumEnd:${episode}){episodeIdNum vidInforssub vidInforsdub vidInforsraw}}`);
        const eps = (((data || {}).episodeInfos) || []);
        const ep = eps.find(e => String(e.episodeIdNum) === String(episode)) || eps[0];
        if (!ep) return JSON.stringify({ streams: [], subtitle: '' });

        const streams = [];
        [['sub', ep.vidInforssub], ['dub', ep.vidInforsdub], ['raw', ep.vidInforsraw]].forEach(([label, info]) => {
            if (!info || !info.vidPath) return;
            streams.push({
                title: `${label.toUpperCase()} ${info.vidResolution ? info.vidResolution + 'p' : 'auto'}`,
                streamUrl: cdnUrl(info.vidPath),
                headers: STREAM_HEADERS
            });
        });

        return JSON.stringify({ streams, subtitle: '' });
    } catch (error) {
        console.log('Legacy stream error: ' + error);
        return JSON.stringify({ streams: [], subtitle: '' });
    }
}

/* PURE-JS CRYPTO (SHA-256 + AES-256-GCM) FOR SORA'S JAVASCRIPCORE SANDBOX */

const aaSbox = [
0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
];

const aaRcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function aaKeyExpansion(key) {
    const Nk = key.length / 4;
    const Nr = Nk + 6;
    const w = new Uint32Array(4 * (Nr + 1));
    for (let i = 0; i < Nk; i++) {
        w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    }
    for (let i = Nk; i < 4 * (Nr + 1); i++) {
        let temp = w[i - 1];
        if (i % Nk === 0) {
            temp = ((temp << 8) | (temp >>> 24)) >>> 0;
            const b0 = (temp >>> 24) & 0xff, b1 = (temp >>> 16) & 0xff, b2 = (temp >>> 8) & 0xff, b3 = temp & 0xff;
            temp = ((aaSbox[b0] << 24) | (aaSbox[b1] << 16) | (aaSbox[b2] << 8) | aaSbox[b3]) ^ (aaRcon[(i / Nk) - 1] << 24);
        } else if (Nk > 6 && i % Nk === 4) {
            const b0 = (temp >>> 24) & 0xff, b1 = (temp >>> 16) & 0xff, b2 = (temp >>> 8) & 0xff, b3 = temp & 0xff;
            temp = (aaSbox[b0] << 24) | (aaSbox[b1] << 16) | (aaSbox[b2] << 8) | aaSbox[b3];
        }
        w[i] = (w[i - Nk] ^ temp) >>> 0;
    }
    const rk = new Uint8Array(4 * (Nr + 1) * 4);
    for (let i = 0; i < w.length; i++) {
        rk[4 * i] = (w[i] >>> 24) & 0xff;
        rk[4 * i + 1] = (w[i] >>> 16) & 0xff;
        rk[4 * i + 2] = (w[i] >>> 8) & 0xff;
        rk[4 * i + 3] = w[i] & 0xff;
    }
    return rk;
}

function aaEncryptBlock(key, block) {
    const Nr = key.length / 16 - 1;
    const s = block.slice();
    for (let i = 0; i < 16; i++) s[i] ^= key[i];
    for (let round = 1; round < Nr; round++) {
        for (let i = 0; i < 16; i++) s[i] = aaSbox[s[i]];
        const t = s.slice();
        s[0] = t[0]; s[4] = t[4]; s[8] = t[8]; s[12] = t[12];
        s[1] = t[5]; s[5] = t[9]; s[9] = t[13]; s[13] = t[1];
        s[2] = t[10]; s[6] = t[14]; s[10] = t[2]; s[14] = t[6];
        s[3] = t[15]; s[7] = t[3]; s[11] = t[7]; s[15] = t[11];
        aaMixColumns(s);
        for (let i = 0; i < 16; i++) s[i] ^= key[round * 16 + i];
    }
    for (let i = 0; i < 16; i++) s[i] = aaSbox[s[i]];
    const t = s.slice();
    s[0] = t[0]; s[4] = t[4]; s[8] = t[8]; s[12] = t[12];
    s[1] = t[5]; s[5] = t[9]; s[9] = t[13]; s[13] = t[1];
    s[2] = t[10]; s[6] = t[14]; s[10] = t[2]; s[14] = t[6];
    s[3] = t[15]; s[7] = t[3]; s[11] = t[7]; s[15] = t[11];
    for (let i = 0; i < 16; i++) s[i] ^= key[Nr * 16 + i];
    return s;
}

function aaGmul(a, b) {
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

function aaMixColumns(s) {
    for (let c = 0; c < 4; c++) {
        const i = c * 4;
        const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
        s[i] = aaGmul(a0, 2) ^ aaGmul(a1, 3) ^ a2 ^ a3;
        s[i + 1] = a0 ^ aaGmul(a1, 2) ^ aaGmul(a2, 3) ^ a3;
        s[i + 2] = a0 ^ a1 ^ aaGmul(a2, 2) ^ aaGmul(a3, 3);
        s[i + 3] = aaGmul(a0, 3) ^ a1 ^ a2 ^ aaGmul(a3, 2);
    }
}

function aaGfMul128(x, y) {
    const z = new Uint8Array(16);
    const v = y.slice();
    const R = [0xe1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 128; i++) {
        if (x[i >> 3] & (0x80 >> (i & 7))) {
            for (let j = 0; j < 16; j++) z[j] ^= v[j];
        }
        const lsb = v[15] & 1;
        for (let j = 15; j > 0; j--) v[j] = ((v[j] >>> 1) | ((v[j - 1] & 1) << 7)) & 0xff;
        v[0] = (v[0] >>> 1);
        if (lsb) for (let j = 0; j < 16; j++) v[j] ^= R[j];
    }
    for (let j = 0; j < 16; j++) x[j] = z[j];
}

function aaGhash(H, data) {
    const y = new Uint8Array(16);
    for (let i = 0; i < data.length; i += 16) {
        for (let j = 0; j < 16; j++) y[j] ^= (i + j < data.length) ? data[i + j] : 0;
        aaGfMul128(y, H);
    }
    return y;
}

function aaInc32(block) {
    let t = (block[15] + 1) & 0xff;
    block[15] = t;
    if (t === 0) {
        t = (block[14] + 1) & 0xff; block[14] = t;
        if (t === 0) {
            t = (block[13] + 1) & 0xff; block[13] = t;
            if (t === 0) { block[12] = (block[12] + 1) & 0xff; }
        }
    }
    return block;
}

function aaGcmSeal(key, iv, plaintext) {
    const rk = aaKeyExpansion(key);
    const H = aaEncryptBlock(rk, new Uint8Array(16));
    const J0 = new Uint8Array(16);
    J0.set(iv.slice(0, 12));
    J0[15] = 1;
    const counter = J0.slice();
    aaInc32(counter);
    const out = new Uint8Array(plaintext.length);
    for (let i = 0; i < plaintext.length; i += 16) {
        const ks = aaEncryptBlock(rk, counter);
        aaInc32(counter);
        for (let j = 0; j < 16 && i + j < plaintext.length; j++) out[i + j] = plaintext[i + j] ^ ks[j];
    }
    const padded = Math.ceil(out.length / 16) * 16;
    const full = new Uint8Array(padded + 16);
    full.set(out);
    const dv = new DataView(full.buffer);
    dv.setUint32(full.length - 4, out.length * 8, false);
    const S = aaGhash(H, full);
    const EKJ0 = aaEncryptBlock(rk, J0);
    const tag = new Uint8Array(16);
    for (let i = 0; i < 16; i++) tag[i] = S[i] ^ EKJ0[i];
    return { out, tag };
}

function aaGcmOpen(key, iv, ciphertext, tag) {
    const rk = aaKeyExpansion(key);
    const H = aaEncryptBlock(rk, new Uint8Array(16));
    const J0 = new Uint8Array(16);
    J0.set(iv.slice(0, 12));
    J0[15] = 1;
    const counter = J0.slice();
    aaInc32(counter);
    const out = new Uint8Array(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i += 16) {
        const ks = aaEncryptBlock(rk, counter);
        aaInc32(counter);
        for (let j = 0; j < 16 && i + j < ciphertext.length; j++) out[i + j] = ciphertext[i + j] ^ ks[j];
    }
    const padded = Math.ceil(ciphertext.length / 16) * 16;
    const full = new Uint8Array(padded + 16);
    full.set(ciphertext);
    const dv = new DataView(full.buffer);
    dv.setUint32(full.length - 4, ciphertext.length * 8, false);
    const S = aaGhash(H, full);
    const EKJ0 = aaEncryptBlock(rk, J0);
    for (let i = 0; i < 16; i++) {
        if ((S[i] ^ EKJ0[i]) !== tag[i]) return null;
    }
    return out;
}

const aaK256 = [
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
];

function aaRotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function aaSha256(bytes) {
    const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = bytes.length;
    const m = new Uint8Array((((l + 8) >> 6) + 1) << 6);
    m.set(bytes);
    m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(m.length - 8, 0, false);
    dv.setUint32(m.length - 4, l * 8, false);
    const w = new Int32Array(64);
    const H = H0.slice();
    for (let i = 0; i < m.length; i += 64) {
        for (let t = 0; t < 16; t++) w[t] = dv.getInt32(i + t * 4, false);
        for (let t = 16; t < 64; t++) {
            const s0 = aaRotr(w[t - 15], 7) ^ aaRotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
            const s1 = aaRotr(w[t - 2], 17) ^ aaRotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }
        let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (let t = 0; t < 64; t++) {
            const S1 = aaRotr(e, 6) ^ aaRotr(e, 11) ^ aaRotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + aaK256[t] + w[t]) | 0;
            const S0 = aaRotr(a, 2) ^ aaRotr(a, 13) ^ aaRotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
        out[i * 4] = (H[i] >>> 24) & 0xff;
        out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
        out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
        out[i * 4 + 3] = H[i] & 0xff;
    }
    return out;
}

/* BYTE / STRING HELPERS */

function aaAscii(str) {
    const s = String(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
}

function aaBytesToStr(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
}

function aaStrToBytes(str) {
    const s = String(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
}

function aaB64(bytes) {
    return btoa(aaBytesToStr(bytes));
}

function aaUnb64(str) {
    const bin = atob(String(str));
    if (bin == null) return null;
    return aaStrToBytes(bin);
}

function aaHexToBytes(hex) {
    const h = String(hex || '');
    const out = new Uint8Array(Math.floor(h.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
}

function aaHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
}

function aaUtf8ToStr(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) {
            out += String.fromCharCode(b);
        } else if ((b & 0xe0) === 0xc0 && i + 1 < bytes.length) {
            out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
            i += 1;
        } else if ((b & 0xf0) === 0xe0 && i + 2 < bytes.length) {
            out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
            i += 2;
        } else if ((b & 0xf8) === 0xf0 && i + 3 < bytes.length) {
            const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            if (cp > 0xffff) {
                const v = cp - 0x10000;
                out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
            } else {
                out += String.fromCharCode(cp);
            }
            i += 3;
        }
    }
    return out;
}

function aaXor56(hex) {
    const s = String(hex || '');
    let out = '';
    for (let i = 0; i + 1 < s.length; i += 2) {
        out += String.fromCharCode(parseInt(s.substr(i, 2), 16) ^ 56);
    }
    return out;
}

/* HELPERS */

async function gql(query) {
    for (let i = 0; i < API_URLS.length; i++) {
        const response = await soraFetch(API_URLS[i], {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify({ query })
        });
        if (!response) continue;
        try {
            const json = await response.json();
            if (json && json.data) return json.data;
        } catch (error) {
            continue;
        }
    }
    return null;
}

async function soraFetch(url, options) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const headers = opts.headers || {};
    const body = typeof opts.body === 'undefined' ? null : opts.body;

    try {
        return await fetchv2(url, headers, method, body);
    } catch (e) {
        try {
            const text = await fetch(url, {
                method: method,
                headers: headers,
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

function extractShowId(url) {
    const match = String(url || '').match(/\/bangumi\/([^\/?#]+)/);
    return match ? match[1] : '';
}

function parseEpisodeUrl(url) {
    const match = String(url || '').match(/\/bangumi\/([^\/?#]+)\/p-([^\/?#]+)/);
    return match ? { showId: match[1], episode: match[2] } : null;
}

function cdnUrl(path) {
    if (!path) return '';
    const p = String(path).trim();
    if (/^https?:\/\//i.test(p)) return p;
    return CDN_BASE + '/' + p.replace(/^\/+/, '');
}

function cleanText(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&#0?39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .trim();
}
