async function searchResults(keyword, page = 0) {
    const results = [];
    try {
        const response = await fetch("https://mangak.io/search?q=" + encodeURIComponent(keyword));
        const html = await response.text();

        const jsonRegex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
        const match = jsonRegex.exec(html);
        if (match) {
            const data = JSON.parse(match[1]);
            const items = data.props?.pageProps?.ssrItems || [];
            for (const item of items) {
                if (item.url && item.name && item.id) {
                    results.push({
                        id: "https://mangak.io" + item.url.trim() + " | " + item.id.trim(),
                        imageURL: "https://passthrough-worker.simplepostrequest.workers.dev/?simple=" + (item.cover || "").trim() + "&referer=https://mangabuddy.com",
                        title: item.name.trim()
                    });
                }
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(url) {
    try {
        const [urlPart] = url.split(" | ");
        const response = await fetch(urlPart);
        const html = await response.text();

        const descRegex = /<meta name="description" content="([^"]+)"/i;
        const descMatch = descRegex.exec(html);
        const description = descMatch ? descMatch[1].trim() : "";
        return {
            description: description.replace(" - not found...", "").trim(),
            tags: []
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
        const [, titleId] = url.split(" | ");
        if (!titleId) return { en: [] };

        const chapUrl = `https://api.mangak.io/titles/${titleId.trim()}/chapters`;
        const chapResponse = await fetch(chapUrl);
        const chapJson = await chapResponse.json();

        if (!chapJson.success || !chapJson.data || !chapJson.data.chapters) {
            return { en: [] };
        }

        const chapters = chapJson.data.chapters;
        for (const chapter of chapters) {
            const match = /(\d+(?:\.\d+)?)/.exec(chapter.name);
            const chapterNum = match ? match[1] : String(chapter.chapter_number || 0);

            results.push([
                String(chapterNum),
                [{
                    id: "https://mangak.io" + chapter.url,
                    chapter: parseFloat(chapterNum) || 0,
                    scanlation_group: chapter.name || `Chapter ${chapterNum}`
                }]
            ]);
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
        const response = await fetch(url);
        const html = await response.text();

        const jsonRegex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
        const match = jsonRegex.exec(html);
        if (match) {
            const data = JSON.parse(match[1]);
            const images = data.props?.pageProps?.initialChapter?.images || [];
            const processedImages = images.map(img => "https://passthrough-worker.simplepostrequest.workers.dev/?simple=" + img.trim() + "&referer=https://mangabuddy.com");
            results.push(...processedImages);
        } else {
            const regex = /var chapImages = '([^']*)'/;
            const legacyMatch = regex.exec(html);
            if (legacyMatch) {
                const images = legacyMatch[1].split(',');
                const processedImages = images.map(img => "https://passthrough-worker.simplepostrequest.workers.dev/?simple=" + img.trim() + "&referer=https://mangabuddy.com");
                results.push(...processedImages);
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}