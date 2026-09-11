async function searchResults(keyword, page = 0) {
    const results = [];
    try {
        const url = "https://ww2.mangafreak.me/Find/" + encodeURIComponent(keyword);
        const response = await soraFetch(url);
        if (!response) return [];
        const html = await response.text();
        const regex = /<div class="manga_search_item">[\s\S]*?<a href="([^"]+)"><img src="([^"]+)"[^>]*><\/a>[\s\S]*?<h3>\s*<a href="[^"]+">([^<]+)<\/a>\s*<\/h3>/g;
        
        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const rawHref = match[1].trim();
            const href = rawHref.startsWith("http") ? rawHref : "https://ww2.mangafreak.me" + rawHref;
            if (!seen.has(href)) {
                seen.add(href);
                const image = match[2].trim();
                const title = match[3].replace(/<[^>]+>/g, '').trim();
                results.push({
                    id: href,
                    href: href,
                    imageURL: image,
                    image: image,
                    title: title
                });
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(url) {
    try {
        const targetUrl = url.startsWith("http") ? url : "https://ww2.mangafreak.me" + url;
        const response = await soraFetch(targetUrl);
        if (!response) return { description: "", tags: [] };
        const html = await response.text();

        const descRegex = /<div class="manga_series_description">[\s\S]*?<p>([\s\S]*?)<\/p>/;
        const match = descRegex.exec(html);
        const description = match ? match[1].replace(/<[^>]+>/g, '').trim() : "";

        const genreRegex = /<a[^>]+href="[^"]*\/Genre\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
        let genreMatch;
        const tags = [];
        const seenTags = new Set();
        while ((genreMatch = genreRegex.exec(html)) !== null) {
            const tag = genreMatch[1].trim();
            if (tag && !seenTags.has(tag)) {
                seenTags.add(tag);
                tags.push(tag);
            }
        }
        
        return {
            description: description,
            tags: tags
        };
    } catch (err) {
        return {
            description: "Error",
            tags: []
        };
    }
}

async function extractChapters(url) {
    const results = [];
    try {
        const targetUrl = url.startsWith("http") ? url : "https://ww2.mangafreak.me" + url;
        const response = await soraFetch(targetUrl);
        if (!response) return { en: [] };
        const html = await response.text();

        const regex = /<a[^>]+href="([^"]*\/Read1_[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        let index = 1;
        const seen = new Set();
        
        while ((match = regex.exec(html)) !== null) {
            const rawHref = match[1].trim();
            const href = rawHref.startsWith("http") ? rawHref : "https://ww2.mangafreak.me" + rawHref;
            if (!seen.has(href)) {
                seen.add(href);
                const titleText = match[2].replace(/<[^>]+>/g, '').trim();
                const numMatch = titleText.match(/Chapter\s+([\d.]+)/i) || rawHref.match(/Read1_[^_]+_([\d.]+)/i) || titleText.match(/([\d.]+)/);
                const number = numMatch ? parseFloat(numMatch[1]) : index;
                const chapterStr = String(number);

                results.push([
                    chapterStr,
                    [{
                        id: href,
                        title: titleText || `Chapter ${chapterStr}`,
                        chapter: number,
                        scanlation_group: ""
                    }]
                ]);
                index++;
            }
        }

        results.reverse();

        return { en: results };
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const targetUrl = url.startsWith("http") ? url : "https://ww2.mangafreak.me" + url;
        const response = await soraFetch(targetUrl);
        if (!response) return [];
        const html = await response.text();

        const regex = /<img[^>]+src="([^"]+\.(?:jpg|png|jpeg|webp))"/gi;
        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const imgSrc = match[1].trim();
            if (imgSrc.includes('/mangas/') && !seen.has(imgSrc)) {
                seen.add(imgSrc);
                results.push(imgSrc);
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function soraFetch(url, options = {}) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        if (typeof fetchv2 === 'function') {
            return await fetchv2(url, headers, options.method || 'GET', options.body || null);
        }
        return await fetch(url, options);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}