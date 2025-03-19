async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await fetch(`https://henaojara.com/?s=${encodedKeyword}`);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const animeElements = doc.querySelectorAll('.anime-list-item');

        const results = Array.from(animeElements).map(anime => {
            const title = anime.querySelector('.anime-title').textContent.trim();
            const image = anime.querySelector('img').src;
            const href = anime.querySelector('a').href;
            return { title, image, href };
        });

        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const description = doc.querySelector('.anime-description')?.textContent.trim() || 'No description available';
        const duration = doc.querySelector('.anime-duration')?.textContent.trim() || 'Unknown';
        const aired = doc.querySelector('.anime-aired')?.textContent.trim() || 'Unknown';

        const details = [{
            description,
            aliases: `Duration: ${duration}`,
            airdate: `Aired: ${aired}`
        }];

        return JSON.stringify(details);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired: Unknown'
        }]);
    }
}

async function extractEpisodes(animeUrl) {
    try {
        const response = await fetch(animeUrl);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const episodeElements = doc.querySelectorAll('.episode-list-item a');

        const episodes = Array.from(episodeElements).map(episode => {
            return {
                href: episode.href,
                number: episode.textContent.trim()
            };
        });

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Fetch error:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(episodeUrl) {
    try {
        const response = await fetch(episodeUrl);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const iframe = doc.querySelector('iframe');
        if (iframe) {
            return iframe.src; // Returns the streaming URL
        } else {
            console.log('No iframe found, trying alternative method...');
            return null;
        }
    } catch (error) {
        console.log('Fetch error:', error);
        return null;
    }
}

// Export the functions for Node.js
module.exports = {
    searchResults,
    extractDetails,
    extractEpisodes,
    extractStreamUrl
};
