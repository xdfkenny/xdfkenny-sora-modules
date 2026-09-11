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

        // --- TMDB Section ---
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
                soraFetch(baseUrlTemplate(i + 1)).then(r => r ? r.json() : { results: [] }).catch(() => ({ results: [] }))
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

        console.log("Transformed Results: " + JSON.stringify(transformedResults));
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

            console.log(JSON.stringify(transformedResults));
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

            console.log(movie);
            return JSON.stringify(movie);
        } else if (url.includes('tv')) {
            const match = url.match(/tv\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];
            const showResponseText = await soraFetch(`https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}&simple=true`);
            const showData = await showResponseText.json();

            const seasonPromises = (showData.seasons || []).map(async (season) => {
                const seasonNumber = season.season_number;
                if (seasonNumber === 0) return [];

                try {
                    const seasonResponseText = await soraFetch(`https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}&simple=true`);
                    if (!seasonResponseText) return [];
                    const seasonData = await seasonResponseText.json();

                    if (seasonData.episodes && seasonData.episodes.length) {
                        return seasonData.episodes.map(episode => ({
                            href: `/tv/${showId}/${seasonNumber}/${episode.episode_number}`,
                            number: episode.episode_number,
                            title: episode.name || ""
                        }));
                    }
                } catch (e) {
                    console.log(`Failed to fetch season ${seasonNumber}: ${e.message}`);
                }
                return [];
            });

            const results = await Promise.all(seasonPromises);
            const allEpisodes = results.flat();
            console.log(allEpisodes);
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
        let tmdbID = "";
        let seasonNumber = "1";
        let episodeNumber = "1";
        let mediaType = "";
        let reqUrl = "";
        let referer = "";

        if (isMovie) {
            tmdbID = ID.replace('/movie/', '').replace('movie/', '');
            mediaType = "movie";
            reqUrl = `https://play.xpass.top/data/movie/${tmdbID}?autostart=false`;
            referer = `https://play.xpass.top/e/movie/${tmdbID}`;
        } else if (ID.includes('tv')) {
            const parts = ID.split('/');
            const cleanParts = parts.filter(p => p !== "");
            tmdbID = cleanParts[1];
            seasonNumber = cleanParts[2];
            episodeNumber = cleanParts[3];
            mediaType = "tv";
            reqUrl = `https://play.xpass.top/data/tv/${tmdbID}/${seasonNumber}/${episodeNumber}?autostart=false`;
            referer = `https://play.xpass.top/e/tv/${tmdbID}/${seasonNumber}/${episodeNumber}`;
        } else {
            return JSON.stringify({ streams: [] });
        }

        const headers = {
            "Cookie": "auth_token=c2685c63f0016d6ab3a3548eeb1e111551acfc1bbd65fc2b1e2b043af659b39a",
            "Referer": referer,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0",
            "Accept": "*/*"
        };

        const response = await soraFetch(reqUrl, { headers });
        if (!response) throw new Error("Failed to fetch server list from XPass");

        const serverList = await response.json();
        if (!Array.isArray(serverList)) throw new Error("Invalid server list response");

        const serverPromises = serverList.map(async (server) => {
            try {
                if (!server.url) return [];
                const playlistUrl = `https://play.xpass.top${server.url}`;
                const playlistResponse = await soraFetch(playlistUrl, { headers });
                if (!playlistResponse) return [];
                const playlistData = await playlistResponse.json();

                let results = [];
                if (playlistData && playlistData.playlist && playlistData.playlist.length > 0) {
                    playlistData.playlist.forEach(item => {
                        if (item.sources && Array.isArray(item.sources)) {
                            item.sources.forEach(src => {
                                if (src.file) {
                                    const isTik = src.file.includes("tik.1x2.space") || 
                                                  (src.label && src.label.toUpperCase().includes("TIK")) || 
                                                  (server.name && server.name.toUpperCase().includes("TIK"));
                                    if (!isTik) {
                                        results.push({
                                            title: `[XPass] ${server.name || 'Server'} - ${src.label || 'HLS'}`,
                                            streamUrl: src.file,
                                            headers: {
                                                "Origin": "https://play.xpass.top",
                                                "Connection": "keep-alive",
                                                "Referer": "https://play.xpass.top/"
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
                return results;
            } catch (err) {
                console.log(`Error fetching playlist for server ${server.name}: ` + err);
                return [];
            }
        });

        const resolvedStreams = await Promise.all(serverPromises);
        if (streamObjects.length === 0) {
            const fallbackUrl = mediaType === "movie"
                ? `https://vidlink.pro/movie/${tmdbID}`
                : `https://vidlink.pro/tv/${tmdbID}/${seasonNumber}/${episodeNumber}`;
            streamObjects.push({
                title: "XPass Backup",
                streamUrl: fallbackUrl,
                headers: { "Referer": "https://vidlink.pro/" }
            });
        }

        return JSON.stringify({
            streams: streamObjects,
            subtitles: ""
        });
    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        let fallbackUrl = "https://vidlink.pro/";
        if (ID.includes('movie')) {
            const mId = ID.replace('/movie/', '').replace('/', '');
            fallbackUrl = `https://vidlink.pro/movie/${mId}`;
        } else if (ID.includes('tv')) {
            const parts = ID.split('/');
            fallbackUrl = `https://vidlink.pro/tv/${parts[2]}/${parts[3]}/${parts[4]}`;
        }
        return JSON.stringify({ streams: [{ title: "XPass Backup", streamUrl: fallbackUrl, headers: { Referer: "https://vidlink.pro/" } }], subtitles: "" });
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
