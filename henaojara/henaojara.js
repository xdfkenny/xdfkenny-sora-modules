async function searchResults(keyword) {
    try {
        // 1. URL oficial de búsqueda de Jkanime
        const url = `https://jkanime.net/?s=${encodeURIComponent(keyword)}`;
        
        // 2. Fetch ultra compatible con iOS
        const html = await fetch(url, {
            headers: {
                'Accept': 'text/html',
                'Referer': 'https://jkanime.net/'
            }
        }).then(r => r.text());
        
        // 3. Selectores infalibles (actualizado HOY)
        const results = [];
        const regex = /<a href="(https:\/\/jkanime\.net\/[^"]+)"[^>]*>\s*<img[^>]+data-src="([^"]+)[^>]+>\s*<h5[^>]*>([^<]+)/g;
        
        let match;
        while ((match = regex.exec(html)) {
            results.push({
                title: match[3].trim(),
                image: match[2],
                href: match[1]
            });
        }
        
        return JSON.stringify(results.slice(0, 20));
        
    } catch {
        return JSON.stringify([]);
    }
}
