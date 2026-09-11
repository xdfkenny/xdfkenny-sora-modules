async function searchResults(keyword) {
    const regex = /<a href="([^"]*)" class="mse">[\s\S]*?<img src="([^"]*)" class="media-object">[\s\S]*?<h2>([^<]*?)<\/h2>/g;
    const results = [];
    try {
        const response = await fetchv2("https://www.animegg.org/search/?q=" + encodeURIComponent(keyword));
        const html = await response.text();

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: "https://www.animegg.org" + match[1].trim()
            });
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
        const response = await fetchv2(url);
        const html = await response.text();

        const descMatch = html.match(/<p class="ptext">(.*?)<\/p>/s);
        const description = descMatch ? descMatch[1].trim() : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: "N/A",
            airdate: "N/A"
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
        const response = await fetchv2(url);
        const html = await response.text();

        const regex = /<a[^>]+href="([^"#]+)"[^>]*>\s*<strong>[^<]*?\s+(\d+)<\/strong>/gi;
        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].startsWith('http') ? match[1].trim() : "https://www.animegg.org" + match[1].trim();
            const epNum = parseInt(match[2], 10);
            if (!seen.has(href)) {
                seen.add(href);
                results.push({ href: href, number: epNum });
            }
        }

        if (results.length === 0) {
            const fallbackRegex = /<a[^>]+href="([^"#]+-episode-(\d+))"/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                const href = match[1].startsWith('http') ? match[1].trim() : "https://www.animegg.org" + match[1].trim();
                const epNum = parseInt(match[2], 10);
                if (!seen.has(href)) {
                    seen.add(href);
                    results.push({ href: href, number: epNum });
                }
            }
        }

        return JSON.stringify(results.reverse());
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        const ulMatch = html.match(/<ul id="videos"[^>]*>(.*?)<\/ul>/s);
        if (!ulMatch) return JSON.stringify({streams: [], subtitle: "none"});
        const ulHtml = ulMatch[1];
        const liRegex = /<li><a[^>]*data-id='(\d+)'[^>]*data-version="(subbed|dubbed)"[^>]*>/g;
        const versions = [];
        let liMatch;
        while ((liMatch = liRegex.exec(ulHtml)) !== null) {
            versions.push({id: liMatch[1], type: liMatch[2]});
        }
        const embedPromises = versions.map(async (ver) => {
            const embedUrl = `https://www.animegg.org/embed/${ver.id}`;
            const embedResponse = await fetchv2(embedUrl);
            const embedHtml = await embedResponse.text();
            const vsMatch = embedHtml.match(/(?:var|const|let) videoSources = (\[[\s\S]*?\]);/);
            if (!vsMatch) return [];
            const jsonString = vsMatch[1].replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
            const vsJson = JSON.parse(jsonString);
            return vsJson.map(src => {
                const quality = src.label;
                const fileUrl = "https://www.animegg.org" + src.file;
                const title = (ver.type === 'subbed' ? 'Sub' : 'Dub') + ' • ' + quality;
                return {
                    title: title,
                    streamUrl: fileUrl,
                    headers: { "Referer": "https://www.animegg.org/" }
                };
            });
        });
        const streamArrays = await Promise.all(embedPromises);
        const streams = streamArrays.flat();
        return JSON.stringify({streams: streams, subtitle: "none"});
    } catch (err) {
        return JSON.stringify({streams: [], subtitle: "none"});
    }
}
