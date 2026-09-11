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

async function extractStreamUrl(ID) {
    const startTime = Date.now();
    let isMovie = ID.includes('movie');
    let tmdbID, seasonNumber = "1", episodeNumber = "1";
    let isSeries = false;

    if (isMovie) {
        tmdbID = ID.replace('/movie/', '').replace('/', '');
    } else if (ID.includes('tv')) {
        const parts = ID.split('/');
        tmdbID = parts[2];
        seasonNumber = parts[3];
        episodeNumber = parts[4];
        isSeries = true;
    } else {
        return JSON.stringify({ streams: [] });
    }

    try {
        const streamResponse = await ilovefeet(tmdbID, isSeries, seasonNumber, episodeNumber, 'm3u8');
        const streams = [];

        if (streamResponse && Array.isArray(streamResponse.streams)) {
            for (const s of streamResponse.streams) {
                streams.push({
                    title: s.title,
                    streamUrl: s.url,
                    headers: {
                        "Referer": "https://vidfast.vc/",
                        "Origin": "https://vidfast.vc"
                    }
                });
            }
        }

        if (streams.length === 0) {
            const fallbackUrl = isSeries ? `https://vidlink.pro/tv/${tmdbID}/${seasonNumber}/${episodeNumber}` : `https://vidlink.pro/movie/${tmdbID}`;
            streams.push({
                title: "VidFast Backup",
                streamUrl: fallbackUrl,
                headers: { "Referer": "https://vidlink.pro/" }
            });
        }

        const final = {
            streams,
            subtitles: streamResponse ? streamResponse.subtitles || "" : ""
        };

        const endTime = Date.now();
        const elapsed = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`Stream fetched in ${elapsed}s`);
        return JSON.stringify(final);
    } catch (e) {
        console.log("Error in extractStreamUrl: " + e.message);
        const fallbackUrl = isSeries ? `https://vidlink.pro/tv/${tmdbID}/${seasonNumber}/${episodeNumber}` : `https://vidlink.pro/movie/${tmdbID}`;
        return JSON.stringify({
            streams: [{ title: "VidFast Backup", streamUrl: fallbackUrl, headers: { Referer: "https://vidlink.pro/" } }],
            subtitles: ""
        });
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

async function ilovearmpits(m3u8Url) {
    try {
        const headers = {
            "Accept": "*/*",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
            "Referer": "https://vidfast.vc/",
            "X-Requested-With": "XMLHttpRequest"
        };

        const response = await fetchv2(m3u8Url, headers);
        const playlistContent = await response.text();

        const has4K = playlistContent.includes('RESOLUTION=3840x2160');

        if (!has4K) {
            console.log(`4K Check for ${m3u8Url}: NO`);
            return { available: false, url: null };
        }

        const lines = playlistContent.split('\n');
        let fourKPath = null;
        let fourKCount = 0;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=3840x2160')) {
                fourKCount++;
                if (fourKCount === 2 && i + 1 < lines.length) {
                    fourKPath = lines[i + 1].trim();
                    break;
                }
            }
        }

        if (!fourKPath && fourKCount === 1) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('RESOLUTION=3840x2160')) {
                    if (i + 1 < lines.length) {
                        fourKPath = lines[i + 1].trim();
                        break;
                    }
                }
            }
        }

        if (!fourKPath) {
            console.log('4K resolution found but could not extract path');
            return { available: false, url: null };
        }

        let baseUrl = '';
        if (m3u8Url.startsWith('https://')) {
            const afterProtocol = m3u8Url.substring(8);
            const hostEnd = afterProtocol.indexOf('/');
            const host = hostEnd !== -1 ? afterProtocol.substring(0, hostEnd) : afterProtocol;
            baseUrl = 'https://' + host;
        } else if (m3u8Url.startsWith('http://')) {
            const afterProtocol = m3u8Url.substring(7);
            const hostEnd = afterProtocol.indexOf('/');
            const host = hostEnd !== -1 ? afterProtocol.substring(0, hostEnd) : afterProtocol;
            baseUrl = 'http://' + host;
        }

        const full4KUrl = fourKPath.startsWith('http') ? fourKPath : `${baseUrl}${fourKPath}`;

        return { available: true, url: full4KUrl };
    } catch (error) {
        console.log('Error checking 4K availability: ' + error);
        return { available: false, url: null };
    }
}

