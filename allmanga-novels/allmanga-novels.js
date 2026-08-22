// AllManga Manga — manga (image-chapter) module for allmanga.to, the manga
// build of the AllAnime platform. Same GraphQL backend as allmanga.js (anime):
//   - search + details: plain persisted queries (no token)
//   - chapter pages:   chapterPages persisted query, gated by the aaReq
//                      AES-GCM token (same keygen flow as the anime module)
// All four functions return the kanzen mangas contract: raw objects/arrays
// (searchResults / extractDetails / extractChapters / extractImages), no
// JSON.stringify. Chapter pages are returned as plain image URLs.
//
// KNOWN LIMITATION: the chapter CDN (aln.youtube-anime.com -> ytimgf.youtube-
// anime.com, and the wp.youtube-anime.com proxy) 403s any request without the
// platform Referer (https://allmanga.to/ or https://mkissa.to/). The keygen
// and chapterPages API work (image URLs are generated fine); but kanzen's
// reader loads images with plain URL requests (no header support), so chapter
// panels do NOT render in-app. Same wall as the old v1.0.x novels build.

// Some host builds omit the console bridge; keep logging a no-op there.
if (typeof console === 'undefined' || !console) { var console = { log: function() {}, print: function() {} }; }

const BASE_URL = 'https://allmanga.to';
const API_URLS = [
    'https://api.allanime.day/api',
    'https://api.mkissa.net/api'
];

// ---- persisted query hashes (sha256 of the query texts below) --------------
const HASH_MANGAS = '2d48e19fb67ddcac42fbb885204b6abb0a84f406f15ef83f36de4a66f49f651a';
const HASH_MANGA = 'd77781dcf964b97aea0be621dbde430e89e200b58526823ee6010dd11c3ca96a';
const HASH_CHAPTER_PAGES = 'ac8c21cdd6949db2741b9b314a3c5a64b30e69bacc18547a78c309b342cc62f2';
// Byte-exact query text for the chapterPages persisted hash. DO NOT reformat:
// HASH_CHAPTER_PAGES is sha256 of this exact string.
const MANGA_CHAPTER_QUERY = "\nquery(\n$mangaId: String!\n$translationType: VaildTranslationTypeMangaEnumType!\n$chapterString: String!\n$page: Int\n$limit: Int!\n$offset: Int\n) {\nchapterPages(\nmangaId:$mangaId\ntranslationType:$translationType\nchapterString:$chapterString\npage:$page\nlimit:$limit\noffset:$offset\n){\nedges{\nstreamerId\nsourceName\nchapterString\npictureUrls\npictureUrlsProcessed\npictureUrlHead\nnotes\nuploadDate\nsourceUrl\npriority\nversionFix\n}\n# episodeInfo{\n# notes\n# thumbnails\n# pictureUrlsProcessed\n# }\npageInfo{\ntotal\n}\npageStatus{\n_id\nnotes\nthumbnail\npageId\nshowId\n\n}\nmanga{\n\ndescription\nthumbnails\nauthors\ngenres\nstatus\naltNames\naverageScore\nrating\nbroadcastInterval\nbanner\nairedEnd\nmagazine\ncharacters\navailableChaptersDetail\navailableChapters\nprevideos\nnameOnlyString\nrelatedShows\nrelatedMangas\nisAdult\ncountryOfOrigin\ntags\ntype\n}\n}\n}\n";

const KEYGEN_URLS = [
    'https://raw.githubusercontent.com/sdaqo/anipy-cli/refs/heads/key-gen/scripts/keygen/keygen.json',
    'https://raw.githubusercontent.com/sdaqo/anipy-cli/key-gen/scripts/keygen/keygen.json'
];

// Known-good keygen snapshot (build 136, epoch 2955) — captured live on
// 2026-08-22 (same snapshot the anime module v1.8.0 uses). When the API says
// AA_CRYPTO_STALE/MISSING/EXPIRED the module self-bootstraps fresh keys from
// the platform crypto endpoint (aaBootstrapFor), with the remote keygen repo
// as last resort.
const FALLBACK_KEYGEN = {
    build_id: '136',
    epoch: 2955,
    lane: 'k7',
    key: 'deeb2732190ceee0d84c7668d79b64ddcd5f27b9f858f2327fe29a7841b7b5da',
    static_key: 'Xot36i3lK3:v1'
};

