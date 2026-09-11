// VidCore Media Source Module

async function searchResults(keyword) {
    try {
        let transformedResults = [];

        const keywordGroups = {
            trending: ["!trending", "!hot", "!tr", "!!"],
            topRatedMovie: ["!top-rated-movie", "!topmovie", "!tm", "??"],
            topRatedTV: ["!top-rated-tv", "!toptv", "!tt", "::"],
            popularMovie: ["!popular-movie", "!popmovie", "!pm", ";;"],
            popularTV: ["!popular-tv", "!poptv", "!pt", "++"],
        };

        const skipTitleFilter = Object.values(keywordGroups).flat();
        const shouldFilter = !matchesKeyword(keyword, skipTitleFilter);

        const encodedKeyword = encodeURIComponent(keyword);
        let baseUrlTemplate = null;

        if (matchesKeyword(keyword, keywordGroups.trending)) {
            baseUrlTemplate = (page) => `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/trending/all/week?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=${page}`)}&simple=true`;
        } else if (matchesKeyword(keyword, keywordGroups.topRatedMovie)) {
            baseUrlTemplate = (page) => `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/movie/top_rated?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=${page}`)}&simple=true`;
        } else if (matchesKeyword(keyword, keywordGroups.topRatedTV)) {
            baseUrlTemplate = (page) => `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/top_rated?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=${page}`)}&simple=true`;
        } else if (matchesKeyword(keyword, keywordGroups.popularMovie)) {
            baseUrlTemplate = (page) => `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/movie/popular?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=${page}`)}&simple=true`;
        } else if (matchesKeyword(keyword, keywordGroups.popularTV)) {
            baseUrlTemplate = (page) => `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/popular?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=${page}`)}&simple=true`;
        } else {
            baseUrlTemplate = (page) => `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/search/multi?api_key=9801b6b0548ad57581d111ea690c85c8&query=${encodedKeyword}&include_adult=false&page=${page}`)}&simple=true`;
        }

        let dataResults = [];

        if (baseUrlTemplate) {
            const pagePromises = Array.from({ length: 5 }, (_, i) =>
                soraFetch(baseUrlTemplate(i + 1)).then(r => r ? r.json() : { results: [] })
            );
            const pages = await Promise.all(pagePromises);
            dataResults = pages.flatMap(p => p.results || []);
        }

        if (dataResults.length > 0) {
            transformedResults = transformedResults.concat(
                dataResults
                    .map(result => {
                        if (result.media_type === "movie" || result.title) {
                            return {
                                title: result.title || result.name || result.original_title || result.original_name || "Untitled",
                                image: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : "",
                                href: `movie/${result.id}`,
                            };
                        } else if (result.media_type === "tv" || result.name) {
                            return {
                                title: result.name || result.title || result.original_name || result.original_title || "Untitled",
                                image: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : "",
                                href: `tv/${result.id}/1/1`,
                            };
                        }
                    })
                    .filter(Boolean)
                    .filter(r => !shouldFilter || r.title.toLowerCase().includes(keyword.toLowerCase()))
            );
        }

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log("Fetch error in searchResults: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

function matchesKeyword(keyword, commands) {
    const lower = keyword.toLowerCase();
    return commands.some(cmd => lower.startsWith(cmd.toLowerCase()));
}

async function extractDetails(url) {
    try {
        if (url.includes('movie')) {
            const match = url.match(/movie\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];
            const responseText = await soraFetch(`https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/movie/${movieId}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}&simple=true`);
            const data = await responseText.json();

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.runtime ? data.runtime + " minutes" : 'Unknown'}`,
                airdate: `Released: ${data.release_date ? data.release_date : 'Unknown'}`
            }];

            return JSON.stringify(transformedResults);
        } else if (url.includes('tv')) {
            const match = url.match(/tv\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];
            const responseText = await soraFetch(`https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}&simple=true`);
            const data = await responseText.json();

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.episode_run_time && data.episode_run_time.length ? data.episode_run_time.join(', ') + " minutes" : 'Unknown'}`,
                airdate: `Aired: ${data.first_air_date ? data.first_air_date : 'Unknown'}`
            }];

            return JSON.stringify(transformedResults);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired/Released: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        if (url.includes('movie')) {
            const match = url.match(/movie\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");
            const movieId = match[1];

            const movie = [
                { href: `/movie/${movieId}`, number: 1, title: "Full Movie" }
            ];
            return JSON.stringify(movie);
        } else if (url.includes('tv')) {
            const match = url.match(/tv\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");
            const showId = match[1];

            const showResponseText = await soraFetch(`https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}&simple=true`);
            const showData = await showResponseText.json();

            let allEpisodes = [];
            for (const season of showData.seasons) {
                const seasonNumber = season.season_number;
                if (seasonNumber === 0) continue;

                const seasonResponseText = await soraFetch(`https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}&simple=true`);
                const seasonData = await seasonResponseText.json();

                if (seasonData.episodes && seasonData.episodes.length) {
                    const episodes = seasonData.episodes.map(episode => ({
                        href: `/tv/${showId}/${seasonNumber}/${episode.episode_number}`,
                        number: episode.episode_number,
                        title: episode.name || ""
                    }));
                    allEpisodes = allEpisodes.concat(episodes);
                }
            }
            return JSON.stringify(allEpisodes);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Fetch error in extractEpisodes: ' + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(ID) {
    try {
        let isMovie = ID.includes('movie');
        let tmdbID, seasonNumber = "1", episodeNumber = "1";
        let mediaType = "";

        if (isMovie) {
            tmdbID = ID.replace('/movie/', '').replace('/', '');
            mediaType = "movie";
        } else if (ID.includes('tv')) {
            const parts = ID.split('/');
            tmdbID = parts[2];
            seasonNumber = parts[3];
            episodeNumber = parts[4];
            mediaType = "tv";
        } else {
            return JSON.stringify({ streams: [] });
        }

        const targetPageUrl = mediaType === "movie"
            ? `https://vidcore.net/movie/${tmdbID}/`
            : `https://vidcore.net/tv/${tmdbID}/${seasonNumber}/${episodeNumber}/`;

        const response = await soraFetch(targetPageUrl);
        if (!response) throw new Error("Failed to fetch vidcore page");
        const html = await response.text();

        const match = html.match(/\\"(?:en|token)\\":\\"(.*?)\\"/) || html.match(/"(?:en|token)":"(.*?)"/);
        if (!match) throw new Error("Could not find payload text on vidcore page");
        const text = match[1];

        const encVidcoreUrl = `https://enc-dec.app/api/enc-vidcore?text=${encodeURIComponent(text)}`;
        const encRes = await soraFetch(encVidcoreUrl);
        if (!encRes) throw new Error("Failed to call enc-vidcore API");
        const encJson = await encRes.json();
        const parts = encJson.result;

        const { servers, stream, token } = parts;

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "Referer": "https://vidcore.net/",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-Token": token
        };

        const serversRes = await fetchv2(servers, headers, "POST", null);
        const serversEncrypted = await serversRes.text();

        const decRes = await fetchv2("https://enc-dec.app/api/dec-vidcore", { "Content-Type": "application/json" }, "POST", JSON.stringify({
            text: serversEncrypted
        }));
        const decJson = await decRes.json();
        const serversDecrypted = decJson.result || [];

        let streamObjects = [];
        let allSubtitles = [];

        const serverPromises = serversDecrypted.map(async (server) => {
            try {
                const streamUrl = `${stream}/${server.data}`;
                const streamRes = await fetchv2(streamUrl, headers, "POST", null);
                const streamEncrypted = await streamRes.text();

                const decStreamRes = await fetchv2("https://enc-dec.app/api/dec-vidcore", { "Content-Type": "application/json" }, "POST", JSON.stringify({
                    text: streamEncrypted
                }));
                const decStreamJson = await decStreamRes.json();
                const streamDecrypted = decStreamJson.result;

                if (streamDecrypted && streamDecrypted.url) {
                    return {
                        name: server.name,
                        url: streamDecrypted.url,
                        tracks: streamDecrypted.tracks || []
                    };
                }
            } catch (err) {
                console.log(`Error fetching/decrypting stream for VidCore server ${server.name}: ` + err.message);
            }
            return null;
        });

        const results = await Promise.all(serverPromises);

        results.forEach(res => {
            if (!res) return;
            streamObjects.push({
                title: `[VidCore] ${res.name}`,
                streamUrl: res.url,
                headers: {
                    "Referer": "https://vidcore.net/",
                    "Origin": "https://vidcore.net"
                }
            });

            res.tracks.forEach(track => {
                if (track.file && !allSubtitles.some(existing => existing.url === track.file)) {
                    allSubtitles.push({
                        url: track.file,
                        language: track.label || "English"
                    });
                }
            });
        });

        if (streamObjects.length === 0) {
            let fallbackUrl = "https://vidlink.pro/";
            if (ID.includes('movie')) {
                const mId = ID.replace('/movie/', '').replace('/', '');
                fallbackUrl = `https://vidlink.pro/movie/${mId}`;
            } else if (ID.includes('tv')) {
                const parts = ID.split('/');
                fallbackUrl = `https://vidlink.pro/tv/${parts[2]}/${parts[3]}/${parts[4]}`;
            }
            streamObjects.push({
                title: "VidCore Backup",
                streamUrl: fallbackUrl,
                headers: { "Referer": "https://vidlink.pro/" }
            });
        }

        const englishSubtitle = allSubtitles.find(sub => sub.language.toLowerCase() === 'english');
        let subtitleUrl = englishSubtitle ? englishSubtitle.url : "";

        return JSON.stringify({
            streams: streamObjects,
            subtitles: subtitleUrl
        });
    } catch (e) {
        console.log("Error in extractStreamUrl: " + e.message);
        let fallbackUrl = "https://vidlink.pro/";
        if (ID.includes('movie')) {
            const mId = ID.replace('/movie/', '').replace('/', '');
            fallbackUrl = `https://vidlink.pro/movie/${mId}`;
        } else if (ID.includes('tv')) {
            const parts = ID.split('/');
            fallbackUrl = `https://vidlink.pro/tv/${parts[2]}/${parts[3]}/${parts[4]}`;
        }
        return JSON.stringify({ streams: [{ title: "VidCore Backup", streamUrl: fallbackUrl, headers: { Referer: "https://vidlink.pro/" } }], subtitles: "" });
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
