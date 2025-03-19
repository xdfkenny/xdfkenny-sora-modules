async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await fetch(`https://api.animemundo.net/api/v2/henaojara/search?q=${encodedKeyword}&language=sub`);
        const data = JSON.parse(responseText);

        const transformedResults = data.data.animes.map(anime => ({
            title: anime.name,
            image: anime.poster,
            href: `https://henaojara.com/watch/${anime.id}`
        }));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Fetch error:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}


async function extractDetails(url) {
    try {
        const match = url.match(/https:\/\/henaojara\.com\/watch\/(.+)$/);
        const encodedID = match[1];
        const response = await fetch(`https://api.animemundo.net/api/v2/henaojara/anime/${encodedID}`);
        const data = JSON.parse(response);
        
        const animeInfo = data.data.anime.info;
        const moreInfo = data.data.anime.moreInfo;

        const transformedResults = [{
            description: animeInfo.description || 'No description available',
            aliases: `Duration: ${animeInfo.stats?.duration || 'Unknown'}`,
            airdate: `Aired: ${moreInfo?.aired || 'Unknown'}`
        }];
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
        description: 'Error loading description',
        aliases: 'Duration: Unknown',
        airdate: 'Aired: Unknown'
        }]);
  }
}

async function extractEpisodes(url) {
    try {
        const match = url.match(/https:\/\/henaojara\.com\/watch\/(.+)$/);
        const encodedID = match[1];
        const response = await fetch(`https://api.animemundo.net/api/v2/henaojara/anime/${encodedID}/episodes`);
        const data = JSON.parse(response);

        const transformedResults = data.data.episodes.map(episode => ({
            href: `https://henaojara.com/watch/${encodedID}?ep=${episode.episodeId.split('?ep=')[1]}`,
            number: episode.number
        }));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Fetch error:', error);
    }    
}

async function extractStreamUrl(url) {
    try {
       const match = url.match(/https:\/\/henaojara\.com\/watch\/(.+)$/);
       const encodedID = match[1];
       const response = await fetch(`https://api.animemundo.net/api/v2/henaojara/episode/sources?animeEpisodeId=${encodedID}&category=sub`);
       const data = JSON.parse(response);
       
       const hlsSource = data.data.sources.find(source => source.type === 'hls');
        const subtitleTrack = data.data.tracks.find(track => track.label === 'English' && track.kind === 'captions');
        
        const result = {
            stream: hlsSource ? hlsSource.url : null,
            subtitles: subtitleTrack ? subtitleTrack.file : null
        };
        console.log(result);
        return JSON.stringify(result);
    } catch (error) {
        console.log('Fetch error:', error);
        return JSON.stringify({ stream: null, subtitles: null });
    }
}