// Self-bootstrap inputs, identical to allmanga anime build 136 scheme:
//   embed[i]   = concat(base64decode(mask blocks))          [32 bytes]
//   salt[i]    = (buildId.charCodeAt(i % len) || 0)
//                ^ ((i * AA_SALT_MUL + AA_SALT_ADD) & 255)
//   linear[i]  = ((i >> 3) * AA_FRAG_MUL + (i % 8) * AA_FRAG_ADD) & 255
//   mask[i]    = embed[i] ^ salt[i] ^ linear[i]
//   hmacKey    = HMAC-SHA256(mask, AA_BOOT_PREFIX + buildId)
//   bootTok    = hex(HMAC-SHA256(hmacKey, `${epoch}~${host}~${lane}~${group}~${buildId}`))
//   GET {AA_BOOTSTRAP_URL}?buildId=<id>&k=<lane>  (x-build-id / x-aa-boot headers)
//   key        = first32(base64decode(partB)) XOR mask
// Epochs are 7-day (floor(now/604800000)); during the first day of an epoch the
// previous one is still accepted. group is "mkissa" for the public hosts.
const AA_MASK_BLOCKS = ['zZ9iqAzia78=', '0GqOekVONY4=', 'uyiEMZfgVqA=', 'HBpHBAntve4='];
const AA_SALT_MUL = 78;
const AA_SALT_ADD = 200;
const AA_FRAG_MUL = 234;
const AA_FRAG_ADD = 70;
const AA_BOOT_PREFIX = 'qrSOLsg:';
const AA_WEEK_MS = 604800000;
const AA_DAY_MS = 86400000;
const AA_BOOTSTRAP_URL = 'https://api.mkissa.net/client-crypto/v1/bootstrap';
const AA_BOOT_HOST = 'mkissa.to';
const AA_BOOT_GROUP = 'mkissa';

// Image hosts (verified live):
//   - chapter pages: pictureUrlHead (https://aln.youtube-anime.com/) + url
//   - relative "mcovers/..." thumbnails -> wp.youtube-anime.com proxy
const THUMB_PROXY_BASE = 'https://wp.youtube-anime.com/aln.youtube-anime.com/';
const DEFAULT_CHAPTER_HEAD = 'https://aln.youtube-anime.com/';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

console.log('[AllMangaNovels] module script loaded v1.1.3 (build 136 keygen + self-bootstrap)');

/* ---- fetch bridge --------------------------------------------------------- */

async function soraFetch(url, options) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const headers = opts.headers || {};
    const body = typeof opts.body === 'undefined' ? null : opts.body;
    try {
        const r = await fetchv2(url, headers, method, body);
        if (r) return toResponseLike(r);
    } catch (e) { /* fall through */ }
    try {
        const text = await fetch(url, { method: method, headers: headers, body: body });
        return toResponseLike(text);
    } catch (e) {
        console.log('soraFetch error: ' + e);
        return null;
    }
}

// Some app builds resolve with the body STRING instead of a Response; wrap so
// .text()/.json() always exist.
function toResponseLike(value) {
    if (value && typeof value.text === 'function' && typeof value.json === 'function') {
        return value;
    }
    let str = '';
    try {
        if (value == null) str = '';
        else if (typeof value === 'string') str = value;
        else str = String(value);
    } catch (e) { str = ''; }
    return {
        status: 200,
        ok: true,
        headers: { get: function() { return null; } },
        text: async function() { return str; },
        json: async function() { return JSON.parse(str); }
    };
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

// Without timers there is no race to lose: the app enforces its own overall
// timeout, so just pass the plain fetch through.
async function soraFetchTimed(url, options, timeoutMs) {
    if (typeof setTimeout !== 'function') return soraFetch(url, options);
    const limit = timeoutMs || 12000;
    return Promise.race([
        soraFetch(url, options),
        timerSafe(limit).then(function() { return null; })
    ]);
}

/* ---- pure-JS crypto (SHA-256 + AES-256-GCM) for the app's JavaScriptCore -- */
// Copied verbatim from allmanga.js — same sandbox, same constraints.

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

/* ---- byte / string helpers ------------------------------------------------ */

function aaAscii(str) {
    const s = String(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
}

const AA_B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function aaB64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = (i + 1 < bytes.length) ? bytes[i + 1] : 0;
        const b2 = (i + 2 < bytes.length) ? bytes[i + 2] : 0;
        out += AA_B64_CHARS[b0 >> 2];
        out += AA_B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
        out += (i + 1 < bytes.length) ? AA_B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
        out += (i + 2 < bytes.length) ? AA_B64_CHARS[b2 & 63] : '=';
    }
    return out;
}

