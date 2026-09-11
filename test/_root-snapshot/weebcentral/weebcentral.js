async function soraFetch(url, options = {}) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
    }
    try {
        if (typeof fetchv2 === 'function') {
            return await fetchv2(url, headers, options.method || 'GET', options.body || null);
        }
        return await fetch(url, options);
    } catch (e) {
        return await fetch(url, options);
    }
}

async function searchResults(keyword, page=0) {
    const results = [];
    try {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        };
        const postData = `text=${encodeURIComponent(keyword)}`;

        const response = await soraFetch("https://weebcentral.com/search/simple?location=main", {
            method: "POST",
            headers: headers,
            body: postData
        });

        const html = await response.text();
        const regex = /<a href="([^"]+)"[^>]*>[\s\S]*?<source srcset="([^"]+)"[^>]*>[\s\S]*?<div class="flex-1[^"]*">([^<]+)<\/div>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            results.push({
                id: href.startsWith('http') ? href : 'https://weebcentral.com' + href,
                imageURL: match[2].trim(),
                title: match[3].trim().replace(/&#39;/g, "'")
            });
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        
        const descMatch = html.match(/<strong>Description<\/strong>\s*<p class="whitespace-pre-wrap break-words">([\s\S]*?)<\/p>/);
        const description = descMatch ? descMatch[1].trim().replace(/&#39;/g, "'") : "";
        
        const tagsMatch = html.match(/<strong>Associated Name\(s\)<\/strong>\s*<ul class="list-disc list-inside">([\s\S]*?)<\/ul>/);
        let tags = [];
        if (tagsMatch) {
            const ulContent = tagsMatch[1];
            const liRegex = /<li>([^<]+)<\/li>/g;
            let liMatch;
            while ((liMatch = liRegex.exec(ulContent)) !== null) {
                tags.push(liMatch[1].trim().replace(/&#39;/g, "'"));
            }
        }
        
        return {
            description,
            tags
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
        const cleanUrl = url.split('?')[0].replace(/\/+$/, '');
        const fullUrl = cleanUrl.replace(/\/[^/]+$/, "/full-chapter-list");
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        
        const regex = /<a[^>]+href=["']((?:https:\/\/weebcentral\.com)?\/chapters\/[a-zA-Z0-9]+)["'][^>]*>([\s\S]*?)<\/a>/g;
        let match;
        let index = 1;
        
        while ((match = regex.exec(html)) !== null) {
            const rawHref = match[1].trim();
            const chapterUrl = rawHref.startsWith('http') ? rawHref : 'https://weebcentral.com' + rawHref;
            const innerText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            
            const numMatch = innerText.match(/Chapter\s+(\d+(?:\.\d+)?)/i) || innerText.match(/(\d+(?:\.\d+)?)/);
            const chapterNum = numMatch ? parseFloat(numMatch[1]) : index;
            
            results.push([
                String(chapterNum),
                [{
                    id: chapterUrl,
                    title: innerText || `Chapter ${chapterNum}`,
                    chapter: chapterNum,
                    scanlation_group: ""
                }]
            ]);
            index++;
        }

        return { en: results };
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const cleanUrl = url.split('?')[0].replace(/\/+$/, '');
        const targetUrl = cleanUrl.startsWith('http') ? cleanUrl : 'https://weebcentral.com' + cleanUrl;
        const fullUrl = targetUrl + "/images?is_prev=False&current_page=1&reading_style=long_strip";
        const response = await soraFetch(fullUrl);
        const html = await response.text();
        
        const regex = /<img[^>]+src="([^"]+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const imgSrc = match[1].trim();
            if (imgSrc.startsWith('http')) {
                results.push(imgSrc);
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}