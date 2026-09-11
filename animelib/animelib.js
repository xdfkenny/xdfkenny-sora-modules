async function searchResults(keyword) {
    const results = [];
    const headers = {
        "Referer": "https://v3.animelib.org/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    };
    try {
        const response = await fetchv2(
            "https://hapi.hentaicdn.org/api/anime?fields[]=rate_avg&fields[]=rate&fields[]=releaseDate&q=" + keyword,
            headers
        );
        const json = await response.json();

        if (json && Array.isArray(json.data)) {
            for (const item of json.data) {
                const title = item.eng_name || item.name || "Unknown";
                const image = item.cover?.default || item.cover?.thumbnail || "";

                results.push({
                    title,
                    image: "https://passthrough-worker.simplepostrequest.workers.dev/?simple=" +
                           image +
                           "&referer=https://v3.animelib.org/",
                    href: item.slug_url || item.slug || item.id,
                    _score: scoreTitle(title, keyword)
                });
            }
        }

        results.sort((a, b) => a._score - b._score);

        return JSON.stringify(
            results.map(({ _score, ...rest }) => rest)
        );
    } catch (err) {
        return JSON.stringify([{
            title: err.message,
            image: "Error",
            href: "Error"
        }]);
    }
}

function scoreTitle(title, keyword) {
    const t = title.toLowerCase();
    const k = keyword.toLowerCase();

    if (t === k) return 0;              
    if (t.startsWith(k)) return 1;     
    if (t.includes(k)) return 2;        
    return 3;                         
}

async function extractDetails(slug) {
    const headers = {
        "Referer": "https://v3.animelib.org/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    };
    try {
        const response = await fetchv2(
            "https://hapi.hentaicdn.org/api/anime/" + slug + 
            "?fields[]=background&fields[]=eng_name&fields[]=otherNames&fields[]=summary&fields[]=releaseDate&fields[]=type_id&fields[]=caution&fields[]=views&fields[]=close_view&fields[]=rate_avg&fields[]=rate&fields[]=genres&fields[]=tags&fields[]=teams&fields[]=user&fields[]=franchise&fields[]=authors&fields[]=publisher&fields[]=userRating&fields[]=moderated&fields[]=metadata&fields[]=metadata.count&fields[]=metadata.close_comments&fields[]=anime_status_id&fields[]=time&fields[]=episodes&fields[]=episodes_count&fields[]=episodesSchedule&fields[]=shiki_rate"
        , headers);
        const json = await response.json();
        const data = json.data || {};

        let description = "No summary available";
        if (data.summary) {
            if (typeof data.summary === "string") {
                description = data.summary;
            } else if (data.summary.content && Array.isArray(data.summary.content)) {
                description = data.summary.content
                    .map(block => {
                        if (block.content && Array.isArray(block.content)) {
                            return block.content.map(t => t.text || "").join("");
                        }
                        return "";
                    })
                    .join("\n")
                    .trim();
            }
        }

        const aliases = Array.isArray(data.otherNames) ? data.otherNames.join(", ") : "";
        return JSON.stringify([{
            description: description,
            airdate: data.releaseDate || "Unknown",
            aliases: aliases
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error",
            airdate: "Error",
            aliases: ""
        }]);
    }
}

async function extractEpisodes(slug) {
    const results = [];
    const headers = {
        "Referer": "https://v3.animelib.org/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    };
    try {
        const response = await fetchv2("https://hapi.hentaicdn.org/api/episodes?anime_id=" + slug, headers);
        const json = await response.json();

        if (json && Array.isArray(json.data)) {
            for (const episode of json.data) {
                results.push({
                    href: episode.id ? String(episode.id) : "",
                    number: parseFloat(episode.number) || 0
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error"
        }]);
    }
}

async function extractStreamUrl(ID) {
    const headers = {
        "Referer": "https://v3.animelib.org/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    };
    try {
        const url = "https://hapi.hentaicdn.org/api/episodes/" + ID;
        const response = await fetchv2(url, headers);
        const json = await response.json();
        
        const data = json.data || {};
        const players = data.players || [];
        players.sort((a, b) => {
            const order = { Animelib: 0, Kodik: 1 };
            return (order[a.player] ?? 99) - (order[b.player] ?? 99);
        });
        const parserPromises = players
            .filter(player => player.team && player.team.name)
            .map(async (player) => {
                try {
                    let streamUrl = null;
                    let highestQualityNum = 0;

                    if (player.player === "Animelib" && player.video && player.video.quality) {
                        const qualities = player.video.quality;

                        
                        for (const qualityItem of qualities) {
                            if (qualityItem.href && qualityItem.quality > highestQualityNum) {
                                highestQualityNum = qualityItem.quality;
                                streamUrl = qualityItem.href;

                            }
                        }
                        
                        if (streamUrl && !streamUrl.startsWith('http')) {
                            streamUrl = 'https://video1.cdnlibs.org/.%D0%B0s/' + streamUrl;
                        }
                    } else if (player.player === "Kodik" && player.src) {
                        let kodikUrl = player.src;
                        if (!kodikUrl.startsWith('http')) {
                            kodikUrl = "https:" + kodikUrl;
                        }
                        const qualitiesJson = await kodikParser(kodikUrl);
                        const qualities = JSON.parse(qualitiesJson);
                        
                        for (const quality in qualities) {
                            if (qualities[quality].src) {
                                const qualityNum = parseInt(quality.replace('p', '')) || 0;
                                if (qualityNum > highestQualityNum) {
                                    highestQualityNum = qualityNum;
                                    streamUrl = qualities[quality].src;
                                }
                            }
                        }
                        
                        if (streamUrl && streamUrl.startsWith('//')) {
                            streamUrl = 'https:' + streamUrl;
                        }
                    }

                    if (streamUrl) {
                        return {
                            title: player.team.name + (highestQualityNum ? ` (${highestQualityNum}p)` : '') + (player.player === "Animelib" ? " (Animelib)" : " (Kodik)"),
                            streamUrl,
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                                "Referer": player.player === "Kodik" ? "https://kodik.info/" : "https://v3.animelib.org/"
                            }
                        };
                    }
                    
                    return null;
                } catch (err) {
                    console.error("[extractStreamUrl] Player processing error:", err.message, err.code);
                    return null;
                }
            });
        
        const results = await Promise.all(parserPromises);
        let streams = results.filter(stream => stream !== null);
        if (streams.length === 0) {
            streams = [{
                title: "Animelib Player",
                streamUrl: "https://v3.animelib.org/anime/" + ID,
                headers: {
                    "Referer": "https://v3.animelib.org/"
                }
            }];
        }
        return JSON.stringify({
            streams: streams,
            subtitle: "https://none.com"
        });
    } catch (err) {
        console.error("[extractStreamUrl] ERROR:", err.message);
        return JSON.stringify({
            streams: [],
            subtitle: "https://none.com"
        });
    }
}

async function kodikParser(url) {
  try {
    const headers = {
      "Referer": "https://v3.animelib.org/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    };
    const response = await fetchv2(url, headers);
    const htmlText = await response.text();

    const urlParamsMatch = htmlText.match(/var\s+urlParams\s*=\s*'([^']+)'/);
    const videoInfoTypeMatch = htmlText.match(/vInfo\.type\s*=\s*'([^']+)'/);
    const videoInfoHashMatch = htmlText.match(/vInfo\.hash\s*=\s*'([^']+)'/);
    const videoInfoIdMatch = htmlText.match(/vInfo\.id\s*=\s*'([^']+)'/);

    const urlParams = urlParamsMatch ? JSON.parse(urlParamsMatch[1]) : {};
    const videoInfo_type = videoInfoTypeMatch ? videoInfoTypeMatch[1] : '';
    const videoInfo_hash = videoInfoHashMatch ? videoInfoHashMatch[1] : '';
    const videoInfo_id = videoInfoIdMatch ? videoInfoIdMatch[1] : '';

    const finalData =
      `d=${urlParams.d}` +
      `&d_sign=${urlParams.d_sign}` +
      `&pd=${urlParams.pd}` +
      `&pd_sign=${urlParams.pd_sign}` +
      `&ref=${urlParams.ref}` +
      `&ref_sign=${urlParams.ref_sign}` +
      `&bad_user=false&cdn_is_working=true` +
      `&type=${videoInfo_type}&hash=${videoInfo_hash}&id=${videoInfo_id}&info=%7B%7D`;


    const headers2 = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Referer": "https://v3.animelib.org/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "X-Requested-With": "XMLHttpRequest"
    };
    const apiResponse = await fetchv2("https://kodikplayer.com/ftor", headers2, "POST", finalData);
    const apiJson = await apiResponse.json();

    const qualities = {};
    
    if (apiJson?.links) {
      for (const quality in apiJson.links) {
        const qualityData = apiJson.links[quality];
        
        if (qualityData && qualityData[0] && qualityData[0].src) {
          const encodedSrc = qualityData[0].src;
          const decodedUrl = decode(encodedSrc);
          
          qualities[quality] = {
            src: decodedUrl,
            type: qualityData[0].type || 'application/x-mpegURL'
          };
        }
      }
    }

    return JSON.stringify(qualities, null, 2);
  } catch (error) {
    console.error("[kodikParser] ERROR:", error.message);
    return JSON.stringify({ error: "error.org" });
  }
}

function decode(input) {
    const _0x1a = ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", String.fromCharCode, ">="];
    (function() {})();
    const _map = _0x1a[0];
    let _o = '',
        _b = 0,
        _c = 0;
    const _r = [];
    for (let _i = 0; _i < input.length; _i++) {
        const _ch = input[_i];
        if (/[a-zA-Z]/.test(_ch)) {
            const _cc = _ch.charCodeAt(0);
            const _max = _ch <= 'Z' ? 90 : 122;
            let _sh = _cc + 18;
            _r.push(String.fromCharCode(_sh <= _max ? _sh : _sh - 26));
        } else _r.push(_ch);
    }
    const _rot = _r.join('');
    for (let _j = 0; _j < _rot.length; _j++) {
        const _ch = _rot[_j];
        if (_ch === _0x1a[1]) break;
        const _v = _map.indexOf(_ch);
        if (_v === -1) continue;
        _b = (_b << 6) | _v;
        _c += 6;
        if (_c >= 8) {
            _c -= 8;
            _o += _0x1a[2]((_b >> _c) & 0xFF);
        }
    }
    return _o;
}