function aaUnb64(str) {
    const s = String(str).replace(/=+$/, '');
    const out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
        const v = AA_B64_CHARS.indexOf(s[i]);
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

/* ---- aaReq token + response decryption (same flow as allmanga anime) ------ */

function aaBuildToken(keys, qh, ts) {
    const payload = '{"v":1,"ts":' + ts + ',"epoch":' + keys.epoch + ',"buildId":"' + keys.build_id + '","qh":"' + qh + '","k":"' + keys.lane + '"}';
    // build 114 IV derivation (site zI()): sha256(epoch:buildId:qh:ts:lane)[0:12]
    const iv = aaSha256(aaAscii(keys.epoch + ':' + keys.build_id + ':' + qh + ':' + ts + ':' + keys.lane)).slice(0, 12);
    const sealed = aaGcmSeal(aaHexToBytes(keys.key), iv, aaAscii(payload));
    const blob = new Uint8Array(1 + 12 + sealed.out.length + 16);
    blob[0] = 1;
    blob.set(iv, 1);
    blob.set(sealed.out, 13);
    blob.set(sealed.tag, 13 + sealed.out.length);
    return aaB64(blob);
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

/* ---- keygen (bundled fallback + remote refresh) --------------------------- */

let aaKeyCache = { keys: null, ts: 0 };

function aaGetKeys() {
    const now = Date.now();
    if (aaKeyCache.keys && now - aaKeyCache.ts < 90000) return aaKeyCache.keys;
    return {
        build_id: FALLBACK_KEYGEN.build_id,
        epoch: String(FALLBACK_KEYGEN.epoch),
        lane: FALLBACK_KEYGEN.lane,
        key: FALLBACK_KEYGEN.key,
        static_key: FALLBACK_KEYGEN.static_key
    };
}

// Pure-JS HMAC-SHA256 over the module's existing aaSha256 (RFC 2104).
function aaHmacSha256(key, msg) {
    let k = key;
    if (k.length > 64) k = aaSha256(k);
    const ipad = new Uint8Array(64);
    const opad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
        const kb = i < k.length ? k[i] : 0;
        ipad[i] = kb ^ 0x36;
        opad[i] = kb ^ 0x5c;
    }
    const inner = aaSha256(aaConcat(ipad, msg));
    return aaSha256(aaConcat(opad, inner));
}

function aaConcat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

// Deterministic client mask for a given build id (see block comment above).
function aaBuildMask(buildId) {
    const embed = new Uint8Array(32);
    let off = 0;
    for (let b = 0; b < AA_MASK_BLOCKS.length; b++) {
        const blk = aaUnb64(AA_MASK_BLOCKS[b]);
        for (let i = 0; i < blk.length && off + i < 32; i++) embed[off + i] = blk[i];
        off += blk.length;
    }
    const mask = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        const cc = buildId.charCodeAt(i % buildId.length) || 0;
        const salt = cc ^ ((i * AA_SALT_MUL + AA_SALT_ADD) & 255);
        const linear = (((i >> 3) * AA_FRAG_MUL) + ((i % 8) * AA_FRAG_ADD)) & 255;
        mask[i] = embed[i] ^ salt ^ linear;
    }
    return mask;
}

