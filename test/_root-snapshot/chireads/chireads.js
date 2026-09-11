async function searchResults(keyword) {
    const results = [];
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `https://chireads.com/?s=${encodedKeyword}`;
        const response = await soraFetch(url);
        const html = await response.text();

        const regex = /<a[^>]+href="(https:\/\/chireads\.com\/category\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const seen = new Set();

        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
            if (rawTitle && !seen.has(href) && !href.endsWith('/category/translatedtales/') && !href.endsWith('/category/original/')) {
                seen.add(href);
                results.push({
                    title: rawTitle,
                    href: href,
                    image: ""
                });
            }
        }

        if (results.length === 0) {
            const altRegex = /<h\d[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            while ((match = altRegex.exec(html)) !== null) {
                const href = match[1].trim();
                const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
                if (rawTitle && !seen.has(href)) {
                    seen.add(href);
                    results.push({ title: rawTitle, href: href, image: "" });
                }
            }
        }

        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([{ title: "Error", href: "", image: "" }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const descMatch = htmlText.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
            htmlText.match(/<meta name="description" content="([^"]+)"/i);

        let description = descMatch
            ? descMatch[1].replace(/<[^>]+>/g, '').trim()
            : "No description available";

        return JSON.stringify([{
            description,
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    } catch (error) {
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    }
}

async function extractChapters(url) {
    const chapters = [];
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();
        
        const linkRegex = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const seen = new Set();
        let index = 1;
        
        while ((match = linkRegex.exec(htmlText)) !== null) {
            const href = match[1].trim();
            const text = match[2].replace(/<[^>]+>/g, '').trim();
            
            if (href.includes("chapitre") || text.toLowerCase().includes("chapitre")) {
                if (!seen.has(href)) {
                    seen.add(href);
                    const numMatch = text.match(/chapitre\s*(\d+)/i) || href.match(/chapitre-(\d+)/i);
                    const num = numMatch ? parseInt(numMatch[1], 10) : index;
                    chapters.push({
                        title: text || `Chapitre ${num}`,
                        href: href,
                        number: num
                    });
                    index++;
                }
            }
        }
        
        return JSON.stringify(chapters);
    } catch (error) {
        return JSON.stringify([{
            href: url,
            title: "Error fetching chapters",
            number: 1
        }]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        let htmlText = await response.text();

        const paragraphs = [];
        const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        let match;
        while ((match = pRegex.exec(htmlText)) !== null) {
            const pText = match[1].replace(/<[^>]+>/g, '').trim();
            if (pText.length > 5) {
                paragraphs.push(pText);
            }
        }

        if (paragraphs.length > 0) {
            return paragraphs.join('\n\n');
        }

        return '<p>No content found</p>';
    } catch (error) {
        return '<p>Error extracting text</p>';
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers || {}, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