async function ilovefeet(imdbId, isSeries = false, season = null, episode = null, preferredFormat = null) {
    let baseUrl;
    if (isSeries) {
        baseUrl = `https://vidfast.vc/tv/${imdbId}/${season}/${episode}`;
    } else {
        baseUrl = `https://vidfast.vc/movie/${imdbId}`;
    }

    const headers = {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "Referer": baseUrl,
        "X-Requested-With": "XMLHttpRequest"
    };

    console.log(`Requesting Base URL: ${baseUrl}`);
    const pageResponse = await fetchv2(baseUrl, headers);
    const pageText = await pageResponse.text();

    let match = pageText.match(/\\"(?:en|token)\\":\\"([^"]+)\\"/) ||
        pageText.match(/"(?:en|token)":"([^"]+)"/) ||
        pageText.match(/'(?:en|token)':'([^']+)'/) ||
        pageText.match(/["'](?:en|token)["']:\s*["']([^"']+)["']/);

    if (!match) {
        throw new Error('Could not find data in page');
    }
    const rawData = match[1];
    console.log("Raw Data extracted:", rawData);

    const apiUrl = `https://enc-dec.app/api/enc-vidfast?text=${encodeURIComponent(rawData)}&version=1`;
    console.log(`Requesting Decrypt API: ${apiUrl}`);
    const apiResponse = await soraFetch(apiUrl);
    const apiData = await apiResponse.json();
    console.log("API Data from enc-dec.app:", JSON.stringify(apiData));

    if (apiData.status !== 200 || !apiData.result) {
        throw new Error('Failed to decrypt data via enc-dec.app API');
    }

    const apiServers = apiData.result.servers;
    const streamBase = apiData.result.stream;
    const csrfToken = apiData.result.token;

    if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
    }

    console.log(`Requesting Servers URL: ${apiServers}`);
    const serversResponse = await soraFetch(apiServers, { method: 'POST', headers: headers });
    const serversEncrypted = await serversResponse.text();

    const decServersResponse = await soraFetch('https://enc-dec.app/api/dec-vidfast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: serversEncrypted, version: "1" })
    });
    const decServersData = await decServersResponse.json();

    if (decServersData.status !== 200 || !decServersData.result) {
        throw new Error('Failed to decrypt servers data via enc-dec.app API');
    }
    const serverList = decServersData.result;

    if (!serverList || serverList.length === 0) {
        throw new Error('No servers available');
    }

    const testServer = async (serverObj, index) => {
        const server = serverObj.data;
        const apiStream = streamBase + '/' + server;

        try {
            console.log(`Requesting Stream URL for server ${index}: ${apiStream}`);
            const streamResponse = await soraFetch(apiStream, { method: 'POST', headers: headers });
            if (!streamResponse) return null;

            const streamEncrypted = await streamResponse.text();
            if (!streamEncrypted || streamEncrypted.includes("Attention Required") || streamEncrypted.includes("Cloudflare")) {
                return null;
            }

            const decStreamResponse = await soraFetch('https://enc-dec.app/api/dec-vidfast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: streamEncrypted, version: "1" })
            });
            if (!decStreamResponse) return null;
            const decStreamData = await decStreamResponse.json();

            if (decStreamData.status !== 200 || !decStreamData.result) {
                return null;
            }

            let data = decStreamData.result;
            if (!data.url) {
                return null;
            }

            const format = data.url.includes('.m3u8') ? 'm3u8' : data.url.includes('.mpd') ? 'mpd' : 'unknown';

            let englishSubtitles = null;
            if (data.tracks && Array.isArray(data.tracks)) {
                const englishTrack = data.tracks.find(track =>
                    track.label && track.label.toLowerCase().includes('english') && track.file
                );
                if (englishTrack) {
                    englishSubtitles = englishTrack.file;
                }
            }

            return {
                name: serverObj.name || `Server ${index}`,
                url: data.url,
                format,
                subtitles: englishSubtitles
            };
        } catch (error) {
            console.log(`Server ${index} failed: ${error.message}`);
            return null;
        }
    };

    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms));

    const serverPromises = serverList.map(async (serverObj, index) => {
        try {
            return await Promise.race([
                testServer(serverObj, index),
                timeout(4000)
            ]);
        } catch (e) {
            console.log(`Server ${index} timed out or failed`);
            return null;
        }
    });

    const results = await Promise.all(serverPromises);
    const workingStreams = results.filter(r => r !== null);

    const workingStreamsMapped = [];
    let englishSubs = null;

    for (const item of workingStreams) {
        let streamUrl = item.url;
        if (item.name === 'vFast') {
            const fourKResult = await ilovearmpits(streamUrl);
            if (fourKResult.available && fourKResult.url) {
                streamUrl = fourKResult.url;
            }
        }

        workingStreamsMapped.push({
            title: item.name,
            url: streamUrl
        });

        if (item.subtitles && !englishSubs) {
            englishSubs = item.subtitles;
        }
    }

    return {
        streams: workingStreamsMapped,
        subtitles: englishSubs
    };
}

