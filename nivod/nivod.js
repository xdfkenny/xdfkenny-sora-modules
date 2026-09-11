async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2(`https://e.kortw.cc/vodsearch/-------------.html?keyword=${keyword}`);
        const html = await response.text();
        
        const regex = /<li class="qy-mod-li[^>]*>[\s\S]*?<a href="([^"]+)"[\s\S]*?background-image:\s*url\(([^)]+)\)[\s\S]*?<span class="text-score">[^<]*<\/span>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<\/li>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: "https://www.nivod.cc" + match[2].trim(),
                href: "https://www.nivod.cc" + match[1].trim()
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

        const match = html.match(/id="show-desc">([\s\S]*?)<\/div>/);
        const description = match ? match[1].trim() : "N/A";

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

        const regex = /<a\s+href="([^"]*\/vodplay\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

        let match;
        const seen = new Set();
        let index = 1;
        while ((match = regex.exec(html)) !== null) {
            const rawHref = match[1].trim();
            const href = rawHref.startsWith('/') ? 'https://www.nivod.cc' + rawHref : rawHref;
            if (!seen.has(href)) {
                seen.add(href);
                const numMatch = match[2].match(/(\d+)/);
                const number = numMatch ? parseInt(numMatch[1], 10) : index;
                results.push({ href: href, number: number });
                index++;
            }
        }

        if (results.length === 0) {
            const vodIdMatch = url.match(/\/voddetail\/(\d+)/);
            if (vodIdMatch) {
                results.push({
                    href: `https://www.nivod.cc/vodplay/${vodIdMatch[1]}/v`,
                    number: 1
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

async function extractStreamUrl(url) {
    try {
        const match = url.match(/\/vodplay\/(\d+)\/([^\/]+)/);
        if (!match) {
            return JSON.stringify({
                streams: [{ title: "Nivod Stream", streamUrl: url, headers: { Referer: "https://www.nivod.cc/" } }],
                subtitle: ""
            });
        }
        
        const videoId = match[1];
        const episodeId = match[2];
        const apiUrl = `https://www.nivod.cc/xhr_playinfo/${videoId}-${episodeId}`;
        
        const response = await fetchv2(apiUrl);
        const data = await response.json();
        const streams = [];
        
        if (data.pdatas && Array.isArray(data.pdatas)) {
            data.pdatas.forEach((item, index) => {
                const streamUrl = item.playurl;
                if (!streamUrl) return;
                
                let hostname = '';
                const m = streamUrl.match(/^https?:\/\/([^\/]+)/);
                if (m) {
                    hostname = m[1];
                }
                
                streams.push({
                    title: `Server ${index + 1}`,
                    streamUrl: streamUrl,
                    headers: {
                        "Host": hostname,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36",
                        "Referer": "https://www.nivod.cc/",
                        "Origin": "https://www.nivod.cc"
                    }
                });
            });
        }
        
        if (streams.length === 0) {
            streams.push({
                title: "Nivod Stream",
                streamUrl: url,
                headers: { Referer: "https://www.nivod.cc/" }
            });
        }

        return JSON.stringify({
            streams: streams,
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({
            streams: [{ title: "Nivod Stream", streamUrl: url, headers: { Referer: "https://www.nivod.cc/" } }],
            subtitle: ""
        });
    }
}
