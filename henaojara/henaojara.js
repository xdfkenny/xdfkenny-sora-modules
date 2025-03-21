const BASE_URL = 'https://henaojara.com';
const SEARCH_URL = `${BASE_URL}/?s=`;

/* MAIN FUNCTIONS */

async function searchResults(keyword) {
    try {
        const response = await fetch(`${SEARCH_URL}${encodeURIComponent(keyword)}`);
        const html = await response.text();
        
        const results = [];
        const regex = /<article[\s\S]*?href="([^"]+)[\s\S]*?<img.*?src="([^"]+)[\s\S]*?<h2.*?>(.*?)<\/h2>/g;
        const matches = html.matchAll(regex);

        for (const match of matches) {
            results.push({
                title: cleanText(match[3]),
                image: match[2],
                href: match[1]
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error('Search error:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        const details = {
            description: extractMeta(html, 'description'),
            airdate: extractAirdate(html),
            aliases: extractAliases(html)
        };

        return JSON.stringify([details]);
    } catch (error) {
        console.error('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: 'Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        const episodes = [];
        const regex = /<a href="(https:\/\/henaojara.com\/animeonline\/episode\/[^"]+-(\d+)x(\d+)\/)[^"]*sub-espanol[^"]*"/gi;
        const matches = html.matchAll(regex);

        for (const match of matches) {
            episodes.push({
                href: match[1],
                number: `S${match[2]}E${match[3]}`,
                season: parseInt(match[2]),
                episode: parseInt(match[3])
            });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error('Episodes error:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // First try direct Streamtape iframe
        const iframeRegex = /<iframe.*?src="(https:\/\/streamtape\.com\/[^"]+)"/i;
        const iframeMatch = html.match(iframeRegex);
        if (iframeMatch) return JSON.stringify({ stream: iframeMatch[1] });

        // Fallback to animeflv-style unpacker
        const scriptRegex = /<script[^>]*>\s*(eval.*?)\s*<\/script>/s;
        const scriptMatch = html.match(scriptRegex);
        if (scriptMatch) {
            const unpacked = unpack(scriptMatch[1]);
            const streamMatch = unpacked.match(/(https?:\/\/[^\s'"]+\.(mp4|m3u8))/i);
            if (streamMatch) return JSON.stringify({ stream: streamMatch[0] });
        }

        return JSON.stringify({ stream: null });
    } catch (error) {
        console.error('Stream error:', error);
        return JSON.stringify({ stream: null });
    }
}

/* HELPER FUNCTIONS */

function cleanText(text) {
    return text.replace(/<\/?[^>]+(>|$)/g, '').trim();
}

function extractMeta(html, metaName) {
    const regex = new RegExp(`<meta name="${metaName}" content="([^"]+)"`);
    const match = html.match(regex);
    return match ? cleanText(match[1]) : 'No description available';
}

function extractAirdate(html) {
    const dateRegex = /<span class="date">([^<]+)</i;
    const dateMatch = html.match(dateRegex);
    return dateMatch ? cleanText(dateMatch[1]) : 'Unknown air date';
}

function extractAliases(html) {
    const aliasRegex = /<h2>También conocida como:<\/h2>\s*<p>([^<]+)</i;
    const aliasMatch = html.match(aliasRegex);
    return aliasMatch ? cleanText(aliasMatch[1]) : 'No alternative titles';
}

/* UNPACKER (Modified from original animeflv implementation) */
function unpack(packed) {
    try {
        return (new Function(packed + ';return p}'))().replace(/\\/g, '');
    } catch (e) {
        console.error('Unpack error:', e);
        return '';
    }
}
