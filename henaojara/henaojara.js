async function searchResults(keyword) {
    try {
        // 1. Configurar URL con parámetros actualizados
        const searchUrl = new URL('https://jkanime.net/');
        searchUrl.pathname = `/buscar/${encodeURIComponent(keyword).replace(/%20/g, '_')}/`;

        // 2. Headers para evitar bloqueos
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Referer': 'https://jkanime.net/',
            'X-Requested-With': 'XMLHttpRequest'
        };

        // 3. Fetch con timeout y validación
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(searchUrl, {
            headers,
            signal: controller.signal,
            cache: 'no-store'
        });

        // 4. Parsear HTML con nueva estructura
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        // 5. Selectores actualizados (Marzo 2024)
        const results = Array.from(doc.querySelectorAll('.col-lg-2.col-md-6.col-sm-6')).map(item => {
            const animeBlock = item.querySelector('.anime__item');
            return {
                title: animeBlock?.querySelector('.anime__item__text h5')?.textContent?.trim(),
                image: animeBlock?.querySelector('[data-setbg]')?.dataset?.setbg,
                href: animeBlock?.querySelector('.anime__item__text a')?.href
            };
        }).filter(item => item.href && item.title);

        return JSON.stringify(results.slice(0, 25));

    } catch (error) {
        return JSON.stringify([]);
    }
}
