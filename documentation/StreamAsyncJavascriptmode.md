# StreamAsync Javascript mode

```{note}
For more examples see the [Modules Repo](https://github.com/50n50/sources)
```

In the streamAsyncJS mode you extract the stream URL asynchronously instead of regular scraping. The function will still be provided with an HTML code. 


## Functions

### searchResults
Input: `HTML` \
Output:`JSON`

Extracts the search results from the provided HTML.

```json
{
   "title": "Example Title",
   "image": "https://example.com/image.jpg",
   "href": "https://grani.me/example"
}
```

### extractDetails
Input: `HTML` \
Output:`JSON`

Extracts the details from the provided HTML.

```json
{
   "description": "An exciting anime series about adventures.",
   "aliases": "Alternate Name",
   "airdate": "2022"
}
```

### extractEpisodes
Input: `HTML` \
Output:`JSON`

Extracts the episodes from the provided HTML.

```json
{
   "href": "https://grani.me/episode/123",
   "number": "1"
}
```

### extractStreamUrl
Input: `HTML` \
Output:`URL`

Extracts the stream from the provided URL.

```txt
https://example.com/stream/video.mp4
```

## Example

```javascript 
function searchResults(html) {
    const results = [];


    const titleRegex = /<h2[^>]*>(.*?)<\/h2>/;
    const hrefRegex = /<a\s+href="([^"]+)"\s*[^>]*>/;
    const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/;

    const itemRegex = /<div class="my-2 w-64[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
    const items = html.match(itemRegex) || [];

    items.forEach((itemHtml) => {
        const titleMatch = itemHtml.match(titleRegex);
        const title = titleMatch ? titleMatch[1].trim() : '';

        const hrefMatch = itemHtml.match(hrefRegex);
        const href = hrefMatch ? hrefMatch[1].trim() : '';

        const imgMatch = itemHtml.match(imgRegex);
        const imageUrl = imgMatch ? imgMatch[1].trim() : '';

        if (title && href) {
            results.push({
                title: title,
                image: imageUrl,
                href: href
            });
        }
    });
    return results;
}

function extractDetails(html) {
    const details = [];

    const descriptionMatch = html.match(/<p class="sm:text-\[1\.05rem\] leading-loose text-justify">([\s\S]*?)<\/p>/);
    let description = descriptionMatch ? descriptionMatch[1].trim() : '';

    const airdateMatch = html.match(/<td[^>]*title="([^"]+)">[^<]+<\/td>/);
    let airdate = airdateMatch ? airdateMatch[1].trim() : '';

    if (description && airdate) {
        details.push({
            description: description,
            aliases: 'N/A',
            airdate: airdate
        });
    }
    console.log(details);
    return details;
}

function extractEpisodes(html) {
    const episodes = [];
    const htmlRegex = /<a\s+[^>]*href="([^"]*?\/episode\/[^"]*?)"[^>]*>[\s\S]*?الحلقة\s+(\d+)[\s\S]*?<\/a>/gi;
    const plainTextRegex = /الحلقة\s+(\d+)/g;

    let matches;

    if ((matches = html.match(htmlRegex))) {
        matches.forEach(link => {
            const hrefMatch = link.match(/href="([^"]+)"/);
            const numberMatch = link.match(/الحلقة\s+(\d+)/);
            if (hrefMatch && numberMatch) {
                const href = hrefMatch[1];
                const number = numberMatch[1];
                episodes.push({
                    href: href,
                    number: number
                });
            }
        });
    } else if ((matches = html.match(plainTextRegex))) {
        matches.forEach(match => {
            const numberMatch = match.match(/\d+/);
            if (numberMatch) {
                episodes.push({
                    href: null,
                    number: numberMatch[0]
                });
            }
        });
    }

    console.log(episodes);
    return episodes;
}

async function extractStreamUrl(html) {
    try {
        const sourceMatch = html.match(/data-source="([^"]+)"/);
        const embedUrl = sourceMatch?.[1]?.replace(/&amp;/g, '&');
        if (!embedUrl) return null;

        const response = await fetch(embedUrl);
        const data = await response;
        const videoUrl = data.match(/src:\s*'(https:\/\/[^']+\.mp4[^']*)'/)?.[1];
        console.log(videoUrl);
        return videoUrl || null;
    } catch (error) {
        return null;
    }
}
```