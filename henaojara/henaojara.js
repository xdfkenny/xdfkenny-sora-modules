/*
 * MAIN FUNCTIONS
 */

async function searchResults(keyword) {
    try {
        const searchUrl = `https://henaojara.com/?q=${encodeURIComponent(keyword)}`;
        const response = await fetch(searchUrl);
        const html = await response.text();

        const results = [];
        const baseUrl = 'https://henaojara.com';
        const itemRegex = /<article class="[^"]*?anime[^"]*?"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"[^>]*>/g;
        
        let match;
        while ((match = itemRegex.exec(html)) !== null) {
            const href = match[1].startsWith('http') ? match[1] : `${baseUrl}${match[1]}`;
            const image = match[2].startsWith('http') ? match[2] : `https:${match[2]}`;
            
            results.push({
                title: match[3].trim() || 'Title: Unknown',
                image: image,
                href: href
            });
        }

        return JSON.stringify(results.slice(0, 10)); // Return top 10 results
        
    } catch (exception) {
        console.log('[searchResults] Error: ', exception);
        return JSON.stringify([{
            title: 'Error loading results',
            image: 'https://via.placeholder.com/150',
            href: 'https://henaojara.com'
        }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        // Extract metadata
        const descMatch = html.match(/<div class="[^"]*?sinopsis[^"]*?"[^>]*>([\s\S]*?)<\/div>/i);
        const epMatch = html.match(/<span class="[^"]*?num-epi[^"]*?"[^>]*>(\d+)/i);
        const dateMatch = html.match(/<strong>Estreno:<\/strong>\s*<span[^>]*>([^<]+)/i);
        const typeMatch = html.match(/<strong>Tipo:<\/strong>\s*<span[^>]*>([^<]+)/i);

        return JSON.stringify([{
            description: descMatch ? descMatch[1].trim().replace(/<\/?[^>]+>/g, '') : 'Description not available',
            aliases: typeMatch ? `Type: ${typeMatch[1]}` : 'Type: Unknown',
            airdate: dateMatch ? `Released: ${dateMatch[1].trim()}` : 'Release date unknown',
            episodes: epMatch ? `Episodes: ${epMatch[1]}` : 'Episode count unknown'
        }]);
        
    } catch (exception) {
        console.log('[extractDetails] Error: ', exception);
        return JSON.stringify([{
            description: 'Failed to load details',
            aliases: 'N/A',
            airdate: 'N/A'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const episodes = [];
        const epRegex = /<a href="([^"]+episodio-\d+\/?)"[^>]*class="[^"]*?episodio[^"]*?"[^>]*>[\s\S]*?<span[^>]*>(\d+)/gi;

        let match;
        while ((match = epRegex.exec(html)) !== null) {
            episodes.push({
                number: match[2] || '0',
                href: match[1].startsWith('http') ? match[1] : `https://henaojara.com${match[1]}`
            });
        }

        return JSON.stringify(episodes.reverse()); // Newest first -> reverse for ascending order
        
    } catch (exception) {
        console.log('[extractEpisodes] Error: ', exception);
        return JSON.stringify([{
            number: '0',
            href: url
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        // Try to find direct video source first
        const videoMatch = html.match(/<video[^>]+src="([^"]+)"[^>]*>/i) || html.match(/<source[^>]+src="([^"]+)"[^>]+type="video\/mp4"/i);
        if (videoMatch && videoMatch[1]) return videoMatch[1];

        // Fallback to iframe source
        const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/i);
        if (iframeMatch && iframeMatch[1]) return iframeMatch[1];

        return null;
        
    } catch (exception) {
        console.log('[extractStreamUrl] Error: ', exception);
        return null;
    }
}

function unpack(source) {
    /* Unpacks P.A.C.K.E.R. packed js code. */
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    }
    catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        /* Look up symbols in the synthetic symtab. */
        const word = match;
        let word2;
        if (radix == 1) {
            //throw Error("symtab unknown");
            word2 = symtab[parseInt(word)];
        }
        else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        /* Juice from a source file the four args needed by decoder. */
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            //const args = re.search(juicer, source, re.DOTALL);
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                if (a[2] == "[]") {
                    //don't know what it is
                    // a = list(a);
                    // a[1] = 62;
                    // a = tuple(a);
                }
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                }
                catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    function _replacestrings(source) {
        /* Strip string lookup table (list) and replace values in source. */
        /* Need to work on this. */
        return source;
    }
}

/*
 * REMOVED FUNCTIONS
 */

// function searchResults(keyword) {
//     const results = [];
//     const baseUrl = "https://www3.animeflv.net/";
    
//     const filmListRegex = /<ul class="ListAnimes AX Rows A03 C02 D02">([\s\S]*?)<\/ul>/;
//     const filmListMatch = html.match(filmListRegex);
    
//     if (!filmListMatch) {
//         return results;
//     }
    
//     const filmListContent = filmListMatch[1];
//     const itemRegex = /<li>\s*<article class="Anime[^>]*">([\s\S]*?)<\/article>\s*<\/li>/g;
//     const items = filmListContent.match(itemRegex) || [];

//     items.forEach(itemHtml => {
//         const imgMatch = html.match(/<img src="([^"]+)" alt="([^"]+)">/);
//         let imageUrl = imgMatch ? imgMatch[1] : '';
        
//         const titleMatch = itemHtml.match(/<h3 class="Title">([^<]+)<\/h3>/);
//         const title = titleMatch ? titleMatch[1] : '';
        
//         const hrefMatch = itemHtml.match(/href="([^"]+)"/);
//         let href = hrefMatch ? hrefMatch[1] : '';
        
//         if (imageUrl && title && href) {
//             if (!imageUrl.startsWith("https")) {
//                 if (imageUrl.startsWith("/")) {
//                     imageUrl = baseUrl + imageUrl;
//                 } else {
//                     imageUrl = baseUrl + "/" + href;
//                 }
//             }
//             if (!href.startsWith("https")) {
//                 if (href.startsWith("/")) {
//                     href = baseUrl + href;
//                 } else {
//                     href = baseUrl + "/" + href;
//                 }
//             }
//             results.push({
//                 title: title.trim(),
//                 image: imageUrl,
//                 href: href
//             });
//         }
//     });
    
//     return results;
// }