async function aaBootstrapFor(lane, epoch) {
    try {
        const mask = aaBuildMask(String(FALLBACK_KEYGEN.build_id));
        const hmacKey = aaHmacSha256(mask, aaAscii(AA_BOOT_PREFIX + FALLBACK_KEYGEN.build_id));
        // message parts (site order): epoch ~ host ~ lane ~ group ~ buildId
        const msg = epoch + '~' + AA_BOOT_HOST + '~' + lane + '~' + AA_BOOT_GROUP + '~' + FALLBACK_KEYGEN.build_id;
        const bootTok = aaHex(aaHmacSha256(hmacKey, aaAscii(msg)));
        const url = AA_BOOTSTRAP_URL + '?buildId=' + encodeURIComponent(FALLBACK_KEYGEN.build_id) +
            '&k=' + encodeURIComponent(lane);
        const resp = await soraFetch(url, {
            headers: {
                'x-build-id': String(FALLBACK_KEYGEN.build_id),
                'x-aa-boot': bootTok,
                'Referer': 'https://' + AA_BOOT_HOST + '/',
                'Origin': 'https://' + AA_BOOT_HOST,
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': UA
            }
        });
        if (!resp || !resp.ok) {
            console.log('bootstrap http ' + (resp ? resp.status : 'no-response') + ' for lane ' + lane);
            return null;
        }
        const j = await resp.json();
        if (!j || !j.partB) { console.log('bootstrap empty partB'); return null; }
        const raw = aaUnb64(j.partB);
        if (!raw || raw.length < 32) { console.log('bootstrap short partB'); return null; }
        const key = new Uint8Array(32);
        for (let i = 0; i < 32; i++) key[i] = raw[i] ^ mask[i % mask.length];
        return {
            build_id: String(FALLBACK_KEYGEN.build_id),
            epoch: String(j.epoch !== undefined ? j.epoch : epoch),
            lane: (j.k && String(j.k)) || lane,
            key: aaHex(key),
            static_key: FALLBACK_KEYGEN.static_key
        };
    } catch (error) {
        console.log('bootstrap error: ' + error);
        return null;
    }
}

// Refresh keys when the API rejects our aaReq token: self-bootstrap first
// (current epoch, then previous), remote keygen repo as last resort.
async function aaFetchRemoteKeys(lane) {
    const now = Date.now();
    if (aaKeyCache.keys && now - aaKeyCache.ts < 90000) return aaKeyCache.keys;

    const curEpoch = Math.floor(now / AA_WEEK_MS);
    const prevEpoch = (now - curEpoch * AA_WEEK_MS < AA_DAY_MS && curEpoch > 0) ? curEpoch - 1 : curEpoch;
    const useLane = lane || FALLBACK_KEYGEN.lane;
    for (const ep of [curEpoch, prevEpoch]) {
        const keys = await aaBootstrapFor(useLane, ep);
        if (keys) {
            console.log('self-bootstrap ok: epoch ' + keys.epoch + ', lane ' + keys.lane);
            aaKeyCache.keys = keys;
            aaKeyCache.ts = Date.now();
            return keys;
        }
    }
    console.log('self-bootstrap failed; trying remote keygen repo');
    for (let i = 0; i < KEYGEN_URLS.length; i++) {
        try {
            const resp = await soraFetch(KEYGEN_URLS[i], {
                headers: { 'User-Agent': UA, 'Accept': 'application/json' }
            });
            if (resp) {
                const json = await resp.json();
                // Guard: the third-party keygen repo lags behind the live site
                // (e.g. build 81 vs the site's 114). Never replace a newer
                // bundled fallback with an older remote snapshot.
                const remoteBuild = Number(json && json.build_id);
                const fallbackBuild = Number(FALLBACK_KEYGEN.build_id);
                if (json && json.build_id && json.key && json.epoch !== undefined && json.lane && remoteBuild >= fallbackBuild) {
                    const keys = {
                        build_id: String(json.build_id),
                        epoch: String(json.epoch),
                        lane: String(json.lane),
                        key: String(json.key),
                        static_key: String(json.static_key || FALLBACK_KEYGEN.static_key)
                    };
                    aaKeyCache.keys = keys;
                    aaKeyCache.ts = Date.now();
                    return keys;
                }
                console.log('Remote keygen stale (build ' + (json && json.build_id) + ' < ' + fallbackBuild + '); keeping fallback');
            }
        } catch (error) {
            console.log('Keygen fetch error: ' + error);
        }
    }
    return null;
}

