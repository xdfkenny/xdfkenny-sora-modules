// Settings start
const baseUrl = "streamingcommunityz.jetzt"; // Non aggiungere 'https://' all'inizio o "/" alla fine
const patcher = true; // Attiva/Disattiva questo se le stream non funzionano
// Settings end
 
function getFullDomain() {
    return `https://${baseUrl}`;
}
 
console.log(extractStreamUrl("https://streamingcommunityz.plus/it/iframe/3?episode_id=62"))
 
async function searchResults(keyword) {
    const response = await soraFetch(
        `${getFullDomain()}/it/archive?search=${keyword}`
    );
    const html = await response.text();
 
    const regex = /<div[^>]*id="app"[^>]*data-page="([^"]*)"/;
    const match = regex.exec(html);
 
    if (!match || !match[1]) {
        return JSON.stringify([]);
    }
 
    const dataPage = match[1].replaceAll(`&quot;`, `"`);
    const pageData = JSON.parse(dataPage);
    const titles = pageData.props?.titles || [];
 
    const results =
        titles
        .map((item) => {
            const posterImage = item.images?.find((img) => img.type === "poster");
            return {
                title: item.name?.replaceAll("amp;", "").replaceAll("&#39;", "'") || "",
                image: posterImage?.filename ?
                    `https://cdn.${baseUrl}/images/${posterImage.filename}` :
                    "",
                href: `${getFullDomain()}/it/titles/${item.id}-${item.slug}`,
            };
        })
        .filter((item) => item.image) || [];
 
    console.log(results);
    return JSON.stringify(results);
}
 
async function extractDetails(url) {
    const response = await soraFetch(`${url}/season-1`);
    const html = await response.text();
 
    const regex = /<div[^>]*id="app"[^>]*data-page="([^"]*)"/;
    const match = regex.exec(html);
 
    if (!match || !match[1]) {
        return JSON.stringify([]);
    }
 
    const dataPage = match[1].replaceAll(`&quot;`, `"`);
    const pageData = JSON.parse(dataPage);
    const titleData = pageData.props?.title;
 
    if (!titleData) {
        return JSON.stringify([]);
    }
 
    return JSON.stringify([{
        description: titleData.plot?.replaceAll("amp;", "").replaceAll("&#39;", "'") ||
            "N/A",
        aliases: titleData.original_name
            ?.replaceAll("amp;", "")
            .replaceAll("&#39;", "'") || "N/A",
        airdate: titleData.release_date || "N/A",
    }]);
}
 
async function extractEpisodes(url) {
    try {
        const episodes = [];
        const baseTitleUrl = url.replace(/\/season-\d+$/, "");
 
        const response = await soraFetch(`${baseTitleUrl}/season-1`);
        const html = await response.text();
        const regex = /<div[^>]*id="app"[^>]*data-page="([^"]*)"/;
        const match = regex.exec(html);
 
        if (!match?.[1]) return JSON.stringify([]);
 
        const pageData = JSON.parse(match[1].replaceAll(`&quot;`, `"`));
        const titleData = pageData.props?.title;
        if (!titleData) return JSON.stringify([]);
 
        const titleId = titleData.id;
        const totalSeasons = titleData.seasons_count || 1;
 
        let hasEpisodes = false;
 
        for (let season = 1; season <= totalSeasons; season++) {
            try {
                const seasonResponse = await soraFetch(`${baseTitleUrl}/season-${season}`);
                const seasonHtml = await seasonResponse.text();
                const seasonMatch = regex.exec(seasonHtml);
 
                if (seasonMatch?.[1]) {
                    const seasonData = JSON.parse(
                        seasonMatch[1].replaceAll(`&quot;`, `"`)
                    );
                    const seasonEpisodes = seasonData.props?.loadedSeason?.episodes || [];
 
                    if (seasonEpisodes.length > 0) {
                        hasEpisodes = true;
                        seasonEpisodes.forEach((episode) => {
                            episodes.push({
                                href: `${getFullDomain()}/it/iframe/${titleId}?episode_id=${episode.id}`,
                                number: episode.number || episodes.length + 1,
                            });
                        });
                    }
                }
            } catch (error) {
                console.log(`Error fetching season ${season}:`, error);
            }
        }
 
        if (!hasEpisodes) {
            episodes.push({
                href: `${getFullDomain()}/it/iframe/${titleId}`,
                number: 1,
            });
        }
 
        console.log(episodes);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Error extracting episodes:", error);
        return JSON.stringify([]);
    }
}
 
async function extractStreamUrl(url) {
    try {
        let modifiedUrl = url;
        if (!url.includes("/it/iframe") && !url.includes("/en/iframe")) {
            modifiedUrl = url.replace("/iframe", "/it/iframe");
        }
 
        const response1 = await soraFetch(modifiedUrl);
        const html1 = await response1.text();
 
        const iframeMatch = html1.match(/<iframe[^>]*src=["']([^"']+)["']/i);
        if (!iframeMatch) {
            console.log("No iframe found in the HTML.");
            return null;
        }
 
        const embedUrl = iframeMatch[1].replace(/&amp;/g, "&");
        console.log("Embed URL:", embedUrl);
 
        const response2 = await soraFetch(embedUrl);
        const html2 = await response2.text();
 
        if (html2.includes("window.masterPlaylist")) {
            const urlMatch = html2.match(/url:\s*['"]([^'"]+)['"]/);
            const tokenMatch = html2.match(/['"]?token['"]?\s*:\s*['"]?([^'",}\s]+)/);
            const expiresMatch = html2.match(/['"]?expires['"]?\s*:\s*['"]?([^'",}\s]+)/);
 
            if (urlMatch && tokenMatch && expiresMatch && tokenMatch[1] !== "null" && expiresMatch[1] !== "null") {
                const separator = urlMatch[1].includes("?") ? "&" : "?";
                let streamUrl = urlMatch[1] + separator + "token=" + encodeURIComponent(tokenMatch[1]) + "&expires=" + encodeURIComponent(expiresMatch[1]);
                if (patcher) {
                    streamUrl += "&h=1";
                }
                console.log("Final URL found (Master Playlist): " + streamUrl);
                return JSON.stringify({
                    streams: [{
                        title: "VixCloud",
                        streamUrl: streamUrl,
                        headers: { Referer: embedUrl }
                    }]
                });
            }
        }
 
        const m3u8Match = html2.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/i);
        if (m3u8Match) {
            console.log("Final URL found (.m3u8 Match):", m3u8Match[1]);
            return m3u8Match[1];
        }
 
        const scriptMatches = html2.match(/<script[^>]*>(.*?)<\/script>/gis);
        if (scriptMatches) {
            for (const script of scriptMatches) {
                const streamMatch = script.match(/['"]?(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/i);
                if (streamMatch) {
                    console.log("Final URL found (Script Match):", streamMatch[1]);
                    return streamMatch[1];
                }
            }
        }
 
        const videoMatch = html2.match(/(?:src|source|url)['"]?\s*[:=]\s*['"]?(https?:\/\/[^'"\s]+(?:\.mp4|\.m3u8|\.mpd)[^'"\s]*)/i);
        if (videoMatch) {
            console.log("Final URL found (Video Source):", videoMatch[1]);
            return videoMatch[1];
        }
 
        console.log("No stream URL found. HTML preview:", html2.substring(0, 1000));
        return null;
 
    } catch (error) {
        console.error("Fetch error during stream extraction:", error);
        return null;
    }
}
 
async function soraFetch(url, options = {
    headers: {},
    method: 'GET',
    body: null
}) {
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
