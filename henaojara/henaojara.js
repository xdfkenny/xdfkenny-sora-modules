async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword.replace(/\s+/g, '+'));
        const response = await fetch(`https://henaojara.com/?s=${encodedKeyword}`);
        const html = await response.text();

        // Use DOMParser to parse the HTML response
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const results = [];
        const elements = doc.querySelectorAll(".result-item"); // Adjust selector based on site structure

        elements.forEach(el => {
            const title = el.querySelector(".post-title a")?.textContent.trim();
            const image = el.querySelector(".post-thumbnail img")?.src;
            const href = el.querySelector(".post-title a")?.href;
            
            if (title && href) {
                results.push({ title, image: image || '', href });
            }
        });

        return JSON.stringify(results);
        
    } catch (error) {
        console.log('Search error:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const description = doc.querySelector(".post-content p")?.textContent.trim() || "No description available";
        
        const transformedResults = [{
            description: description,
            aliases: `Alias: Unknown`, 
            airdate: `Aired: Unknown`
        }];
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Alias: Unknown',
            airdate: 'Aired: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {        
        const response = await fetch(url);
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const results = [];
        const episodes = doc.querySelectorAll(".episodes-list a"); // Adjust selector

        episodes.forEach(episode => {
            const href = episode.href;
            const number = episode.textContent.trim();
            
            results.push({ href, number });
        });

        return JSON.stringify(results);
        
    } catch (error) {
        console.log('Episodes fetch error:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
       return url;  // HenaoJara likely serves direct stream URLs
    } catch (error) {
       console.log('Stream URL fetch error:', error);
       return null;
    }
}