/* ---- generic TTL cache ----------------------------------------------------- */

const aaCache = {};

function cacheGet(key) {
    const hit = aaCache[key];
    if (hit && Date.now() - hit.ts < hit.ttl) return hit.value;
    return null;
}

function cacheSet(key, value, ttlMs) {
    const keys = Object.keys(aaCache);
    if (keys.length > 120) {
        const now = Date.now();
        keys.forEach(function(k) {
            if (now - aaCache[k].ts > aaCache[k].ttl) delete aaCache[k];
        });
    }
    aaCache[key] = { value: value, ts: Date.now(), ttl: ttlMs || 300000 };
}

/* ---- GraphQL API calls ------------------------------------------------------ */

function apiHeaders(extra) {
    const h = {
        'Origin': BASE_URL,
        'Referer': BASE_URL + '/',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': UA
    };
    if (extra) {
        Object.keys(extra).forEach(function(k) { h[k] = extra[k]; });
    }
    return h;
}

// Persisted-query GET, tries every API host. Returns parsed JSON or null.
// When `queryText` is given (APQ registration fallback), the full query is
// sent along so a server whose persisted-query cache was evicted re-registers
// it on first use (same behaviour as the anime module's POST fallback).
async function apiQuery(variables, hash, options) {
    const opts = options || {};
    const extensions = { persistedQuery: { version: 1, sha256Hash: hash } };
    if (opts.token) {
        extensions.aaReq = opts.token;
        extensions.k = opts.lane;
    }
    for (let i = 0; i < API_URLS.length; i++) {
        let url = API_URLS[i] + '?variables=' + encodeURIComponent(JSON.stringify(variables)) +
            '&extensions=' + encodeURIComponent(JSON.stringify(extensions));
        if (opts.queryText) {
            url += '&query=' + encodeURIComponent(opts.queryText);
        }
        const resp = await soraFetchTimed(url, { headers: apiHeaders(opts.headers) }, opts.timeout || 12000);
        if (!resp) continue;
        try {
            const json = await resp.json();
            if (json && typeof json === 'object') return json;
        } catch (e) {
            console.log('apiQuery parse error on ' + API_URLS[i] + ': ' + e);
        }
    }
    return null;
}

async function mangaSearch(keyword) {
    const variables = {
        search: { query: String(keyword || ''), isManga: true },
        limit: 26,
        page: 1,
        translationType: 'sub',
        countryOrigin: 'ALL'
    };
    const json = await apiQuery(variables, HASH_MANGAS);
    return (json && json.data && json.data.mangas && json.data.mangas.edges) || [];
}

async function mangaDetail(mangaId) {
    const variables = { _id: mangaId, search: { allowAdult: false, allowUnknown: false } };
    const json = await apiQuery(variables, HASH_MANGA);
    return (json && json.data && json.data.manga) || null;
}

// chapterPages is gated by the aaReq token; on AA_CRYPTO_STALE/MISSING the
// keygen is refreshed and the call retried once (same as the anime module).
async function mangaChapterPages(mangaId, chapterString, translationType) {
    let keys = aaGetKeys();
    let parsed = await mangaChapterPagesOnce(keys, mangaId, chapterString, translationType);
    if (!parsed) {
        const fresh = await aaFetchRemoteKeys();
        if (fresh) {
            keys = fresh;
            parsed = await mangaChapterPagesOnce(keys, mangaId, chapterString, translationType);
        }
    }
    return parsed;
}

