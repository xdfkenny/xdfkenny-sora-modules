async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`https://aniwaves.ru/filter?keyword=${encodedKeyword}`);
        const html = await responseText.text();

        const regex = /<div\s+class="item\s*">[\s\S]*?<a\s+href="([^"]+)">[\s\S]*?<img\s+src="([^"]+)"[^>]*>[\s\S]*?<a\s+class="name\s+d-title"[^>]*>([^<]+)<\/a>/g;

        const results = [];
        let match;

        while ((match = regex.exec(html)) !== null) {
            if (match[3].trim() === "Omiai Aite Wa Oshiego Tsuyokina Mondaiji") {
                continue;
            }

            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: `https://aniwaves.ru${match[1].trim()}`
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const responseText = await soraFetch(url);
        const html = await responseText.text();

        // Description: match synopsis div, then find any div with class containing "content"
        const descriptionMatch = html.match(/<div class="synopsis mb-3">[\s\S]*?<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/);
        let description = descriptionMatch ? descriptionMatch[1].trim() : 'No description available';

        // Remove possible "Aired, ..." prefix (only on episode pages)
        description = description.replace(/^Aired,\s+[^,]+,\s*/, '');

        const aliasesMatch = html.match(/<div class="names font-italic mb-2">(.*?)<\/div>/);
        const aliases = aliasesMatch ? aliasesMatch[1].trim() : 'No aliases available';

        const airdateMatch = html.match(/Date aired:\s*<span><span[^>]*>(.*?)<\/span>/);
        const airdate = airdateMatch ? `Aired: ${airdateMatch[1].trim()}` : 'Aired: Unknown';

        const transformedResults = [{
            description,
            aliases,
            airdate
        }];

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired/Released: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        // Extract series slug from URLs like https://aniwaves.ru/watch/kimetsu-no-yaiba-77717
        const slugMatch = url.match(/https:\/\/aniwaves\.ru\/watch\/([^\/]+)/);
        if (!slugMatch) throw new Error("Invalid URL format");
        const animeSlug = slugMatch[1];

        // First hyphen-separated word for fallback (e.g., "kimetsu")
        const firstWordMatch = animeSlug.match(/^([^-]+)/);
        const firstSlugWord = firstWordMatch ? firstWordMatch[1] : animeSlug;

        const responseText = await soraFetch(url);
        const html = await responseText.text();

        // Capture episode count: "Episodes: <span>26 / 26</span>" -> take first number
        const episodesMatch = html.match(/Episodes:\s*<span>(\d+)/);
        const episodesCount = episodesMatch ? parseInt(episodesMatch[1], 10) : 0;

        const transformedResults = [];

        if (episodesCount > 0) {
            for (let i = 1; i <= episodesCount; i++) {
                transformedResults.push({
                    href: `${url}/episode/${i}`,
                    number: i
                });
            }
        } else {
            // Fallback search using the API
            const apiUrl = `https://aniwaves.ru/filter?keyword=${encodeURIComponent(firstSlugWord)}`;
            const searchResponse = await soraFetch(apiUrl);
            const searchHtml = await searchResponse.text();

            // Match a search result card: <a href="/watch/..." ...><span>Ep: 26</span>
            const regex = new RegExp(
                `<a\\s+[^>]*href="\\/watch\\/${animeSlug}"[^>]*>[\\s\\S]*?<span>Ep:\\s*(\\d+)<\\/span>`,
                'i'
            );
            const epMatch = searchHtml.match(regex);
            const fallbackCount = epMatch ? parseInt(epMatch[1], 10) : 0;

            for (let i = 1; i <= fallbackCount; i++) {
                transformedResults.push({
                    href: `${url}/episode/${i}`,
                    number: i
                });
            }
        }

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Fetch error in extractEpisodes:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        console.log("Input URL: " + url);
        const match = url.match(/https:\/\/aniwaves\.ru\/watch\/([^\/]+)\/episode\/(\d+)/);
        if (!match) throw new Error("Invalid URL format – expected /watch/SLUG/episode/NUM");

        const animeSlug = match[1];
        const episodeNumber = match[2];
        console.log("Anime slug: " + animeSlug + ", Episode: " + episodeNumber);

        const idMatch = animeSlug.match(/(\d+)$/);
        if (!idMatch) throw new Error("Could not extract show ID from slug");
        const showId = idMatch[1];
        console.log("Show ID: " + showId);

        const headers = { 'Referer': url };

        // Step 1: Get server list (JSON -> extract result HTML)
        const listUrl = "https://aniwaves.ru/ajax/server/list?servers=" + showId + "&eps=" + episodeNumber;
        console.log("Fetching server list: " + listUrl);
        const listResp = await soraFetch(listUrl, { headers });
        if (!listResp) throw new Error("No response for server list");
        const rawText = await listResp.text();
        const listJson = JSON.parse(rawText);
        const html = listJson.result;                     // the actual HTML
        console.log("Server list HTML (first 500 chars): " + html.substring(0, 500));

        // Extract first sub link-id (overall first)
        const subIdMatch = html.match(/data-link-id="([^"]+)"/);
        console.log("Sub ID match: " + (subIdMatch ? subIdMatch[1] : "null"));
        // Extract first dub link-id inside the dub block
        const dubIdMatch = html.match(/<div class="type" data-type="dub">[\s\S]*?data-link-id="([^"]+)"/);
        console.log("Dub ID match: " + (dubIdMatch ? dubIdMatch[1] : "null"));

        const subUrls = [];
        const dubUrls = [];

        async function resolveM3u8(linkId, type) {
            console.log("\n--- Resolving " + type + " stream for link ID: " + linkId + " ---");
            try {
                // Step 2: get embed URL
                const srcUrl = "https://aniwaves.ru/ajax/sources?id=" + encodeURIComponent(linkId) + "&asi=0&autoPlay=0";
                console.log("Fetching source: " + srcUrl);
                const srcResp = await soraFetch(srcUrl, { headers });
                if (!srcResp) { console.log("No response for source API"); return null; }
                const srcText = await srcResp.text();
                console.log("Source API response (first 500 chars): " + srcText.substring(0, 500));
                const srcData = JSON.parse(srcText);
                const embedUrl = srcData?.result?.url;
                if (!embedUrl) { console.log("No embed URL in source response"); return null; }
                console.log("Embed URL: " + embedUrl);

                // Step 3: fetch embed page, extract data-id for getSources
                console.log("Fetching embed page...");
                const embedResp = await soraFetch(embedUrl, { headers });
                if (!embedResp) { console.log("No response for embed page"); return null; }
                const embedHtml = await embedResp.text();
                console.log("Embed HTML (first 500 chars): " + embedHtml.substring(0, 500));
                
                // NEW: extract data-id from the player div
                const dataIdMatch = embedHtml.match(/data-id="([^"]+)"/);
                if (!dataIdMatch) { console.log("No data-id found in embed page"); return null; }
                const sourceId = dataIdMatch[1];
                console.log("getSources ID (data-id): " + sourceId);

                // Step 4: call getSources
                const getSrcUrl = "https://play.echovideo.ru/embed-1/getSources?id=" + sourceId;
                console.log("Fetching getSources: " + getSrcUrl);
                const getSrcResp = await soraFetch(getSrcUrl, { headers });
                if (!getSrcResp) { console.log("No response for getSources"); return null; }
                const getSrcText = await getSrcResp.text();
                console.log("getSources response: " + getSrcText);
                const srcData2 = JSON.parse(getSrcText);
                const sources = srcData2?.sources;
                if (!sources) { console.log("No 'sources' field in getSources response"); return null; }
                console.log("Found M3U8: " + sources);
                return sources;
            } catch (e) {
                console.log("Error resolving " + type + ": " + e);
                return null;
            }
        }

        if (subIdMatch) {
            const m3u8 = await resolveM3u8(subIdMatch[1], "SUB");
            if (m3u8) subUrls.push(m3u8);
        }

        if (dubIdMatch) {
            const m3u8 = await resolveM3u8(dubIdMatch[1], "DUB");
            if (m3u8) dubUrls.push(m3u8);
        }

        console.log("\nFinal SUB URLs: " + JSON.stringify(subUrls));
        console.log("Final DUB URLs: " + JSON.stringify(dubUrls));

        const streams = [];
        if (subUrls[0]) streams.push({ title: "SUB", streamUrl: subUrls[0], headers: { 'Referer': url } });
        if (dubUrls[0]) streams.push({ title: "DUB", streamUrl: dubUrls[0], headers: { 'Referer': url } });

        const result = { streams, subtitles: "" };
        console.log("Result: " + JSON.stringify(result));
        return JSON.stringify(result);

    } catch (error) {
        console.log("Fetch error in extractStreamUrl: " + error);
        const result = { streams: "", subtitles: "" };
        console.log("Error result: " + JSON.stringify(result));
        return JSON.stringify(result);
    }
}

// extractStreamUrl(`https://aniwaves.ru/anime-watch/one-piece/ep-1`);

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
