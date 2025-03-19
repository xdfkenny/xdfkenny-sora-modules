async function searchResults(keyword) {
    try {
        // 1. Configurar URL con formato específico de Jkanime 2024
        const formattedKeyword = keyword.trim()
            .replace(/ /g, '_')    // Reemplazar espacios por _
            .replace(/%20/g, '_')  // Asegurar formato URL
            .toLowerCase();

        const searchUrl = `https://jkanime.net/buscar/${formattedKeyword}/`;

        // 2. Configurar headers para evitar bloqueos
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Referer': 'https://jkanime.net/',
            'Cache-Control': 'no-cache'
        };

        // 3. Realizar petición con timeout
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        const response = await fetch(searchUrl, { 
            headers, 
            signal: controller.signal 
        });

        // 4. Extraer datos con nueva estructura HTML
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        const results = Array.from(doc.querySelectorAll('.col-lg-2.col-md-6')).map(item => {
            const anime = item.querySelector('.anime__item');
            return {
                title: anime?.querySelector('h5 a')?.textContent?.trim(),
                image: anime?.querySelector('[data-setbg]')?.dataset?.setbg,
                href: anime?.querySelector('a')?.href
            };
        }).filter(item => item.href && item.title);

        return JSON.stringify(results);

    } catch (error) {
        return JSON.stringify([]);
    }
}
