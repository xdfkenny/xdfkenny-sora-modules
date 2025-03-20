/*
 * MAIN FUNCTIONS
 */

async function searchResults(keyword) {
    try {
        const searchUrl = `https://henaojara.com/buscar?q=${encodeURIComponent(keyword)}`;
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

/* Keep the UNPACKER MODULE section as-is from original code */
