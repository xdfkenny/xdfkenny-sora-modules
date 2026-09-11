// ==========================================
// ⚙️ MODULE SORA — ANIME-SAMA (Supabase Edition + Sibnet Fix)test update
// ==========================================

// ==========================================
// 🗄️ TRACKER SUPABASE (Base de données)
// ==========================================
const SUPABASE_URL = "https://qyeisgowjisqbatrmqta.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F68CBjFVPh71U0SdD9BQJg_UJgL9-Fj";

async function sendSupabaseLog(moduleName, actionType, dataPayload) {
    try {
        const payload = { module: moduleName, action: actionType, data: dataPayload };
        const headers = { 
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Prefer": "return=minimal" 
        };
        await fetchv2(`${SUPABASE_URL}/rest/v1/app_logs`, headers, "POST", JSON.stringify(payload));
    } catch (e) { 
        console.log(`[Tracker] 🚨 Erreur d'envoi vers Supabase : ${e.message}`); 
    }
}

// ==========================================
// ⚙️ LOGIQUE DU MODULE ANIME-SAMA
// ==========================================

async function getDomainsList() {
    console.log(`[Domaines] 🌐 Récupération des domaines actifs...`);
    try {
        const response = await fetchv2("https://anime-sama.pw/");
        const html = await response.text();

        const domainRegex = /{ name: '([^']+)' }/g;
        const domains = [];
        let match;
        while ((match = domainRegex.exec(html)) !== null) {
            domains.push(match[1]);
        }
        
        console.log(`[Domaines] ✅ Domaines trouvés : ${domains.join(', ')}`);
        return domains.length > 0 ? domains : ["anime-sama.to"];
    } catch (err) {
        console.log(`[Domaines] 🚨 Erreur, fallback sur anime-sama.to`);
        return ["anime-sama.to"];
    }
}

async function trySearch(domain, keyword) {
    console.log(`[Recherche AS] 🔍 Tentative sur : ${domain} pour "${keyword}"`);
    try {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": `https://${domain}/`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        };

        const fetchUrl = `https://${domain}/template-php/defaut/fetch.php`;
        const response = await fetchv2(fetchUrl, headers, "POST", `query=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        const results = [];
        
        const regex = /<a[^>]+href=["']([^"']+)["'][\s\S]*?<img[^>]+src=["']([^"']+)["'][\s\S]*?<h3[^>]*>(.*?)<\/h3>/gi;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            let href = match[1].trim();
            let image = match[2].trim();
            let title = match[3].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&#8211;/g, "-").trim();
            
            if (href.startsWith('/')) href = `https://${domain}${href}`;
            if (image.startsWith('/')) image = `https://${domain}${image}`;

            if (!results.find(r => r.href === href)) {
                results.push({ title, image, href });
            }
        }
        
        return { results: results };
    } catch (e) {
        console.log(`[Recherche AS] 🚨 Erreur sur ${domain} : ${e}`);
        return { results: [] };
    }
}

async function searchResults(keyword) {
    try {
        const domains = await getDomainsList();
        console.log(`[Recherche AS] 🔍 Démarrage de la recherche sur ${domains.length} domaines.`);
        
        let finalResults = [];

        for (let i = 0; i < domains.length; i++) {
            let currentDomain = domains[i];
            console.log(`[Recherche AS] 📡 Vérification du radar pour : ${currentDomain}...`);
            
            try {
                const checkRes = await fetchv2(`https://anime-sama.pw/?check=${currentDomain}`, { "User-Agent": "Mozilla/5.0" }, "GET");
                const checkData = JSON.parse(await checkRes.text());
                if (checkData.code !== 200) {
                    console.log(`[Recherche AS] ⏭️ ${currentDomain} ignoré.`);
                    continue; 
                }
            } catch (e) {}

            try {
                let searchAttempt = await trySearch(currentDomain, keyword);
                if (searchAttempt.results && searchAttempt.results.length > 0) {
                    console.log(`[Recherche AS] 🚀 Succès sur ${currentDomain} ! ${searchAttempt.results.length} résultats extraits.`);
                    finalResults = searchAttempt.results;
                    break; 
                }
            } catch (err) {}
        }

        sendSupabaseLog("Anime-Sama", "SEARCH", { 
            keyword: keyword, 
            results_count: finalResults.length,
            top_results: finalResults.slice(0, 3).map(r => r.title)
        });

        return JSON.stringify(finalResults);
    } catch (globalErr) {
        console.log(`[Recherche AS] 🚨 Crash global : ${globalErr}`);
        return JSON.stringify([]);
    }
}

