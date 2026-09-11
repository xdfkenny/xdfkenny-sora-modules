async function searchResults(keyword, page = 1) {
    const results = [];
    try {
        const searchUrl = `https://www.mangaworld.mx/archive?keyword=${encodeURIComponent(keyword)}&page=${page || 1}`;
        const response = await soraFetch(searchUrl);
        if (!response) return [];

        const html = await response.text();
        const parsed = parseMCData(html);
        if (parsed && parsed.o && parsed.o.w) {
            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.mangas) {
                    for (const manga of data.mangas) {
                        results.push({
                            id: `https://www.mangaworld.mx/manga/${manga.linkId}/${manga.slug}`,
                            title: manga.title || "",
                            imageURL: manga.image ? (manga.image.startsWith('http') ? manga.image : `https://cdn.mangaworld.mx${manga.image}`) : ""
                        });
                    }
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
        const response = await soraFetch(url);
        if (!response) return { description: "", tags: [] };

        const html = await response.text();
        const parsed = parseMCData(html);
        let description = "";
        let tags = [];

        if (parsed && parsed.o && parsed.o.w) {
            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.manga) {
                    description = data.manga.trama || "";
                    if (data.manga.genres) {
                        tags = data.manga.genres.map(g => g.name || g);
                    }
                    break;
                }
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
        const response = await soraFetch(url);
        if (!response) return { it: [] };

        const html = await response.text();
        const parsed = parseMCData(html);
        if (parsed && parsed.o && parsed.o.w) {
            let mangaSlug = "sousou-no-frieren";
            let mangaLinkId = "1699";

            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.manga) {
                    if (data.manga.slug) mangaSlug = data.manga.slug;
                    if (data.manga.linkId) mangaLinkId = String(data.manga.linkId);
                    break;
                }
            }

            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.pages) {
                    if (data.pages.volumes) {
                        for (const vol of data.pages.volumes) {
                            if (vol.chapters) {
                                for (const chap of vol.chapters) {
                                    const matchNum = /(?:capitolo|cap\b|\bch\b)\s*(\d+(?:\.\d+)?)/i.exec(chap.name) || /(\d+(?:\.\d+)?)/.exec(chap.name);
                                    const chapterNum = matchNum ? matchNum[1] : "0";
                                    results.push([
                                        String(chapterNum),
                                        [{
                                            id: `https://www.mangaworld.mx/manga/${mangaLinkId}/${mangaSlug}/read/${chap._id}`,
                                            title: chap.name || `Capitolo ${chapterNum}`,
                                            chapter: parseFloat(chapterNum) || 0
                                        }]
                                    ]);
                                }
                            }
                        }
                    }
                    if (data.pages.singleChapters) {
                        for (const chap of data.pages.singleChapters) {
                            const matchNum = /(?:capitolo|cap\b|\bch\b)\s*(\d+(?:\.\d+)?)/i.exec(chap.name) || /(\d+(?:\.\d+)?)/.exec(chap.name);
                            const chapterNum = matchNum ? matchNum[1] : "0";
                            results.push([
                                String(chapterNum),
                                [{
                                    id: `https://www.mangaworld.mx/manga/${mangaLinkId}/${mangaSlug}/read/${chap._id}`,
                                    title: chap.name || `Capitolo ${chapterNum}`,
                                    chapter: parseFloat(chapterNum) || 0
                                }]
                            ]);
                        }
                    }
                }
            }
        }

        results.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

        return { it: results };
    } catch (err) {
        return { it: [] };
    }
}

async function extractImages(chapterUrl) {
    const results = [];
    try {
        let cleanUrl = chapterUrl;
        if (/\/read\/[a-f0-9]+(?:\/\d+)?$/i.test(chapterUrl)) {
            cleanUrl = chapterUrl.replace(/\/(\d+)$/, '');
        }

        const response = await soraFetch(cleanUrl);
        if (!response) return [];

        const html = await response.text();
        const parsed = parseMCData(html);
        if (parsed && parsed.o && parsed.o.w) {
            for (const item of parsed.o.w) {
                const data = item[2];
                if (data && data.chapter) {
                    const chapter = data.chapter;
                    const mangaSlug = chapter.manga.slugFolder;
                    const mangaId = chapter.manga._id;
                    const volumePart = chapter.volume ? `${chapter.volume.slugFolder}-${chapter.volume._id}/` : "";
                    const chapterSlug = chapter.slugFolder;
                    const chapterId = chapter._id;

                    if (chapter.pages) {
                        for (const p of chapter.pages) {
                            results.push(`https://cdn.mangaworld.mx/chapters/${mangaSlug}-${mangaId}/${volumePart}${chapterSlug}-${chapterId}/${p}`);
                        }
                    }
                    break;
                }
            }
        }
        return results;
    } catch (err) {
        return [];
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

function getMCScriptTag(html) {
    const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const body = match[1];
        if (body.includes('$MC') && body.includes('.concat(')) {
            return body;
        }
    }
    return null;
}

function parseMCData(html) {
    const scriptBody = getMCScriptTag(html);
    if (!scriptBody) return null;

    const concatIdx = scriptBody.indexOf('.concat(');
    if (concatIdx === -1) return null;

    const startIdx = concatIdx + 8;
    const rawData = scriptBody.substring(startIdx, scriptBody.lastIndexOf(')'));
    try {
        return eval(`(${rawData})`);
    } catch (err) {
        return null;
    }
}