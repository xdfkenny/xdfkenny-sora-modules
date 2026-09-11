// ==========================================
// ⚙️ MODULE SORA — VOIRANIME (Tracker Pro + Filemoon + Logs Console)
// ==========================================

const BASE_URL = "https://voir-anime.to";

// ==========================================
// 🎛️ CONFIG — Activer / désactiver les extracteurs
// Mets `false` pour désactiver un host (il sera ignoré à l'extraction).
// ==========================================
const EXTRACTORS = {
    filemoon:   false,   // Filemoon / Filelions / clones "Byse Frontend"
    voe:        true,   // VOE (voe.sx, domain-hopping)
    streamtape: true,  // Streamtape (parsing sans eval — actuellement instable)
    vidmoly:    true,   // Vidmoly
    streamhide: true,   // Streamhide / VidHide / F16px / Luluvdo
    yourupload: true,   // YourUpload
    sibnet:     true,   // Sibnet
    mailru:     true    // Mail.ru
};

// Détermine à quel extracteur appartient une URL d'embed (ou null si inconnu).
function extractorKeyForUrl(urlLower) {
    if (urlLower.includes("filemoon") || urlLower.includes("filelions") || urlLower.includes("alions") || urlLower.includes("weneverbeenfree")) return "filemoon";
    if (urlLower.includes("voe.sx") || urlLower.includes("voe.network") || urlLower.includes("voe") || urlLower.includes("lancewhosedifficult")) return "voe";
    if (urlLower.includes("streamtape.com") || urlLower.includes("streamta.pe")) return "streamtape";
    if (urlLower.includes("vidmoly")) return "vidmoly";
    if (urlLower.includes("streamhide") || urlLower.includes("vidhide") || urlLower.includes("luluvdo")) return "streamhide";
    if (urlLower.includes("yourupload")) return "yourupload";
    if (urlLower.includes("sibnet")) return "sibnet";
    if (urlLower.includes("my.mail.ru")) return "mailru";
    return null; // inconnu -> laissé au scan approfondi (Byse/Filemoon clone)
}


// ==========================================
// 🗄️ TRACKER SUPABASE (Base de données)
// ==========================================
const SUPABASE_URL = "https://qyeisgowjisqbatrmqta.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F68CBjFVPh71U0SdD9BQJg_UJgL9-Fj";

async function sendSupabaseLog(moduleName, actionType, dataPayload) {
    try {
        const payload = {
            module: moduleName,
            action: actionType,
            data: dataPayload
        };

        const headers = { 
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Prefer": "return=minimal" 
        };
        
        if (typeof fetchv2 !== 'undefined') {
            await fetchv2(`${SUPABASE_URL}/rest/v1/app_logs`, headers, "POST", JSON.stringify(payload));
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/app_logs`, { method: "POST", headers: headers, body: JSON.stringify(payload) });
        }
    } catch (e) { 
        console.log(`[Tracker] 🚨 Erreur d'envoi vers Supabase : ${e.message}`); 
    }
}

// ==========================================
// ⚙️ LOGIQUE DU MODULE VOIRANIME
// ==========================================

// --- 1. RECHERCHE ---
async function searchResults(keyword) {
    console.log(`[Recherche] 🔍 Recherche classique pour : "${keyword}"`);
    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(keyword)}&post_type=wp-manga`;
        console.log(`[Recherche] 🔗 URL appelée : ${searchUrl}`);

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://voir-anime.to"
        };

        const response = await soraFetch(searchUrl, { headers });
        const html = await response.text();

        if (html.includes("Just a moment...") || html.includes("Cloudflare") || html.includes("DDoS")) {
            console.log(`[Recherche] ⛔ AÏE ! L'application est bloquée par Cloudflare.`);
            sendSupabaseLog("VoirAnime", "BLOCKED", { keyword: keyword, reason: "Cloudflare" });
            return JSON.stringify([]);
        }

        const results = [];
        const blocks = html.split(/c-tabs-item__content|page-item-detail|class=["']c-image["']/i);

        for (let i = 1; i < blocks.length; i++) {
            let block = blocks[i];
            
            let hrefMatch = block.match(/href=["']([^"']+)["']/i);
            let titleMatch = block.match(/title=["']([^"']+)["']/i) || block.match(/alt=["']([^"']+)["']/i);
            let imgMatch = block.match(/data-src=["']([^"']+)["']/i) || block.match(/src=["']([^"']+)["']/i);
            let yearMatch = block.match(/release-year[^>]*>\s*<a[^>]*>(\d{4})<\/a>/i);

            if (hrefMatch && titleMatch) {
                let href = hrefMatch[1];
                let title = titleMatch[1];
                
                if (href.includes('.css') || href.includes('.js') || href.includes('wp-') || title.includes('RSD') || !href.includes(BASE_URL)) {
                    continue;
                }

                title = title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&#8211;/g, "-").trim();
                let rawImage = imgMatch ? imgMatch[1] : "";
                if (rawImage.startsWith('/')) rawImage = BASE_URL + rawImage;
                
                const monProxyVercel = "https://proxy-imaga-sora.kurzmathis4.workers.dev/?url=";
                let image = rawImage ? `${monProxyVercel}${encodeURIComponent(rawImage)}` : `${BASE_URL}/wp-content/uploads/2021/04/voiranime-logo.png`;

                let year = yearMatch ? yearMatch[1] : null;

                if (!results.find(r => r.href === href)) {
                    let item = { title: title, image: image, href: href };
                    if (year) item.year = year; 
                    results.push(item);
                }
            }
        }
        
        console.log(`[Recherche] ✅ ${results.length} animes trouvés.`);
        sendSupabaseLog("VoirAnime", "SEARCH", { 
            keyword: keyword, 
            results_count: results.length,
            top_results: results.slice(0, 3).map(r => r.title)
        });

        return JSON.stringify(results);

    } catch (e) { 
        console.error(`[Recherche] 🚨 Erreur :`, e);
        sendSupabaseLog("VoirAnime", "ERROR", { keyword: keyword, error_message: String(e) });
        return JSON.stringify([]); 
    }
}

