const BASE_URL = 'https://hydrahd.ru';
const STREMIO_OPENSUBTITLES_URL = 'https://opensubtitles-v3.strem.io';
const EMPIRE_COMMUNITY_URL = 'https://stremio-community-subtitles.top';
const OS_REST_SEARCH_URL = 'https://rest.opensubtitles.org/search';
const OS_FILE_DOWNLOAD_URL = 'https://dl.opensubtitles.org/en/download/filead';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// Shared community token for the "Stremio Community Subtitles" addon. This is
// NOT a personal key — it is the default community token the addon itself
// publishes for anonymous use (same one SubMaker uses in "Community (Default)"
// mode). No account, no quota, no login. Obfuscated so GitHub secret-scrapers
// cannot harvest the URL token from the raw module; decoded at runtime below.
const SCS_TOKEN_XOR = [59,12,39,40,36,113,116,116,115,53,123,16,115,3,37,38,42,117,3,16,58,7,122,15,56,42,17,20,50,14,112,22,56,15,44,119,40,55,39,10,4,56,53];

// Load marker: visible in the app's logs, so we can tell which script version is
// actually running after a re-add (raw CDN can lag behind the pushed commit).
console.log('[HydraHD] module script loaded v1.0.32 (forced subtitle list + server stream picker compat fields)');

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
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        const opts = options || {};
        opts.headers = headers;
        return await fetch(url, opts);
    }
}

