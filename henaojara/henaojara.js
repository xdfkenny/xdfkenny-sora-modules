async function searchResults(keyword) {
    try {
        const response = await fetch(`https://henaojara.com/?s=${encodeURIComponent(keyword)}`);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const results = Array.from(doc.querySelectorAll('.MovieList .TPostMv')).map(anime => {
            return {
                title: anime.querySelector('.Title').textContent.trim(),
                image: anime.querySelector('img').dataset.src,
                href: anime.querySelector('a').href
            };
        });
        
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const details = {
            description: doc.querySelector('meta[property="og:description"]').content,
            aliases: Array.from(doc.querySelectorAll('.Info span')).map(el => el.textContent).join(', '),
            airdate: doc.querySelector('.Year').textContent.trim()
        };
        
        return JSON.stringify([details]);
    } catch (error) {
        return JSON.stringify([{ description: 'Descripción no disponible' }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const seasonMatch = url.match(/season\/(.+?)\/$/);
        const season = seasonMatch ? seasonMatch[1] : '1';
        
        const episodes = Array.from(html.matchAll(/<a href="(https:\/\/henaojara.com\/animeonline\/episode\/[^"]+?)".*?<span class="ClB">([^<]+)/gs)).map(match => {
            return {
                href: match[1],
                number: match[2].replace('Capitulo ', '').trim()
            };
        });
        
        return JSON.stringify(episodes.reverse());
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // Extract encoded video URL
        const encodedUrlMatch = html.match(/var sources = ({.*?});/s);
        if (!encodedUrlMatch) throw new Error('No video found');
        
        const sources = JSON.parse(encodedUrlMatch[1]);
        const hlsUrl = base64Decode(sources.hls);
        
        return JSON.stringify({
            stream: hlsUrl,
            subtitles: null // Subtitles embedded in stream
        });
    } catch (error) {
        return JSON.stringify({ stream: null, subtitles: null });
    }
}

// Base64 decoder for video URLs
function base64Decode(str) {
    return decodeURIComponent(atob(str).split('').map(c => 
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
}
