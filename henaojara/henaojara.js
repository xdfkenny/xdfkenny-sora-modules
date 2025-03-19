async function searchResults(keyword) {
    try {
        const url = `https://jkanime.net/?s=${encodeURIComponent(keyword)}`;
        const html = await fetch(url).then(r => r.text());
        
        const results = [];
        const regex = /<a href="(https:\/\/jkanime\.net\/[^"]+)"[^>]*>\s*<img[^>]+data-src="([^"]+)[^>]+>\s*<h5[^>]*>([^<]+)/g;
        
        let match;
        while ((match = regex.exec(html)) {  // ← ¡Aquí estaba el error!
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
