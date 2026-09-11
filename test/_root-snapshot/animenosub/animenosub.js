async function searchResults(keyword) {
    const results = [];
    const response = await fetchv2(`https://animenosub.to/?s=${keyword}`);
    const html = await response.text();

    // Regex pattern to extract the title, image, and href from the article elements
    const regex = /<article class="bs"[^>]*>.*?<a href="([^"]+)"[^>]*>.*?<img src="([^"]+)"[^>]*>.*?<h2[^>]*>(.*?)<\/h2>/gs;

    let match;
    while ((match = regex.exec(html)) !== null) {
        results.push({
            title: match[3].trim(),
            image: match[2].trim(),
            href: match[1].trim()
        });
    }

    return JSON.stringify(results);
}

async function extractDetails(url) {
    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();

    const match = html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/);

    let description = "N/A";
    if (match) {
        description = match[1]
            .replace(/<[^>]+>/g, '') 
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code)) 
            .replace(/&quot;/g, '"') 
            .replace(/&apos;/g, "'") 
            .replace(/&amp;/g, "&") 
            .trim();
    }

    results.push({
        description: description,
        aliases: 'N/A',
        airdate: 'N/A'
    });

    return JSON.stringify(results);
}

async function extractEpisodes(url) {
    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();

    const regex = /<a href="([^"]+)">\s*<div class="epl-num">([\d.]+)<\/div>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        results.push({
            href: match[1].trim(),
            number: parseFloat(match[2])
        });
    }
    results.reverse();
    return JSON.stringify(results);
}


async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        const streams = [];
        
        const optionRegex = /<option value="([^"]+)"[^>]*>\s*([^<]*Omega[^<]*)\s*<\/option>/gi;
        
        let optionMatch;
        while ((optionMatch = optionRegex.exec(html)) !== null) {
            const base64Value = optionMatch[1];
            const label = optionMatch[2].trim();
            
            if (!base64Value) continue;

            try {
                const decodedHtml = atob(base64Value);
                const iframeMatch = decodedHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                
                if (iframeMatch) {
                    let iframeUrl = iframeMatch[1];
                    if (iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl;

                    const responseTwo = await fetchv2(iframeUrl);
                    const htmlTwo = await responseTwo.text();

                    const m3u8Match = htmlTwo.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+master\.m3u8[^'"]*)['"]/i) || 
                                      htmlTwo.match(/file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i);
                    
                    if (m3u8Match) {
                        streams.push({
                            title: label,
                            streamUrl: m3u8Match[1],
                            headers: {
                                "Referer": "https://vidmoly.biz/",
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                            }
                        });
                    }
                }
            } catch (innerErr) {
            }
        }

        return JSON.stringify({
            streams: streams,
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
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
