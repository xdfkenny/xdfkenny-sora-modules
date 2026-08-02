# SoftSubs Javascript mode

For more examples see the [Modules Repo](https://github.com/xdfkenny/xdfkenny-sora-modules)

In the softsub mode you extract the subtitles alongside the stream, usually you'd need to have async or streamAsync mode activated for this too.

## Functions

### searchResults
Input: `HTML/Keyword (Depending on the mode)` \
Output: `JSON`

Extracts the search results from the provided keyword.

```json
[
  {
     "title": "Example Title",
     "image": "https://example.com/image.jpg",
     "href": "https://grani.me/example"
  }
]
```

### extractDetails
Input: `HTML/URL (Depending on the mode)` \
Output: `JSON`

Extracts the details from the provided URL.

```json
[
  {
     "description": "An exciting anime series about adventures.",
     "aliases": "Alternate Name",
     "airdate": "2022"
  }
]
```

### extractEpisodes
Input: `HTML/URL (Depending on the mode)` \
Output: `JSON`

Extracts the episodes from the provided URL.

```json
[
  {
     "href": "https://your-source.com/watch/anime-123?ep=episode-456",
     "number": "1"
  }
]
```

### extractStreamUrl
Input: `URL` \
Output: `JSON`

Extracts the stream url from the provided URL.

```json
{
  "stream": "https://example.com/stream/video.mp4",
  "subtitles": "https://example.com/subtitles/english.vtt"
}
```

## Example

```javascript
async function searchResults(keyword) {
     try {
          const encodedKeyword = encodeURIComponent(keyword);
          const responseText = await fetch(`https://api.your-source.com/search?q=${encodedKeyword}&language=sub`);
          const data = JSON.parse(responseText);

          const transformedResults = data.data.animes.map(anime => ({
                title: anime.name,
                image: anime.poster,
                href: `https://your-source.com/watch/${anime.id}`
          }));
          
          return JSON.stringify(transformedResults);
          
     } catch (error) {
          console.log('Fetch error: ' + error);
          return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
     }
}


async function extractDetails(url) {
     try {
          const match = url.match(/https:\/\/your-source\.com\/watch\/(.+)$/);
          const encodedID = match[1];
          const response = await fetch(`https://api.your-source.com/anime/${encodedID}`);
          const data = JSON.parse(response);
          
          const animeInfo = data.data.anime.info;
          const moreInfo = data.data.anime.moreInfo;

          const transformedResults = [{
                description: animeInfo.description || 'No description available',
                aliases: (animeInfo.alternateNames || []).join(', ') || 'No alternative titles',
                airdate: `Aired: ${moreInfo?.aired || 'Unknown'}`
          }];
          
          return JSON.stringify(transformedResults);
     } catch (error) {
          console.log('Details error: ' + error);
          return JSON.stringify([{
          description: 'Error loading description',
          aliases: 'No alternative titles',
          airdate: 'Aired: Unknown'
          }]);
  }
}

async function extractEpisodes(url) {
     try {
          const match = url.match(/https:\/\/your-source\.com\/watch\/(.+)$/);
          const encodedID = match[1];
          const response = await fetch(`https://api.your-source.com/anime/${encodedID}/episodes`);
          const data = JSON.parse(response);

          const transformedResults = data.data.episodes.map(episode => ({
                href: `https://your-source.com/watch/${encodedID}?ep=${episode.episodeId.split('?ep=')[1]}`,
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
         const episodeId = new URL(url).searchParams.get('ep');
         const encodedID = encodeURIComponent(episodeId);
         const response = await fetch(`https://api.your-source.com/episode/sources?animeEpisodeId=${encodedID}&category=sub`);
         const data = JSON.parse(response);
         
         const hlsSource = data.data.sources.find(source => source.type === 'hls');
          const subtitleTrack = data.data.tracks.find(track => track.label === 'English' && track.kind === 'captions');
          
          const result = {
                stream: hlsSource ? hlsSource.url : null,
                subtitles: subtitleTrack ? subtitleTrack.file : null
          };
          return JSON.stringify(result);
     } catch (error) {
          console.log('Fetch error: ' + error);
          return JSON.stringify({ stream: null, subtitles: null });
     }
}
```
