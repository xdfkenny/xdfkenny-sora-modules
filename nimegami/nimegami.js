async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://nimegami.id/?s=" + encodeURIComponent(keyword) + "&post_type=post");
        const html = await response.text();

        const regex = /<article>[\s\S]*?<a href="([^"]+)"[^>]*>\s*<img[^>]+src="([^"]+)"[\s\S]*?<h2[^>]*>\s*<a[^>]+>([^<]+)<\/a>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            title: "Error",
            image: "Error",
            href: "Error"
        }]);
    }
}


async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        let description = "N/A";
        let aliases = "N/A";
        let airdate = "N/A";

        // Extract synopsis/description
        const synopsisMatch = html.match(/<div class="content" itemprop="text"[^>]*>[\s\S]*?<\/div>/);
        if (synopsisMatch) {
            // Remove HTML tags and clean up the text
            description = synopsisMatch[0]
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        return JSON.stringify([{
            description: description,
            aliases: aliases,
            airdate: airdate
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }]);
    }
}

async function extractEpisodes(url) {
    const results = [];
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        // First try to extract individual episodes (excluding batch)
        const htmlWithoutBatch = html.replace(/<div class="batch-dlcuy">[\s\S]*?<\/div>/g, '');
        const episodeRegex = /<h4>([^<]*Episode\s+(\d+)[^<]*)<\/h4>\s*<ul>([\s\S]*?)<\/ul>/gi;
        
        let episodeMatch;
        while ((episodeMatch = episodeRegex.exec(htmlWithoutBatch)) !== null) {
            const episodeTitle = episodeMatch[1];
            const episodeNumber = parseInt(episodeMatch[2], 10);
            const linksHtml = episodeMatch[3];

            const qualityRegex = /<strong>(\d+p)<\/strong>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>/g;
            let qualityMatch;
            let highestQualityLink = null;
            let highestQuality = 0;

            while ((qualityMatch = qualityRegex.exec(linksHtml)) !== null) {
                const quality = parseInt(qualityMatch[1], 10);
                const link = qualityMatch[2].trim();

                if (quality > highestQuality) {
                    highestQuality = quality;
                    highestQualityLink = link;
                }
            }

            if (highestQualityLink) {
                results.push({
                    number: episodeNumber,
                    href: highestQualityLink,
                });
            }
        }

        if (results.length === 0) {
            const movieRegex = /<strong>(\d+p)<\/strong>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>/g;
            let movieMatch;
            let highestQuality = 0;
            let movieLink = null;

            while ((movieMatch = movieRegex.exec(html)) !== null) {
                const quality = parseInt(movieMatch[1], 10);
                const link = movieMatch[2].trim();

                if (quality > highestQuality) {
                    highestQuality = quality;
                    movieLink = link;
                }
            }

            if (movieLink) {
                results.push({
                    number: 1,
                    href: movieLink,
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            number: "Error",
            title: "Error",
            href: "Error",
            quality: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const streams = [];
        
        const downloadDivMatch = html.match(/<div id="download_div"[\s\S]*?<\/div>/);
        if (downloadDivMatch) {
            const downloadDiv = downloadDivMatch[0];
            
            const linkRegex = /<a[^>]*href="([^"]+)"[^>]*id="ini_download_[^"]*"[^>]*>/g;
            let linkMatch;
            let serverCount = 1;
            
            while ((linkMatch = linkRegex.exec(downloadDiv)) !== null) {
                const streamUrl = linkMatch[1].trim();
                
                streams.push({
                    title: `Server ${serverCount}`,
                    streamUrl: streamUrl,
                    headers: {}
                });
                
                serverCount++;
            }
        }

        return JSON.stringify({
            streams: streams,
            subtitle: "https://placeholder.com/subtitles.vtt"
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
            subtitle: "https://placeholder.com/subtitles.vtt"
        });
    }
}