// --- 2. DÉTAILS ---
async function extractDetails(url) {
    console.log(`[Détails] 📖 Analyse de : ${url}`);
    sendSupabaseLog("VoirAnime", "DETAILS", { anime_url: url });

    try {
        const response = await soraFetch(url);
        const html = await response.text();

        let description = "Pas de description disponible.";
        const descMatch = html.match(/<div class=["']summary__content[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<div class=["']description-summary[^>]*>([\s\S]*?)<\/div>/i);

        if (descMatch && descMatch[1]) {
            description = descMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&#8217;/g, "'").replace(/&#8230;/g, "...").replace(/&quot;/g, '"').replace(/&#8220;?/g, '"').replace(/&#8221;?/g, '"').replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"').trim();
        }

        let airdate = "N/A";
        const fullDateMatch = html.match(/(?:Start\s*date|End\s*date|Année\s*de\s*sortie|Année|Release|Sortie|Year)[^<]*<\/h5>[\s\S]{1,150}?<div[^>]*class=["'][^"']*summary-content[^"']*["'][^>]*>\s*([^<]+?)\s*<\/div>/i);
        
        if (fullDateMatch && fullDateMatch[1]) { airdate = fullDateMatch[1].trim(); } 
        else {
            const yearFallback = html.match(/(?:Start\s*date|End\s*date|Année\s*de\s*sortie|Année|Release|Sortie|Year)[\s\S]{1,150}?\b(19\d{2}|20\d{2})\b/i);
            if (yearFallback && yearFallback[1]) { airdate = yearFallback[1]; } 
            else {
                const altMatch = html.match(/href=["'][^"']*(?:anime-release|release|year|\/annee\/)[^"']*["'][^>]*>\s*(19\d{2}|20\d{2})\s*<\/a>/i);
                if (altMatch && altMatch[1]) { airdate = altMatch[1]; }
            }
        }

        console.log(`[Détails] ✅ Description et année (${airdate}) récupérées.`);
        return JSON.stringify([{ description, aliases: "Voiranime", airdate }]);
    } catch (e) { 
        console.error(`[Détails] 🚨 Erreur :`, e);
        return JSON.stringify([{ description: "Erreur de chargement", aliases: "Voiranime", airdate: "N/A" }]); 
    }
}

// --- 3. ÉPISODES ---
async function extractEpisodes(url) {
    console.log(`[Episodes] 📂 Recherche des épisodes pour : ${url}`);
    try {
        const response = await soraFetch(url);
        let html = await response.text();
        let results = [];
        
        const epRegex = /<li class=["'][^"']*wp-manga-chapter[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            let epHref = match[1];
            let epTitle = match[2].replace(/<[^>]+>/g, '').trim();
            let numMatch = epTitle.match(/(?:Épisode|Episode|Ep|OAV)\s*(\d+)/i) || epHref.match(/-(\d+)(?:-vostfr|-vf)?\/?$/i);
            let epNumber = numMatch ? parseInt(numMatch[1]) : (results.length + 1);

            results.push({ href: epHref, title: epTitle, number: epNumber });
        }

        results.sort((a, b) => a.number - b.number);
        console.log(`[Episodes] ✅ ${results.length} épisodes trouvés.`);
        return JSON.stringify(results);
    } catch (e) { 
        console.error(`[Episodes] 🚨 Erreur :`, e);
        return JSON.stringify([]); 
    }
}

// --- 4. LECTEUR (Tracker Ultra Détaillé avec Console.log & Filemoon) ---
async function extractStreamUrl(url) {
    let extractionLogs = [];
    _fmPowBudget = FM_POW_BUDGET;   // reset du budget de minage local filemoon par extraction

    // Fonction Helper pour écrire en même temps dans la console et dans Supabase
    function logDebug(msg) {
        console.log(`[Extrait Vidéo] ${msg}`);
        extractionLogs.push(msg);
    }

    logDebug(`🎬 --- NOUVELLE EXTRACTION ---`);
    logDebug(`🌐 URL Cible : ${url}`);
    let startTime = Date.now();

    // Numéro d'épisode (pour les logs Supabase / alerte Discord). Formats: ...-N-vostfr/ ou episode-N.
    const _epM = String(url).split(/[?#]/)[0].match(/-(\d+)(?:-(?:vostfr|vf|va))?\/?$/i)
              || String(url).match(/(?:episode|ep)[-\/]?(\d+)/i);
    const epNumber = _epM ? parseInt(_epM[1]) : null;

    try {
        logDebug(`📡 Requête HTTP pour récupérer le code source de la page...`);
        const response = await soraFetch(url);
        const html = await response.text();
        logDebug(`✅ Code source récupéré (${html.length} octets).`);
        
        let streams = [];
        let embedUrls = [];
        let failedLinks = [];

        // 1️⃣ Recherche des iframes directes
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let match;
        while ((match = iframeRegex.exec(html)) !== null) {
            let iframeUrl = match[1];
            if (iframeUrl.startsWith('//')) iframeUrl = "https:" + iframeUrl;
            if (iframeUrl.startsWith('http') && !embedUrls.includes(iframeUrl)) embedUrls.push(iframeUrl);
        }
        logDebug(`🔍 Iframes directes trouvées : ${embedUrls.length}`);
        if(embedUrls.length > 0) logDebug(`↳ Liens : ${embedUrls.join(', ')}`);

        // 2️⃣ Recherche des redirections (data-redirect)
        const redirectRegex = /data-redirect=["']([^"']+\?host=[^"']+)["']/gi;
        let pagesToFetch = [];
        
        while ((match = redirectRegex.exec(html)) !== null) {
            let redirectUrl = match[1].replace(/&amp;/g, '&');
            if (redirectUrl.startsWith('/')) redirectUrl = BASE_URL + redirectUrl;
            if (!pagesToFetch.includes(redirectUrl)) pagesToFetch.push(redirectUrl);
        }
        logDebug(`🔄 Liens 'data-redirect' trouvés : ${pagesToFetch.length}`);

        if (pagesToFetch.length > 0) {
            logDebug(`⏳ Résolution des liens redirect...`);
            const pagesHtml = await Promise.all(
                pagesToFetch.map(async p => {
                    try {
                        let res = await soraFetch(p, { headers: { "Referer": url } });
                        return await res.text();
                    } catch (e) {
                        logDebug(`❌ Échec de résolution du redirect: ${p} - Erreur: ${e.message}`);
                        return "";
                    }
                })
            );

            for (let i = 0; i < pagesHtml.length; i++) {
                const pageSource = pagesHtml[i];
                const frameMatch = pageSource.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (frameMatch) {
                    let frameUrl = frameMatch[1];
                    if (frameUrl.startsWith('//')) frameUrl = "https:" + frameUrl;
                    if (frameUrl.startsWith('http') && !embedUrls.includes(frameUrl)) {
                        embedUrls.push(frameUrl);
                        logDebug(`✅ Nouvelle Iframe trouvée via redirect : ${frameUrl}`);
                    }
                }
            }
        }

        if (embedUrls.length === 0) {
            failedLinks.push({ server_name: "Extracteur Global", url: "Aucun lecteur détecté sur la page" });
            logDebug(`🛑 CRITIQUE : Aucun lecteur (iframe) n'a pu être extrait. Fin de l'extraction.`);
        }

        // --- TRAITEMENT DES LECTEURS ---
        for (let embedUrl of embedUrls) {
            let urlLower = embedUrl.toLowerCase();
            logDebug(`⚙️ Analyse du lecteur : ${embedUrl}`);

            // 🎛️ Skip si l'extracteur est désactivé dans EXTRACTORS
            const _exKey = extractorKeyForUrl(urlLower);
            if (_exKey && EXTRACTORS[_exKey] === false) {
                logDebug(`[MOTEUR] ⏭️ ${_exKey} désactivé (config EXTRACTORS) — ignoré.`);
                continue;
            }

            // --- MOTEUR FILEMOON / FILELIONS ---
            if (urlLower.includes("filemoon") || urlLower.includes("filelions") || urlLower.includes("alions") || urlLower.includes("weneverbeenfree")) {
                logDebug(`[MOTEUR] Sélection de Filemoon/Filelions`);
                try {
                    logDebug(`[Filemoon] Exécution de filemoonExtractor...`);
                    // 🌟 CORRECTION 1 : On passe l'URL parent (voir-anime.to/...) à l'extracteur
                    let fmResult = await filemoonExtractor(embedUrl, url, logDebug);
                    
                    if (fmResult && fmResult.url) {
                        let qLabel = fmResult.quality ? ` [${fmResult.quality}]` : "";
                        const typeStr = fmResult.url.includes(".m3u8") ? "HLS" : "MP4";
                        streams.push({ title: `Filemoon${qLabel} (${typeStr})`, streamUrl: fmResult.url, headers: fmResult.headers || { "Referer": embedUrl } });
                        logDebug(`[Filemoon] 🟢 SUCCÈS ! Flux final trouvé : ${fmResult.url}`);
                    } else if (typeof fmResult === 'string') {
                        const typeStr = fmResult.includes(".m3u8") ? "HLS" : "MP4";
                        streams.push({ title: `Filemoon (${typeStr})`, streamUrl: fmResult, headers: { "Referer": embedUrl } });
                        logDebug(`[Filemoon] 🟢 SUCCÈS ! Flux final trouvé : ${fmResult}`);
                    } else {
                        failedLinks.push({ server_name: "Filemoon (Lien Introuvable)", url: embedUrl });
                        logDebug(`[Filemoon] ❌ Aucun flux final généré.`);
                    }
                } catch (e) {
                    failedLinks.push({ server_name: "Filemoon (Crash)", url: embedUrl, error: e.message });
                    logDebug(`[Filemoon] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            // --- MOTEUR VOE ---
            else if (urlLower.includes("voe.sx") || urlLower.includes("voe.network") || urlLower.includes("voe") || urlLower.includes("lancewhosedifficult")) {
                logDebug(`[MOTEUR] Sélection de VOE`);
                try {
                    let voeRes = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL } });
                    if (voeRes) {
                        let voeHtml = await voeRes.text();
                        const redirectMatch = voeHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);
                        if (redirectMatch && redirectMatch[1]) {
                            logDebug(`[VOE] Redirection domain-hopping détectée : ${redirectMatch[1]}`);
                            voeRes = await soraFetch(redirectMatch[1], { headers: { "Referer": BASE_URL } });
                            voeHtml = await voeRes.text();
                        }
                        
                        logDebug(`[VOE] Tentative de décodage JSON...`);
                        const streamUrl = voeExtractor(voeHtml);
                        if (streamUrl) {
                            const typeStr = streamUrl.includes(".m3u8") ? "HLS" : "MP4";
                            streams.push({ title: `VOE (${typeStr})`, streamUrl: streamUrl, headers: { "Referer": embedUrl } });
                            logDebug(`[VOE] 🟢 SUCCÈS ! Flux final trouvé : ${streamUrl}`);
                        } else {
                            failedLinks.push({ server_name: "VOE (Décodage Échoué)", url: embedUrl });
                            logDebug(`[VOE] ❌ Échec du déchiffrement du script JSON.`);
                        }
                    } else {
                        failedLinks.push({ server_name: "VOE (Page inaccessible)", url: embedUrl });
                        logDebug(`[VOE] ❌ Page hors-ligne ou inaccessible.`);
                    }
                } catch(e) { 
                    failedLinks.push({ server_name: "VOE (Crash)", url: embedUrl, error: e.message }); 
                    logDebug(`[VOE] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            // --- MOTEUR STREAMTAPE ---
            else if (urlLower.includes("streamtape.com") || urlLower.includes("streamta.pe")) {
                logDebug(`[MOTEUR] Sélection de Streamtape`);
                try {
                    const stRes = await soraFetch(embedUrl);
                    const stHtml = await stRes.text();
                    
                    logDebug(`[Streamtape] Recherche du robotlink...`);
                    
                    let directUrl = null;
                    
                    // 🌟 L'ULTIME MÉTHODE : Streamtape met un FAUX lien dans la balise HTML pour piéger les bots (Erreur 500).
                    // Le VRAI lien est calculé en Javascript juste en dessous. On va exécuter ce calcul !
                    const robotLineMatch = stHtml.match(/document\.getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*([^;]+)/i);

                    if (robotLineMatch) {
                        let expression = robotLineMatch[1].trim();
                        logDebug(`[Streamtape] 🔬 Expression brute : ${expression}`);

                        try {
                            // ⚠️ PAS de new Function / eval : interdit par JavaScriptCore sur iOS (crash non catchable).
                            // On parse manuellement le pattern Streamtape : concaténation de littéraux string
                            // avec éventuel .substring(N) / .substr(N) sur l'un des morceaux.
                            // Ex : '//streamtape.com/get_video?id=xxx&expires=...' + ('abctoken').substring(3)
                            let tokenStr = "";
                            // Capture chaque terme : soit '...' , soit ('...').substring(N) / .substr(N)
                            const termRegex = /(?:\(\s*)?(['"])([^'"]*)\1(?:\s*\)\s*\.\s*(substring|substr)\s*\(\s*(\d+)\s*\))?/g;
                            let term;
                            let matchedAny = false;
                            while ((term = termRegex.exec(expression)) !== null) {
                                matchedAny = true;
                                let piece = term[2];
                                const fn = term[3];
                                const arg = term[4] !== undefined ? parseInt(term[4], 10) : null;
                                if (fn && arg !== null) {
                                    // substring(N) et substr(N) sans 2e argument sont équivalents ici (jusqu'à la fin)
                                    piece = piece.slice(arg);
                                }
                                tokenStr += piece;
                            }

                            if (matchedAny && tokenStr) {
                                // Nettoyage : le token peut commencer par un domaine partiel, '//', ou directement 'get_video'
                                let t = tokenStr.trim();
                                if (t.startsWith('http')) {
                                    directUrl = t;
                                } else if (t.startsWith('//')) {
                                    directUrl = 'https:' + t;
                                } else if (t.startsWith('streamtape') || t.includes('streamtape')) {
                                    // ex: 'streamtape.com/get_video...' -> https:// devant
                                    directUrl = 'https://' + t.replace(/^\/+/, '');
                                } else {
                                    // ex: 'get_video?id=...' ou '/get_video?...' -> on préfixe le domaine
                                    directUrl = 'https://streamtape.com/' + t.replace(/^\/+/, '');
                                }
                                // Garde-fou : corriger les TLD mal recomposés (streamtape.cdom, .ccom, etc.)
                                directUrl = directUrl.replace(/streamtape\.[a-z]*dom/gi, 'streamtape.com')
                                                     .replace(/streamtape\.c+om/gi, 'streamtape.com');
                                logDebug(`[Streamtape] Lien calculé (parsing manuel, sans eval).`);
                            } else {
                                logDebug(`[Streamtape] ⚠️ Expression non reconnue par le parser manuel.`);
                            }
                        } catch(err) {
                            logDebug(`[Streamtape] ⚠️ Erreur de parsing : ${err.message}`);
                        }
                    }

                    if (directUrl) {
                        if (!directUrl.includes("&stream=1")) directUrl += "&stream=1";
                        
                        logDebug(`[Streamtape] Lien intermédiaire reconstruit : ${directUrl}`);
                        logDebug(`[Streamtape] 🔄 Suivi de la redirection (Location) vers le fichier MP4...`);

                        // 🌟 2. On fait un "HEAD" pour suivre le statut 302 et capturer le lien final tapecontent
                        try {
                            const redirectReq = await soraFetch(directUrl, {
                                headers: { "Referer": embedUrl, "User-Agent": "Mozilla/5.0" },
                                method: "HEAD"
                            });
                            
                            if (redirectReq && redirectReq.url && redirectReq.url !== directUrl) {
                                directUrl = redirectReq.url;
                                logDebug(`[Streamtape] 🟢 SUCCÈS ! Lien MP4 direct obtenu : ${directUrl.substring(0, 40)}...`);
                            } else {
                                logDebug(`[Streamtape] ⚠️ Redirection non suivie, utilisation du lien intermédiaire.`);
                            }
                        } catch(e) {
                            logDebug(`[Streamtape] ⚠️ Erreur lors du suivi de la redirection, on garde le lien intermédiaire.`);
                        }

                        const typeStr = directUrl.includes(".m3u8") ? "HLS" : "MP4";
                        streams.push({ 
                            title: `Streamtape (${typeStr})`, 
                            streamUrl: directUrl, 
                            headers: { "Referer": "https://streamtape.com/", "User-Agent": "Mozilla/5.0" } 
                        });
                    } else {
                        failedLinks.push({ server_name: "Streamtape (Robotlink Introuvable)", url: embedUrl });
                        logDebug(`[Streamtape] ❌ Script robotlink introuvable (Anti-bot modifié).`);
                    }
                } catch (e) { 
                    failedLinks.push({ server_name: "Streamtape (Crash)", url: embedUrl, error: e.message });
                    logDebug(`[Streamtape] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            // --- MOTEUR VIDMOLY ---
            else if (urlLower.includes("vidmoly")) {
                logDebug(`[MOTEUR] Sélection de Vidmoly`);
                try {
                    const vidRes = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL } });
                    const vidHtml = await vidRes.text();
                    const fileMatch = vidHtml.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                    
                    if (fileMatch) {
                        const typeStr = fileMatch[1].includes(".m3u8") ? "HLS" : "MP4";
                        streams.push({ 
                            title: `Vidmoly (${typeStr})`, 
                            streamUrl: fileMatch[1], 
                            headers: { "Referer": "https://vidmoly.to/", "Origin": "https://vidmoly.to" } 
                        });
                        logDebug(`[Vidmoly] 🟢 SUCCÈS ! Flux final trouvé : ${fileMatch[1]}`);
                    } else {
                        failedLinks.push({ server_name: "Vidmoly (Lien Introuvable)", url: embedUrl });
                        logDebug(`[Vidmoly] ❌ Aucun lien M3U8/MP4 détecté.`);
                    }
                } catch (e) {
                    failedLinks.push({ server_name: "Vidmoly (Crash)", url: embedUrl, error: e.message });
                    logDebug(`[Vidmoly] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            // --- MOTEUR F16PX / STREAMHIDE ---
            else if (urlLower.includes("streamhide") || urlLower.includes("vidhide") || urlLower.includes("luluvdo")) {
                logDebug(`[MOTEUR] Sélection de Streamhide / F16px`);
                try {
                    const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL } });
                    logDebug(`[Streamhide] Exécution de vidhideExtractor...`);
                    let streamUrl = vidhideExtractor(await req.text()); 
                    if (streamUrl) {
                        const typeStr = streamUrl.includes(".m3u8") ? "HLS" : "MP4";
                        streams.push({ title: `Streamhide (${typeStr})`, streamUrl: streamUrl, headers: { "Referer": embedUrl, "User-Agent": "Mozilla/5.0" } });
                        logDebug(`[Streamhide] 🟢 SUCCÈS ! Flux final trouvé : ${streamUrl}`);
                    } else {
                        failedLinks.push({ server_name: "Streamhide/F16px (Protégé ou Mort)", url: embedUrl });
                        logDebug(`[Streamhide] ❌ Impossible d'extraire la vidéo (peut-être DMCA/Supprimé).`);
                    }
                } catch(e) { 
                    failedLinks.push({ server_name: "Streamhide (Crash)", url: embedUrl, error: e.message }); 
                    logDebug(`[Streamhide] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            // --- MOTEUR YOURUPLOAD ---
            else if (urlLower.includes("yourupload")) {
                logDebug(`[MOTEUR] Sélection de YourUpload`);
                try {
                    const yuRes = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL } });
                    const yuHtml = await yuRes.text();
                    const yuMatch = yuHtml.match(/property=["']og:video["'][^>]+content=["']([^"']+)["']/i) || yuHtml.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i);
                    
                    if (yuMatch) {
                        let initialStreamUrl = yuMatch[1];
                        let finalStreamUrl = initialStreamUrl;
                        try {
                            logDebug(`[YourUpload] Vérification de la redirection finale (HEAD request)...`);
                            const redirectReq = await soraFetch(initialStreamUrl, { headers: { "Referer": embedUrl, "User-Agent": "Mozilla/5.0" }, method: "HEAD" });
                            if (redirectReq && redirectReq.url && redirectReq.url !== initialStreamUrl) {
                                finalStreamUrl = redirectReq.url;
                            }
                        } catch(e) {}
                        streams.push({ title: "YourUpload (MP4)", streamUrl: finalStreamUrl, headers: { "Referer": embedUrl, "Origin": "https://www.yourupload.com", "User-Agent": "Mozilla/5.0" } });
                        logDebug(`[YourUpload] 🟢 SUCCÈS ! Lien MP4 généré.`);
                    } else {
                        failedLinks.push({ server_name: "YourUpload (Fichier Introuvable)", url: embedUrl });
                        logDebug(`[YourUpload] ❌ Code HTML ne contient aucun lien vidéo valide.`);
                    }
                } catch(e) { 
                    failedLinks.push({ server_name: "YourUpload (Crash)", url: embedUrl, error: e.message }); 
                    logDebug(`[YourUpload] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            // --- MOTEUR SIBNET ---
            else if (urlLower.includes("sibnet")) {
                logDebug(`[MOTEUR] Sélection de Sibnet`);
                try {
                    const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL }, encoding: "windows-1251" });
                    const sibHtml = await req.text();
                    const mp4Match = sibHtml.match(/player\.src\s*\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/i) || sibHtml.match(/src:\s*["'](\/v\/[^"']+\.mp4)[^"']*["']/i);
                    if (mp4Match) {
                        let directUrl = mp4Match[1].startsWith("http") ? mp4Match[1] : "https://video.sibnet.ru" + mp4Match[1];
                        streams.push({ title: "Sibnet (MP4)", streamUrl: directUrl, headers: { "Referer": embedUrl, "User-Agent": "Mozilla/5.0" } });
                        logDebug(`[Sibnet] 🟢 SUCCÈS ! Flux MP4 trouvé.`);
                    } else {
                        failedLinks.push({ server_name: "Sibnet (MP4 Introuvable)", url: embedUrl });
                        logDebug(`[Sibnet] ❌ Aucun MP4 détecté dans le code source Windows-1251.`);
                    }
                } catch (e) { 
                    failedLinks.push({ server_name: "Sibnet (Crash)", url: embedUrl, error: e.message });
                    logDebug(`[Sibnet] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            // --- MOTEUR MAIL.RU ---
            else if (urlLower.includes("my.mail.ru")) {
                logDebug(`[MOTEUR] Sélection de Mail.ru`);
                try {
                    // L'URL ressemble à https://my.mail.ru/video/embed/7427523657800355959
                    const idMatch = embedUrl.match(/video\/embed\/(.+)/i);
                    if (idMatch && idMatch[1]) {
                        const videoId = idMatch[1];
                        const apiRes = await soraFetch(`https://my.mail.ru/+/video/meta/${videoId}`);
                        
                        if (apiRes) {
                            const apiJson = JSON.parse(await apiRes.text());
                            
                            if (apiJson && apiJson.videos && apiJson.videos.length > 0) {
                                for (let vid of apiJson.videos) {
                                    let directUrl = vid.url.startsWith('//') ? "https:" + vid.url : vid.url;
                                    const typeStr = directUrl.includes(".m3u8") ? "HLS" : "MP4";
                                    streams.push({ 
                                        title: `Mail.ru [${vid.key}] (${typeStr})`, 
                                        streamUrl: directUrl, 
                                        headers: { "Referer": "https://my.mail.ru/", "User-Agent": "Mozilla/5.0" } 
                                    });
                                }
                                logDebug(`[Mail.ru] 🟢 SUCCÈS ! Flux MP4 trouvé(s).`);
                            } else {
                                failedLinks.push({ server_name: "Mail.ru (API Vide)", url: embedUrl });
                                logDebug(`[Mail.ru] ❌ Aucun lien dans l'API de Mail.ru.`);
                            }
                        }
                    } else {
                        failedLinks.push({ server_name: "Mail.ru (ID Invalide)", url: embedUrl });
                        logDebug(`[Mail.ru] ❌ ID de vidéo introuvable dans l'URL.`);
                    }
                } catch (e) {
                    failedLinks.push({ server_name: "Mail.ru (Crash)", url: embedUrl, error: e.message });
                    logDebug(`[Mail.ru] 🚨 ERREUR CRITIQUE : ${e.message}`);
                }
            }
            else {
                logDebug(`[MOTEUR] ⚠️ Lecteur Inconnu : ${embedUrl}. Scan approfondi du code source...`);
                try {
                    const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL } });
                    const htmlContent = await req.text();
                    
                    // 🌟 DÉTECTION INTELLIGENTE : Recherche de la signature Filemoon cachée
                    if (htmlContent.includes("Byse Frontend")) {
                        if (EXTRACTORS.filemoon === false) {
                            logDebug(`[MOTEUR] ⏭️ Clone Filemoon (Byse) détecté mais filemoon désactivé — ignoré.`);
                        } else {
                        logDebug(`[MOTEUR] 🟢 Signature "Byse Frontend" détectée ! Clone Filemoon identifié.`);
                        try {
                            let fmResult = await filemoonExtractor(embedUrl, url, logDebug);
                            if (fmResult && fmResult.url) {
                                let qLabel = fmResult.quality ? ` [${fmResult.quality}]` : "";
                                const typeStr = fmResult.url.includes(".m3u8") ? "HLS" : "MP4";
                                streams.push({ title: `Filemoon Clone${qLabel} (${typeStr})`, streamUrl: fmResult.url, headers: fmResult.headers || { "Referer": embedUrl } });
                                logDebug(`[Filemoon Clone] 🟢 SUCCÈS ! Flux final trouvé : ${fmResult.url}`);
                            } else if (typeof fmResult === 'string') {
                                const typeStr = fmResult.includes(".m3u8") ? "HLS" : "MP4";
                                streams.push({ title: `Filemoon Clone (${typeStr})`, streamUrl: fmResult, headers: { "Referer": embedUrl } });
                                logDebug(`[Filemoon Clone] 🟢 SUCCÈS ! Flux final trouvé : ${fmResult}`);
                            } else {
                                failedLinks.push({ server_name: "Filemoon Clone (Lien Introuvable)", url: embedUrl });
                                logDebug(`[Filemoon Clone] ❌ Aucun flux final généré.`);
                            }
                        } catch (e) {
                            failedLinks.push({ server_name: "Filemoon Clone (Crash)", url: embedUrl, error: e.message });
                            logDebug(`[Filemoon Clone] 🚨 ERREUR CRITIQUE : ${e.message}`);
                        }
                        } // fin du else (EXTRACTORS.filemoon activé)
                    } else {
                        failedLinks.push({ server_name: "Lecteur Non Supporté", url: embedUrl });
                        logDebug(`[MOTEUR] ❌ Hôte non pris en charge définitivement.`);
                    }
                } catch(e) {
                    failedLinks.push({ server_name: "Lecteur Non Supporté (Erreur Scan)", url: embedUrl });
                    logDebug(`[MOTEUR] ⚠️ Impossible de scanner le code source.`);
                }
            }
        }

        // Filtration des résultats finaux
        let safeStreams = streams.filter(s => 
            s.streamUrl.includes('.mp4') || 
            s.streamUrl.includes('.m3u8') || 
            s.streamUrl.includes('streamtape.com')
        );
        
        let uniqueStreams = [];
        let seenUrls = new Set();
        for (let s of safeStreams) {
            if (!seenUrls.has(s.streamUrl)) { seenUrls.add(s.streamUrl); uniqueStreams.push(s); }
        }

        let totalTime = Date.now() - startTime;
        logDebug(`🏁 FIN DE L'EXTRACTION (${totalTime}ms). Serveurs valides retenus : ${uniqueStreams.length}`);

        // 📡 Logs vers Supabase pour l'historique
        if (failedLinks.length > 0) {
            sendSupabaseLog("VoirAnime", "UNSUPPORTED_HOSTS", { 
                media_url: url,
                media_path: url,
                ep_number: epNumber,
                failed_count: failedLinks.length,
                failed_links: failedLinks,
                execution_time_ms: totalTime,
                extraction_logs: extractionLogs
            });
        }

        if (uniqueStreams.length > 0) {
            sendSupabaseLog("VoirAnime", "PLAYER", { 
                media_url: url,
                media_path: url,
                ep_number: epNumber,
                streams_found: uniqueStreams.length,
                servers: uniqueStreams.map(s => ({ nom: s.title, lien: s.streamUrl })),
                execution_time_ms: totalTime,
                extraction_logs: extractionLogs
            });
            // Format conforme au guide Sora : { streams: [{title, streamUrl, headers}], subtitles }
            // (l'ancien { type: "servers", ... } n'était pas reconnu par le host -> 0 sources)
            return JSON.stringify({ streams: uniqueStreams, subtitles: "" });
        } else {
            return JSON.stringify({ streams: [], subtitles: "" });
        }

    } catch (e) {
        logDebug(`💥 CRASH GLOBAL DE L'EXTRACTEUR : ${e.message}`);
        sendSupabaseLog("VoirAnime", "ERROR", { media_path: url, error_message: String(e), extraction_logs: extractionLogs });
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

// =====================================================================
// OUTILS DE DÉCODAGE & FETCH
// =====================================================================

// --- SORA FETCH ---
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

// --- FILEMOON EXTRACTOR ---
// 🌟 CORRECTION 2 : Ajout du paramètre parentUrl pour la double vérification
// ============================================================================
//  FILEMOON — flux complet vérifié (porté de nakanime/movix, 2026-06)
//  details -> challenge -> (worker ECDSA) attest -> captcha -> PoW (worker+fallback)
//  -> verify -> playback (X-Embed-* + X-Captcha-Token) -> AES-256-GCM LOCAL (pur-JS).
//  Plus aucune dépendance à api.jm26.net.
// ============================================================================
const FM_ATTEST = "https://filemoon-attest.kurzmathis4.workers.dev/attest"; // worker ECDSA (signature)
const FM_POW    = "https://filemoon-attest.kurzmathis4.workers.dev/pow";    // worker PoW (mine côté serveur, fallback local)
const FM_UA     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// --- PoW : hash maison style ChaCha (PAS SHA256) ---
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
function _fmSolve(nonce, diff) {
    if (diff <= 0) return "0";
    const o = nonce + ":"; let s = 0;
    for (; s < 8000000; s++) { if (_fmWr(_fmGr(_fmYr(o + s))) >= diff) return String(s); }
    return null;
}
const FM_POW_BUDGET = 2;
let _fmPowBudget = FM_POW_BUDGET;
// PoW : worker d'abord (mine côté serveur, pas de gel), fallback local budgété si échec.
async function _fmSolvePoW(nonce, diff) {
    if (diff <= 0) return "0";
    try {
        const r = await soraFetch(FM_POW, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce: nonce, difficulty: diff }) });
        if (r) {
            const j = JSON.parse(await r.text());
            if (j && j.solution !== undefined && j.solution !== null && String(j.solution) !== "") return String(j.solution);
        }
    } catch (e) {}
    if (_fmPowBudget <= 0) return "0";
    _fmPowBudget--;
    return _fmSolve(nonce, diff);
}

// --- Déchiffrement AES-256-GCM 100% local ---
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
// base64url 100% pur-JS (l'atob d'iOS est inconstant)
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
    const out = new Uint8Array(total); let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}
// AES-256 (chiffrement) + déchiffrement GCM via CTR (sans vérif du tag). Pur JS. Validé 50/50 vs crypto.subtle.
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
    } catch (e) { return null; }
}

async function filemoonExtractor(url, parentUrl, logFn = console.log) {
    if (typeof parentUrl === 'function') { logFn = parentUrl; parentUrl = `${BASE_URL}/`; }
    else if (!parentUrl) { parentUrl = `${BASE_URL}/`; }
    const log = (m) => logFn(`[FM-Core] ${m}`);
    try {
        const embedUrl = url;
        const videoId = (embedUrl.match(/\/(?:[eo]\w+|[de])\/([a-zA-Z0-9]+)/) || [])[1];
        if (!videoId) { log(`❌ Aucun ID dans l'URL`); return null; }
        let host = (embedUrl.match(/https?:\/\/([^/]+)/) || [])[1];
        let frame = embedUrl;
        const base = { "User-Agent": FM_UA, "Accept": "application/json", "Origin": `https://${host}`, "Referer": `https://${host}/` };
        const embedHost = BASE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

        // 1) details -> domain hop + frame url
        try {
            const r = await soraFetch(`https://${host}/api/videos/${videoId}/embed/details`, { headers: base });
            const j = JSON.parse(await r.text());
            if (j.embed_frame_url) { const h = j.embed_frame_url.match(/https?:\/\/([^/]+)/); if (h && h[1] !== host) { host = h[1]; frame = j.embed_frame_url; base.Origin = `https://${host}`; base.Referer = `https://${host}/`; } }
        } catch (e) {}

        // 2) challenge
        const cr = await soraFetch(`https://${host}/api/videos/access/challenge`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ video_code: videoId }) });
        const cj = JSON.parse(await cr.text());
        if (!cj.challenge_id || !cj.nonce) { log(`❌ challenge`); return null; }

        // 3) worker (ECDSA) + attest -> fingerprint
        const wr = await soraFetch(FM_ATTEST, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce: cj.nonce, challenge_id: cj.challenge_id }) });
        const wj = JSON.parse(await wr.text());
        if (!wj.signature) { log(`❌ worker`); return null; }
        const ar = await soraFetch(`https://${host}/api/videos/access/attest`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ viewer_id: wj.viewer_id, device_id: wj.device_id, challenge_id: cj.challenge_id, nonce: cj.nonce, signature: wj.signature, public_key: wj.public_key, client: wj.client, storage: {}, attributes: { entropy: "high" } }) });
        const aj = JSON.parse(await ar.text());
        if (!aj.token) { log(`❌ attest`); return null; }
        const fp = { token: aj.token, viewer_id: aj.viewer_id || wj.viewer_id, device_id: aj.device_id || wj.device_id, confidence: aj.confidence || 0.6 };

        // 4) captcha (PoW)
        const capR = await soraFetch(`https://${host}/api/videos/${videoId}/embed/captcha`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ fingerprint: fp }) });
        const cap = JSON.parse(await capR.text());
        let verifyToken = null;
        if (cap.pow_nonce && cap.pow_difficulty && cap.pow_token) {
            // 5) PoW (worker, fallback local) + verify
            const solution = await _fmSolvePoW(cap.pow_nonce, cap.pow_difficulty);
            if (!solution || solution === "0") { log(`⏭️ PoW non résolu`); return null; }
            const vr = await soraFetch(`https://${host}/api/videos/${videoId}/embed/captcha/verify`, { headers: { ...base, "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ pow_token: cap.pow_token, solution, fingerprint: fp }) });
            const vj = JSON.parse(await vr.text());
            verifyToken = vj.token;
            if (!verifyToken) { log(`❌ PoW refusé`); return null; }
        }

        // 6) playback (X-Embed-* : on se présente comme embarqué par voir-anime)
        const pbHeaders = {
            "User-Agent": FM_UA, "Accept": "*/*", "Content-Type": "application/json",
            "Origin": `https://${host}`, "Referer": frame,
            "Cookie": `byse_viewer_id=${fp.viewer_id}; byse_device_id=${fp.device_id}`,
            "X-Embed-Origin": embedHost,
            "X-Embed-Referer": `${BASE_URL}/`,
            "X-Embed-Parent": embedUrl
        };
        if (verifyToken) pbHeaders["X-Captcha-Token"] = verifyToken;
        const pb = await soraFetch(`https://${host}/api/videos/${videoId}/embed/playback`, { headers: pbHeaders, method: "POST", body: JSON.stringify({ fingerprint: fp }) });
        const pbt = await pb.text();
        if (!pbt.includes("playback")) { log(`❌ playback: ${pbt.slice(0, 70)}`); return null; }
        const pj = JSON.parse(pbt).playback;

        // 7) déchiffrage AES-GCM 100% LOCAL
        const decrypted = _fmDecryptPlayback(pj);
        if (decrypted && Array.isArray(decrypted.sources) && decrypted.sources.length) {
            const best = decrypted.sources.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (best && best.url) {
                log(`🟢 Flux final trouvé !`);
                return { url: best.url, quality: best.label || best.height || "HD", headers: { "Referer": `https://${host}/`, "Origin": `https://${host}` } };
            }
        }
        log(`❌ déchiffrage vide`);
    } catch (error) { log(`🚨 ${error.message}`); }
    return null;
}

// --- AUTRES EXTRACTEURS ---
function voeExtractor(html) {
    try {
        const jsonScriptMatch = html.match(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
        if (!jsonScriptMatch) return null;

        const obfuscatedJson = jsonScriptMatch[1].trim();
        let data;
        try { data = JSON.parse(obfuscatedJson); } catch (e) { return null; }
        
        if (!Array.isArray(data) || typeof data[0] !== "string") return null;
        
        let obfuscatedString = data[0];
        let step1 = voeRot13(obfuscatedString);
        let step2 = voeRemovePatterns(step1);
        let step3 = voeBase64Decode(step2);
        let step4 = voeShiftChars(step3, 3);
        let step5 = step4.split("").reverse().join("");
        let step6 = voeBase64Decode(step5);

        try { step6 = decodeURIComponent(escape(step6)); } catch(e) {}

        let result;
        try { result = JSON.parse(step6); } catch (e) { return null; }

        if (result && typeof result === "object") {
            let streamUrl = result.source;
            if (!streamUrl && result.source && Array.isArray(result.source)) {
                let found = result.source.find(url => url && url.source && url.source.startsWith("http"));
                if(found) streamUrl = found.source;
            }
            if (!streamUrl) {
                const stringified = JSON.stringify(result);
                const m3u8Match = stringified.match(/https?:\/\/[^"]+\.m3u8[^"]*/i);
                if (m3u8Match) streamUrl = m3u8Match[0];
            }
            if (streamUrl) return streamUrl;
        }
        return null;
    } catch(err) { return null; }
}

function voeRot13(str) {
    return str.replace(/[a-zA-Z]/g, function (c) {
        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

function voeRemovePatterns(str) {
    const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
    let result = str;
    for (const pat of patterns) { result = result.split(pat).join(""); }
    return result;
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
    return str.split("").map((c) => String.fromCharCode(c.charCodeAt(0) - shift)).join("");
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
                        while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
                        let unpackedMatch = p.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
                        if (unpackedMatch) { videoUrl = unpackedMatch[1]; break; }
                    }
                }
            }
        }
        return videoUrl ? videoUrl.replace(/\\\//g, "/").trim() : null;
    } catch (e) { return null; }
}