async function mangaChapterPagesOnce(keys, mangaId, chapterString, translationType) {
    const variables = {
        mangaId: mangaId,
        translationType: translationType || 'sub',
        chapterString: String(chapterString),
        page: 1,
        limit: 500,
        offset: 0
    };
    const ts = Math.floor(Date.now() / 300000) * 300000;
    const qh = aaHex(aaSha256(aaAscii(MANGA_CHAPTER_QUERY)));
    // Crypto-gated queries require the platform's canonical referer (mkissa.to)
    // — the API answers AA_CRYPTO_WRONG_REFERER otherwise.
    const cryptoHeaders = {
        'Content-Type': 'application/json',
        'x-build-id': keys.build_id,
        'Origin': 'https://mkissa.to',
        'Referer': 'https://mkissa.to'
    };
    const json = await apiQuery(variables, HASH_CHAPTER_PAGES, {
        token: aaBuildToken(keys, qh, ts),
        lane: keys.lane,
        headers: cryptoHeaders,
        timeout: 15000
    });
    if (!json) return null;
    const msg = (json.errors && json.errors[0] && json.errors[0].message) || '';
    if (msg.indexOf('PersistedQueryNotFound') === 0) {
        // APQ cache evicted on the server: re-send with the query text so it
        // registers the persisted query and executes in one round-trip.
        console.log('[AllMangaNovels] PersistedQueryNotFound; registering query text');
        const registered = await apiQuery(variables, HASH_CHAPTER_PAGES, {
            token: aaBuildToken(keys, qh, ts),
            lane: keys.lane,
            queryText: MANGA_CHAPTER_QUERY,
            headers: cryptoHeaders,
            timeout: 15000
        });
        if (!registered) return null;
        const regMsg = (registered.errors && registered.errors[0] && registered.errors[0].message) || '';
        if (regMsg.indexOf('AA_CRYPTO_STALE') === 0 || regMsg.indexOf('AA_CRYPTO_MISSING') === 0 || regMsg.indexOf('AA_CRYPTO_EXPIRED') === 0) {
            console.log('[AllMangaNovels] aaReq stale/missing: ' + regMsg.slice(0, 60));
            return null;
        }
        return (registered.data && registered.data.tobeparsed) ? aaDecrypt(keys, registered.data.tobeparsed) : null;
    }
    if (msg.indexOf('AA_CRYPTO_STALE') === 0 || msg.indexOf('AA_CRYPTO_MISSING') === 0 || msg.indexOf('AA_CRYPTO_EXPIRED') === 0) {
        console.log('[AllMangaNovels] aaReq stale/missing: ' + msg.slice(0, 60));
        return null;
    }
    const parsed = (json.data && json.data.tobeparsed) ? aaDecrypt(keys, json.data.tobeparsed) : null;
    return parsed;
}

/* ---- helpers ---------------------------------------------------------------- */

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

function normalizeImage(path) {
    const p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.indexOf('mcovers/') === 0) return THUMB_PROXY_BASE + p;
    return BASE_URL + '/' + p.replace(/^\/+/, '');
}

