// ========== SEARCH ==========
async function searchResults(keyword) {
    try {
        const url = `https://henaojara.com/?s=${encodeURIComponent(keyword)}`;
        const response = await fetch(url);
        const html = await response;
        
        const results = [];
        const regex = /<article class="TPost C">[^]*?<a href="(.*?)"[^]*?data-src="(.*?)"[^]*?<h3 class="Title">(.*?)<\/h3>/g;
        
        let match;
        while((match = regex.exec(html)) !== null) {
            const title = decodeEntities(match[3]);
            results.push({
                title: title.replace(/ Temporada \d+| Latino| Sub| Español/gi, "").trim(),
                image: match[2].replace("-185x278", ""),
                href: match[1]
            });
        }
        
        return JSON.stringify(results.slice(0, 15));
        
    } catch(error) {
        return JSON.stringify([{ 
            title: "Error de conexión", 
            image: "https://i.imgur.com/9E8uF1d.png", 
            href: "#" 
        }]);
    }
}

// ========== DETAILS ==========
async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response;
        
        const description = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] || "Descripción no disponible";
        const year = html.match(/<span class="Year">(\d+)<\/span>/)?.[1] || "N/A";
        
        return JSON.stringify([{
            description: description,
            aliases: `Año: ${year}`,
            airdate: "Actualizado diariamente"
        }]);
        
    } catch {
        return JSON.stringify([{ 
            description: "Error al cargar detalles", 
            aliases: "N/A", 
            airdate: "N/A" 
        }]);
    }
}

// ========== EPISODES ==========
async function extractEpisodes(url) {
    try {
        const response = await fetch(url);
        const html = await response;
        
        const episodes = [];
        const regex = /<a class="[^"]*infovan[^"]*"[^]*?href="(.*?)"[^]*?<div class="centerv">(\d+)<\/div>/g;
        
        let match;
        while((match = regex.exec(html)) !== null) {
            episodes.push({
                href: match[1].startsWith("http") ? match[1] : `https://henaojara.com${match[1]}`,
                number: match[2]
            });
        }
        
        return JSON.stringify(episodes.reverse());
        
    } catch {
        return JSON.stringify([]);
    }
}

// ========== STREAM ==========
async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response;
        
        const streamMatch = html.match(/<iframe[^>]+src="(https:\/\/henaojara\.com\/player[^"]+)"/);
        if(!streamMatch) throw new Error();
        
        const playerResponse = await fetch(streamMatch[1]);
        const playerHtml = await playerResponse;
        
        const m3u8Url = playerHtml.match(/file:\s*"([^"]+\.m3u8)"/)?.[1];
        return m3u8Url || null;
        
    } catch {
        return null;
    }
}

// ========== UTILS ==========
function decodeEntities(text) {
    return text.replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&#039;/g, "'")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">");
}
