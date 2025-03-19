async function searchResults(keyword) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Referer': 'https://jkanime.net/'
        };

        const response = await fetch(`https://jkanime.net/buscar/${encodeURIComponent(keyword)}/`, { headers });
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const results = Array.from(doc.querySelectorAll('.col-lg-2.col-md-6')).map(item => {
            const container = item.querySelector('.anime__item');
            return {
                title: container?.querySelector('h5')?.textContent?.trim() || 'Sin título',
                image: container?.querySelector('.set-bg')?.dataset?.setbg || '',
                href: container?.querySelector('a')?.href || ''
            };
        }).filter(item => item.href);

        return JSON.stringify(results);

    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Referer': url
        };

        const response = await fetch(url, { headers });
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const episodes = Array.from(doc.querySelectorAll('#episodes-content .epcontent')).map(ep => {
            return {
                href: ep.querySelector('a')?.href || '',
                number: ep.querySelector('span')?.textContent?.replace('Capitulo ', '') || '0'
            };
        }).reverse();

        return JSON.stringify(episodes);

    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Referer': url
        };

        const response = await fetch(url, { headers });
        const html = await response.text();
        
        // New improved video URL extraction
        const videoMatch = html.match(/file:\s*"([^"]+\.m3u8)"/);
        const streamUrl = videoMatch ? videoMatch[1] : null;

        return JSON.stringify({
            stream: streamUrl,
            subtitles: null
        });

    } catch (error) {
        return JSON.stringify({ stream: null, subtitles: null });
    }
}
