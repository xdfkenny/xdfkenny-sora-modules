async function searchResults(keyword) {
    try {
        // 1. Construcción de URL
        const url = https://jkanime.net/?s=${encodeURIComponent(keyword)};
        
        // 2. Fetch con manejo de errores HTTP
        const response = await fetch(url, {
            headers: {
                'Accept': 'text/html',
                'Referer': 'https://jkanime.net/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) throw new Error(HTTP error! status: ${response.status});
        
        const html = await response.text();
        
        // 3. Usar DOMParser para mejor confiabilidad
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 4. Selectores CSS actualizados
        const items = doc.querySelectorAll('div.container section div.animes__body ul li');
        
        const results = [];
        
        items.forEach(item => {
            const link = item.querySelector('a');
            const img = item.querySelector('img');
            const title = item.querySelector('h5');
            
            if (link && img && title) {
                results.push({
                    title: title.textContent.trim(),
                    image: img.dataset.src || img.src,
                    href: link.href
                });
            }
        });
        
        // 5. Limitar resultados y validar JSON
        return JSON.stringify(results.slice(0, 20), null, 2);
        
    } catch (error) {
        console.error('Error en searchResults:', error);
        return JSON.stringify(
            { error: true, message: error.message },
            null, 
            2
        );
    }
}
