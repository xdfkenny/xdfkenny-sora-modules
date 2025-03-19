async function searchResults(keyword) {
    try {
        const safeKeyword = encodeURIComponent(keyword).replace(/%20/g, '+');
        const url = `https://jkanime.net/buscar/${safeKeyword}/`;

        // Configuración anti-crash
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept-Language': 'es-ES,es;q=0.9'
            }
        });

        clearTimeout(timeoutId);
        const html = await response.text();

        // Parseo seguro con validación de nodos
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const items = Array.from(doc.querySelectorAll('div.anime__item'));

        if (!items.length) return JSON.stringify([]);

        const results = items.map(item => {
            const link = item.querySelector('a[href]');
            const image = item.querySelector('[data-setbg]');
            const title = item.querySelector('h5');

            return {
                title: title?.textContent?.trim() || 'Título no disponible',
                image: image?.dataset?.setbg || 'https://via.placeholder.com/300x400',
                href: link?.href || ''
            };
        }).filter(item => item.href);

        return JSON.stringify(results.slice(0, 25)); // Limitar resultados

    } catch (error) {
        console.error('Búsqueda fallida:', error);
        return JSON.stringify([]);
    }
}
