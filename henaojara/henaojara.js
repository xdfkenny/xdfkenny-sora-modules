async function searchResults(keyword) {
    try {
        // 1. Configuración ultra-rápida con timeout
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        
        // 2. URL codificada para Jkanime 2024
        const searchUrl = `https://jkanime.net/buscar/${encodeURIComponent(keyword).replace(/%20/g, '_')}/`;
        
        // 3. Fetch optimizado para iOS
        const response = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                'Referer': 'https://jkanime.net/',
                'Accept-Language': 'es-ES,es;q=0.9'
            }
        });
        
        // 4. Parseo seguro
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        // 5. Selectores actualizados (Junio 2024)
        const results = Array.from(doc.querySelectorAll('.col-lg-2.col-md-6')).map(item => {
            const anchor = item.querySelector('.anime__item a');
            const image = item.querySelector('.anime__item [data-src]');
            const title = item.querySelector('.anime__item h5');
            
            return anchor && image && title ? {
                title: title.textContent.trim(),
                image: image.dataset.src,
                href: anchor.href
            } : null;
        }).filter(Boolean);
        
        return JSON.stringify(results.slice(0, 15));

    } catch (error) {
        return JSON.stringify([]);
    }
}
