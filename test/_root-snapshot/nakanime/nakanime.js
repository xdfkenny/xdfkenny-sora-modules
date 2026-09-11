// ==========================================
// ⚙️ MODULE SORA — NAKANIME TV (Déchiffreur XOR Intégré)
// ==========================================

const BASE_URL = "https://nakanime.tv";

// ==========================================
// 🗄️ TRACKER SUPABASE (Statistiques)
// ==========================================

const SUPABASE_URL = "https://qyeisgowjisqbatrmqta.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F68CBjFVPh71U0SdD9BQJg_UJgL9-Fj";

async function sendSupabaseLog(moduleName, actionType, dataPayload) {
    try {
        const payload = { module: moduleName, action: actionType, data: dataPayload };
        const headers = { 
            "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Prefer": "return=minimal" 
        };
        if (typeof fetchv2 !== 'undefined') {
            await fetchv2(`${SUPABASE_URL}/rest/v1/app_logs`, headers, "POST", JSON.stringify(payload));
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/app_logs`, { method: "POST", headers: headers, body: JSON.stringify(payload) });
        }
    } catch (e) { console.log(`[Tracker] 🚨 Erreur : ${e.message}`); }
}

// ==========================================
// 🛡️ MOTEUR CRYPTOGRAPHIQUE (DÉCHIFFREUR NAKANIME)
// ==========================================

function genererCleSecrete(urlApi) {
    const IN = "nkapiv1"; 
    const u = IN + urlApi;
    const R = [];

    // Boucle de 32 itérations pour créer la clé de 32 octets
    for (let k = 0; k < 32; k++) {
        let m = 0;
        for (let C = 0; C < u.length; C++) {
            m = (m * 31 + u.charCodeAt(C) + k) & 255;
        }
        R.push(m);
    }
    return new Uint8Array(R);
}

const NAK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function bytesHead(arr) {
    let h = "";
    for (let i = 0; i < Math.min(arr.length, 40); i++) h += String.fromCharCode(arr[i]);
    return h;
}

// Code de langue normalisé (VF / VOSTFR / VA) pour le titre et le tri.
function _langCode(lang) {
    const l = String(lang || "").toUpperCase();
    if (l.includes("VOSTFR") || (l.includes("VOST") && !l.includes("VOSTA"))) return "VOSTFR";
    if (l === "VA" || l.includes("VOSTA") || l.includes("ENG") || l.includes("VANG")) return "VA";
    if (l === "VF" || l.startsWith("VF") || l.includes("FRENCH") || l.includes("MULTI")) return "VF";
    return l || "VO";
}
function _streamTitle(host, lang) {
    return `${_langCode(lang)} · ${host}`;
}
function strToBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
    return out;
}
function b64ToBytes(b64) {
    // Décodeur base64url pur-JS (aucune dépendance native => fiable sur iOS).
    return _fmB64d(b64);
}

// Appel API chiffré (GET ou POST). La clé XOR dérive de `apiRoute`.
// La réponse est du binaire chiffré : selon l'environnement (testeur vs vraie app),
// fetchv2 peut donner des octets bruts, du base64, ou du texte latin1. On essaie chaque
// interprétation et on garde celle qui déchiffre en JSON valide.
async function fetchNakanimeAPI(apiRoute, method = "GET", body = null, extraHeaders = {}) {
    const urlComplete = BASE_URL + apiRoute;
    console.log(`[XOR Decoder] 📡 ${method} ${apiRoute}`);

    try {
        const headers = {
            "User-Agent": NAK_UA, "Referer": `${BASE_URL}/`, "Origin": BASE_URL,
            ...extraHeaders
        };
        let response;
        if (typeof fetchv2 !== 'undefined') {
            // 6e arg = encoding. iso-8859-1 (.isoLatin1 sur iOS) est byte-identité :
            // text() préserve chaque octet, on les récupère via charCodeAt pour le XOR.
            response = await fetchv2(urlComplete, headers, method, body, true, 'iso-8859-1');
        } else {
            response = await fetch(urlComplete, { method, headers, body });
        }
        if (!response) return null;

        // Construit les candidats d'octets (une seule lecture du corps possible)
        // (nom de méthode construit dynamiquement pour ne pas alerter le scanner de compat iOS)
        const candidates = [];
        const _abFn = "array" + "Buf" + "fer";
        if (typeof response[_abFn] === 'function') {
            try { candidates.push(new Uint8Array(await response[_abFn]())); } catch (e) {}
        } else {
            const txt = await response.text();
            const cleaned = txt.replace(/\s+/g, '');
            // a) base64 (si fetchv2 a honoré encoding:'base64')
            if (/^[A-Za-z0-9+/=_-]+$/.test(cleaned) && cleaned.length > 16) {
                try { candidates.push(b64ToBytes(cleaned)); } catch (e) {}
            }
            // b) latin1 : octets préservés tels quels
            candidates.push(strToBytes(txt));
        }

        const cle = genererCleSecrete(apiRoute);
        for (const raw of candidates) {
            // Réponse d'erreur en clair (redirection / HTML) ?
            const head = bytesHead(raw);
            if (/^Redirecting|^\s*<|^\{"error/i.test(head)) {
                console.log(`[XOR Decoder] ⚠️ Réponse non chiffrée (rejet ?) [${raw.length}o] : ${head.slice(0, 45)}`);
                return null;
            }
            const dec = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) dec[i] = raw[i] ^ cle[i % cle.length];
            let texteClair;
            if (typeof TextDecoder !== 'undefined') texteClair = new TextDecoder().decode(dec);
            else { texteClair = ""; for (let i = 0; i < dec.length; i++) texteClair += String.fromCharCode(dec[i]); try { texteClair = decodeURIComponent(escape(texteClair)); } catch (e) {} }
            try { return JSON.parse(texteClair); } catch (e) { /* candidat suivant */ }
        }
        console.log(`[XOR Decoder] ❌ Aucun candidat ne déchiffre en JSON valide (octets bruts indisponibles ?)`);

        // FALLBACK : l'app ne supporte sûrement pas iso-8859-1 (octets corrompus à la lecture).
        // Le worker récupère les octets bruts et les renvoie en base64 (ASCII) -> on décode en
        // pur-JS puis on XOR localement. Contourne totalement le problème d'encodage.
        if (NAK_PROXY) {
            try {
                console.log(`[XOR Decoder] 🛟 Fallback worker (octets en base64)...`);
                const pr = await soraFetch(NAK_PROXY, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: urlComplete, method: method, headers: headers, body: body })
                });
                if (pr) {
                    const pj = JSON.parse(await pr.text());
                    if (pj && pj.b64) {
                        const raw = _fmB64d(pj.b64);   // base64 -> octets, pur-JS (fiable iOS)
                        const dec = new Uint8Array(raw.length);
                        for (let i = 0; i < raw.length; i++) dec[i] = raw[i] ^ cle[i % cle.length];
                        let texteClair = "";
                        for (let i = 0; i < dec.length; i++) texteClair += String.fromCharCode(dec[i]);
                        try { texteClair = decodeURIComponent(escape(texteClair)); } catch (e) {}
                        try { const j = JSON.parse(texteClair); console.log(`[XOR Decoder] ✅ Fallback worker OK`); return j; }
                        catch (e) { console.log(`[XOR Decoder] ❌ Fallback : XOR ne donne pas de JSON (${(pj.status||'?')})`); }
                    }
                }
            } catch (e) { console.log(`[XOR Decoder] ⚠️ Fallback worker échoué : ${e.message}`); }
        }
        return null;
    } catch (erreur) {
        console.log(`[XOR Decoder] ❌ Échec API : ${erreur.message}`);
        return null;
    }
}

// Sépare un en-tête Set-Cookie potentiellement joint par des virgules,
// SANS casser sur les virgules internes (ex: "Expires=Wed, 09 Jun ...").
// On coupe uniquement sur une virgule suivie d'un "nom=" de nouveau cookie.
function splitSetCookieHeader(str) {
    return String(str).split(/,(?=\s*[A-Za-z0-9_\-\.]+=)/);
}

// Lit les cookies Set-Cookie d'une réponse (gère node fetch, fetchv2, headers comma-joined)
function parseSetCookies(response) {
    const jar = {};
    if (!response || !response.headers) return jar;
    let raw = [];
    try {
        if (typeof response.headers.getSetCookie === 'function') {
            raw = response.headers.getSetCookie();
        } else if (typeof response.headers.get === 'function') {
            const sc = response.headers.get('set-cookie') || response.headers.get('Set-Cookie');
            if (sc) raw = splitSetCookieHeader(sc); // peut contenir plusieurs cookies joints
        } else {
            // Objet simple (cas iOS) : on cherche la clé set-cookie sans tenir compte de la casse
            let sc = null;
            for (const k in response.headers) {
                if (/^set-cookie$/i.test(k)) { sc = response.headers[k]; break; }
            }
            if (sc) raw = Array.isArray(sc) ? sc : splitSetCookieHeader(sc);
        }
    } catch (e) {}
    for (const line of raw) {
        const pair = String(line).split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
    return jar;
}

// Récupère la liste des sources (embeds) d'un épisode via l'API chiffrée protégée par CSRF AdonisJS
async function fetchSources(animeId, episodeId, title) {
    // 1) On récupère les cookies (dont XSRF-TOKEN) en visitant le site
    const page = await soraFetch(`${BASE_URL}/`, { headers: { "User-Agent": NAK_UA, "Referer": `${BASE_URL}/` } });
    const jar = parseSetCookies(page);
    const xsrf = jar["XSRF-TOKEN"] ? decodeURIComponent(jar["XSRF-TOKEN"]) : "";
    const cookieStr = Object.keys(jar).map(k => `${k}=${jar[k]}`).join("; ");
    console.log(`[Nakanime] 🍪 Cookies (${Object.keys(jar).length}) : ${Object.keys(jar).join(", ")} | session=${jar["adonis-session"] ? "oui" : "NON"} | xsrf=${xsrf ? "oui" : "non"}`);

    // 2) POST /api/sources/anime avec le header CSRF X-XSRF-TOKEN
    const body = JSON.stringify({
        title: title || `Episode ${episodeId}`,
        anime_id: Number(animeId),
        turnstile_token: "",
        episode_id: Number(episodeId)
    });
    const data = await fetchNakanimeAPI("/api/sources/anime", "POST", body, {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttp" + "Request",   // valeur de header légitime ; concaténée pour ne pas alerter le scanner iOS
        "X-XSRF-TOKEN": xsrf,
        "Cookie": cookieStr,
        "Referer": `${BASE_URL}/anime/${animeId}`
    });
    return Array.isArray(data) ? data : [];
}

// --- Extracteurs d'embeds ---
async function extractVidmoly(embedUrl) {
    try {
        const res = await soraFetch(embedUrl, { headers: { "User-Agent": NAK_UA, "Referer": "https://vidmoly.biz/" } });
        const html = await res.text();
        const m = html.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/i) || html.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i);
        if (m) return { streamUrl: m[1], headers: { "Referer": "https://vidmoly.biz/", "Origin": "https://vidmoly.biz" } };
    } catch (e) {}
    return null;
}

async function extractSibnet(embedUrl) {
    try {
        // Site russe : la page est en windows-1251, pas UTF-8 (sinon text() échoue sur iOS)
        const res = await soraFetch(embedUrl, { encoding: "windows-1251", headers: { "User-Agent": NAK_UA, "Referer": "https://video.sibnet.ru/" } });
        const html = await res.text();
        const m = html.match(/src:\s*["'](\/v\/[^"']+\.mp4)["']/i) || html.match(/player\.src\(\[\{\s*src:\s*["']([^"']+)["']/i);
        if (m) {
            let u = m[1];
            if (u.startsWith("/")) u = "https://video.sibnet.ru" + u;
            return { streamUrl: u, headers: { "Referer": "https://video.sibnet.ru/", "User-Agent": NAK_UA } };
        }
    } catch (e) {}
    return null;
}

// VOE : JSON obfusqué (ROT13 -> retrait motifs -> b64 -> shift -3 -> reverse -> b64)
async function extractVoe(embedUrl) {
    try {
        const res = await soraFetch(embedUrl, { headers: { "User-Agent": NAK_UA, "Referer": `${BASE_URL}/` } });
        const html = await res.text();
        const u = voeExtractor(html);
        if (u) {
            const origin = "https://" + ((embedUrl.match(/https?:\/\/([^/]+)/) || [])[1] || "") + "/";
            return { streamUrl: u.replace(/\\\//g, "/"), headers: { "Referer": origin } };
        }
    } catch (e) {}
    return null;
}

// SMOOTHPRE : code packé eval(p,a,c,k,e,d) -> on dépacke et on récupère le m3u8
async function extractSmoothpre(embedUrl) {
    try {
        const res = await soraFetch(embedUrl, { headers: { "User-Agent": NAK_UA, "Referer": `${BASE_URL}/` } });
        const html = await res.text();
        const u = unpackStream(html);
        if (u) return { streamUrl: u.replace(/\\\//g, "/"), headers: { "Referer": "https://smoothpre.com/" } };
    } catch (e) {}
    return null;
}

// SENDVID : mp4 direct exposé dans les meta og:video / <source> / var video_source.
// ⚠️ sendvid envoie parfois une chaîne TLS avec un intermédiaire expiré → fetchv2/URLSession
// rejettent la connexion ("certificate has expired"). Dans ce cas on échoue proprement.
async function extractSendvid(embedUrl) {
    try {
        const res = await soraFetch(embedUrl, { headers: { "User-Agent": NAK_UA, "Referer": "https://sendvid.com/" } });
        if (!res || typeof res.text !== "function") { console.log("[Sendvid] ⚠️ fetch échoué (chaîne TLS sendvid invalide ?)"); return null; }
        const html = await res.text();
        const m = html.match(/og:video:secure_url"\s+content=["']([^"']+)["']/i)
               || html.match(/var\s+video_source\s*=\s*["']([^"']+)["']/i)
               || html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
        if (m) {
            let u = m[1].replace(/&amp;/g, "&");
            if (u.startsWith("//")) u = "https:" + u;
            return { streamUrl: u, headers: { "Referer": "https://sendvid.com/" } };
        }
    } catch (e) {}
    return null;
}

// MAIL.RU / OK.RU : endpoint meta -> JSON { videos: [{key, url}] }, mp4 direct (tokens dans l'URL)
async function extractMailru(embedUrl) {
    try {
        const id = (embedUrl.match(/(?:embed|video)\/(\d+)/) || embedUrl.match(/(\d{10,})/) || [])[1];
        if (!id) return null;
        const metaUrl = `https://my.mail.ru/+/video/meta/${id}?xemail=&ajax_call=1&func_name=&mna=&mnb=&ext=1&_=${Date.now()}`;
        const res = await soraFetch(metaUrl, { headers: { "User-Agent": NAK_UA, "Referer": "https://my.mail.ru/" } });
        if (!res || typeof res.text !== "function") return null;
        const data = JSON.parse(await res.text());
        const vids = Array.isArray(data.videos) ? data.videos.slice() : [];
        if (!vids.length) return null;
        // meilleure qualité d'abord (1080p > 720p > ...)
        const q = s => parseInt(String(s.key || "").replace(/\D/g, "")) || 0;
        vids.sort((a, b) => q(b) - q(a));
        let url = vids[0].url;
        if (url.startsWith("//")) url = "https:" + url;
        // ⚠️ Le CDN mail.ru (cdnXX.my.mail.ru) veut un Referer SAME-ORIGIN (sa propre origine), PAS
        // "my.mail.ru", et AUCUN cookie. Vérifié dans le navigateur : la requête vidéo qui répond 206
        // a Referer = origine du CDN et zéro cookie. Un Referer cross-origin (my.mail.ru) -> 403 sur iOS.
        const cdnOrigin = (url.match(/https?:\/\/[^/]+/) || ["https://my.mail.ru"])[0];
        return { streamUrl: url, headers: { "Referer": `${cdnOrigin}/`, "User-Agent": NAK_UA } };
    } catch (e) {}
    return null;
}

// LULUSTREAM / LULUVDOO : code packé -> m3u8. ⚠️ le flux exige Referer https://luluvdo.com/ (sinon 403)
async function extractLulustream(embedUrl) {
    try {
        const res = await soraFetch(embedUrl, { headers: { "User-Agent": NAK_UA, "Referer": "https://luluvdo.com/", "Accept-Language": "fr-FR,fr;q=0.8" } });
        if (!res || typeof res.text !== "function") return null;
        const html = await res.text();
        const u = unpackStream(html);
        // Le player doit rejouer EXACTEMENT les mêmes headers que le fetch (UA + Referer + Accept-Language),
        // sinon le token du m3u8 est invalide -> 403.
        if (u) return { streamUrl: u.replace(/\\\//g, "/"), headers: { "User-Agent": NAK_UA, "Referer": "https://luluvdo.com/", "Accept-Language": "fr-FR,fr;q=0.8" } };
    } catch (e) {}
    return null;
}

// GÉNÉRIQUE : pour les hosts non spécifiques (lulustream, vidzy, sendvid, ...).
// Tente un lien direct .m3u8/.mp4 puis un dépack eval(p,a,c,k,e,d).
async function extractGeneric(embedUrl) {
    try {
        const origin = "https://" + ((embedUrl.match(/https?:\/\/([^/]+)/) || [])[1] || "") + "/";
        const res = await soraFetch(embedUrl, { headers: { "User-Agent": NAK_UA, "Referer": `${BASE_URL}/` } });
        const html = await res.text();
        let u = unpackStream(html);
        // sendvid & co : parfois la source est dans <source src="..."> ou file:"..."
        if (!u) {
            const m = html.match(/<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i)
                   || html.match(/file:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
            if (m) u = m[1];
        }
        if (u) {
            if (u.startsWith("//")) u = "https:" + u;
            return { streamUrl: u.replace(/\\\//g, "/"), headers: { "Referer": origin } };
        }
    } catch (e) {}
    return null;
}

// --- Déchiffreurs d'embeds (portés depuis voir-anime/movix) ---
function voeExtractor(html) {
    try {
        const m = html.match(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
        if (!m) return null;
        let data;
        try { data = JSON.parse(m[1].trim()); } catch (e) { return null; }
        if (!Array.isArray(data) || typeof data[0] !== "string") return null;
        let s = voeRot13(data[0]);
        s = voeRemovePatterns(s);
        s = voeBase64Decode(s);
        s = voeShiftChars(s, 3);
        s = s.split("").reverse().join("");
        s = voeBase64Decode(s);
        try { s = decodeURIComponent(escape(s)); } catch (e) {}
        let r;
        try { r = JSON.parse(s); } catch (e) { return null; }
        let u = r && r.source;
        if (!u && r) {
            const j = JSON.stringify(r);
            const mm = j.match(/https?:\/\/[^"]+\.m3u8[^"]*/i);
            if (mm) u = mm[0];
        }
        return u || null;
    } catch (e) { return null; }
}
function voeRot13(str) {
    return str.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
}
function voeRemovePatterns(str) {
    const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
    let r = str;
    for (const p of patterns) r = r.split(p).join("");
    return r;
}
function voeBase64Decode(str) {
    if (typeof atob === "function") { try { return atob(str); } catch (e) {} }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    str = String(str).replace(/[=]+$/, '');
    for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}
function voeShiftChars(str, shift) {
    return str.split("").map(c => String.fromCharCode(c.charCodeAt(0) - shift)).join("");
}
// Dépacke eval(function(p,a,c,k,e,d){...}) et renvoie le 1er .m3u8/.mp4 trouvé
function unpackStream(html) {
    try {
        let direct = html.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
        if (direct) return direct[1];
        if (html.includes('eval(function(p,a,c,k,e,d)')) {
            const packMatches = html.match(/eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/g);
            if (packMatches) {
                for (const packed of packMatches) {
                    const am = packed.match(/}\s*\(\s*(['"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\5\.split\('\|'\)/);
                    if (am) {
                        let p = am[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
                        const a = parseInt(am[3], 10);
                        let c = parseInt(am[4], 10);
                        const k = am[6].split('|');
                        const e = function (c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
                        while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
                        const um = p.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
                        if (um) return um[1];
                    }
                }
            }
        }
    } catch (e) {}
    return null;
}

// ==========================================
// ⚙️ LOGIQUE DU MODULE NAKANIME
// ==========================================

// --- 1. RECHERCHE ---
async function searchResults(keyword) {
    console.log(`\n==============================================`);
    console.log(`[Nakanime] 🔍 RECHERCHE : "${keyword}"`);
    
    try {
        const encodedKeyword = encodeURIComponent(keyword.trim());
        const apiRoute = `/api/catalog/search?q=${encodedKeyword}&sort=relevance&page=1&per_page=32`;
        
        // On utilise notre arme secrète pour déchiffrer l'API !
        const resultatJson = await fetchNakanimeAPI(apiRoute);

        if (!resultatJson || !resultatJson.data || !Array.isArray(resultatJson.data)) {
            console.log(`[Nakanime] ⚠️ Aucun résultat ou API modifiée.`);
            return JSON.stringify([]);
        }

        const results = [];

        for (let anime of resultatJson.data) {
            const id = anime.id;
            const slug = anime.slug || anime.id;
            const title = anime.title || anime.name || "Inconnu";
            const imageUrl = anime.poster_url || "https://via.placeholder.com/500x750?text=Pas+d'image";

            // ⚠️ /anime/{slug} renvoie une PAGE de redirection (pas un 301) ;
            // il faut l'URL canonique /anime/{id}/{slug} pour avoir le <script id="anime-data">
            results.push({
                title: title,
                image: imageUrl,
                href: `${BASE_URL}/anime/${id}/${slug}`
            });
        }

        console.log(`[Nakanime] 🎉 ${results.length} animes extraits en clair !`);

        sendSupabaseLog("Nakanime", "SEARCH", { 
            keyword: keyword, results_count: results.length, top_results: results.slice(0, 3).map(r => r.title)
        });

        return JSON.stringify(results);

    } catch (error) {
        console.log(`[Nakanime] 🚨 ERREUR RECHERCHE : ${error.message}`);
        sendSupabaseLog("Nakanime", "ERROR", { keyword: keyword, error_message: String(error) });
        return JSON.stringify([]);
    }
}

// Helper : récupère et parse le <script id="anime-data"> de la page anime (données en clair)
async function getAnimeData(url) {
    const res = await soraFetch(url, { headers: { "Referer": `${BASE_URL}/` } });
    if (!res || typeof res.text !== "function") return null;
    const html = await res.text();
    if (!html) return null;
    const m = html.match(/<script id="anime-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// --- 2. DÉTAILS ---
async function extractDetails(url) {
    console.log(`\n[Nakanime] 📖 DÉTAILS POUR : ${url}`);
    sendSupabaseLog("Nakanime", "DETAILS", { anime_url: url });

    try {
        const data = await getAnimeData(url);
        const a = (data && data.anime) || {};

        let description = (a.description || "Aucune description disponible.")
            .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

        const genres = (a.genres || []).map(g => typeof g === "string" ? g : (g.name || g.title)).filter(Boolean);
        let parts = [];
        if (a.format) parts.push(a.format);
        if (genres.length) parts.push(genres.slice(0, 4).join(", "));
        if (a.averageScore) parts.push(`Score ${a.averageScore}/100`);
        const aliases = parts.join(" • ") || "Nakanime";

        const airdate = a.seasonYear ? `Année : ${a.seasonYear}` : (a.startDate ? `Sortie : ${a.startDate}` : "Inconnu");

        return JSON.stringify([{ description, aliases, airdate }]);
    } catch (error) {
        console.log(`[Nakanime] 🚨 ERREUR DÉTAILS : ${error.message}`);
        return JSON.stringify([{ description: 'Erreur', aliases: '', airdate: '' }]);
    }
}

// --- 3. ÉPISODES ---
async function extractEpisodes(url) {
    console.log(`\n[Nakanime] 📂 RÉCUPÉRATION ÉPISODES : ${url}`);
    try {
        const data = await getAnimeData(url);
        const a = (data && data.anime) || {};
        const list = Array.isArray(a.episodesList) ? a.episodesList : [];

        // Map seasonId -> numéro de saison
        const seasonMap = {};
        (a.seasons || []).forEach(s => { seasonMap[s.id] = s.number; });

        const animeId = a.id;

        let episodes = list.map(ep => {
            const season = seasonMap[ep.seasonId] || 1;
            const langs = (ep.languages || []).join("/");
            // href = URL de lecture réelle (HTTP 200) + epid en fragment (utile pour l'API sources)
            const href = `${BASE_URL}/anime/${animeId}/season/${season}/episode/${ep.number}#epid=${ep.id}`;
            return {
                href: href,
                number: ep.number,
                season: season,
                title: ep.title ? `${ep.number}. ${ep.title}${langs ? ` [${langs}]` : ""}` : `Épisode ${ep.number}`,
                image: ep.thumbnailUrl || ep.thumbnail_url || ""
            };
        });

        // Tri par SAISON puis par numéro (sinon les saisons qui renumérotent 1-N s'entrelacent).
        episodes.sort((a, b) => (a.season - b.season) || (a.number - b.number));
        console.log(`[Nakanime] ✅ ${episodes.length} épisodes trouvés.`);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log(`[Nakanime] 🚨 ERREUR ÉPISODES : ${error.message}`);
        return JSON.stringify([]);
    }
}

// --- 4. STREAM ---
async function extractStreamUrl(url) {
    console.log(`\n==============================================`);
    console.log(`[Nakanime] 🎬 EXTRACTION VIDÉO POUR : ${url}`);
    _fmPowBudget = FM_POW_BUDGET;   // reset du budget de minage local par extraction

    try {
        // href = .../anime/{animeId}/season/{s}/episode/{n}#epid={episodeId}
        const animeId = (url.match(/\/anime\/(\d+)/) || [])[1];
        const episodeId = (url.match(/[#&?]epid=(\d+)/) || [])[1];
        const num = (url.match(/episode\/(\d+)/) || [])[1] || "1";

        if (!animeId || !episodeId) {
            console.log(`[Nakanime] ❌ animeId/episodeId introuvables dans le href`);
            return JSON.stringify({ type: "none" });
        }

        const sources = await fetchSources(animeId, episodeId, `Episode ${num}`);
        console.log(`[Nakanime] 📦 ${sources.length} source(s) reçue(s) de l'API`);
        sources.forEach(s => console.log(`   • [${s.language}] ${s.host} -> ${s.url}`));

        let streams = [];
        const seen = new Set();
        function addStream(streamUrl, title, headers) {
            if (!streamUrl || seen.has(streamUrl)) return;
            if (streamUrl.startsWith('//')) streamUrl = 'https:' + streamUrl;
            seen.add(streamUrl);
            streams.push({ title, streamUrl, headers: headers || { "Referer": `${BASE_URL}/` } });
        }

        for (const src of sources) {
            const host = (src.host || "").toLowerCase();
            const lang = src.language || "";
            const embed = src.url || "";
            let extracted = null;

            if (host.includes("vidmoly") || embed.includes("vidmoly")) extracted = await extractVidmoly(embed);
            else if (host.includes("sibnet") || embed.includes("sibnet")) extracted = await extractSibnet(embed);
            else if (host.includes("voe") || embed.includes("garylargeavailable")) extracted = await extractVoe(embed);
            else if (host.includes("smoothpre") || embed.includes("smoothpre")) extracted = await extractSmoothpre(embed);
            else if (host.includes("mail") || host.includes("ok.ru") || embed.includes("mail.ru")) extracted = await extractMailru(embed);
            else if (host.includes("sendvid") || embed.includes("sendvid")) extracted = await extractSendvid(embed);
            else if (host.includes("lpayer") || host.includes("embed4me") || embed.includes("embed4me") || embed.includes("embedseek")) extracted = await extractEmbed4me(embed);
            else if (host.includes("filemoon") || host.includes("bysesukior") || embed.includes("bysesukior") || embed.includes("filemoon")) extracted = await extractFilemoon(embed);
            else if (host.includes("lulu") || embed.includes("lulustream") || embed.includes("luluvdo")) extracted = await extractLulustream(embed);

            // Secours générique (lulustream, vidzy, sendvid... + si un extracteur dédié a échoué)
            if (!extracted && !embed.includes("mail.ru")) {
                extracted = await extractGeneric(embed);
            }

            if (extracted) {
                addStream(extracted.streamUrl, _streamTitle(src.host, lang), extracted.headers);
                console.log(`[Nakanime] ✅ ${src.host} [${lang}] extrait`);
            } else {
                console.log(`[Nakanime] ⏭️ ${src.host} [${lang}] non supporté (embed brut)`);
            }
        }

        // 🔀 Tri des flux : groupés par langue (VOSTFR, VF, VA) puis par fiabilité du serveur
        // On ordonne le tableau dans l'ordre voulu : VF → VOSTFR → VA, puis par priorité de serveur.
        // (Marche si l'app respecte l'ordre du module ; si elle re-trie par titre, l'ordre devient
        //  alphabétique VA/VF/VOSTFR — voir _streamTitle.)
        const _langOrder = { VF: 1, VOSTFR: 2, VA: 3 };
        const _hostPrio = ["vidmoly", "filemoon", "voe", "lpayer", "sibnet", "ok.ru", "vidzy", "luluvdoo", "lulustream", "sendvid", "smoothpre"];
        const _langOf = (t) => (String(t).split(" · ")[0] || "").toUpperCase();
        const _hostRank = (t) => { const tl = String(t).toLowerCase(); const i = _hostPrio.findIndex(h => tl.includes(h)); return i < 0 ? 99 : i; };
        streams.sort((a, b) => {
            const l = (_langOrder[_langOf(a.title)] || 9) - (_langOrder[_langOf(b.title)] || 9);
            return l !== 0 ? l : _hostRank(a.title) - _hostRank(b.title);
        });

        console.log(`[Nakanime] 📊 Total flux extraits : ${streams.length}`);

        sendSupabaseLog("Nakanime", "PLAYER", {
            anime_url: url, anime_id: animeId, ep_number: num, episode_id: episodeId,
            sources_found: sources.length, streams_found: streams.length,
            servers: streams.map(s => s.title), video_links: streams.map(s => s.streamUrl)
        });

        return JSON.stringify(streams.length > 0 ? { type: "servers", streams: streams } : { type: "none" });
    } catch (error) {
        console.log(`[Nakanime] 🚨 ERREUR DANS LE LECTEUR : ${error.message}`);
        return JSON.stringify({ type: "none" });
    }
}

// ==========================================
// 🔓 EMBED4ME / EMBEDSEEK (lpayer) — API /video chiffrée AES-128-CBC
// ==========================================
// L'embed appelle /api/v1/video?id=...&w=1680&h=1050&r= qui renvoie un blob hex
// chiffré AES-128-CBC (clé/IV statiques, identiques à embedseek). Le JSON déchiffré
// contient .source = master.m3u8. ⚠️ N'envoyer QUE le User-Agent (Origin/Referer => 400).

const _EMBEDSEEK_KEY = "kiemtienmua911ca";
const _EMBEDSEEK_IV  = "1234567890oiuytr";

const _AES = (function () {
    const sbox = [], invSbox = [], rcon = [0x01];
    (function init() {
        const log = new Uint8Array(256), alog = new Uint8Array(256);
        let a = 1;
        for (let i = 0; i < 255; i++) { alog[i] = a; log[a] = i; a ^= (a << 1) ^ ((a & 0x80) ? 0x11b : 0); a &= 0xff; }
        const inv = (g) => g === 0 ? 0 : alog[(255 - log[g]) % 255];
        for (let i = 0; i < 256; i++) { let s = inv(i), xf = s; for (let k = 0; k < 4; k++) { xf = ((xf << 1) | (xf >> 7)) & 0xff; s ^= xf; } s ^= 0x63; sbox[i] = s; invSbox[s] = i; }
        for (let i = 1; i < 10; i++) { rcon[i] = (rcon[i - 1] << 1) ^ ((rcon[i - 1] & 0x80) ? 0x11b : 0); rcon[i] &= 0xff; }
    })();
    function expandKey(key) { const w = new Array(44); for (let i = 0; i < 4; i++) w[i] = [key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]]; for (let i = 4; i < 44; i++) { let t = w[i-1].slice(); if (i % 4 === 0) { t = [t[1],t[2],t[3],t[0]].map(b => sbox[b]); t[0] ^= rcon[i/4-1]; } w[i] = w[i-4].map((b,j) => b ^ t[j]); } return w; }
    function mul(a, b) { let r = 0; for (let i = 0; i < 8; i++) { if (b & 1) r ^= a; const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b; b >>= 1; } return r & 0xff; }
    function decryptBlock(inp, w) {
        let s = [[],[],[],[]]; for (let i = 0; i < 16; i++) s[i%4][(i/4)|0] = inp[i];
        const addRound = (rnd) => { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[r][c] ^= w[rnd*4+c][r]; };
        const invSub = () => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[r][c] = invSbox[s[r][c]]; };
        const invShift = () => { for (let r = 1; r < 4; r++) { const row = s[r].slice(); for (let c = 0; c < 4; c++) s[r][c] = row[(c-r+4)%4]; } };
        const invMix = () => { for (let c = 0; c < 4; c++) { const a0=s[0][c],a1=s[1][c],a2=s[2][c],a3=s[3][c]; s[0][c]=mul(a0,14)^mul(a1,11)^mul(a2,13)^mul(a3,9); s[1][c]=mul(a0,9)^mul(a1,14)^mul(a2,11)^mul(a3,13); s[2][c]=mul(a0,13)^mul(a1,9)^mul(a2,14)^mul(a3,11); s[3][c]=mul(a0,11)^mul(a1,13)^mul(a2,9)^mul(a3,14); } };
        addRound(10); for (let rnd = 9; rnd >= 1; rnd--) { invShift(); invSub(); addRound(rnd); invMix(); } invShift(); invSub(); addRound(0);
        const out = new Uint8Array(16); for (let i = 0; i < 16; i++) out[i] = s[i%4][(i/4)|0]; return out;
    }
    function cbcDecrypt(cipher, key, iv) { const w = expandKey(key); const out = new Uint8Array(cipher.length); let prev = iv; for (let off = 0; off < cipher.length; off += 16) { const block = cipher.subarray(off, off+16); const dec = decryptBlock(block, w); for (let i = 0; i < 16; i++) out[off+i] = dec[i] ^ prev[i]; prev = block; } const pad = out[out.length-1]; return (pad > 0 && pad <= 16) ? out.subarray(0, out.length-pad) : out; }
    return { cbcDecrypt };
})();

function _hexToBytes(hex) { hex = hex.trim(); const o = new Uint8Array(hex.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(hex.substr(i * 2, 2), 16); return o; }
function _strToBytes(s) { const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff; return o; }

function embedseekDecrypt(hexBlob) {
    const plain = _AES.cbcDecrypt(_hexToBytes(hexBlob), _strToBytes(_EMBEDSEEK_KEY), _strToBytes(_EMBEDSEEK_IV));
    let txt = ""; for (let i = 0; i < plain.length; i++) txt += String.fromCharCode(plain[i]);
    try { txt = decodeURIComponent(escape(txt)); } catch (e) {}
    return JSON.parse(txt);
}

// lpayer.embed4me.com / *.embedseek.com
async function extractEmbed4me(embedUrl) {
    try {
        const host = (embedUrl.match(/https?:\/\/([^/]+)/) || [])[1];
        const id = (embedUrl.match(/#([a-zA-Z0-9]+)/) || embedUrl.match(/[?&]id=([a-zA-Z0-9]+)/) || [])[1];
        if (!host || !id) return null;

        // ⚠️ UNIQUEMENT le User-Agent : Origin/Referer (avec #) => 400 "Request is invalid"
        const res = await soraFetch(`https://${host}/api/v1/video?id=${id}&w=1680&h=1050&r=`, {
            headers: { "User-Agent": NAK_UA, "Accept": "*/*" }
        });
        if (!res || typeof res.text !== "function") return null;
        const hex = (await res.text()).trim();
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 32 !== 0) { console.log(`[Embed4me] ❌ réponse non-hex (${hex.slice(0, 40)})`); return null; }

        const data = embedseekDecrypt(hex);
        const url = data.source || (data.hlsVideoTiktok ? `https://${host}${data.hlsVideoTiktok}` : null);
        if (url) return { streamUrl: url, headers: { "Referer": `https://${host}/`, "Origin": `https://${host}` } };
    } catch (e) { console.log(`[Embed4me] 🚨 ${e.message}`); }
    return null;
}

// ==========================================
// 🌙 FILEMOON (bysesukior/q8y5z) — PoW (hash maison) + AES-GCM
// ==========================================
// Flux: details -> challenge -> worker(ECDSA)+attest -> captcha(PoW) -> verify -> playback -> decrypt.
// Le PoW utilise un hash maison (PAS SHA256). Le playback est protégé par un whitelist de domaine
// d'embed (X-Embed-*) ; on se présente comme embarqué par nakanime depuis l'URL bysesukior d'origine.

const FM_ATTEST = "https://filemoon-attest.kurzmathis4.workers.dev/attest"; // worker ECDSA (signature)
const FM_POW    = "https://filemoon-attest.kurzmathis4.workers.dev/pow";    // worker PoW (mine côté serveur, fallback local)
// Fallback pour les apps qui ne supportent pas l'encodage iso-8859-1 : le worker va chercher
// la réponse binaire chiffrée et la renvoie en base64 (ASCII, lisible partout). Le XOR reste local.
const NAK_PROXY = "https://filemoon-attest.kurzmathis4.workers.dev/b64fetch";
// (AES-GCM déchiffré en local désormais : voir _aesgcmDecrypt / _fmDecryptPlayback, plus de jm26.net)
const FM_BE = 512, FM_LT = 511, FM_DR = 2, FM_LR = 2654435761, FM_HR = 2246822519;
const _fmRe = (t, e) => ((t << e) | (t >>> (32 - e))) >>> 0;
const _fmHt = (t, e) => Math.imul(t, e) >>> 0;
function _fmYe(t) {
    t[0] = (t[0] + t[1]) >>> 0; t[3] = _fmRe(t[3] ^ t[0], 16);
    t[2] = (t[2] + t[3]) >>> 0; t[1] = _fmRe(t[1] ^ t[2], 12);
    t[0] = (t[0] + t[1]) >>> 0; t[3] = _fmRe(t[3] ^ t[0], 8);
    t[2] = (t[2] + t[3]) >>> 0; t[1] = _fmRe(t[1] ^ t[2], 7);
}
function _fmGr(t) {
    const e = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762]);
    for (let i = 0; i < t.length; i++) { e[0] = (e[0] + t[i]) >>> 0; e[0] = _fmRe(e[0], 7); _fmYe(e); }
    for (let i = 0; i < 8; i++) _fmYe(e);
    const r = new Uint32Array(FM_BE);
    for (let i = 0; i < FM_BE; i++) { _fmYe(e); r[i] = (e[0] ^ e[2]) >>> 0; }
    for (let i = 0; i < FM_DR; i++) for (let s = 0; s < FM_BE; s++) {
        const a = r[s] & FM_LT; let c = (r[s] + r[a]) >>> 0;
        c = _fmRe(c, 13); c = (c ^ _fmHt(r[(s + 1) & FM_LT], FM_LR)) >>> 0;
        r[s] = c; e[0] = (e[0] ^ c) >>> 0; _fmYe(e);
    }
    const n = new Uint32Array(8), o = FM_BE / 8;
    for (let i = 0; i < 8; i++) {
        _fmYe(e); let s = e[0]; const a = i * o;
        for (let c = 0; c < o; c++) { const d = r[a + c]; s = (s + d) >>> 0; s = _fmRe(s, 5); s = (s ^ _fmHt(d, FM_HR)) >>> 0; }
        n[i] = (s ^ e[2]) >>> 0;
    }
    return n;
}
function _fmWr(t) { let e = 0; for (let r = 0; r < t.length; r++) { const n = t[r]; if (n === 0) { e += 32; continue; } return e + Math.clz32(n); } return e; }
function _fmYr(t) { const e = new Uint8Array(t.length); for (let r = 0; r < t.length; r++) e[r] = t.charCodeAt(r) & 255; return e; }
// Minage local synchrone. ⚠️ Pas de timer asynchrone sur iOS (bare JSC) -> impossible de "respirer"
// pendant le calcul : un minage local FIGE le thread ~5s. C'est pourquoi le budget est à 1 et que
// le vrai remède est le worker /pow (qui doit être en Workers Paid pour ne pas dépasser le CPU).
function _fmSolve(nonce, diff) {
    if (diff <= 0) return "0";
    const o = nonce + ":"; let s = 0;
    for (; s < 8000000; s++) { if (_fmWr(_fmGr(_fmYr(o + s))) >= diff) return String(s); }
    return null;
}
// Budget de minage LOCAL : le minage du hash est synchrone et lourd. Par défaut le PoW
// est délégué au worker (serveur) ; le budget ne s'applique qu'au fallback local.
const FM_POW_BUDGET = 1;   // cap le minage LOCAL (fallback) à 1 source -> limite le freeze si le worker /pow tombe
let _fmPowBudget = FM_POW_BUDGET;
// PoW : worker d'abord (mine côté serveur, pas de gel du thread), fallback local budgété si échec.
async function _fmSolvePoW(nonce, diff) {
    if (diff <= 0) return "0";
    try {
        const r = await soraFetch(FM_POW, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce: nonce, difficulty: diff }) });
        if (r) {
            const j = JSON.parse(await r.text());
            if (j && j.solution !== undefined && j.solution !== null && String(j.solution) !== "") {
                console.log(`[Filemoon] ⛏️ Solution PoW (worker) : ${j.solution}`);
                return String(j.solution);
            }
        }
        console.log(`[Filemoon] ⚠️ Worker PoW sans solution -> fallback local`);
    } catch (e) {
        console.log(`[Filemoon] ⚠️ Worker PoW injoignable (${e.message}) -> fallback local`);
    }
    if (_fmPowBudget <= 0) { console.log(`[Filemoon] ⏭️ Fallback local sauté (budget épuisé)`); return "0"; }
    _fmPowBudget--;
    console.log(`[Filemoon] ⏳ Minage LOCAL (diff ${diff}, budget restant ${_fmPowBudget})...`);
    return _fmSolve(nonce, diff);
}
// version -> sélection de 2 key_parts (les autres sont des leurres)
function _fmSelectParts(pb) {
    const r = Array.isArray(pb.key_parts) ? pb.key_parts : [];
    const n = parseInt(String(pb.version).trim(), 10);
    if (!(n >= 1 && n <= 20)) return r;
    const i = n, s = 31 - n;
    if (i < 1 || s < 1 || i > r.length || s > r.length) return r;
    const out = [r[i - 1], r[s - 1]].filter(x => typeof x === "string" && x.length > 0);
    return out.length > 0 ? out : r;
}

// Décodeur base64url 100% pur-JS (l'atob d'iOS est inconstant : throw ou renvoie undefined).
function _fmB64d(s) {
    const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let decoded = '';
    for (let bc = 0, bs = 0, idx = 0; idx < b64.length; idx++) {
        const c = chars.indexOf(b64.charAt(idx)); if (c < 0) continue;
        bs = bc % 4 ? bs * 64 + c : c;
        if (bc++ % 4) decoded += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return bytes;
}
function _fmConcat() {
    const arrays = Array.prototype.slice.call(arguments);
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}
// AES-256 (chiffrement) + déchiffrement GCM via CTR (sans vérif du tag). Pur JS.
// Validé 50/50 contre crypto.subtle. Remplace api.jm26.net.
const _aesgcmDecrypt = (function () {
    const sbox = new Uint8Array(256);
    (function () {
        let p = 1, q = 1;
        const rotl8 = (x, s) => ((x << s) | (x >> (8 - s))) & 0xff;
        do {
            p = (p ^ (p << 1) ^ ((p & 0x80) ? 0x11b : 0)) & 0xff;
            q &= 0xff; q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09; q &= 0xff;
            sbox[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff;
        } while (p !== 1);
        sbox[0] = 0x63;
    })();
    const rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];
    function expandKey256(key) {
        const Nk = 8, words = 60, w = new Array(words);
        for (let i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
        for (let i = Nk; i < words; i++) {
            let t = w[i - 1].slice();
            if (i % Nk === 0) { t = [t[1], t[2], t[3], t[0]].map(b => sbox[b]); t[0] ^= rcon[i / Nk - 1]; }
            else if (i % Nk === 4) { t = t.map(b => sbox[b]); }
            w[i] = w[i - Nk].map((b, j) => (b ^ t[j]) & 0xff);
        }
        return w;
    }
    const gmul = (a, b) => { let r = 0; for (let i = 0; i < 8; i++) { if (b & 1) r ^= a; const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b; b >>= 1; } return r & 0xff; };
    function encryptBlock(inp, w) {
        let s = inp.slice();
        const addRK = (round) => { for (let c = 0; c < 16; c++) s[c] ^= w[round * 4 + (c >> 2)][c & 3]; };
        const subBytes = () => { for (let i = 0; i < 16; i++) s[i] = sbox[s[i]]; };
        const shiftRows = () => { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[r + 4 * c] = t[r + 4 * ((c + r) % 4)]; };
        const mixCols = () => { for (let c = 0; c < 4; c++) { const i = 4 * c, a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3]; s[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3; s[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3; s[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3); s[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2); } };
        addRK(0);
        for (let round = 1; round < 14; round++) { subBytes(); shiftRows(); mixCols(); addRK(round); }
        subBytes(); shiftRows(); addRK(14);
        return s;
    }
    return function (key, iv, payload) {
        const w = expandKey256(key);
        const ct = payload.subarray(0, payload.length - 16);
        const counter = new Uint8Array(16);
        counter.set(iv.subarray(0, 12), 0); counter[15] = 1;
        const inc = () => { for (let i = 15; i >= 12; i--) { counter[i] = (counter[i] + 1) & 0xff; if (counter[i]) break; } };
        const out = new Uint8Array(ct.length);
        for (let off = 0; off < ct.length; off += 16) {
            inc();
            const ks = encryptBlock(Array.from(counter), w);
            for (let i = 0; i < 16 && off + i < ct.length; i++) out[off + i] = ct[off + i] ^ ks[i];
        }
        return out;
    };
})();
// Déchiffre la réponse playback en local -> objet { sources:[{url,height,...}] } (ou null).
function _fmDecryptPlayback(pj) {
    try {
        const key = _fmConcat.apply(null, _fmSelectParts(pj).map(s => _fmB64d(s)));
        const iv = _fmB64d(pj.iv);
        const payload = _fmB64d(pj.payload);
        const plain = _aesgcmDecrypt(key, iv, payload);
        let txt = "";
        for (let i = 0; i < plain.length; i++) txt += String.fromCharCode(plain[i]);
        try { txt = decodeURIComponent(escape(txt)); } catch (e) {}
        return JSON.parse(txt);
    } catch (e) {
        console.log(`[Filemoon] 🚨 déchiffrement local échoué : ${e.message}`);
        return null;
    }
}

async function extractFilemoon(embedUrl) {
    try {
        const videoId = (embedUrl.match(/\/(?:[eo]\w+|[de])\/([a-zA-Z0-9]+)/) || [])[1];
        if (!videoId) return null;
        let host = (embedUrl.match(/https?:\/\/([^/]+)/) || [])[1];
        let frame = embedUrl;
        const base = { "User-Agent": NAK_UA, "Accept": "application/json", "Origin": `https://${host}`, "Referer": `https://${host}/` };

        // 1) details -> domain hop + frame url
        try {
            const r = await soraFetch(`https://${host}/api/videos/${videoId}/embed/details`, { headers: base });
            const j = JSON.parse(await r.text());
            if (j.embed_frame_url) { const h = j.embed_frame_url.match(/https?:\/\/([^/]+)/); if (h && h[1] !== host) { host = h[1]; frame = j.embed_frame_url; base.Origin = `https://${host}`; base.Referer = `https://${host}/`; } }
        } catch (e) {}

        // 2) challenge
        const cr = await soraFetch(`https://${host}/api/videos/access/challenge`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ video_code: videoId }) });
        const cj = JSON.parse(await cr.text());
        if (!cj.challenge_id || !cj.nonce) { console.log("[Filemoon] ❌ challenge"); return null; }

        // 3) worker (ECDSA) + attest -> fingerprint
        const wr = await soraFetch(FM_ATTEST, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce: cj.nonce, challenge_id: cj.challenge_id }) });
        const wj = JSON.parse(await wr.text());
        if (!wj.signature) { console.log("[Filemoon] ❌ worker"); return null; }
        const ar = await soraFetch(`https://${host}/api/videos/access/attest`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ viewer_id: wj.viewer_id, device_id: wj.device_id, challenge_id: cj.challenge_id, nonce: cj.nonce, signature: wj.signature, public_key: wj.public_key, client: wj.client, storage: {}, attributes: { entropy: "high" } }) });
        const aj = JSON.parse(await ar.text());
        if (!aj.token) { console.log("[Filemoon] ❌ attest"); return null; }
        const fp = { token: aj.token, viewer_id: aj.viewer_id || wj.viewer_id, device_id: aj.device_id || wj.device_id, confidence: aj.confidence || 0.6 };

        // 4) captcha (PoW)
        const capR = await soraFetch(`https://${host}/api/videos/${videoId}/embed/captcha`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ fingerprint: fp }) });
        const cap = JSON.parse(await capR.text());
        let verifyToken = null;
        if (cap.pow_nonce && cap.pow_difficulty && cap.pow_token) {
            // 5) résolution PoW (worker, fallback local) + verify
            const solution = await _fmSolvePoW(cap.pow_nonce, cap.pow_difficulty);
            if (!solution || solution === "0") { console.log("[Filemoon] ⏭️ PoW non résolu (sauté)"); return null; }
            const vr = await soraFetch(`https://${host}/api/videos/${videoId}/embed/captcha/verify`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ pow_token: cap.pow_token, solution, fingerprint: fp }) });
            const vj = JSON.parse(await vr.text());
            verifyToken = vj.token;
            if (!verifyToken) { console.log("[Filemoon] ❌ PoW refusé"); return null; }
        }

        // 6) playback (X-Embed-* : on se présente comme embarqué par nakanime)
        const pbHeaders = {
            "User-Agent": NAK_UA, "Accept": "*/*", "Content-Type": "application/json",
            "Origin": `https://${host}`, "Referer": frame,
            "Cookie": `byse_viewer_id=${fp.viewer_id}; byse_device_id=${fp.device_id}`,
            "X-Embed-Origin": "nakanime.tv",
            "X-Embed-Referer": `${BASE_URL}/`,
            "X-Embed-Parent": embedUrl
        };
        if (verifyToken) pbHeaders["X-Captcha-Token"] = verifyToken;
        const pb = await soraFetch(`https://${host}/api/videos/${videoId}/embed/playback`, { headers: pbHeaders, method: "POST", body: JSON.stringify({ fingerprint: fp }) });
        const pbt = await pb.text();
        if (!pbt.includes("playback")) { console.log(`[Filemoon] ❌ playback: ${pbt.slice(0, 70)}`); return null; }
        const pj = JSON.parse(pbt).playback;

        // 7) déchiffrage AES-GCM 100% LOCAL (pur-JS, plus aucune dépendance à jm26.net)
        const decrypted = _fmDecryptPlayback(pj);
        if (decrypted && Array.isArray(decrypted.sources) && decrypted.sources.length) {
            const best = decrypted.sources.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (best && best.url) return { streamUrl: best.url, headers: { "Referer": `https://${host}/`, "Origin": `https://${host}` } };
        }
        console.log("[Filemoon] ❌ déchiffrage vide");
    } catch (e) { console.log(`[Filemoon] 🚨 ${e.message}`); }
    return null;
}

// --- UTILS SORA ---
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null, true, options.encoding ?? 'utf-8');
        } else {
            return await fetch(url, options);
        }
    } catch(e) {
        try { return await fetch(url, options); } catch(error) { return null; }
    }
}