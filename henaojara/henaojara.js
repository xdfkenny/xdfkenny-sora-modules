async function searchResults(keyword) {
    try {
        const response = await fetch(`https://jkanime.net/buscar/${encodeURIComponent(keyword)}/`);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const results = Array.from(doc.querySelectorAll('.col-lg-2.col-md-6.col-sm-6')).map(item => {
            const anime = item.querySelector('.anime__item');
            return {
                title: anime.querySelector('h5 a')?.textContent?.trim() || 'Sin título',
                image: anime.querySelector('.set-bg')?.getAttribute('data-setbg') || '',
                href: anime.querySelector('a')?.href || ''
            };
        });
        
        return JSON.stringify(results.filter(r => r.href));

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
        
        return JSON.stringify([{
            description: doc.querySelector('.tab.sinopsis')?.textContent?.trim() || 'Descripción no disponible',
            aliases: Array.from(doc.querySelectorAll('#ainfo p')).map(p => p.textContent).join(' ') || 'Sin información adicional',
            airdate: doc.querySelector('.fechas')?.textContent?.trim() || 'Fecha desconocida'
        }]);
        
    } catch (error) {
        return JSON.stringify([{description: 'Error al cargar detalles'}]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        const episodes = [];
        const regex = /<a href="(https:\/\/jkanime\.net\/[^"]+?)"[^>]*>.*?<span>([^<]+)/gs;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            episodes.push({
                href: match[1],
                number: match[2].replace('Capitulo ', '').trim()
            });
        }
        
        return JSON.stringify(episodes.reverse());
        
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // Extraer URL del reproductor
        const videoMatch = html.match(/file:\s*["'](https:\/\/[^"']+\.m3u8)["']/);
        if (!videoMatch) throw new Error('URL no encontrada');
        
        return JSON.stringify({
            stream: videoMatch[1],
            subtitles: null
        });
        
    } catch (error) {
        return JSON.stringify({stream: null, subtitles: null});
    }
}
