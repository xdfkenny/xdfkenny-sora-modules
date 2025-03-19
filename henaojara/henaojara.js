async function searchResults(keyword) {
    try {
        const response = await fetch(`https://jkanime.net/buscar/${encodeURIComponent(keyword)}/`);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const results = Array.from(doc.querySelectorAll('.anime__item')).map(anime => {
            const title = anime.querySelector('.anime__title')?.textContent?.trim() || 'Sin título';
            const image = anime.querySelector('img')?.src || '';
            const href = anime.querySelector('a')?.href || '';
            
            return { title, image, href };
        });
        
        return JSON.stringify(results.filter(item => item.href !== ''));
    } catch (error) {
        return JSON.stringify([]); // Eliminado console.error
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // Regex mejorado para extraer la URL del video
        const videoUrlMatch = html.match(/file:\s*["'](https:\/\/[^"']+\.m3u8)["']/);
        if (!videoUrlMatch) throw new Error('URL no encontrada');
        
        return JSON.stringify({
            stream: videoUrlMatch[1],
            subtitles: null
        });
    } catch (error) {
        return JSON.stringify({ stream: null, subtitles: null });
    }
}

// Mantén las otras funciones (extractDetails y extractEpisodes) sin console.error
