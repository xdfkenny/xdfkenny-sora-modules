/*
 * API CONFIGURATION (No colon after variable name)
 */
const HENAOJARA_API = "https://xdfkenny.github.io/xdfkenny-sora-api-henaojara";

/*
 * MAIN FUNCTIONS (Fixed object syntax)
 */

async function searchResults(keyword) {
    try {
        const response = await fetch(`${HENAOJARA_API}/search?q=${encodeURIComponent(keyword)}`);
        const data = await response.json();
        
        return JSON.stringify(data.map(item => ({
            title: item.title || 'Title: Unknown',
            image: item.image || 'Image: Unknown',
            href: item.url || 'Href: Unknown'
        }));
        
    } catch (error) {
        console.error('[searchResults] Error:', error);
        return JSON.stringify([{
            title: 'Error fetching results',
            image: 'https://via.placeholder.com/150',
            href: '#'
        }]);
    }
}

async function extractDetails(url) {
    try {
        const encodedUrl = encodeURIComponent(url);
        const response = await fetch(`${HENAOJARA_API}/details?url=${encodedUrl}`);
        const data = await response.json();
        
        return JSON.stringify([{
            description: data.description || 'Description: Unknown',
            aliases: `Episodes: ${data.episodes || 'Unknown'}`,
            airdate: `Aired: ${data.aired || 'Unknown'}`  // Fixed property name
        }]);
        
    } catch (error) {
        console.error('[extractDetails] Error:', error);
        return JSON.stringify([{
            description: 'Error loading details',
            aliases: 'Episodes: Unknown',
            airdate: 'Aired: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const encodedUrl = encodeURIComponent(url);
        const response = await fetch(`${HENAOJARA_API}/episodes?url=${encodedUrl}`);
        const data = await response.json();
        
        return JSON.stringify(data.map(episode => ({
            href: episode.url || 'Href: Unknown',
            number: episode.number || 'Number: Unknown'
        })));
        
    } catch (error) {
        console.error('[extractEpisodes] Error:', error);
        return JSON.stringify([{
            href: 'Href: Unknown',
            number: 'Number: Unknown'
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const encodedUrl = encodeURIComponent(url);
        const response = await fetch(`${HENAOJARA_API}/stream?url=${encodedUrl}`);
        const data = await response.json();
        
        return data.streamUrl || null;
        
    } catch (error) {
        console.error('[extractStreamUrl] Error:', error);
        return null;
    }
}
