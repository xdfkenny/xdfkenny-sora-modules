const BASE_URL = 'https://allmanga.to';
const API_URL = 'https://api.allanime.day/api';
const CDN_BASE = 'https://allanimenews.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const API_HEADERS = {
    'Origin': BASE_URL,
    'Referer': BASE_URL + '/',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': UA
};

const STREAM_HEADERS = {
    'Referer': CDN_BASE + '/',
    'Origin': CDN_BASE,
    'User-Agent': UA
};

/* MAIN FUNCTIONS */

async function searchResults(keyword) {
    try {
        const query = String(keyword || '').trim();
        if (!query) return JSON.stringify([]);

        const data = await gql(`{shows(search:{sortBy:Trending,query:${JSON.stringify(query)}},limit:26,page:1){edges{_id name englishName nativeName thumbnail}}}`);
        const shows = (((data || {}).shows || {}).edges) || [];

        const results = [];
        const seen = new Set();
        shows.forEach(show => {
            const href = `${BASE_URL}/bangumi/${show._id}`;
            const title = cleanText(show.englishName || show.name || '');
            if (!title || !show._id || seen.has(href)) return;
            seen.add(href);
            results.push({ title, image: show.thumbnail || '', href });
        });

        return JSON.stringify(results);
    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const showId = extractShowId(url);
        if (!showId) return JSON.stringify([]);

        const data = await gql(`{show(_id:${JSON.stringify(showId)}){description englishName name altNames season airedStart}}`);
        const show = (data || {}).show;
        if (!show) return JSON.stringify([]);

        const aliases = (show.altNames || [])
            .filter(name => name && cleanText(name))
            .map(name => cleanText(name))
            .join(' | ') || cleanText(show.englishName || show.name || 'Unknown');
        const airdate = (show.season && show.season.year) ? String(show.season.year) : cleanText(show.airedStart || 'Unknown');

        return JSON.stringify([{
            description: cleanText(show.description || 'No description available'),
            aliases,
            airdate
        }]);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: 'Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const showId = extractShowId(url);
        if (!showId) return JSON.stringify([]);

        const data = await gql(`{episodeInfos(showId:${JSON.stringify(showId)},episodeNumStart:0,episodeNumEnd:999999){episodeIdNum}}`);
        const eps = (((data || {}).episodeInfos) || []);

        const episodes = eps
            .filter(ep => ep.episodeIdNum !== undefined && ep.episodeIdNum !== null)
            .map(ep => ({
                href: `${BASE_URL}/bangumi/${showId}/p-${ep.episodeIdNum}`,
                number: ep.episodeIdNum
            }))
            .sort((a, b) => a.number - b.number);

        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const parsed = parseEpisodeUrl(url);
        if (!parsed) return JSON.stringify({ streams: [], subtitle: '' });

        const { showId, episode } = parsed;
        const data = await gql(`{episodeInfos(showId:${JSON.stringify(showId)},episodeNumStart:${episode},episodeNumEnd:${episode}){episodeIdNum vidInforssub vidInforsdub vidInforsraw}}`);
        const eps = (((data || {}).episodeInfos) || []);
        const ep = eps.find(e => String(e.episodeIdNum) === String(episode)) || eps[0];
        if (!ep) return JSON.stringify({ streams: [], subtitle: '' });

        const streams = [];
        [['sub', ep.vidInforssub], ['dub', ep.vidInforsdub], ['raw', ep.vidInforsraw]].forEach(([label, info]) => {
            if (!info || !info.vidPath) return;
            streams.push({
                title: `${label.toUpperCase()} ${info.vidResolution ? info.vidResolution + 'p' : 'auto'}`,
                streamUrl: cdnUrl(info.vidPath),
                headers: STREAM_HEADERS
            });
        });

        return JSON.stringify({ streams, subtitle: '' });
    } catch (error) {
        console.log('Stream error: ' + error);
        return JSON.stringify({ streams: [], subtitle: '' });
    }
}

/* HELPERS */

async function gql(query) {
    const response = await soraFetch(API_URL, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ query })
    });
    if (!response) return null;
    const json = await response.json();
    return (json && json.data) ? json.data : null;
}

async function soraFetch(url, options) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const headers = opts.headers || {};
    const body = typeof opts.body === 'undefined' ? null : opts.body;

    try {
        return await fetchv2(url, headers, method, body);
    } catch (e) {
        try {
            const text = await fetch(url, {
                method: method,
                headers: headers,
                body: body
            });
            return {
                text: async () => text,
                json: async () => JSON.parse(text)
            };
        } catch (error) {
            console.log('soraFetch error: ' + error);
            return null;
        }
    }
}

function extractShowId(url) {
    const match = String(url || '').match(/\/bangumi\/([^\/?#]+)/);
    return match ? match[1] : '';
}

function parseEpisodeUrl(url) {
    const match = String(url || '').match(/\/bangumi\/([^\/?#]+)\/p-([^\/?#]+)/);
    return match ? { showId: match[1], episode: match[2] } : null;
}

function cdnUrl(path) {
    if (!path) return '';
    const p = String(path).trim();
    if (/^https?:\/\//i.test(p)) return p;
    return CDN_BASE + '/' + p.replace(/^\/+/, '');
}

function cleanText(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&#0?39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .trim();
}
