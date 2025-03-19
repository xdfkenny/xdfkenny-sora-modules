async function searchResults(keyword) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Referer': 'https://jkanime.net/'
        };

        const response = await fetch(`https://jkanime.net/buscar/${encodeURIComponent(keyword)}/`, { headers });
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Selector actualizado para 2024
        const results = Array.from(doc.querySelectorAll('.col-lg-2.col-md-6.col-sm-6')).map(item => {
            const animeBlock = item.querySelector('.anime__item');
            return {
                title: animeBlock?.querySelector('h5 a')?.textContent?.trim() || 'Sin título',
                image: animeBlock?.querySelector('.set-bg')?.dataset?.setbg || '',
                href: animeBlock?.querySelector('a')?.href || ''
            };
        }).filter(item => item.href && item.image);

        return JSON.stringify(results);

    } catch (error) {
        return JSON.stringify([]);
    }
}
