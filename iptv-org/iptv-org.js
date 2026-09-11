async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://iptv-org.github.io/iptv/index.m3u");
        const m3uContent = await response.text();

        const lines = m3uContent.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#EXTINF:')) {
                const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                const logo = logoMatch ? logoMatch[1] : '';

                const lastCommaIndex = line.lastIndexOf(',');
                const fullName = lastCommaIndex !== -1 ? line.substring(lastCommaIndex + 1).trim() : '';

                const streamUrl = (i + 1 < lines.length) ? lines[i + 1].trim() : '';

                const hlsEndings = [".m3u8", ".m3u", ".m3u?", ".m3u8?", ".m3u#", ".m3u8#"];
                const urlLower = streamUrl.toLowerCase();
                const isHls = hlsEndings.some(ending => urlLower.endsWith(ending));
                if (fullName.toLowerCase().includes(keyword.toLowerCase()) && isHls) {
                    results.push({
                        title: fullName,
                        image: logo,
                        href: streamUrl
                    });
                }
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
        return JSON.stringify([{
            description: "N/A",
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

        results.push({
            href: url,
            number: 1
        });


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
        return JSON.stringify({
            "streams": [
                {
                "title": "Server 1",
                "streamUrl": url,
                "headers": {}
                }
            ],
            "subtitle": ""
            });
    } catch (err) {
        return "https://error.org/";
    }
}