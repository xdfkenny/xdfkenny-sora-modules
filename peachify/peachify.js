// Sora module for Peachify using enc-dec.app API

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
                soraFetch(baseUrlTemplate(i + 1)).then(r => r.json())
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
                    .filter(result => result.title !== "Overflow")
                    .filter(result => result.title !== "My Marriage Partner Is My Student, a Cocky Troublemaker")
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

function getQualityWeight(title) {
    if (title.includes("2160p") || title.includes("4K")) return 2160;
    if (title.includes("1080p")) return 1080;
    if (title.includes("720p")) return 720;
    if (title.includes("480p")) return 480;
    if (title.includes("360p")) return 360;
    if (title.includes("Auto")) return 1;
    return 0;
}

async function extractStreamUrl(ID) {
    try {
        let isMovie = ID.includes('movie');
        let tmdbID, seasonNumber = "1", episodeNumber = "1";
        let mediaType = "";

        const parts = ID.split('/').filter(Boolean);
        if (isMovie) {
            tmdbID = parts[parts.length - 1];
            mediaType = "movie";
        } else if (ID.includes('tv')) {
            tmdbID = parts[1];
            seasonNumber = parts[2];
            episodeNumber = parts[3];
            mediaType = "tv";
        } else {
            return JSON.stringify({ streams: [] });
        }

        const servers = [
            {"label": "Wolf", "path": "air", "api": "https://usa.eat-peach.sbs"},
            {"label": "Spider", "path": "holly", "api": "https://usa.eat-peach.sbs"},
            {"label": "Iron", "path": "moviebox", "api": "https://uwu.eat-peach.sbs"},
            {"label": "Multi", "path": "multi", "api": "https://usa.eat-peach.sbs"},
            {"label": "Dark", "path": "net", "api": "https://uwu.eat-peach.sbs"},
        ];

        const requestHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "Origin": "https://peachify.top",
            "Referer": "https://peachify.top/"
        };

        let streamObjects = [];
        let allSubtitles = [];

        const serverPromises = servers.map(async (server) => {
            try {
                const url = mediaType === "movie"
                    ? `${server.api}/${server.path}/movie/${tmdbID}`
                    : `${server.api}/${server.path}/tv/${tmdbID}/${seasonNumber}/${episodeNumber}`;

                const response = await soraFetch(url, { headers: requestHeaders });
                if (!response) return null;
                const jsonRes = await response.json();
                if (!jsonRes || !jsonRes.data) return null;

                const dec_peachify = "https://enc-dec.app/api/dec-peachify";
                const decResponse = await fetchv2(dec_peachify, { "Content-Type": "application/json" }, "POST", JSON.stringify({ text: jsonRes.data }));
                const decData = await decResponse.json();

                if (decData && decData.status === 200 && decData.result) {
                    return {
                        serverLabel: server.label,
                        sources: decData.result.sources || [],
                        subtitles: decData.result.subtitles || []
                    };
                }
            } catch (err) {
                console.log(`Error processing Peachify server ${server.label}: ${err.message}`);
            }
            return null;
        });

        const results = await Promise.all(serverPromises);

        results.forEach(res => {
            if (!res) return;
            const { serverLabel, sources, subtitles } = res;
            
            sources.forEach(src => {
                if (src.url && !streamObjects.some(existing => existing.streamUrl === src.url)) {
                    streamObjects.push({
                        title: `[Peachify - ${serverLabel}] ${src.dub || 'HLS'}`,
                        streamUrl: src.url,
                        headers: {
                            "Origin": "https://peachify.top",
                            "Referer": "https://peachify.top/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                            ...(src.headers || {})
                        }
                    });
                }
            });

            subtitles.forEach(sub => {
                if (sub.url && !allSubtitles.some(existing => existing.url === sub.url)) {
                    allSubtitles.push(sub);
                }
            });
        });

        streamObjects.sort((a, b) => {
            const weightA = getQualityWeight(a.title);
            const weightB = getQualityWeight(b.title);
            return weightB - weightA;
        });

        if (streamObjects.length === 0) {
            const fallbackUrl = mediaType === "movie"
                ? `https://vidlink.pro/movie/${tmdbID}`
                : `https://vidlink.pro/tv/${tmdbID}/${seasonNumber}/${episodeNumber}`;
            streamObjects.push({
                title: "Peachify Backup",
                streamUrl: fallbackUrl,
                headers: { "Referer": "https://vidlink.pro/" }
            });
        }

        const englishSubtitle = allSubtitles.find(sub => (sub.language || sub.lang || sub.label || '').toLowerCase() === 'english');
        let subtitleUrl = englishSubtitle ? englishSubtitle.url : "";

        if (subtitleUrl) {
            subtitleUrl = `https://passthrough-worker.simplepostrequest.workers.dev/?url=${encodeURIComponent(subtitleUrl)}&type=vtt&referer=https%3A%2F%2Fpeachify.top%2F`;
        }

        return JSON.stringify({
            streams: streamObjects,
            subtitles: subtitleUrl
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
        return JSON.stringify({ streams: [{ title: "Peachify Backup", streamUrl: fallbackUrl, headers: { Referer: "https://vidlink.pro/" } }], subtitles: "" });
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
