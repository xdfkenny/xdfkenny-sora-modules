//Thanks ibro for the TMDB search!

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

        if (isMovie) {
            tmdbID = ID.replace('/movie/', '');
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

        const tmdbUrl = `https://post-eosin.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/${mediaType}/${tmdbID}?api_key=ad301b7cc82ffe19273e55e4d4206885&append_to_response=external_ids&language=en`)}&simple=true`;
        const response = await soraFetch(tmdbUrl);
        if (!response) throw new Error("Failed to fetch TMDB details");
        const tmdbData = await response.json();

        const title = encodeURIComponent(encodeURIComponent(tmdbData.title || tmdbData.name || ""));
        const releaseDate = tmdbData.release_date || tmdbData.first_air_date || "";
        const year = releaseDate ? new Date(releaseDate).getFullYear() : "";
        const imdbId = tmdbData.external_ids?.imdb_id || "";
        const tmdbId = tmdbData.id;

        const seedRes = await soraFetch(`https://api.speedracelight.com/seed?mediaId=${tmdbId}`, {
            headers: {
                "Referer": "https://player.videasy.to/",
                "Origin": "https://player.videasy.to",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
            }
        });
        if (!seedRes) throw new Error("Failed to fetch seed data");
        const seedJson = await seedRes.json();
        const seed = seedJson.seed;
        const enc = "2";

        let servers = [
            { name: "Yoru", endpoint: "cdn", flag: "🇺🇸" },
            { name: "Breach", endpoint: "m4uhd", flag: "🇺🇸" },
            { name: "Neon", endpoint: "vsrc", flag: "🇺🇸" },
            { name: "Vyse", endpoint: "hdmovie", flag: "🇺🇸", filterQuality: "English" },
            { name: "Killjoy", endpoint: "meine", flag: "🇩🇪", query: "language=german" },
            { name: "Fade", endpoint: "hdmovie", flag: "🇮🇳", filterQuality: "Hindi" },
            { name: "Omen", endpoint: "lamovie", flag: "🇪🇸" },
            { name: "Raze", endpoint: "superflix", flag: "🇵🇹" }
        ];

        try {
            const pyRes = await soraFetch("https://raw.githubusercontent.com/smy778/EncDecEndpoints/refs/heads/main/samples/videasy.py");
            if (pyRes) {
                const pyText = await pyRes.text();
                const serversMatch = pyText.match(/'''([\s\S]*?)'''/);
                if (serversMatch) {
                    const parsedServers = [];
                    const lines = serversMatch[1].split("\n");
                    for (const line of lines) {
                        if (line.includes("---") || line.includes("Server") || !line.trim()) continue;
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 3) {
                            const name = parts[0];
                            const language = parts[1];
                            const url = parts[2];
                            const urlMatch = url.match(/https:\/\/api\.speedracelight\.com\/([^\/]+)\/sources-with-title(?:\?(.*))?/);
                            if (urlMatch) {
                                const endpoint = urlMatch[1];
                                const query = urlMatch[2] || null;
                                
                                let flag = "🇺🇸";
                                if (language.toLowerCase() === "german" || name.toLowerCase() === "killjoy") flag = "🇩🇪";
                                else if (language.toLowerCase() === "hindi" || name.toLowerCase() === "fade") flag = "🇮🇳";
                                else if (language.toLowerCase() === "spanish" || name.toLowerCase() === "omen") flag = "🇪🇸";
                                else if (language.toLowerCase() === "portuguese" || name.toLowerCase() === "raze") flag = "🇵🇹";

                                const filterMatch = line.match(/FILTERS quality == "([^"]+)"/);
                                const filterQuality = filterMatch ? filterMatch[1] : null;

                                parsedServers.push({
                                    name,
                                    endpoint,
                                    flag,
                                    query,
                                    filterQuality
                                });
                            }
                        }
                    }
                    if (parsedServers.length > 0) {
                        servers = parsedServers;
                    }
                }
            }
        } catch (e) {
            console.log("Failed to fetch dynamic servers, using fallback: " + e.message);
        }

        let streamObjects = [];
        let allSubtitles = [];

        const serverPromises = servers.map(async (server) => {
            try {
                let fullUrl = `https://api.speedracelight.com/${server.endpoint}/sources-with-title?title=${title}&mediaType=${mediaType}&year=${year}&episodeId=${episodeNumber}&seasonId=${seasonNumber}&tmdbId=${tmdbId}&imdbId=${imdbId}&enc=${enc}&seed=${seed}`;
                if (server.query) {
                    fullUrl += `&${server.query}`;
                }

                const fetchOpts = {
                    headers: {
                        "Referer": "https://player.videasy.to/",
                        "Origin": "https://player.videasy.to",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
                    }
                };
                const responseTwo = await soraFetch(fullUrl, fetchOpts);
                if (!responseTwo) return null;

                const encrypted = await responseTwo.text();
                if (!encrypted || encrypted.includes("Attention Required") || encrypted.includes("Cloudflare")) return null;

                const postData = JSON.stringify({
                    text: encrypted.trim(),
                    id: String(tmdbId),
                    seed: seed
                });

                const decryptHeaders = {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
                };

                const decryptedResponse = await fetchv2("https://enc-dec.app/api/dec-videasy", decryptHeaders, "POST", postData);
                const decryptedData = await decryptedResponse.json();

                if (decryptedData && decryptedData.status === 200 && decryptedData.result) {
                    let sources = decryptedData.result.sources || [];
                    if (server.filterQuality) {
                        sources = sources.filter(e => e.quality === server.filterQuality || e.quality.includes(server.filterQuality));
                    }

                    return {
                        serverName: server.name,
                        flag: server.flag,
                        sources: sources,
                        subtitles: decryptedData.result.subtitles || []
                    };
                }
            } catch (err) {
                console.log(`Error fetching/decrypting stream for server ${server.name}: ` + err.message);
            }
            return null;
        });

        const results = await Promise.all(serverPromises);

        results.forEach(res => {
            if (!res) return;
            const { serverName, flag, sources, subtitles } = res;
            const nonHDRSources = sources.filter(s => !s.quality.includes("HDR"));

            nonHDRSources.forEach(src => {
                if (!streamObjects.some(existing => existing.streamUrl === src.url)) {
                    streamObjects.push({
                        title: `[${serverName}] ${flag} ${src.quality}`,
                        streamUrl: src.url,
                        headers: {
                            "Origin": "https://player.videasy.to",
                            "Referer": "https://player.videasy.to/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                        }
                    });
                }
            });

            subtitles.forEach(sub => {
                if (!allSubtitles.some(existing => existing.url === sub.url)) {
                    allSubtitles.push(sub);
                }
            });
        });

        streamObjects.sort((a, b) => {
            const weightA = getQualityWeight(a.title);
            const weightB = getQualityWeight(b.title);
            return weightB - weightA;
        });

        const englishSubtitle = allSubtitles.find(sub => (sub.language || sub.lang)?.toLowerCase() === 'english');
        let subtitleUrl = englishSubtitle ? englishSubtitle.url : "";

        if (subtitleUrl) {
            subtitleUrl = `https://passthrough-worker.simplepostrequest.workers.dev/?url=${encodeURIComponent(subtitleUrl)}&type=vtt&referer=https%3A%2F%2Fplayer.videasy.to%2F`;
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