// --- 2. DÉTAILS ---
async function extractDetails(url) {
    console.log(`[Détails AS] 📖 Chargement des infos pour : ${url}`);
    sendSupabaseLog("Anime-Sama", "DETAILS", { anime_url: url });

    try {
        const response = await fetchv2(url);
        const html = await response.text();

        let description = "Pas de description disponible.";
        let descMatch = html.match(/id=["']synopsis["'][^>]*>([\s\S]*?)<\//i) || 
                          html.match(/class=["']synopsis["'][^>]*>([\s\S]*?)<\//i) || 
                          html.match(/<p class=["']text-sm[^>]*>([\s\S]*?)<\/p>/i);

        if (descMatch && descMatch[1]) {
            description = descMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").trim();
        }

        return JSON.stringify([{ description, aliases: "Anime-Sama" }]);
    } catch (e) { 
        return JSON.stringify([{ description: "Erreur de chargement", aliases: "Anime-Sama" }]); 
    }
}

// --- 3. ÉPISODES ---
async function extractEpisodes(url) {
    console.log(`[Episodes AS] 📂 Analyse multi-saisons : ${url}`);
    try {
        if (!url.endsWith('/')) url += '/';

        const headers = { "User-Agent": "Mozilla/5.0", "Referer": url };
        const response = await fetchv2(url, headers, "GET");
        const html = await response.text();

        const seasonRegex = /panneauAnime\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;
        let match;
        let tabs = [];
        
        while ((match = seasonRegex.exec(html)) !== null) {
            let name = match[1].trim();
            let path = match[2].trim();
            if (name.toLowerCase() === 'nom' || path.toLowerCase() === 'url') continue;
            let fullUrl = path.startsWith('http') ? path : url + path;
            tabs.push({ name: name, url: fullUrl });
        }

        if (tabs.length === 0) tabs.push({ name: "Saison 1", url: url + "saison1/vostfr" });

        let results = [];
        let fallbackSeason = 1;

        for (let tab of tabs) {
            try {
                let jsUrl = tab.url;
                if (!jsUrl.endsWith('/')) jsUrl += '/';
                jsUrl += "episodes.js";
                
                let jsRes = await fetchv2(jsUrl, headers, "GET");
                let jsContent = await jsRes.text();

                if (!jsContent || jsContent.includes("<html") || jsContent.length < 50) {
                    let tabRes = await fetchv2(tab.url, headers, "GET");
                    let tabText = await tabRes.text();
                    let scriptMatch = tabText.match(/<script[^>]+src=['"]([^'"]*episodes\.js[^'"]*)['"]/i);
                    if (scriptMatch) {
                        let scriptSrc = scriptMatch[1].trim();
                        let baseFolder = tab.url.endsWith('/') ? tab.url : tab.url + '/';
                        jsUrl = scriptSrc.startsWith('http') ? scriptSrc : (scriptSrc.startsWith('/') ? new URL(url).origin + scriptSrc : baseFolder + scriptSrc);
                        jsRes = await fetchv2(jsUrl, headers, "GET");
                        jsContent = await jsRes.text();
                    }
                }

                if (!jsContent || jsContent.includes("<html") || jsContent.length < 50) continue;

                const arrayRegex = /(?:var|let|const)\s+[a-zA-Z0-9_]+\s*=\s*\[([\s\S]*?)\]/gm;
                let arrMatch;
                let maxEpisodes = 0;

                while ((arrMatch = arrayRegex.exec(jsContent)) !== null) {
                    let urls = arrMatch[1].match(/['"]([^'"]+)['"]/g) || [];
                    if (urls.length > maxEpisodes) maxEpisodes = urls.length;
                }

                if (maxEpisodes > 0) {
                    let cleanTabName = tab.name.replace(/\(?(VOSTFR|VF)\)?/i, '').trim();
                    let currentSeason = fallbackSeason;
                    let seasonMatch = cleanTabName.match(/saison\s*(\d+)/i);
                    
                    if (seasonMatch) currentSeason = parseInt(seasonMatch[1]);
                    else if (cleanTabName.toLowerCase().includes('film') || cleanTabName.toLowerCase().includes('oav')) currentSeason = 0; 

                    for (let i = 0; i < maxEpisodes; i++) {
                        let separator = jsUrl.includes('?') ? '&' : '?';
                        let epHref = `${jsUrl}${separator}episode_index=${i}`;
                        let epTitle = maxEpisodes === 1 ? cleanTabName : `Épisode ${i + 1}`;
                        
                        results.push({
                            title: epTitle, name: epTitle, href: epHref,
                            number: i + 1, season: currentSeason     
                        });
                    }
                    if (!cleanTabName.toLowerCase().includes('film')) fallbackSeason++;
                }
            } catch (e) { }
        }
        return JSON.stringify(results);
    } catch (e) { return JSON.stringify([]); }
}

// --- 4. LECTEUR ---
async function extractStreamUrl(url) {
    console.log(`[Lecteur AS] 🎬 Démarrage pour : ${url}`);
    
    try {
        let epIndex = 0;
        let jsUrl1 = url;
        
        if (url.includes('episode_index=')) {
            let parts = url.split('episode_index=');
            epIndex = parseInt(parts[1]) || 0;
            jsUrl1 = parts[0];
            if (jsUrl1.endsWith('?') || jsUrl1.endsWith('&')) jsUrl1 = jsUrl1.slice(0, -1);
        }

        let langsToFetch = [];
        let langMatch = jsUrl1.match(/\/(vostfr|vf|va)\//i);

        if (langMatch) {
            let currentLang = langMatch[1].toLowerCase();
            langsToFetch = [
                { lang: "VOSTFR", url: jsUrl1.replace(`/${currentLang}/`, '/vostfr/') },
                { lang: "VF", url: jsUrl1.replace(`/${currentLang}/`, '/vf/') },
                { lang: "VA", url: jsUrl1.replace(`/${currentLang}/`, '/va/') }
            ];
        } else {
            langsToFetch = [{ lang: "VOSTFR", url: jsUrl1 }]; 
        }

        const headers = { "User-Agent": "Mozilla/5.0", "Referer": "https://anime-sama.to/" };

        let fetchPromises = langsToFetch.map(l => fetchv2(l.url, headers, "GET").then(r => r.text()).catch(() => ""));
        let contents = await Promise.all(fetchPromises);
        
        let allEmbeds = [];

        function parseJsContent(jsText, langTag) {
            if (!jsText || jsText.includes("<html") || jsText.length < 50) return;
            const arrayRegex = /(?:var|let|const)\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\];/gm;
            let match;
            while ((match = arrayRegex.exec(jsText)) !== null) {
                let urls = match[2].match(/['"]([^'"]+)['"]/g) || [];
                if (epIndex < urls.length) {
                    let rawUrl = urls[epIndex].replace(/['"]/g, '').trim();
                    if (rawUrl.startsWith('http')) {
                        allEmbeds.push({ url: rawUrl, lang: langTag });
                    }
                }
            }
        }

        for (let i = 0; i < contents.length; i++) {
            if (contents[i]) parseJsContent(contents[i], langsToFetch[i].lang);
        }

        let streams = [];
        let extractedNames = [];
        let failedLinks = [];

        for (let embed of allEmbeds) {
            let embedUrl = embed.url;
            let urlLower = embedUrl.toLowerCase();
            let prefix = `[${embed.lang}]`;
            let streamCountBefore = streams.length;

            // 1. LECTEUR VOE
            if (urlLower.includes("voe.sx") || urlLower.includes("voe.network") || urlLower.includes("voe") || urlLower.includes("lancewhosedifficult")) {
                console.log(`[Lecteur] 🕵️ Extraction VOE en cours sur : ${embedUrl}`);
                try {
                    let voeRes = await fetchv2(embedUrl, { "Referer": "https://anime-sama.to/" }, "GET");
                    if (voeRes) {
                        let voeHtml = await voeRes.text();
                        
                        // Fix Redirection VOE (Domain Hopping)
                        const redirectMatch = voeHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);
                        if (redirectMatch && redirectMatch[1]) {
                            console.log(`[Lecteur] 🔄 VOE : Redirection détectée -> ${redirectMatch[1]}`);
                            voeRes = await fetchv2(redirectMatch[1], { "Referer": "https://anime-sama.to/" }, "GET");
                            voeHtml = await voeRes.text();
                        }

                        const streamUrl = voeExtractor(voeHtml);
                        if (streamUrl) {
                            const typeStr = streamUrl.includes(".m3u8") ? "HLS" : "MP4";
                            streams.push({ title: `${prefix} VOE (${typeStr})`, streamUrl: streamUrl, headers: { "Referer": embedUrl } });
                            extractedNames.push(`${prefix} VOE`);
                        }
                    }
                } catch(e) {}
            }
            // 2. LECTEUR STREAMTAPE
            else if (urlLower.includes("streamtape")) {
                try {
                    const stRes = await fetchv2(embedUrl, { "Referer": "https://anime-sama.to/" }, "GET");
                    const stHtml = await stRes.text();
                    const robotMatch = stHtml.match(/document\.getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*[^;]+\(['"]([^'"]+)['"]\)/i);
                    if (robotMatch) {
                        let tokenStr = robotMatch[1];
                        let directUrl = "https://streamtape.com" + tokenStr.substring(tokenStr.indexOf('/get_video')) + "&dl=1";
                        streams.push({ title: `${prefix} Streamtape`, streamUrl: directUrl, headers: { "Referer": "https://streamtape.com/" } });
                        extractedNames.push(`${prefix} Streamtape`);
                    }
                } catch (e) {}
            } 
            // 4. LECTEUR VIDMOLY
            else if (urlLower.includes("vidmoly")) {
                try {
                    let fixedVidUrl = embedUrl.replace(/vidmoly\.(to|me|net|ru|is)/i, "vidmoly.biz");
                    const vidRes = await fetchv2(fixedVidUrl, { "Referer": "https://vidmoly.biz/" }, "GET");
                    const vidHtml = await vidRes.text();
                    const fileMatch = vidHtml.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || vidHtml.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                    if (fileMatch) {
                        streams.push({ title: `${prefix} Vidmoly`, streamUrl: fileMatch[1], headers: { "Referer": "https://vidmoly.biz/" } });
                        extractedNames.push(`${prefix} Vidmoly`);
                    }
                } catch (e) {}
            }
            // 5. LECTEUR SENDVID
            else if (urlLower.includes("sendvid")) {
                try {
                    const req = await fetchv2(embedUrl, { "Referer": "https://anime-sama.to/" }, "GET");
                    const sendHtml = await req.text();
                    const mp4Match = sendHtml.match(/<source[^>]+src=["']([^"']+\.mp4)["']/i) || sendHtml.match(/video_source\s*=\s*["']([^"']+)["']/i);
                    if (mp4Match) {
                        streams.push({ title: `${prefix} Sendvid`, streamUrl: mp4Match[1], headers: { "Referer": embedUrl } });
                        extractedNames.push(`${prefix} Sendvid`);
                    }
                } catch (e) {}
            }
            // 6. LECTEUR SIBNET (AVEC DIAGNOSTIC iOS)
            else if (urlLower.includes("sibnet.ru")) {
                console.log(`[Sibnet] 🔍 1/4 - Démarrage extraction sur : ${embedUrl}`);
                try {
                    // 🌟 CORRECTION 1 : On force un User-Agent Desktop pour éviter la version mobile de Sibnet sur iOS
                    const sibnetHeaders = { 
                        "Referer": "https://anime-sama.to/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    };
                    const req = await fetchv2(embedUrl, sibnetHeaders, "GET", null, true, "windows-1251");
                    
                    if (!req) {
                        console.log(`[Sibnet] 🚨 1/4 - ERREUR FATALE : La requête (fetchv2) a renvoyé NULL. (Problème de fetch réseau sur iOS ?)`);
                        continue;
                    }
                    
                    const html = await req.text();
                    
                    if (!html || html.length < 100) {
                         console.log(`[Sibnet] 🚨 2/4 - ERREUR : HTML reçu vide ou trop court (Taille: ${html ? html.length : 0}).`);
                         continue;
                    } else {
                         console.log(`[Sibnet] ✅ 2/4 - HTML téléchargé avec succès. (Taille: ${html.length} chars)`);
                    }

                    // 🌟 CORRECTION 2 : Regex plus robuste (Supporte les .m3u8 et les URLs absolues)
                    const srcMatch = html.match(/player\.src\s*\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/i) || 
                                     html.match(/src:\s*["']((?:https?:\/\/video\.sibnet\.ru)?\/v\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || 
                                     html.match(/["']((?:https?:\/\/video\.sibnet\.ru)?\/v\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
                    
                    if (srcMatch) {
                        let streamUrl = srcMatch[1].startsWith("http") ? srcMatch[1] : "https://video.sibnet.ru" + srcMatch[1];
                        console.log(`[Sibnet] ✅ 3/4 - SRC trouvée par le Regex : ${streamUrl}`);
                        
                        try {
                            console.log(`[Sibnet] 📡 4/4 - Tentative de résolution de la redirection (HEAD)...`);
                            const redirectReq = await fetchv2(streamUrl, {
                                "Referer": embedUrl,
                                // Certains iOS WKWebview bloquent si le User-Agent n'est pas "Mobile"
                                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
                            }, "HEAD");
                            
                            if (redirectReq && redirectReq.url && redirectReq.url !== streamUrl) {
                                console.log(`[Sibnet] 🔄 Redirection confirmée vers : ${redirectReq.url}`);
                                streamUrl = redirectReq.url;
                            } else {
                                console.log(`[Sibnet] ⚠️ Pas de redirection détectée (URL identique ou échec HEAD). On garde le lien d'origine.`);
                            }
                        } catch(redErr) {
                            console.log(`[Sibnet] 🚨 Erreur lors de la redirection HEAD (Typique sur iOS) : ${redErr.message}. On force le lien d'origine.`);
                        }

                        streams.push({ 
                            title: `${prefix} Sibnet`, 
                            streamUrl: streamUrl, 
                            headers: { "Referer": embedUrl, "User-Agent": "Mozilla/5.0" } 
                        });
                        extractedNames.push(`${prefix} Sibnet`);
                        console.log(`[Sibnet] 🎉 SUCCÈS TOTAL : Sibnet ajouté aux flux.`);

                    } else {
                        console.log(`[Sibnet] 🚨 3/4 - ERREUR : Le Regex n'a rien trouvé. Extrait du HTML : ${html.substring(0, 500)}...`);
                    }
                } catch(globalSibErr) {
                    console.log(`[Sibnet] 💥 CRASH GÉNERAL DANS LE TRY/CATCH SIBNET : ${globalSibErr.message}`);
                }
            }
            // 6.5 LECTEUR EMBED4ME / LPLAYER (famille embedseek, API /api/v1/video chiffrée AES-128-CBC)
            else if (urlLower.includes("lplayer") || urlLower.includes("embed4me") || urlLower.includes("embedseek") || urlLower.includes("neocine") || urlLower.includes("seekplayer") || urlLower.includes("flemmix") || urlLower.includes("p2pstream")) {
                console.log(`[Lecteur] 🕵️ Extraction Embed4me/lplayer : ${embedUrl}`);
                try {
                    const r = await embed4meExtractor(embedUrl);
                    if (r && r.streamUrl) {
                        streams.push({ title: `${prefix} Lplayer (HLS)`, streamUrl: r.streamUrl, headers: r.headers });
                        extractedNames.push(`${prefix} Lplayer`);
                    }
                } catch (e) {}
            }
            // 7. DETECTEUR UNIVERSEL (Vidhide / Famille Packer)
            else {
                try {
                    const req = await fetchv2(embedUrl, { "Referer": "https://anime-sama.to/" }, "GET");
                    const html = await req.text();

                    if (html.includes('/vidhide/') || html.includes('eval(function(p,a,c,k,e,d)')) {
                        let streamUrl = vidhideExtractor(html); 
                        if (streamUrl) {
                            let originMatch = embedUrl.match(/^(https?:\/\/[^\/]+)/i);
                            let originUrl = originMatch ? originMatch[1] + "/" : "https://vidhide.com/";
                            streams.push({ 
                                title: `${prefix} Vidhide`, 
                                streamUrl: streamUrl, 
                                headers: { "Referer": originUrl, "User-Agent": "Mozilla/5.0" } 
                            });
                            extractedNames.push(`${prefix} Vidhide`);
                        }
                    }
                } catch(e) {}
            }

            if (streams.length === streamCountBefore) {
                let domainMatch = embedUrl.match(/https?:\/\/(?:www\.)?([^/]+)/i);
                let serverFallbackName = domainMatch ? domainMatch[1] : "Inconnu";
                failedLinks.push({ server_name: `${prefix} ${serverFallbackName}`, url: embedUrl });
            }
        }

        let safeStreams = streams.filter(s => s.streamUrl.includes('.mp4') || s.streamUrl.includes('.m3u8'));
        let uniqueStreams = [];
        let seenUrls = new Set();
        for (let s of safeStreams) {
            if (!seenUrls.has(s.streamUrl)) { seenUrls.add(s.streamUrl); uniqueStreams.push(s); }
        }

        sendSupabaseLog("Anime-Sama", "PLAYER", { 
            media_url: url, ep_number: epIndex + 1, streams_found: uniqueStreams.length, servers: extractedNames
        });

        if (failedLinks.length > 0) {
            sendSupabaseLog("Anime-Sama", "UNSUPPORTED_HOSTS", {
                media_url: url, ep_number: epIndex + 1, failed_count: failedLinks.length, failed_links: failedLinks
            });
        }

        return JSON.stringify(uniqueStreams.length > 0 ? { type: "servers", streams: uniqueStreams } : { type: "none" });

    } catch (e) {
        return JSON.stringify({ type: "none" });
    }
}

// ==========================================
// 🛠️ FONCTIONS UTILITAIRES & DÉCRYPTEURS
// ==========================================

// ==========================================
// 🔓 EMBED4ME / LPLAYER (embedseek) — AES-128-CBC pur JS (porté de movix)
// L'API /api/v1/video?id=... renvoie un blob hex chiffré. Clé/IV statiques.
// ==========================================
const _EMBED4ME_KEY = "kiemtienmua911ca";
const _EMBED4ME_IV  = "1234567890oiuytr";

// --- AES-128 pur JS (déchiffrement CBC) ---
const _AES = (function () {
    const sbox = [], invSbox = [], rcon = [0x01];
    (function init() {
        const p = new Uint8Array(256), q = new Uint8Array(256);
        let x = 1, xi = 1;
        for (let i = 0; i < 256; i++) {
            p[i] = x;
            x ^= (x << 1) ^ ((x & 0x80) ? 0x11b : 0);
            xi ^= xi << 1; xi ^= xi << 2; xi ^= xi << 4;
            if (xi & 0x80) xi ^= 0x09;
            q[x & 0xff === 0 ? 0 : x] = 0; // placeholder, real inverse below
        }
        // table de log/antilog correcte
        const log = new Uint8Array(256), alog = new Uint8Array(256);
        let a = 1;
        for (let i = 0; i < 255; i++) {
            alog[i] = a; log[a] = i;
            a ^= (a << 1) ^ ((a & 0x80) ? 0x11b : 0); a &= 0xff;
        }
        const inv = (g) => g === 0 ? 0 : alog[(255 - log[g]) % 255];
        for (let i = 0; i < 256; i++) {
            let s = inv(i), xf = s;
            for (let k = 0; k < 4; k++) { xf = ((xf << 1) | (xf >> 7)) & 0xff; s ^= xf; }
            s ^= 0x63;
            sbox[i] = s; invSbox[s] = i;
        }
        for (let i = 1; i < 10; i++) {
            rcon[i] = (rcon[i - 1] << 1) ^ ((rcon[i - 1] & 0x80) ? 0x11b : 0);
            rcon[i] &= 0xff;
        }
    })();

    function expandKey(key) { // key: 16 bytes
        const w = new Array(44);
        for (let i = 0; i < 4; i++)
            w[i] = [key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]];
        for (let i = 4; i < 44; i++) {
            let t = w[i - 1].slice();
            if (i % 4 === 0) {
                t = [t[1], t[2], t[3], t[0]].map(b => sbox[b]);
                t[0] ^= rcon[i / 4 - 1];
            }
            w[i] = w[i - 4].map((b, j) => b ^ t[j]);
        }
        return w;
    }

    function xtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x11b : 0)) & 0xff; }
    function mul(a, b) {
        let r = 0;
        for (let i = 0; i < 8; i++) {
            if (b & 1) r ^= a;
            const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b;
            b >>= 1;
        }
        return r & 0xff;
    }

    function decryptBlock(inp, w) {
        let s = [[], [], [], []];
        for (let i = 0; i < 16; i++) s[i % 4][(i / 4) | 0] = inp[i];

        const addRound = (rnd) => {
            for (let c = 0; c < 4; c++)
                for (let r = 0; r < 4; r++)
                    s[r][c] ^= w[rnd * 4 + c][r];
        };
        const invSub = () => {
            for (let r = 0; r < 4; r++)
                for (let c = 0; c < 4; c++) s[r][c] = invSbox[s[r][c]];
        };
        const invShift = () => {
            for (let r = 1; r < 4; r++) {
                const row = s[r].slice();
                for (let c = 0; c < 4; c++) s[r][c] = row[(c - r + 4) % 4];
            }
        };
        const invMix = () => {
            for (let c = 0; c < 4; c++) {
                const a0 = s[0][c], a1 = s[1][c], a2 = s[2][c], a3 = s[3][c];
                s[0][c] = mul(a0,14)^mul(a1,11)^mul(a2,13)^mul(a3,9);
                s[1][c] = mul(a0,9)^mul(a1,14)^mul(a2,11)^mul(a3,13);
                s[2][c] = mul(a0,13)^mul(a1,9)^mul(a2,14)^mul(a3,11);
                s[3][c] = mul(a0,11)^mul(a1,13)^mul(a2,9)^mul(a3,14);
            }
        };

        addRound(10);
        for (let rnd = 9; rnd >= 1; rnd--) {
            invShift(); invSub(); addRound(rnd); invMix();
        }
        invShift(); invSub(); addRound(0);

        const out = new Uint8Array(16);
        for (let i = 0; i < 16; i++) out[i] = s[i % 4][(i / 4) | 0];
        return out;
    }

    function cbcDecrypt(cipher, key, iv) {
        const w = expandKey(key);
        const out = new Uint8Array(cipher.length);
        let prev = iv;
        for (let off = 0; off < cipher.length; off += 16) {
            const block = cipher.subarray(off, off + 16);
            const dec = decryptBlock(block, w);
            for (let i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
            prev = block;
        }
        // retire le padding PKCS#7
        const pad = out[out.length - 1];
        return (pad > 0 && pad <= 16) ? out.subarray(0, out.length - pad) : out;
    }

    return { cbcDecrypt };
})();

function _hexToBytes(hex) {
    hex = hex.trim();
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}
function _strToBytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
}

async function embed4meExtractor(embedUrl) {
    try {
        const host = (embedUrl.match(/https?:\/\/([^/]+)/i) || [])[1];
        const id = (embedUrl.match(/#([a-zA-Z0-9]+)/) || [])[1] || (embedUrl.match(/[?&]id=([a-zA-Z0-9]+)/) || [])[1];
        if (!host || !id) return null;
        const apiUrl = `https://${host}/api/v1/video?id=${id}&w=1680&h=1050&r=`;
        // ⚠️ N'envoyer QUE le User-Agent (Origin/Referer -> 400 sur cette famille).
        const res = await fetchv2(apiUrl, { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Accept": "*/*" }, "GET");
        if (!res || typeof res.text !== "function") return null;
        const hex = (await res.text()).trim();
        if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
        const cipher = _hexToBytes(hex);
        const plain = _AES.cbcDecrypt(cipher, _strToBytes(_EMBED4ME_KEY), _strToBytes(_EMBED4ME_IV));
        let txt = ""; for (let i = 0; i < plain.length; i++) txt += String.fromCharCode(plain[i]);
        try { txt = decodeURIComponent(escape(txt)); } catch (e) {}
        const data = JSON.parse(txt);
        let streamUrl = data.source || (data.hlsVideoTiktok ? `https://${host}${data.hlsVideoTiktok}` : null);
        if (!streamUrl) return null;
        return { streamUrl: streamUrl, headers: { "Referer": `https://${host}/`, "Origin": `https://${host}` } };
    } catch (e) { return null; }
}

// Décodeur VOE (Mise à jour avec safeAtob pour corriger l'erreur Buffer)
function voeExtractor(html) {
    try {
        const jsonScriptMatch = html.match(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
        if (!jsonScriptMatch) return null;
        
        let data = JSON.parse(jsonScriptMatch[1].trim());
        let step1 = data[0].replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
        let step2 = step1; 
        ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(pat => step2 = step2.split(pat).join(""));
        
        const safeAtob = (b64) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
            let str = String(b64).replace(/=+$/, '');
            let output = '';
            for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
                buffer = chars.indexOf(buffer);
            }
            return output;
        };
        
        let step3 = safeAtob(step2);
        let step4 = step3.split("").map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).join("");
        let step5 = step4.split("").reverse().join("");
        let step6 = safeAtob(step5);
        
        let result = JSON.parse(step6);
        return result.direct_access_url || (result.source && result.source.find(s => s.direct_access_url)?.direct_access_url) || null;
    } catch (e) { return null; }
}

function vidhideExtractor(html) {
    try {
        let videoUrl = null;

        let directMatch = html.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
        if (directMatch) {
            videoUrl = directMatch[1];
        } 
        else if (html.includes('eval(function(p,a,c,k,e,d)')) {
            let packRegex = /eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/g;
            let packMatches = html.match(packRegex);
            
            if (packMatches) {
                for (let packed of packMatches) {
                    let argsMatch = packed.match(/}\s*\(\s*(['"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\5\.split\('\|'\)/);
                    if (argsMatch) {
                        let p = argsMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
                        let a = parseInt(argsMatch[3], 10);
                        let c = parseInt(argsMatch[4], 10);
                        let k = argsMatch[6].split('|');
                        
                        let e = function(c) {
                            return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
                        };
                        
                        while (c--) {
                            if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
                        }
                        
                        let unpackedMatch = p.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
                        if (unpackedMatch) {
                            videoUrl = unpackedMatch[1];
                            break;
                        }
                    }
                }
            }
        }

        if (videoUrl) {
            return videoUrl.replace(/\\\//g, "/").trim();
        }
        return null;
    } catch (e) {
        return null;
    }
}