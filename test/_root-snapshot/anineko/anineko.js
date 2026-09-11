async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://anineko.to/browser?keyword=" + encodeURIComponent(keyword));
        const html = await response.text();

        const regex = /<article class="nv-anime-card nv-browse-card">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: "https://anineko.to" + match[1].trim()
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
        const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
        if (descMatch) {
            description = descMatch[1].trim();
        }

        return JSON.stringify([{
            description: description,
            aliases: "N/A",
            airdate: "N/A"
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

        const regex = /<article class="nv-info-episode-item">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<strong>Episode (\d+)<\/strong>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                href: "https://anineko.to" + match[1].trim(),
                number: parseInt(match[2], 10)
            });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const serverTasks = [];
        let subtitles = "";

        const regex = /<button[^>]+data-video="([^"]+)"[^>]*>\s*([^<\s]+)\s*<span>([^<]+)<\/span>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const videoUrl = match[1];
            const serverName = match[2].trim();
            let label = match[3].trim();

            if (label === "Sort Sub") label = "Soft Sub";

            if (!subtitles) {
                const subMatch = videoUrl.match(/(?:sub|caption_1|c1_file)=([^&"]+)/);
                if (subMatch) {
                    subtitles = decodeURIComponent(subMatch[1]);
                }
            }

            serverTasks.push((async () => {
                let streamUrl = null;
                let priority = 99;

                try {
                    if (serverName === "HD-1" || serverName === "HD-2") {
                        priority = serverName === "HD-1" ? 1 : 2;
                        if (videoUrl.includes("vibeplayer.site")) {
                            const idMatch = videoUrl.match(/vibeplayer\.site\/([a-z0-9]+)/);
                            if (idMatch) {
                                streamUrl = `https://vibeplayer.site/public/stream/${idMatch[1]}/master.m3u8`;
                            }
                        }
                    } else if (serverName === "StreamHG" || serverName === "Earnvids") {
                        priority = serverName === "StreamHG" ? 3 : 4;
                        const playerResponse = await fetchv2(videoUrl);
                        const playerHtml = await playerResponse.text();
                        const obfuscatedScript = playerHtml.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
                        if (obfuscatedScript) {
                            const unpackedScript = unpack(obfuscatedScript[1]);

                            const hlsMatch = unpackedScript.match(/"(https:\/\/[^"]+master\.m3u8[^"]*)"/);
                            if (hlsMatch) {
                                streamUrl = hlsMatch[1];
                            } else {
                                const fileMatch = unpackedScript.match(/file\s*:\s*"([^"]+)"/);
                                if (fileMatch) streamUrl = fileMatch[1];
                            }
                        }
                    } else if (serverName === "Doodstream") {
                        priority = 5;
                        const playerResponse = await fetchv2(videoUrl);
                        const playerHtml = await playerResponse.text();
                        streamUrl = await doodstreamExtractor(playerHtml, videoUrl);
                    }
                } catch (e) {
                    console.log("Error extracting server " + serverName + ": " + e);
                }

                if (streamUrl) {
                    return { serverName, label, priority, streamUrl };
                }
                return null;
            })());
        }

        const resolvedResults = await Promise.all(serverTasks);
        const validStreams = resolvedResults.filter(s => s !== null);

        validStreams.sort((a, b) => a.priority - b.priority);

        const streams = [];
        const serverCounts = {};

        for (const s of validStreams) {
            let baseName = s.serverName.replace("-", " ");
            let baseTitle = "";
            if (s.serverName === "HD-1" || s.serverName === "HD-2") {
                baseTitle = `[👑] ${baseName} ${s.label}`;
            } else {
                baseTitle = `${baseName} ${s.label}`;
            }

            let finalTitle = baseTitle;
            if (serverCounts[baseTitle]) {
                serverCounts[baseTitle]++;
                finalTitle = `${baseTitle} ${serverCounts[baseTitle]}`;
            } else {
                serverCounts[baseTitle] = 1;
            }

            streams.push({
                title: finalTitle,
                streamUrl: s.streamUrl,
                headers: {}
            });
        }

        return JSON.stringify({
            streams: streams,
            subtitles: subtitles
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
            subtitles: ""
        });
    }
}

async function doodstreamExtractor(html, url) {
    try {
        const streamDomain = url.match(/https:\/\/(.*?)\//)[1];
        const md5Match = html.match(/'\/pass_md5\/(.*?)',/);
        if (!md5Match) return null;
        const md5Path = md5Match[1];

        const token = md5Path.substring(md5Path.lastIndexOf("/") + 1);
        const expiryTimestamp = new Date().valueOf();
        const random = randomStr(10);

        const passResponse = await fetchv2(`https://${streamDomain}/pass_md5/${md5Path}`, {
            headers: {
                "Referer": url,
            },
        });
        const responseData = await passResponse.text();
        return `${responseData}${random}?token=${token}&expiry=${expiryTimestamp}`;
    } catch (e) {
        return null;
    }
}

function randomStr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        }
        else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            }
            catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function detect(source) {
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    }
    catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        }
        else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                if (a[2] == "[]") {
                }
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                }
                catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    function _replacestrings(source) {
        return source;
    }
}
