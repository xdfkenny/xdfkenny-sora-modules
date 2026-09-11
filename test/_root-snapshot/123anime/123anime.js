const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://123animehub.cc/"
};

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://123animehub.cc/search?keyword=" + encodeURIComponent(keyword), defaultHeaders);
        const html = await response.text();

        const filmListMatch = html.match(/<div class="film-list[^"]*">([\s\S]*?)(?:<div class="clearfix"><\/div>|$(?![\s\S]))/i);
        const filmList = filmListMatch ? filmListMatch[1] : html;

        const itemBlocks = filmList.split(/<div class="item">/i).slice(1);
        for (const block of itemBlocks) {
            const hrefMatch = block.match(/href="([^"]+)"/);
            const titleMatch = block.match(/data-jtitle="([^"]+)"/) || block.match(/class="name"[^>]*>([^<]+)</) || block.match(/alt="([^"]+)"/);
            const imageMatch = block.match(/<img[^>]+data-src="([^"]+)"/) || block.match(/<img[^>]+src="([^"]+)"/) || block.match(/(?:data-src|src)="([^"]+)"/);

            if (hrefMatch && titleMatch) {
                const href = hrefMatch[1].trim();
                const title = titleMatch[1].trim();
                const image = imageMatch ? imageMatch[1].trim() : "";

                results.push({
                    title: title,
                    image: image ? (image.startsWith("http") ? image : "https://123animehub.cc" + image) : "",
                    href: href.startsWith("http") ? href : "https://123animehub.cc" + href
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            title: "Error",
            image: "Error",
            href: "Error"
        }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url, defaultHeaders);
        const html = await response.text();

        let description = "N/A";
        let aliases = "N/A";
        let airdate = "N/A";

        const descMatch = html.match(/<div class="desc">([\s\S]*?)<\/div>/);
        if (descMatch) {
            description = descMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        }

        const aliasMatch = html.match(/<p class="alias">([^<]*)<\/p>/);
        if (aliasMatch) {
            aliases = aliasMatch[1].trim();
        }

        const airdateMatch = html.match(/<dt>Released:<\/dt>\s*<dd>\s*<a[^>]*>(\d+)<\/a>/);
        if (airdateMatch) {
            airdate = airdateMatch[1].trim();
        }

        return JSON.stringify([{
            description: description,
            aliases: aliases,
            airdate: airdate
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }]);
    }
}

async function extractEpisodes(url) {
    const results = [];
    try {
        const animeId = url.split('/').pop();

        const response = await fetchv2("https://123animehub.cc/ajax/film/sv?id=" + animeId, defaultHeaders);
        const jsonData = await response.json();
        const html = jsonData.html;

        const episodesMatch = html.match(/<ul class="episodes range"[^>]*>([\s\S]*?)<\/ul>/);
        if (!episodesMatch) {
            return JSON.stringify(results);
        }

        const episodesHTML = episodesMatch[1];

        const episodeRegex = /data-pop='(\d+)'/g;
        let match;
        const seenEpisodes = new Set();

        while ((match = episodeRegex.exec(episodesHTML)) !== null) {
            const episodeNum = parseInt(match[1], 10);

            if (!seenEpisodes.has(episodeNum)) {
                seenEpisodes.add(episodeNum);
                results.push({
                    href: animeId + "/" + episodeNum + "/vidstreaming.io",
                    number: episodeNum
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error"
        }]);
    }
}

async function extractStreamUrl(ID) {
    try {
        const response = await fetchv2("https://123animehub.cc/ajax/episode/info?epr=" + encodeURIComponent(ID), defaultHeaders);
        const data = await response.json();
        const target = data.target;

        if (!target) throw new Error("No target in response: " + JSON.stringify(data));

        const responseTarget = await fetchv2(target, defaultHeaders);
        const htmlTarget = await responseTarget.text();
        const zrpart2Match = htmlTarget.match(/var\s+zrpart2\s*=\s*'([^']+)';/);
        if (!zrpart2Match) throw new Error("zrpart2 not found");
        const zrpart2 = zrpart2Match[1];

        const originMatch = target.match(/^(https?:\/\/[^\/]+)/);
        const origin = originMatch ? originMatch[1] : "";

        const hsUrl = `${origin}/hs/${zrpart2}`;
        const responseHs = await fetchv2(hsUrl, defaultHeaders);
        const htmlHs = await responseHs.text();
        const dataIdMatch = htmlHs.match(/id="mg-player"[^>]*data-id="([^"]+)"/);
        if (!dataIdMatch) throw new Error("data-id not found");
        const dataId = dataIdMatch[1];

        const sourcesUrl = `${origin}/hs/getSources?id=${dataId}`;
        const responseSources = await fetchv2(sourcesUrl, defaultHeaders);
        const dataSources = await responseSources.json();

        let sourcesArray = [];
        if (Array.isArray(dataSources)) {
            sourcesArray = dataSources;
        } else if (dataSources && Array.isArray(dataSources.sources)) {
            sourcesArray = dataSources.sources;
        } else if (dataSources && typeof dataSources.sources === "string") {
            sourcesArray = [{ file: dataSources.sources, label: "Auto" }];
        } else {
            console.log("Unexpected dataSources format:", JSON.stringify(dataSources));
        }

        const streams = sourcesArray.map(source => ({
            title: source.label || "Auto",
            streamUrl: "https://stream-proxy-397vf67bnod.simplepostrequest.workers.dev/?url=" + encodeURIComponent(source.file || source.url || source.link) + "&referer=https%3A%2F%2Fplay2.echovideo.ru",
            headers: {
                "Origin": "https://play2.echovideo.ru",
                "Referer": "https://play2.echovideo.ru/"
            }
        }));

        return JSON.stringify({ streams: streams });
    } catch (err) {
        console.log("Stream URL Error details:", err.message, err.stack);
        return "https://error.org/";
    }
}
