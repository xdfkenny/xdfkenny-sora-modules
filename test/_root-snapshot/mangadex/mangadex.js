async function searchResults(keyword, page = 0) {
    const results = [];
    try {
        const offset = (page || 0) * 100;
        const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(keyword)}&limit=100&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=cover_art&order[followedCount]=desc&order[relevance]=desc`;
        const response = await soraFetch(url);
        if (!response) return [];
        const data = await response.json();

        if (data && data.result === 'ok' && Array.isArray(data.data)) {
            for (const manga of data.data) {
                const id = manga.id;
                const attributes = manga.attributes || {};

                let title = attributes.title?.en || attributes.title?.['en'];
                if (!title) {
                    const altTitles = attributes.altTitles || [];
                    for (const alt of altTitles) {
                        if (alt.en) {
                            title = alt.en;
                            break;
                        }
                    }
                }
                if (!title) {
                    title = Object.values(attributes.title || {})[0] || 'Unknown Title';
                }

                let imageURL = '';
                const relationships = manga.relationships || [];
                const coverArt = relationships.find(rel => rel.type === 'cover_art');
                if (coverArt && coverArt.attributes && coverArt.attributes.fileName) {
                    imageURL = `https://uploads.mangadex.org/covers/${id}/${coverArt.attributes.fileName}.512.jpg`;
                }

                results.push({
                    id: id,
                    href: id,
                    imageURL: imageURL,
                    image: imageURL,
                    title: title
                });
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(urlOrId) {
    try {
        const idMatch = String(urlOrId).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const mangaId = idMatch ? idMatch[0] : urlOrId;
        const url = `https://api.mangadex.org/manga/${mangaId}?includes[]=artist&includes[]=author&includes[]=cover_art`;
        const response = await soraFetch(url);
        if (!response) return { description: "", tags: [] };
        const data = await response.json();

        if (data && data.result === 'ok' && data.data) {
            const attributes = data.data.attributes || {};
            const description = attributes.description?.en || attributes.description?.['en'] || Object.values(attributes.description || {})[0] || '';
            const tags = (attributes.tags || [])
                .map(tag => tag.attributes?.name?.en || Object.values(tag.attributes?.name || {})[0])
                .filter(Boolean);

            return {
                description: description || "",
                tags: tags
            };
        }

        return { description: "", tags: [] };
    } catch (err) {
        return { description: "", tags: [] };
    }
}

async function extractChapters(urlOrId) {
    try {
        const idMatch = String(urlOrId).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const mangaId = idMatch ? idMatch[0] : urlOrId;

        const langMap = {};
        const limit = 500;
        let offset = 0;
        let total = 1;

        while (offset < total) {
            const apiUrl = `https://api.mangadex.org/manga/${mangaId}/feed?limit=${limit}&offset=${offset}&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic&order[chapter]=asc`;
            const response = await soraFetch(apiUrl);
            if (!response) break;
            const data = await response.json();

            if (!data || data.result !== 'ok' || !Array.isArray(data.data)) {
                break;
            }

            total = typeof data.total === 'number' ? data.total : data.data.length;

            for (const ch of data.data) {
                const lang = ch.attributes?.translatedLanguage || 'en';
                if (!langMap[lang]) {
                    langMap[lang] = new Map();
                }

                const chapterStr = (ch.attributes?.chapter != null && ch.attributes.chapter !== '')
                    ? String(ch.attributes.chapter)
                    : (ch.attributes?.title || '0');
                const chapterNum = parseFloat(chapterStr) || 0;
                const chapterId = ch.id;

                let title = ch.attributes?.title;
                if (!title) {
                    title = ch.attributes?.chapter ? `Chapter ${ch.attributes.chapter}` : 'Oneshot';
                }

                const groupRel = (ch.relationships || []).find(rel => rel.type === 'scanlation_group');
                const scanlationGroup = groupRel?.attributes?.name || '';

                const chapterItem = {
                    id: chapterId,
                    title: title,
                    chapter: chapterNum,
                    scanlation_group: scanlationGroup
                };

                if (!langMap[lang].has(chapterStr)) {
                    langMap[lang].set(chapterStr, [chapterItem]);
                } else {
                    langMap[lang].get(chapterStr).push(chapterItem);
                }
            }

            offset += limit;
            if (offset >= 3000) break;
        }

        const results = {};
        for (const [lang, map] of Object.entries(langMap)) {
            results[lang] = Array.from(map.entries());
        }

        if (Object.keys(results).length === 0) {
            return { en: [] };
        }

        return results;
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(chapterUrlOrId) {
    try {
        const idMatch = String(chapterUrlOrId).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const chapterId = idMatch ? idMatch[0] : chapterUrlOrId;

        const apiEndpoint = `https://api.mangadex.org/at-home/server/${chapterId}`;
        const apiResponse = await soraFetch(apiEndpoint);
        if (!apiResponse) return [];
        const serverData = await apiResponse.json();

        if (!serverData || serverData.result !== 'ok' || !serverData.chapter) {
            return [];
        }

        const imageBaseUrl = serverData.baseUrl;
        const chapterHash = serverData.chapter.hash;

        const hasDataSaver = Array.isArray(serverData.chapter.dataSaver) && serverData.chapter.dataSaver.length > 0;
        const imageFiles = hasDataSaver ? serverData.chapter.dataSaver : (serverData.chapter.data || []);
        const qualityPath = hasDataSaver ? 'data-saver' : 'data';
        console.log(imageFiles.map(fileName => `${imageBaseUrl}/${qualityPath}/${chapterHash}/${fileName}`));
        return imageFiles.map(fileName => `${imageBaseUrl}/${qualityPath}/${chapterHash}/${fileName}`);
    } catch (error) {
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
