function cleanTitle(title) {
    return title
        .replace(/&#8217;/g, "'")  
        .replace(/&#8211;/g, "-")  
        .replace(/&#[0-9]+;/g, ""); 
}

async function searchResults(keyword) {
    const url = `https://animeheaven.me/fastsearch.php?xhr=1&s=${encodeURIComponent(keyword)}`;
    const response = await soraFetch(url);
    const html = await response.text();
    const results = [];

    const itemRegex = /<a class='ac' href='([^']+)'>[\s\S]*?<img class='coverimg' src='([^']+)' alt='[^']*'>[\s\S]*?<div class='fastname'>([^<]+)<\/div>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
        const href = `https://animeheaven.me${match[1]}`;
        const image = `https://animeheaven.me${match[2]}`;
        const rawTitle = match[3].trim();
        const title = cleanTitle(rawTitle);

        results.push({ title, image, href });
    }

    console.log(results);
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const response = await soraFetch(url);
    const html = await response.text();
    const details = [];

    const descriptionMatch = html.match(/<div class='infodes c'>([^<]+)<\/div>/);
    let description = descriptionMatch ? descriptionMatch[1] : '';

    const aliasesMatch = html.match(/<div class='infotitle c'>([^<]+)<\/div>/);
    let aliases = aliasesMatch ? aliasesMatch[1] : '';

    const airdateMatch = html.match(/Year: <div class='inline c2'>([^<]+)<\/div>/);
    let airdate = airdateMatch ? airdateMatch[1] : '';

    if (description && airdate) {
        details.push({
            description: description,
            aliases: aliases || 'N/A',
            airdate: airdate
        });
    }

    console.log(details);
    return JSON.stringify(details);
}

async function extractEpisodes(url) {
    const response = await soraFetch(url);
    const html = await response.text();
    const episodes = [];

    const episodeRegex = /<a[^>]+id="([^"]+)"[^>]*>[\s\S]*?<div class='[^']*watch2 bc'[^>]*>(\d+)<\/div>/g;

    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
        const id = match[1];
        const number = parseInt(match[2], 10);

        if (!isNaN(number)) {
            episodes.push({
                href: id,
                number: number
            });
        }
    }

    episodes.reverse();

    console.log(episodes);
    return JSON.stringify(episodes);
}

async function extractStreamUrl(id) {
    
    const cookieHeader = `key=${id}`;
    const headers = {
        Cookie: cookieHeader
    };

    const response = await soraFetch(`https://animeheaven.me/gate.php`, { headers });
    const html = await response.text();

    const sourceRegex = /<source\s+src=['"]([^"']+\.mp4\?[^"']*)['"]\s+type=['"]video\/mp4['"]/i;
    const match = html.match(sourceRegex);

    if (match) {
        const streamUrl = match[1].replace(/&amp;/g, '&');
        console.log("Extracted stream URL:", streamUrl);
        return streamUrl;
    } else {
        console.error("Stream URL not found.");
        return "";
    }
}

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
