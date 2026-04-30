# Normal JavaScript mode

```{note}
For more examples see the [Modules Repo](https://github.com/50n50/sources)
```

In the normal Javascript mode Sora will scrape the HTML of a link and provide it to the function. You are then required to scrape the necessary detail from the HTML and rewrite it into the follow specified JSON format.


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

Extracts the stream from the provided HTML.

```txt
https://example.com/stream/video.mp4
```

## Example

```javascript 
function cleanTitle(title) {
    //Module specefic function, ignore
    return title
        .replace(/&#8217;/g, "'")  
        .replace(/&#8211;/g, "-")  
        .replace(/&#[0-9]+;/g, ""); 
}

function searchResults(html) {
    const results = [];
    const baseUrl = "https://grani.me/";

    const filmListRegex = /<div class="content_episode"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
    const items = html.match(filmListRegex) || [];


    items.forEach((itemHtml, index) => {
      const titleMatch = itemHtml.match(/<a class="cona" href="([^"]+)">([^<]+)<\/a>/);
      const href = titleMatch ? titleMatch[1] : '';
      let title = titleMatch ? titleMatch[2] : '';  
      title = cleanTitle(title);
      const imgMatch = itemHtml.match(/<img[^>]*class="coveri"[^>]*src="([^"]+)"[^>]*>/);
      const imageUrl = imgMatch ? imgMatch[1] : '';
      
      if (title && href) {
          results.push({
              title: title.trim(),
              image: imageUrl.trim(),
              href: href.trim()
          });
      }
  });
  
  return results;
}

function extractDetails(html) {
   const details = [];

   const descriptionMatch = html.match(/<div class="infodes2 entry-content entry-content-single" itemprop="description">[\s\S]*?<p>([\s\S]*?)<\/p>/);
   let description = descriptionMatch ? descriptionMatch[1] : '';

   const aliasesMatch = html.match(/<h1 class="entry-title" itemprop="name""([^"]+)">/);
   let aliases = aliasesMatch ? aliasesMatch[1] : '';

   const airdateMatch = html.match(/<div class="textd">Year:<\/div>\s*<div class="textc">([^<]+)<\/div>/);
   let airdate = airdateMatch ? airdateMatch[1] : '';

   if (description && airdate) {
       details.push({
           description: description,
           aliases: aliases || 'N/A',
           airdate: airdate
       });
   }

   return details;
}

function extractEpisodes(html) {
   const episodes = [];
   const baseUrl = "https://grani.me/";

   const episodeLinks = html.match(/<a class="infovan"[^>]*href="([^"]+)"[\s\S]*?<div class="centerv">(\d+)<\/div>/g);
   
   if (!episodeLinks) {
       return episodes;
   }

   episodeLinks.forEach(link => {
       const hrefMatch = link.match(/href="([^"]+)"/);
       const numberMatch = link.match(/<div class="centerv">(\d+)<\/div>/);

       if (hrefMatch && numberMatch) {
           let href = hrefMatch[1];
           const number = numberMatch[1];

           if (!href.startsWith("https")) {
               href = href.startsWith("/") ? baseUrl + href.slice(1) : baseUrl + href;
           }

           episodes.push({
               href: href,
               number: number
           });
       }
   });
   episodes.reverse();
   return episodes;
}

function extractStreamUrl(html) {
    const sourceRegex = /<source[^>]+id="iframevideo"[^>]+src="([^"]+)"/;
    const match = html.match(sourceRegex);
    return match ? match[1] : null;
}

```