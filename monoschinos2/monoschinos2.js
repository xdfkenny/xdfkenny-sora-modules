function cleanTitle(title) {
    return title
        .replace(/&#8217;/g, "'")  
        .replace(/&#8211;/g, "-")  
        .replace(/&#[0-9]+;/g, ""); 
}

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://wwv.monoschinos2.net/animes?buscar=" + encodeURIComponent(keyword));
        const html = await response.text();

        const regex = /<li class="col mb-5 ficha_efecto">.*?<a href="([^"]+)" title="([^"]+)">.*?<img[^>]+src="([^"]+)"/gs;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                href: match[1].trim().replace("./", "https://wwv.monoschinos2.net/"),
                title: cleanTitle(match[2].trim().replace(" Online Gratis", "").replace("Ver Anime", "")),
                image: match[3].trim()
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

        const match = html.match(/<div class="mb-3">\s*<p>(.*?)<\/p>/s);
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

        const epRegex = /<a[^>]+href=["'](\.\/ver\/[^"']+)["']/gi;
        let epMatch;
        const seen = new Set();
        let epCount = 1;

        while ((epMatch = epRegex.exec(html)) !== null) {
            const href = epMatch[1].replace("./", "https://wwv.monoschinos2.net/");
            if (!seen.has(href)) {
                seen.add(href);
                const numMatch = href.match(/episodio-(\d+)/i);
                const number = numMatch ? parseInt(numMatch[1], 10) : epCount;
                results.push({ href: href, number: number });
                epCount++;
            }
        }

        if (results.length > 0) {
            return JSON.stringify(results.reverse());
        }

        const parts = url.split('/');
        const u = parts[parts.length - 1] || parts[parts.length - 2];
        const iMatch = html.match(/data-i="(\d+)"/);
        const i = iMatch ? iMatch[1] : null;

        if (i) {
            let page = 1;
            while (page <= 5) {
                const formData = `acc=episodes&i=${i}&u=${u}&p=${page}`;
                const headers = {
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": url,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                };
                const res = await fetchv2("https://wwv.monoschinos2.net/ajax_pagination", headers, "POST", formData);
                const pageHtml = await res.text();
                if (!pageHtml.trim()) break;

                const regex = /<a class="ko" href="([^"]+)"/g;
                let match;
                while ((match = regex.exec(pageHtml)) !== null) {
                    const href = match[1].trim().replace("./", "https://wwv.monoschinos2.net/");
                    if (!seen.has(href)) {
                        seen.add(href);
                        results.push({
                            href: href,
                            number: results.length + 1
                        });
                    }
                }
                page++;
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

        const streams = [];
        const encryptMatch = html.match(/data-encrypt="([^"]+)"/);
        if (encryptMatch) {
            const iValue = encryptMatch[1];
            const formData = `acc=opt&i=${iValue}`;
            const headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Referer": url,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            };
            const domain = url.match(/https?:\/\/[^/]+/)[0];
            try {
                const optResp = await fetchv2(`${domain}/ajax_pagination`, headers, "POST", formData);
                const optHtml = await optResp.text();

                const mp4uploadMatch = optHtml.match(/data-player="([^"]+)"[^>]*>mp4upload/i);
                if (mp4uploadMatch) {
                    const playerUrl = atob(mp4uploadMatch[1]);
                    const playerResp = await fetchv2(playerUrl);
                    const playerHtml = await playerResp.text();
                    const mp4Match = playerHtml.match(/src:\s*"([^"]+\.mp4[^"]*)"/);
                    if (mp4Match) {
                        streams.push({
                            title: "Mp4Upload",
                            streamUrl: mp4Match[1],
                            headers: { "Referer": "https://mp4upload.com/" }
                        });
                    }
                }
            } catch (e) {}
        }

        if (streams.length === 0) {
            streams.push({
                title: "MonosChinos Player",
                streamUrl: url,
                headers: { "Referer": "https://wwv.monoschinos2.net/" }
            });
        }

        return JSON.stringify({ streams, subtitle: "" });
    } catch (error) {
        return JSON.stringify({
            streams: [{
                title: "MonosChinos Player",
                streamUrl: url,
                headers: { "Referer": "https://wwv.monoschinos2.net/" }
            }],
            subtitle: ""
        });
    }
}

function atob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charAt(i);
        if (char === '=') break;
        const index = chars.indexOf(char);
        if (index === -1) continue;
        buffer = (buffer << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            str += String.fromCharCode((buffer >> bits) & 0xFF);
            buffer &= (1 << bits) - 1;
        }
    }
    return str;
}
