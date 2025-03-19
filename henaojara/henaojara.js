// searchResults - Versión 100% anti-crash
async function searchResults(keyword) {
    try {
        // 1. Configuración segura de URL
        const encodedKeyword = encodeURIComponent(keyword)
            .replace(/%20/g, '+')
            .replace(/'/g, '%27');
        
        const searchUrl = `https://jkanime.net/buscar/${encodedKeyword}/`;

        // 2. Configurar timeout de 5 segundos
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        // 3. Hacer request con headers móviles
        const response = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html'
            }
        });
        
        clearTimeout(timeout);

        // 4. Validar respuesta HTTP
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
            return JSON.stringify([]);
        }

        const html = await response.text();

        // 5. Parseo seguro con DOMParser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 6. Selectores actualizados (noviembre 2023)
        const results = Array.from(doc.querySelectorAll('div.anime__item')).map(item => {
            try {
                return {
                    title: item.querySelector('h5')?.textContent?.trim() || 'Sin título',
                    image: item.querySelector('[data-setbg]')?.dataset?.setbg || '',
                    href: item.querySelector('a')?.href || ''
                };
            } catch {
                return null;
            }
        }).filter(item => item?.href);

        return JSON.stringify(results.slice(0, 20));

    } catch (error) {
        return JSON.stringify([]);
    }
}
