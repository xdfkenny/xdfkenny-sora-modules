# Async JavaScript Mode

```{note}
For more examples see the [Modules Repo](https://github.com/50n50/sources)
```

In the async Javascript mode Sora will only provide the search keyword for the the searchResults function and the URL for the other three functions. Aside from that, the response format is required to be the same as normal mode.


## Functions

### searchResults
Input: `Keyword (string)` \
Output:`JSON`

Extracts the search results from the provided keyword.

```json
{
   "title": "Example Title",
   "image": "https://example.com/image.jpg",
   "href": "https://grani.me/example"
}
```

### extractDetails
Input: `URL` \
Output:`JSON`

Extracts the details from the provided URL.

```json
{
   "description": "An exciting anime series about adventures.",
   "aliases": "Alternate Name",
   "airdate": "2022"
}
```

### extractEpisodes
Input: `URL` \
Output:`JSON`

Extracts the expisodes from the provided URL.

```json
{
   "href": "https://grani.me/episode/123",
   "number": "1"
}
```

### extractStreamUrl
Input: `URL` \
Output:`URL`

Extracts the stream url from the provided URL.

```txt
https://example.com/stream/video.mp4
```

## Example

```javascript
/** soraFetch — tries fetchv2 first, falls back to fetch */
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            const text = await fetch(url, options);
            return {
                text: async () => text,
                json: async () => JSON.parse(text)
            };
        } catch(error) {
            console.log('soraFetch error: ' + error.message);
            return null;
        }
    }
}

async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await soraFetch(`https://api.animemundo.net/api/v2/hianime/search?q=${encodedKeyword}&language=dub`);
        const data = await response.json();

        const filteredAnimes = data.data.animes.filter(anime => anime.episodes.dub !== null); 
        
        const transformedResults = data.data.animes.map(anime => ({
            title: anime.name,
            image: anime.poster,
            href: `https://hianime.to/watch/${anime.id}`
        }));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Fetch error: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        const match = url.match(/https:\/\/hianime\.to\/watch\/(.+)$/);
        const encodedID = match[1];
        const response = await soraFetch(`https://api.animemundo.net/api/v2/hianime/anime/${encodedID}`);
        const data = await response.json();
        
        const animeInfo = data.data.anime.info;
        const moreInfo = data.data.anime.moreInfo;

        const transformedResults = [{
            description: animeInfo.description || 'No description available',
            aliases: `Duration: ${animeInfo.stats?.duration || 'Unknown'}`,
            airdate: `Aired: ${moreInfo?.aired || 'Unknown'}`
        }];
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
        description: 'Error loading description',
        aliases: 'Duration: Unknown',
        airdate: 'Aired: Unknown'
        }]);
  }
}

async function extractEpisodes(url) {
    try {
        const match = url.match(/https:\/\/hianime\.to\/watch\/(.+)$/);
        const encodedID = match[1];
        const response = await soraFetch(`https://api.animemundo.net/api/v2/hianime/anime/${encodedID}/episodes`);
        const data = await response.json();

        const transformedResults = data.data.episodes.map(episode => ({
            href: `https://hianime.to/watch/${encodedID}?ep=${episode.episodeId.split('?ep=')[1]}`,
            number: episode.number
        }));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Fetch error: ' + error);
        return JSON.stringify([]);
    }    
}

async function extractStreamUrl(url) {
    try {
       const match = url.match(/https:\/\/hianime\.to\/watch\/(.+)$/);
       const encodedID = match[1];
       const response = await soraFetch(`https://api.animemundo.net/api/v2/hianime/episode/sources?animeEpisodeId=${encodedID}&category=dub`);
       const data = await response.json();
       
       const hlsSource = data.data.sources.find(source => source.type === 'hls');
       
       return hlsSource ? hlsSource.url : null;
    } catch (error) {
       console.log('Fetch error: ' + error);
       return null;
    }
}
```