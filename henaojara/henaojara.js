async function extractStreamUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // Improved regex pattern with JSON validation
        const encodedUrlMatch = html.match(/var sources\s*=\s*({[^}]+});/s);
        if (!encodedUrlMatch) throw new Error('No video found');
        
        // Convert JS object to valid JSON
        const jsObject = encodedUrlMatch[1]
            .replace(/'/g, '"')
            .replace(/(\w+):/g, '"$1":');
            
        const sources = JSON.parse(jsObject);
        const hlsUrl = base64Decode(sources.hls);
        
        return JSON.stringify({
            stream: hlsUrl,
            subtitles: null
        });
    } catch (error) {
        return JSON.stringify({ stream: null, subtitles: null });
    }
}
