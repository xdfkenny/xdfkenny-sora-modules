async function searchResults(keyword) {
    const postData = `op=title_search&q=${encodeURIComponent(keyword)}`;
    const headers = await getDefaultHeaders();
    const results = [];
    try {
        const response = await fetchv2("https://otaku-streamers.com/a.php", headers, "POST", postData);
        const data = await response.json();

        if (data && data.content) {
            data.content.forEach(item => {
                results.push({
                    title: item.title,
                    image: item.cover,
                    href: item.url
                });
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
    const headers = await getDefaultHeaders();
    try {
        const response = await fetchv2(url, headers);
        const html = await response.text();

        const descriptionMatch = html.match(/<div class="tp-synopsis">[\s\S]*?<p>([\s\S]*?)<\/p>/i);
        const description = descriptionMatch ? descriptionMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[^>]+(>|$)/g, "").trim() : "N/A";

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
    const headers = await getDefaultHeaders();
    const results = [];
    try {
        const response = await fetchv2(url, headers);
        const html = await response.text();

        const regex = /<a href="(.*?)" class="tp-ep-row" data-no="(.*?)">/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                href: match[1].trim(),
                number: parseInt(match[2], 10)
            });
        }
        results.reverse();
        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    const headers = await getDefaultHeaders();
    try {
        const response = await fetchv2(url, headers);
        const html = await response.text();

        const streamMatch = html.match(/<source src="(.*?)" type=".*?"\/>/i);
        return streamMatch ? streamMatch[1] : "https://error.org/";
    } catch (err) {
        return "https://error.org/";
    }
}

async function getDefaultHeaders() {
    const session = await fetchv2("https://ilovefeet.simplepostrequest.workers.dev/session");
    const sessionKey = await session.text();
    return {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Cookie": `bb_betasessionhash=${sessionKey}`
    };
}
