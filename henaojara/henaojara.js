async function searchResults(keyword) {
    try {
        const response = await fetch(`https://jkanime.net/buscar/${encodeURIComponent(keyword)}/`);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const results = Array.from(doc.querySelectorAll('.anime__item')).map(anime => {
            const title = anime.querySelector('.anime__title')?.textContent.trim() || 'Sin título';
            const image = anime.querySelector('img')?.src || '';
            const href = anime.querySelector('a')?.href || '';
            
            return { title, image, href };
        });
        
        return JSON.stringify(results);
    } catch (error) {
        console.error('Error en searchResults:', error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const description = doc.querySelector('.sinopsis')?.textContent.trim() || 'Descripción no disponible';
        const aliases = Array.from(doc.querySelectorAll('.info span')).map(el => el.textContent).join(', ') || 'Sin información';
        const airdate = doc.querySelector('.fecha')?.textContent.trim() || 'Fecha desconocida';
        
        return JSON.stringify([{ description, aliases, airdate }]);
    } catch (error) {
        console.error('Error en extractDetails:', error);
        return JSON.stringify([{ description: 'Error al cargar detalles' }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        const episodes = [];
        const regex = /<a href="(https:\/\/jkanime\.net\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            episodes.push({
                href: match[1],
                number: match[2].replace('Episodio ', '').trim()
            });
        }
        
        return JSON.stringify(episodes.reverse());
    } catch (error) {
        console.error('Error en extractEpisodes:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // Extraer la URL del video
        const videoUrlMatch = html.match(/file:\s*"([^"]+)"/);
        if (!videoUrlMatch) throw new Error('No se encontró el video');
        
        const streamUrl = videoUrlMatch[1];
        
        return JSON.stringify({
            stream: streamUrl,
            subtitles: null
        });
    } catch (error) {
        console.error('Error en extractStreamUrl:', error);
        return JSON.stringify({ stream: null, subtitles: null });
    }
}