// /manga/{mangaId} and /manga/{mangaId}/chapter-{chapterString}-{type}
function extractMangaId(url) {
    const match = String(url || '').match(/\/manga\/([^\/?#]+)/);
    return match ? match[1] : '';
}

function parseChapterUrl(url) {
    const u = String(url || '');
    const mangaMatch = u.match(/\/manga\/([^\/?#]+)\//);
    const chMatch = u.match(/\/chapter-([^\/?#]+?)-(sub|raw|dub)$/);
    if (!mangaMatch) return null;
    return {
        mangaId: mangaMatch[1],
        chapterString: chMatch ? chMatch[1] : '',
        translationType: chMatch ? chMatch[2] : 'sub'
    };
}

/* ---- novels contract ---------------------------------------------------------- */

async function searchResults(keyword, page = 0) {
    const key = 'search/' + String(keyword || '').toLowerCase();
    const cached = cacheGet(key);
    if (cached) return cached;
    try {
        const edges = await mangaSearch(keyword);
        const results = [];
        const seen = new Set();
        edges.forEach(function(show) {
            if (!show || !show._id) return;
            const id = BASE_URL + '/manga/' + show._id;
            if (seen.has(id)) return;
            seen.add(id);
            const title = cleanText(show.englishName || show.name || show.nativeName || 'Unknown');
            if (!title) return;
            results.push({ id: id, title: title, imageURL: normalizeImage(show.thumbnail) });
        });
        cacheSet(key, results, 60000);
        console.log('[AllMangaNovels] search "' + keyword + '" -> ' + results.length + ' results');
        return results;
    } catch (error) {
        console.log('Search error: ' + error);
        return [];
    }
}

async function extractDetails(url) {
    try {
        const mangaId = extractMangaId(url);
        if (!mangaId) return { description: 'No manga id', tags: [] };
        const manga = await mangaDetail(mangaId);
        if (!manga) return { description: 'No description available', tags: [] };
        return {
            description: cleanText(manga.description) || 'No description available',
            tags: (manga.genres || []).map(function(g) { return cleanText(g); }).filter(Boolean)
        };
    } catch (error) {
        console.log('Details error: ' + error);
        return { description: 'Error loading description', tags: [] };
    }
}

async function extractChapters(url) {
    try {
        const mangaId = extractMangaId(url);
        if (!mangaId) return { en: [] };
        const cacheKey = 'chapters/' + mangaId;
        const cached = cacheGet(cacheKey);
        if (cached) return cached;

        const manga = await mangaDetail(mangaId);
        const list = (manga && manga.availableChaptersDetail && manga.availableChaptersDetail.sub) || [];
        if (!list.length) return { en: [] };

        // The API returns chapters newest-first; present them ascending.
        const unique = [];
        const seen = new Set();
        list.slice().reverse().forEach(function(ch) {
            const s = String(ch).trim();
            if (!s || seen.has(s)) return;
            seen.add(s);
            unique.push(s);
        });

        const results = unique.map(function(ch) {
            const num = parseFloat(ch);
            return [
                String(num || ch),
                [{
                    id: BASE_URL + '/manga/' + mangaId + '/chapter-' + encodeURIComponent(ch) + '-sub',
                    title: 'Chapter ' + ch,
                    chapter: num || 0,
                    scanlation_group: ''
                }]
            ];
        });
        cacheSet(cacheKey, results, 300000);
        console.log('[AllMangaNovels] chapters for ' + mangaId + ' -> ' + results.length);
        return { en: results };
    } catch (error) {
        console.log('Chapters error: ' + error);
        return { en: [] };
    }
}

async function extractImages(chapterUrl) {
    try {
        const parsed = parseChapterUrl(chapterUrl);
        if (!parsed || !parsed.mangaId || !parsed.chapterString) return [];
        const cacheKey = 'images/' + parsed.mangaId + '/' + parsed.chapterString + '/' + parsed.translationType;
        const cached = cacheGet(cacheKey);
        if (cached) return cached;

        const result = await mangaChapterPages(parsed.mangaId, parsed.chapterString, parsed.translationType);
        const pages = (result && result.chapterPages && result.chapterPages.edges) || [];
        if (!pages.length) return [];

        // Pick the first server with picture pages; prefer one with a head URL.
        let edge = null;
        for (let i = 0; i < pages.length; i++) {
            if (pages[i] && Array.isArray(pages[i].pictureUrls) && pages[i].pictureUrls.length) {
                if (!edge || !edge.pictureUrlHead) edge = pages[i];
                if (pages[i].pictureUrlHead) break;
            }
        }
        if (!edge) return [];
        const head = String(edge.pictureUrlHead || DEFAULT_CHAPTER_HEAD).replace(/\/+$/, '') + '/';
        const imgs = edge.pictureUrls
            .filter(function(p) { return p && p.url; })
            .sort(function(a, b) { return (a.num || 0) - (b.num || 0); })
            .map(function(p) {
                return /^https?:\/\//i.test(p.url) ? p.url : head + String(p.url).replace(/^\/+/, '');
            });
        cacheSet(cacheKey, imgs, 1800000);
        console.log('[AllMangaNovels] images for ' + parsed.mangaId + ' ch ' + parsed.chapterString + ' -> ' + imgs.length + ' pages');
        return imgs;
    } catch (error) {
        console.log('Images error: ' + error);
        return [];
    }
}

// Byte-exact query text for the chapterPages persisted hash. DO NOT reformat:
// the hash (HASH_CHAPTER_PAGES) is sha256 of this exact string.

// Compatibility aliases: Luna builds before the 2026-06-28 "Renamed function"
// commit (88e1a8da) call the old names (searchContent/getContentData/
// getChapters/getChapterImages); current builds call the names above.
async function searchContent(input, page) { return searchResults(input, page); }
async function getContentData(input) { return extractDetails(input); }
async function getChapters(input) { return extractChapters(input); }
async function getChapterImages(input) { return extractImages(input); }