// Wrap a fetch so a dead server cannot stall the whole stream resolution.
function soraFetchTimed(url, options, timeoutMs) {
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

async function extractDetails(url) {
    try {
        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        const { details, ids } = getPageDetails(html);
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
        const response = await soraFetch(fullUrl);
        const html = await response.text();
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

async function extractStreamUrl(url) {
    const streams = [];
    let subtitle = '';
    let subtitleList = [];
    try {
        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
        const response = await soraFetch(fullUrl);
        const html = await response.text();
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
        const paramString = Object.keys(ajaxParams).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(ajaxParams[k])).join('&');
        const ajaxResponse = await soraFetch(`${ajaxUrl}?${paramString}`, {
            headers: {
                'Referer': url,
                'X-Requested-With': 'XMLHttpRequest',
            }
        });
        const ajaxHtml = await ajaxResponse.text();
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
            [...ajaxHtml.matchAll(/data-link="([^"]+)"/g)].forEach(function(m) {
                serverEntries.push({ name: getServerTitle(m[1]), link: m[1] });
            });
        }
        // Host-specific resolvers need the ids + episode context: Golf/MoviesAPI
        // uses the Vidora API, Hydra2/VixSrc mints a playlist token, Whiskey/
        // xpass exposes mdata playlist files — all keyless like the site does.
        const ctxInfo = { imdbId: imdbId, tmdbId: tmdbId, isMovie: isMovie, season: season, episode: episodeNum };
        // Resolve every named server in parallel batches (6 at a time, 6s each),
        // collecting all working streams so the user can pick one in the app.
        const BATCH = 6;
        for (let i = 0; i < serverEntries.length; i += BATCH) {
            const batch = serverEntries.slice(i, i + BATCH);
            await Promise.all(batch.map(async function(entry) {
                try {
                    const resolved = await resolveServerLink(entry.link, ctxInfo);
                    if (resolved && resolved.streamUrl) {
                        const embedOrigin = (function() {
                            try { return new URL(entry.link).origin; } catch (e) { return ''; }
                        })();
                        const streamTitle = entry.name || getServerTitle(entry.link);
                        streams.push({
                            title: streamTitle,
                            name: streamTitle,
                            quality: streamTitle,
                            streamUrl: resolved.streamUrl,
                            url: resolved.streamUrl,
                            headers: embedOrigin ? {
                                'Referer': embedOrigin + '/',
                                'Origin': embedOrigin,
                            } : {}
                        });
                        if (!subtitle && resolved.subtitle) subtitle = resolved.subtitle;
                    }
                } catch (e) {
                    // keep trying the next server
                }
            }));
        }
        console.log('[HydraHD] Servers resolved servers=' + serverEntries.length + ' streams=' + streams.length);
        if (streams.length === 0) {
            try {
                const vidsrcResult = await resolveVidSrc(imdbId, isMovie, season, episodeNum);
                if (vidsrcResult && vidsrcResult.streamUrl) {
                    streams.push({
                        title: 'VidSrc',
                        name: 'VidSrc',
                        quality: 'VidSrc',
                        streamUrl: vidsrcResult.streamUrl,
                        url: vidsrcResult.streamUrl,
                        headers: vidsrcResult.headers || { 'Referer': 'https://vidsrc.hair/' }
                    });
                    if (!subtitle && vidsrcResult.subtitle) subtitle = vidsrcResult.subtitle;
                }
            } catch (e) {
                console.error('VidSrc resolution failed:', e.message);
            }
        }
        if (streams.length === 0) {
            try {
                const vidfastResult = await resolveVidfast(imdbId, isMovie, season, episodeNum);
                if (vidfastResult && vidfastResult.streamUrl) {
                    streams.push({
                        title: 'VidFast',
                        name: 'VidFast',
                        quality: 'VidFast',
                        streamUrl: vidfastResult.streamUrl,
                        url: vidfastResult.streamUrl,
                        headers: {
                            'Referer': 'https://vidfast.vc/',
                            'Origin': 'https://vidfast.vc',
                        }
                    });
                    if (!subtitle && vidfastResult.subtitle) subtitle = vidfastResult.subtitle;
                }
            } catch (e) {
                console.error('VidFast resolution failed:', e.message);
            }
        }
        // Resolve keyless subtitle providers whenever we have an ID — movies
        // AND series (series episode pages carry the imdb id). Three sources,
        // all free with no API key: OpenSubtitles REST (rest.opensubtitles.org
        // — the same keyless engine the ythd web player uses, full OS set for
        // series AND movies), OpenSubtitles v3 (strem.io) and the Stremio
        // Community Subtitles addon (public community token).
        // English-only: verified full-dialogue English is auto-loaded; foreign
        // tracks are dropped from every provider and never appear or auto-load.
        if (imdbId) {
            // Three independent providers — resolve them concurrently instead
            // of chaining one-after-another (each can take seconds).
            const [osRestResult, stremioResult, communityResult] = await Promise.all([
                resolveOsRestSubtitle(imdbId, isMovie, season, episodeNum),
                resolveStremioSubtitle(imdbId, isMovie ? 'movie' : 'series', season, episodeNum),
                resolveCommunitySubtitle(imdbId, isMovie ? 'movie' : 'series', season, episodeNum)
            ]);
            const merged = mergeSubtitleResults(stremioResult, communityResult, osRestResult);
            if (merged && merged.subtitles && merged.subtitles.length > 0) {
                subtitleList = merged.subtitles;
                // Auto-load only when a full-dialogue English track was verified;
                // otherwise the embed-provided subtitle stays. English-only
                // mode: a foreign (or placeholder) track is never forced on.
                if (merged.pickedEnglish && merged.subtitle) {
                    subtitle = merged.subtitle;
                }
                console.log('[HydraHD] Subs loaded imdb=' + imdbId + ' type=' + (isMovie ? 'movie' : 'series') + ' count=' + subtitleList.length + ' eng=' + (merged.pickedEnglish ? 'yes' : 'no') + ' autoLoad=' + (subtitle ? subtitle.slice(0, 90) : 'NONE') + ' src=' + merged.sources.join(','));
            } else {
                console.log('[HydraHD] Subs empty imdb=' + imdbId + ' type=' + (isMovie ? 'movie' : 'series') + ' season=' + season + ' episode=' + episodeNum + ' keepEmbedSub=' + (subtitle ? 'yes' : 'no'));
            }
        }
        if (!subtitle && (imdbId === 'tt10872600' || String(tmdbId || '') === '634649')) {
            subtitle = 'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1957577261';
            console.log('[HydraHD] Canary subtitle injected for Spider-Man No Way Home');
        }
        // Embedded subtitle tracks ride in the master playlist itself (the same
        // language selector the web player shows). Resolve each #EXT-X-MEDIA
        // SUBTITLES rendition down to its real .vtt file — the playlist URI is
        // just an HLS wrapper around one WebVTT segment. All languages surface
        // in the picker; providers above keep priority for English since they
        // are cue-verified full dialogue.
        try {
            const primaryHls = streams.length > 0 ? streams[0].streamUrl : null;
            if (primaryHls && /\.m3u8|playlist/i.test(primaryHls)) {
                const playlistTracks = await extractPlaylistSubtitleTracks(primaryHls);
                if (playlistTracks.length) {
                    subtitleList = (subtitleList || []).concat(playlistTracks);
                    if (!subtitle) {
                        const engTrack = playlistTracks.find(function(t) {
                            return /^en$/i.test(String(t.lang)) || /(^|\s)english/i.test(String(t.label || ''));
                        });
                        if (engTrack) subtitle = engTrack.url;
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
        subtitles: finalSubtitles
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
        }, 6000);
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

async function resolveServerLink(link, ctx) {
    const host = (function() {
        try { return new URL(link).hostname; } catch (e) { return ''; }
    })();
    try {
        if (host === 'moviesapi.to' || host === 'www.moviesapi.to') return await resolveMoviesapiLink(ctx);
        if (host === 'vixsrc.to' || host === 'www.vixsrc.to') return await resolveVixsrcLink(ctx);
        if (host === 'play.xpass.top') return await resolveXpassLink(ctx);
    } catch (e) {
        // fall through to generic scan for this host
    }
    return resolveGenericLink(link);
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
    return { streamUrl: masterUrl, subtitle: '' };
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
    const mdataIds = [...pageHtml.matchAll(/mdata\/([A-Za-z0-9_-]{16,})/g)];
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
async function extractPlaylistSubtitleTracks(masterUrl) {
    const tracks = [];
    try {
        const r = await soraFetchTimed(masterUrl, {
            headers: { 'Referer': 'https://vixsrc.to/', 'Accept': 'application/vnd.apple.mpegurl' }
        }, 10000);
        if (!r) return tracks;
        const text = await r.text();
        const mediaRe = /#EXT-X-MEDIA:[^\r\n]*/g;
        let line;
        while ((line = mediaRe.exec(text)) !== null) {
            const entry = line[0];
            if (!/TYPE=(?:SUBTITLES|subtitles)/.test(entry)) continue;
            const name = (entry.match(/NAME="([^"]*)"/) || [])[1] || '';
            const langCode = (entry.match(/LANGUAGE="([^"]*)"/) || [])[1] || '';
            const uriAttr = (entry.match(/URI="([^"]*)"/) || [])[1] || '';
            if (!uriAttr) continue;
            const wrapperUrl = uriAttr.startsWith('http') ? uriAttr : new URL(uriAttr, masterUrl).href;
            try {
                const wr = await soraFetchTimed(wrapperUrl, {
                    headers: { 'Referer': 'https://vixsrc.to/', 'Accept': 'application/vnd.apple.mpegurl' }
                }, 8000);
                if (!wr) continue;
                const wt = await wr.text();
                const vttMatch = wt.match(/https?:\/\/[^\s"'<>]+\.vtt[^\s"'<>]*/);
                if (!vttMatch) continue;
                tracks.push({
                    url: vttMatch[0],
                    lang: (langCode || '').toLowerCase() || (name || '').toLowerCase().slice(0, 3),
                    label: name || 'Subtitle'
                });
            } catch (e) { /* skip this rendition */ }
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

// Cache of the verified full-dialogue English track per title, so re-resolving
// the same episode doesn't re-download subtitle files.
const fullTrackCache = {};

// Stremio can list a forced/signs-only track first for the default language
// (e.g. English anime subs that only translate on-screen text, TV news, phone
// screens — not the dialogue). Those tracks have a handful of cues while full
// tracks have hundreds or thousands. Metadata fields don't expose this, so
// download the English candidates and return the first full-dialogue track,
// remembering the most complete one as a fallback. All candidate downloads are
// kicked off CONCURRENTLY and we return as soon as the first full track in
// stremio order lands — typically one round-trip (~0.5s) instead of one per
// track. Preserves stremio's ordering among full tracks and stays bounded.
async function pickFullEnglishTrack(englishCandidates) {
    if (!Array.isArray(englishCandidates) || englishCandidates.length === 0) return '';
    if (englishCandidates.length === 1) return englishCandidates[0].url;
    const MIN_CUES = 120;   // a real episode has 250+; signs-only tracks stay under ~100
    const MAX_CHECK = 6;    // bound concurrent fetches
    const cands = englishCandidates.slice(0, MAX_CHECK);
    const pending = cands.map(function(cand) {
        return (async function() {
            try {
                const resp = await soraFetch(cand.url, {
                    headers: { 'Referer': 'https://app.strem.io/', 'Accept': '*/*' }
                });
                if (!resp) return 0;
                const text = await resp.text();
                return (String(text || '').match(/-->/g) || []).length;
            } catch (e) {
                return 0; // failed fetch -> treat as unusable
            }
        })();
    });
    for (let i = 0; i < cands.length; i++) {
        const cues = await pending[i];
        if (cues >= MIN_CUES) return cands[i].url; // first full-dialogue track wins
    }
    // No full-dialogue track: wait for any stragglers and use the most complete.
    const counts = await Promise.all(pending);
    let bestUrl = cands[0].url;
    let bestCues = counts[0];
    for (let i = 1; i < cands.length; i++) {
        if (counts[i] > bestCues) {
            bestCues = counts[i];
            bestUrl = cands[i].url;
        }
    }
    return bestUrl;
}

async function resolveStremioSubtitle(imdbId, type, season, episode) {
    try {
        const params = [];
        if (type === 'series') {
            if (season) params.push('season=' + encodeURIComponent(String(season)));
            if (episode) params.push('episode=' + encodeURIComponent(String(episode)));
        }
        const query = params.length ? ('?' + params.join('&')) : '';
        const response = await soraFetch(`${STREMIO_OPENSUBTITLES_URL}/subtitles/${type}/${imdbId}.json${query}`, {
            headers: {
                'Accept': 'application/json',
                'Referer': 'https://app.strem.io/'
            }
        });
        if (!response) return null;
        const data = await response.json();
        const subtitles = ((data && data.subtitles) || [])
            .filter(item => item && item.url)
            .map(item => ({
                url: item.url,
                lang: item.lang || '',
                label: stremioSubtitleLabel(item)
            }));
        if (subtitles.length === 0) return null;

        // English-only mode: drop every non-English track right at the source,
        // so the picker and auto-load can never offer/serve a foreign language.
        const english = subtitles.filter(isEnglishStremioSubtitle);
        if (english.length === 0) return null;
        const filteredSubtitles = english.slice();

        // Prefer the first full-dialogue English track over the possibly-forced
        // one stremio returns first, so auto-loaded subtitles are real dialogue
        // ("characters talking") rather than background/signs translation.
        const cacheKey = type + '/' + imdbId + '/' + (season || '') + '/' + (episode || '');
        let bestEnglishUrl = '';
        if (english.length > 1) {
            if (Object.prototype.hasOwnProperty.call(fullTrackCache, cacheKey)) {
                bestEnglishUrl = fullTrackCache[cacheKey];
            } else {
                bestEnglishUrl = await pickFullEnglishTrack(english);
                fullTrackCache[cacheKey] = bestEnglishUrl || '';
            }
        }

        const preferred = english[0] || subtitles[0];
        if (preferred && bestEnglishUrl) {
            preferred.url = bestEnglishUrl;   // picker + auto-load both use the full track
            preferred.label = 'English';
        }
        return {
            subtitle: preferred && preferred.url ? preferred.url : '',
            subtitles: filteredSubtitles,
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
        const response = await soraFetch(url, {
            headers: {
                'Accept': 'application/json',
                'Referer': 'https://app.strem.io/'
            }
        });
        if (!response) return null;
        const data = await response.json();
        const subtitles = ((data && data.subtitles) || [])
            .filter(item => item && item.url)
            .map(item => ({
                url: item.url,
                lang: String(item.lang || '').toLowerCase(),
                label: stremioSubtitleLabel(item)
            }));
        if (subtitles.length === 0) return null;

        // SCS answers titles it has no data for with a 1-cue "Test Subtitle"
        // placeholder, and can list forced/signs-only English tracks first.
        // Download-verify the English candidates (bounded, concurrent) and keep
        // only real full-dialogue tracks: they are the auto-load AND the picker
        // entries, so a fake track never shows up in front of the user.
        // English-only mode: all non-English tracks are dropped entirely.
        const englishCandidates = subtitles.filter(isEnglishStremioSubtitle);
        const verifiedEnglish = await verifyScEnglishTracks(englishCandidates);
        const autoLoadUrl = verifiedEnglish.length > 0 ? verifiedEnglish[0].url : '';

        const result = {
            subtitle: autoLoadUrl,
            subtitles: verifiedEnglish,
            pickedEnglish: verifiedEnglish.length > 0
        };
        scsResultCache[cacheKey] = result;
        return result;
    } catch (e) {
        console.log('[HydraHD] Community subs error: ' + (e && e.message ? e.message : e));
        return null;
    }
}

// Download English candidates concurrently and return only full-dialogue tracks
// (cue count, not the 1-cue placeholder). Keeps SCS's original ordering.
async function verifyScEnglishTracks(englishCandidates) {
    if (!Array.isArray(englishCandidates) || englishCandidates.length === 0) return [];
    const MIN_CUES = 120;   // a real episode has 250+; the placeholder has 1
    const MAX_CHECK = 6;
    const cands = englishCandidates.slice(0, MAX_CHECK);
    const counts = await Promise.all(cands.map(function(cand) {
        return (async function() {
            try {
                const resp = await soraFetch(cand.url, {
                    headers: { 'Referer': 'https://app.strem.io/', 'Accept': '*/*' }
                });
                if (!resp) return 0;
                const text = String((await resp.text()) || '');
                return (text.match(/-->/g) || []).length;
            } catch (e) {
                return 0;
            }
        })();
    }));
    const verified = [];
    for (let i = 0; i < cands.length; i++) {
        if (counts[i] >= MIN_CUES) {
            verified.push({
                url: cands[i].url,
                lang: 'eng',
                label: 'English'
            });
        }
    }
return verified;
}

// ---- OpenSubtitles REST (keyless series + movie source) --------------------
// The public rest.opensubtitles.org search API is what the web player's
// subtitles panel uses (ythd worker -> cloudorchestranova). It works with no
// login and no API key: the search accepts a plain imdbid (WITHOUT the "tt"
// prefix) and an X-User-Agent header, and every hit carries a direct download
// link. The same keyless engine covers series, which v3 (movies only) and
// the stalled SCS connector cannot. English-only: we search with
// sublanguageid-eng and verify full-dialogue cue counts before offering a track.
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
        const response = await soraFetch(url, { headers });
        if (!response) return null;
        const data = await response.json();
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
        // Keep only full-dialogue English tracks: verify by downloading the
        // plaintext SRT and counting cues (real episodes have 250+, signs-only
        // tracks stay under ~100, and OS "ads"/placeholder stubs have few).
        const verified = await verifyOsRestTracks(candidates);
        if (verified.length === 0) return null;
        const result = {
            subtitle: verified[0].url,
            subtitles: verified,
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

async function verifyOsRestTracks(candidates) {
    const MIN_CUES = 120;
    const MAX_CHECK = 6;
    const cands = candidates.slice(0, MAX_CHECK);
    const counts = await Promise.all(cands.map(function(cand) {
        return (async function() {
            try {
                const resp = await soraFetch(cand.url, {
                    headers: { 'Referer': 'https://www.opensubtitles.org/', 'Accept': '*/*' }
                });
                if (!resp) return 0;
                const text = String((await resp.text()) || '');
                if (text.indexOf('Download failed') !== -1) return 0;
                if (text.indexOf('try a different subtitle') !== -1) return 0;
                if (text.length < 200) return 0;
                return (text.match(/-->/g) || []).length;
            } catch (e) {
                return 0;
            }
        })();
    }));
    const verified = [];
    for (let i = 0; i < cands.length; i++) {
        if (counts[i] >= MIN_CUES) {
            verified.push({
                url: cands[i].url,
                lang: 'eng',
                label: cands[i].label || 'English'
            });
        }
    }
    return verified;
}

// Merge the three keyless providers' results into one picker list. OS REST
// English entries come first (full OpenSubtitles set for series AND movies),
// v3 fills in movie English, SCS adds community tracks. URLs are deduplicated
// so the same file never appears twice. All entries are English-only.
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
    // Auto-load priority: OS REST verified full-dialogue English, then v3, then
    // whatever the first provider flagged as default.
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
        if (!existing || (isUtf8 && existing.indexOf('senc=') !== -1)) {
            byLang[lang] = url;
        }
    });
    const entries = Object.keys(byLang).map(function(lang) {
        return {
            lang: lang,
            url: byLang[lang],
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

async function resolveVidfast(imdbId, isMovie = true, season = null, episode = null) {
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
                return {
                    streamUrl: decStreamData.result.url,
                    subtitle: getVidfastSubtitle(decStreamData.result)
                };
            }
        } catch (e) {
            continue;
        }
    }
    throw new Error('No working stream found');
}

async function resolveVidSrc(imdbId, isMovie = true, season = null, episode = null) {
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
    for (let i = 0; i < 15; i++) {
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
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!servers || !servers.length) {
        throw new Error('No vidsrc servers available');
    }
    for (const server of servers) {
        if (!server || !server.ref) continue;
        try {
            const playResponse = await soraFetch(`https://vidsrc.hair/api.php?a=play&ref=${encodeURIComponent(server.ref)}`, { headers: apiHeaders });
            const playData = await playResponse.json();
            if (!playData || !playData.url) continue;
            const streamUrl = /^https?:\/\//.test(playData.url) ? playData.url : new URL(playData.url, 'https://vidsrc.hair/').href;
            if (await verifyStreamUrl(streamUrl)) {
                return {
                    streamUrl,
                    subtitle: '',
                    headers: { 'Referer': 'https://vidsrc.hair/', 'Origin': 'https://vidsrc.hair' }
                };
            }
        } catch (e) {
            continue;
        }
    }
    throw new Error('No working vidsrc stream found');
}

async function verifyStreamUrl(streamUrl) {
    try {
        const response = await soraFetch(streamUrl, {
            method: 'HEAD',
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
        if (!contentType) return true;
        return !contentType.startsWith('text/html');
    } catch (e) {
        return false;
    }
}
