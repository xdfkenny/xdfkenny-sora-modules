// IMDb Module for Sora / Luna

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
            const pagePromises = Array.from({ length: 3 }, (_, i) =>
                soraFetch(baseUrlTemplate(i + 1)).then(r => r ? r.json() : { results: [] })
            );
            const pages = await Promise.all(pagePromises);
            dataResults = pages.flatMap(p => p.results || []);
        }

        if (dataResults.length > 0) {
            transformedResults = dataResults
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
                .filter(r => !shouldFilter || r.title.toLowerCase().includes(keyword.toLowerCase()));
        }

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log("Fetch error in searchResults: " + error);
        return JSON.stringify([]);
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
            const match = url.match(/tv\/([^\/]+)/);
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
                        title: episode.name || `Episode ${episode.episode_number}`
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

function detectQuality(fileName, defaultQuality = "1080p") {
    const qualities = ["2160p", "4k", "1080p", "720p", "480p", "360p"];
    const lower = (fileName || "").toLowerCase();
    for (const q of qualities) {
        if (lower.includes(q)) {
            return q === "4k" ? "2160p" : q;
        }
    }
    return defaultQuality;
}

async function extractStreamUrl(ID) {
    try {
        let isMovie = ID.includes('movie');
        let tmdbID, seasonNumber = "1", episodeNumber = "1";
        let mediaType = "";

        if (isMovie) {
            const match = ID.match(/movie\/(\d+)/);
            if (match) {
                tmdbID = match[1];
                mediaType = "movie";
            }
        } else if (ID.includes('tv')) {
            const match = ID.match(/tv\/(\d+)\/(\d+)\/(\d+)/);
            if (match) {
                tmdbID = match[1];
                seasonNumber = match[2];
                episodeNumber = match[3];
                mediaType = "tv";
            }
        }

        if (!tmdbID) {
            return JSON.stringify({ streams: [] });
        }

        const tmdbUrl = `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/${mediaType}/${tmdbID}?api_key=ad301b7cc82ffe19273e55e4d4206885&append_to_response=external_ids&language=en`)}&simple=true`;
        const response = await soraFetch(tmdbUrl);
        if (!response) throw new Error("Failed to fetch TMDB details");
        const tmdbData = await response.json();

        const imdbId = tmdbData.external_ids?.imdb_id || "";
        if (!imdbId) {
            return JSON.stringify({ streams: [] });
        }

        let streamApiUrl = "";
        if (mediaType === "movie") {
            streamApiUrl = `https://streamdata.vaplayer.ru/api.php?imdb=${imdbId}&type=movie`;
        } else {
            streamApiUrl = `https://streamdata.vaplayer.ru/api.php?imdb=${imdbId}&type=tv&season=${seasonNumber}&episode=${episodeNumber}`;
        }

        const fetchOpts = {
            headers: {
                "Referer": "https://nextgencloudfabric.com/",
                "Origin": "https://nextgencloudfabric.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        };

        const streamRes = await soraFetch(streamApiUrl, fetchOpts);
        if (!streamRes) throw new Error("Failed to fetch stream details");
        const streamJson = await streamRes.json();

        let streamObjects = [];
        let subtitleUrl = "";

        if (streamJson && streamJson.status_code === "200" && streamJson.data && streamJson.data.stream_urls) {
            const detectedQuality = detectQuality(streamJson.data.file_name || streamJson.data.title || "");
            
            streamJson.data.stream_urls.forEach((url, index) => {
                streamObjects.push({
                    title: `[IMDb] Server ${index + 1} (${detectedQuality})`,
                    streamUrl: url,
                    headers: {
                        "Referer": "https://nextgencloudfabric.com/",
                        "Origin": "https://nextgencloudfabric.com",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                });
            });

            if (streamJson.default_subs && Array.isArray(streamJson.default_subs)) {
                const englishSub = streamJson.default_subs.find(sub => 
                    (sub.language || sub.lang || sub.label || "").toLowerCase().includes("eng")
                );
                if (englishSub && englishSub.url) {
                    subtitleUrl = englishSub.url;
                }
            }
        }

        return JSON.stringify({
            streams: streamObjects,
            subtitles: subtitleUrl
        });
    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        return JSON.stringify({ streams: [], subtitles: "" });
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
