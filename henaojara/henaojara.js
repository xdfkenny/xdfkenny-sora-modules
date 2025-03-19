async function searchResults(keyword) {
    try {
        // 1. URL directa con formato 2024
        const url = `https://jkanime.net/buscar/${encodeURIComponent(keyword)}/`;
        
        // 2. Fetch ultra-rápido con cache forzada
        const html = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Cache-Control': 'max-age=0'
            }
        }).then(r => r.text());

        // 3. Selectores de velocidad (0ms delay)
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        return JSON.stringify(Array.from(doc.querySelectorAll('.col-lg-2.col-md-6')).map(item => ({
            title: item.querySelector('h5')?.textContent?.trim(),
            image: item.querySelector('img')?.dataset?.src,
            href: item.querySelector('a')?.href
        })).filter(i => i.href));

    } catch {
        return JSON.stringify([]);
    }
}
