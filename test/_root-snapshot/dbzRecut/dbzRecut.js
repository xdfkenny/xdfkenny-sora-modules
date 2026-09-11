async function searchResults(keyword) {
    const results = [];

    results.push({
        title: "Saiyan Arc",
        image: "https://ugc.production.linktr.ee/5fe54b0e-0381-4ca2-a1da-260e5b09da3a_image.png?io=true&size=thumbnail-stack_v1_0",
        href: "https://pixeldrain.net/l/wCsLUVni"
    });

    results.push({
        title: "Freeza Arc",
        image: "https://ugc.production.linktr.ee/bad5121e-debd-4d09-8d07-a047fb791526_image.png?io=true&size=thumbnail-stack_v1_0",
        href: "https://pixeldrain.net/l/UFw6sshg"
    });

    results.push({
        title: "Cell Arc",
        image: "https://ugc.production.linktr.ee/1d3c535f-8f02-45ca-b8cd-d0cf3abd77ec_image.png?io=true&size=thumbnail-stack_v1_0",
        href: "https://pixeldrain.net/l/C3TS8gGk"
    });

    results.push({
        title: "Boo Arc",
        image: "https://ugc.production.linktr.ee/71f7161c-0ae3-41ec-8bb0-43a75ecaaaac_image.png?io=true&size=thumbnail-stack_v1_0",
        href: "https://pixeldrain.net/l/NGxFsN2P"
    });
    
    console.log(`Results: ${JSON.stringify(results)}`);
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const match = url.match(/https:\/\/pixeldrain\.net\/l\/([^\/]+)/);
    if (!match) throw new Error("Invalid URL format");
            
    const arcId = match[1];

    const response = await soraFetch(`https://pixeldrain.net/api/list/${arcId}`);
    const data = await response.json();

    const hasImage = data.files.some(file => file.mime_type.startsWith("image/"));
    const fileCount = hasImage ? data.file_count - 1 : data.file_count;

    const transformedResults = [{
        description: `Title: ${data.title}\nFile Count: ${fileCount}`,
        aliases: `Title: ${data.title}\nFile Count: ${fileCount}`,
        airdate: ''
    }];

    console.log(`Details: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

async function extractEpisodes(url) {
    const match = url.match(/https:\/\/pixeldrain\.net\/l\/([^\/]+)/);
    if (!match) throw new Error("Invalid URL format");
            
    const arcId = match[1];

    const response = await soraFetch(`https://pixeldrain.net/api/list/${arcId}`);
    const data = await response.json();

    const transformedResults = data.files
        .filter(result => !result.mime_type.startsWith("image/"))
        .map((result, index) => {
            return {
                href: `${result.id}`,
                number: index + 1,
            };
        });

    console.log(`Episodes: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

// searchResults("all");
// extractDetails("https://pixeldrain.net/l/dX3cF5Q3");
// extractEpisodes("https://pixeldrain.net/l/dX3cF5Q3");
// extractStreamUrl(`EDg7Q9Uu`);

async function extractStreamUrl(url) {
    return `https://pixeldrain.net/api/file/${url}?download`;
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
