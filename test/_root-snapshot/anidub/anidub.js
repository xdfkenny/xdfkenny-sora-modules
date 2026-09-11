const BASE_URL = "https://anidub.org";
const PLAPI_BASE = "https://plapi.cdnvideohub.com/api/v1/player/sv";
const DEFAULT_SUBTITLE = "https://none.com";

function _ua() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
}

function _safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function _htmlDecode(value) {
  const s = String(value || "");

  return s
    .replace(/&#58;/g, ":")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function _stripTags(value) {
  return _htmlDecode(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function _absUrl(url, base) {
  const raw = _htmlDecode(String(url || "").trim());
  if (!raw) return "";

  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("//")) return "https:" + raw;

  const root = String(base || BASE_URL).replace(/\/+$/, "");
  return root + "/" + raw.replace(/^\/+/, "");
}

function _attr(tag, name) {
  const s = String(tag || "");
  if (!s) return "";

  const quoted = new RegExp(name + "\\s*=\\s*(['\"])(.*?)\\1", "i").exec(s);
  if (quoted && quoted[2]) return _htmlDecode(quoted[2]);

  const plain = new RegExp(name + "\\s*=\\s*([^\\s>]+)", "i").exec(s);
  return plain && plain[1] ? _htmlDecode(plain[1]) : "";
}

function _cleanTitle(raw) {
  const t = _stripTags(raw || "");
  return t
    .replace(/\s+смотреть\s+онлайн.*$/i, "")
    .replace(/\s*\[.*?\]\s*$/g, "")
    .trim() || "Unknown title";
}

function _scoreTitle(title, keyword) {
  const t = String(title || "").toLowerCase().trim();
  const k = String(keyword || "").toLowerCase().trim();

  if (!t || !k) return 99;
  if (t === k) return 0;
  if (t.startsWith(k)) return 1;
  if (t.includes(k)) return 2;

  return 3;
}

function _packRelease(payload) {
  return "anidub-release:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackRelease(href) {
  const raw = String(href || "");
  if (!raw.startsWith("anidub-release:")) return null;

  return _safeJsonParse(
    decodeURIComponent(raw.slice("anidub-release:".length)),
    null
  );
}

function _packEpisode(payload) {
  return "anidub:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackEpisode(href) {
  const raw = String(href || "");
  if (!raw.startsWith("anidub:")) return null;

  return _safeJsonParse(
    decodeURIComponent(raw.slice("anidub:".length)),
    null
  );
}

function _headers(referer) {
  return {
    "User-Agent": _ua(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "Referer": referer || BASE_URL + "/",
    "Origin": BASE_URL
  };
}

function _jsonHeaders(referer) {
  return {
    "User-Agent": _ua(),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "Referer": referer || BASE_URL + "/",
    "Origin": BASE_URL
  };
}

function _searchHeaders() {
  return {
    "User-Agent": _ua(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL
  };
}

async function _postSearch(query) {
  const body =
    "do=search" +
    "&subaction=search" +
    "&story=" + encodeURIComponent(String(query || ""));

  const url = BASE_URL + "/index.php?do=search";

  const res = await fetchv2(url, _searchHeaders(), "POST", body);
  return await res.text();
}

function _parseSearchResults(html, keyword) {
  const src = String(html || "");
  const out = [];
  const seen = new Set();

  const itemRegex = /<a\b[^>]*class=["'][^"']*all__item[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
  const blocks = src.match(itemRegex) || [];

  for (const block of blocks) {
    const aTag = (block.match(/<a\b[^>]*>/i) || [""])[0];
    const href = _absUrl(_attr(aTag, "href"), BASE_URL);

    const titleFromAttr = _attr(aTag, "title");

    const titleMatch = block.match(
      /<span[^>]*class=["'][^"']*all__item-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
    );

    const title = _cleanTitle(titleFromAttr || (titleMatch ? titleMatch[1] : ""));

    const imgTag = (block.match(/<img\b[^>]*>/i) || [""])[0];
    const image = _absUrl(_attr(imgTag, "src") || _attr(imgTag, "data-src"), BASE_URL);

    if (!href || !title || seen.has(href)) continue;

    seen.add(href);

    out.push({
      title,
      image,
      href: _packRelease({
        animeUrl: href,
        title,
        image
      }),
      _score: _scoreTitle(title, keyword)
    });
  }

  out.sort((a, b) => a._score - b._score);

  return out.map(({ _score, ...rest }) => rest);
}

function _extractMeta(html, propOrName) {
  const src = String(html || "");

  const re1 = new RegExp(
    `<meta[^>]*(?:property|name)=["']${propOrName}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );

  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propOrName}["'][^>]*>`,
    "i"
  );

  const m = src.match(re1) || src.match(re2);
  return m && m[1] ? _htmlDecode(m[1]).trim() : "";
}

function _extractDescription(html) {
  const meta =
    _extractMeta(html, "og:description") ||
    _extractMeta(html, "twitter:description") ||
    _extractMeta(html, "description");

  return _stripTags(meta) || "No description available.";
}

function _extractPlayerConfig(html) {
  const src = String(html || "");

  const tagMatch = src.match(/<video-player\b[^>]*>/i);
  const tag = tagMatch ? tagMatch[0] : "";

  const titleId =
    _attr(tag, "data-title-id") ||
    _attr(tag, "title-id") ||
    "";

  const pub =
    _attr(tag, "data-publisher-id") ||
    _attr(tag, "publisher-id") ||
    "19";

  const aggr =
    _attr(tag, "data-aggregator") ||
    _attr(tag, "aggregator") ||
    "cvh";

  return {
    titleId,
    pub,
    aggr
  };
}

function _buildPlaylistUrl(cfg) {
  if (!cfg?.titleId) return "";

  return (
    PLAPI_BASE +
    "/playlist" +
    `?pub=${encodeURIComponent(cfg.pub || "19")}` +
    `&aggr=${encodeURIComponent(cfg.aggr || "cvh")}` +
    `&id=${encodeURIComponent(cfg.titleId)}`
  );
}

function _buildVideoUrl(vkId) {
  const id = String(vkId || "").trim();
  if (!id) return "";

  return PLAPI_BASE + "/video/" + encodeURIComponent(id);
}

async function _fetchPlaylistFromPage(html, referer) {
  const cfg = _extractPlayerConfig(html);
  const playlistUrl = _buildPlaylistUrl(cfg);

  if (!playlistUrl) {
    return {
      cfg,
      playlist: null
    };
  }

  const res = await fetchv2(playlistUrl, _jsonHeaders(referer));
  const json = await res.json();

  return {
    cfg,
    playlist: json
  };
}

function _voiceRank(name) {
  const s = String(name || "").toLowerCase();

  const order = [
    "anidub online",
    "anidub",
    "anilibria",
    "aniliberty",
    "shiza",
    "studio band",
    "студийная банда",
    "onwave",
    "animevost",
    "jam club",
    "jam",
    "anibaza",
    "koekak",
    "subvost",
    "субтитры",
    "sub"
  ];

  for (let i = 0; i < order.length; i++) {
    if (s.includes(order[i])) return i;
  }

  return 999;
}

function _makeVoiceName(item) {
  const studio = String(item?.voiceStudio || "").trim();
  const type = String(item?.voiceType || "").trim();

  const joined = [studio, type].filter(Boolean).join(" · ");
  if (joined) return joined;

  const name = String(item?.name || "").trim();
  if (name) return name;

  return "AniDub";
}

function _cleanStreamUrl(url) {
  const s = String(url || "").trim();
  return s || null;
}

function _buildQualityUrls(sources) {
  return {
    url4k: _cleanStreamUrl(sources?.mpeg4kUrl),
    url2k: _cleanStreamUrl(sources?.mpeg2kUrl || sources?.mpegQhdUrl),
    url1080: _cleanStreamUrl(sources?.mpegFullHdUrl),
    url720: _cleanStreamUrl(sources?.mpegHighUrl),
    url480: _cleanStreamUrl(sources?.mpegMediumUrl),
    url360: _cleanStreamUrl(sources?.mpegLowUrl),
    url240: _cleanStreamUrl(sources?.mpegLowestUrl),
    url144: _cleanStreamUrl(sources?.mpegTinyUrl),
    hlsUrl: _cleanStreamUrl(sources?.hlsUrl),
    dashUrl: _cleanStreamUrl(sources?.dashUrl)
  };
}

function _bestQualityUrl(q) {
  return (
    q.url4k ||
    q.url2k ||
    q.url1080 ||
    q.url720 ||
    q.url480 ||
    q.url360 ||
    q.url240 ||
    q.url144 ||
    q.hlsUrl ||
    null
  );
}

function _hasAnyQuality(q) {
  return Boolean(
    q.url4k ||
    q.url2k ||
    q.url1080 ||
    q.url720 ||
    q.url480 ||
    q.url360 ||
    q.url240 ||
    q.url144 ||
    q.hlsUrl
  );
}

function _appendVoiceoverStream(streams, voiceName, sources, headers) {
  const q = _buildQualityUrls(sources);
  const best = _bestQualityUrl(q);

  if (!best || !_hasAnyQuality(q)) return;

  streams.push({
    title: voiceName || "AniDub",
    streamUrl: best,

    url4k: q.url4k,
    url2k: q.url2k,
    url1080: q.url1080,
    url720: q.url720,
    url480: q.url480,
    url360: q.url360,
    url240: q.url240,
    url144: q.url144,

    headers
  });
}

function _optionKey(option) {
  return [
    String(option?.vkId || "").trim(),
    String(option?.cvhId || "").trim(),
    String(option?.voiceName || "").toLowerCase().replace(/\s+/g, " ").trim()
  ].join("|");
}

async function searchResults(keyword) {
  try {
    const query = String(keyword || "").trim();
    if (!query) return JSON.stringify([]);

    const html = await _postSearch(query);
    const results = _parseSearchResults(html, query);

    return JSON.stringify(results);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractDetails(href) {
  try {
    const release = _unpackRelease(href);
    const animeUrl = release?.animeUrl || String(href || "");

    if (!animeUrl) return JSON.stringify([]);

    const res = await fetchv2(animeUrl, _headers(BASE_URL + "/"));
    const html = await res.text();

    const title =
      _extractMeta(html, "og:title") ||
      _extractMeta(html, "twitter:title") ||
      release?.title ||
      "AniDub";

    const description = _extractDescription(html);

    let airdate = "Unknown";
    const yearMatch = html.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch && yearMatch[1]) airdate = yearMatch[1];

    return JSON.stringify([
      {
        description,
        aliases: _cleanTitle(title),
        airdate
      }
    ]);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractEpisodes(href) {
  try {
    const release = _unpackRelease(href);
    const animeUrl = release?.animeUrl || String(href || "");

    if (!animeUrl) return JSON.stringify([]);

    const pageRes = await fetchv2(animeUrl, _headers(BASE_URL + "/"));
    const html = await pageRes.text();

    const { cfg, playlist } = await _fetchPlaylistFromPage(html, animeUrl);

    const items = Array.isArray(playlist?.items) ? playlist.items : [];

    if (!items.length) {
      return JSON.stringify([]);
    }

    const isSerial = playlist?.isSerial === true;
    const byEpisode = new Map();

    for (const item of items) {
      const season =
        Number.isFinite(item?.season) && item.season > 0
          ? item.season
          : 1;

      const episode =
        Number.isFinite(item?.episode) && item.episode > 0
          ? item.episode
          : 1;

      const key = isSerial ? `${season}:${episode}` : "movie:1";
      const voiceName = _makeVoiceName(item);

      const option = {
        vkId: item?.vkId ? String(item.vkId) : "",
        cvhId: item?.cvhId ? String(item.cvhId) : "",
        voiceStudio: String(item?.voiceStudio || "").trim(),
        voiceType: String(item?.voiceType || "").trim(),
        voiceName,
        name: String(item?.name || "").trim(),
        season,
        episode
      };

      if (!option.vkId && !option.cvhId) continue;

      if (!byEpisode.has(key)) {
        byEpisode.set(key, {
          season,
          episode,
          title: isSerial
            ? `Episode ${episode}`
            : playlist?.titleName || release?.title || "Movie",
          options: []
        });
      }

      const episodeData = byEpisode.get(key);

      const optionKey = [
        option.vkId,
        option.cvhId,
        option.voiceName.toLowerCase().replace(/\s+/g, " ").trim()
      ].join("|");

      const exists = episodeData.options.some(existing => {
        const existingKey = [
          existing.vkId,
          existing.cvhId,
          existing.voiceName.toLowerCase().replace(/\s+/g, " ").trim()
        ].join("|");

        return existingKey === optionKey;
      });

      if (!exists) {
        episodeData.options.push(option);
      }
    }

    const out = Array.from(byEpisode.values())
      .sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      })
      .map(ep => {
        ep.options.sort((a, b) => _voiceRank(a.voiceName) - _voiceRank(b.voiceName));

        return {
          href: _packEpisode({
            animeUrl,
            titleId: cfg?.titleId || "",
            pub: cfg?.pub || "19",
            aggr: cfg?.aggr || "cvh",
            season: ep.season,
            episode: ep.episode,
            options: ep.options
          }),
          number: ep.episode,
          title: ep.title || `Episode ${ep.episode}`
        };
      });

    return JSON.stringify(out);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractStreamUrl(href) {
  try {
    const payload = _unpackEpisode(href);
    const options = Array.isArray(payload?.options) ? payload.options : [];

    if (!options.length) {
      return JSON.stringify({
        streams: [],
        subtitle: DEFAULT_SUBTITLE
      });
    }

    options.sort((a, b) => _voiceRank(a.voiceName) - _voiceRank(b.voiceName));

    const streams = [];
    const seenVkIds = new Set();

    for (const opt of options) {
      const vkId = opt?.vkId ? String(opt.vkId).trim() : "";
      if (!vkId) continue;

      if (seenVkIds.has(vkId)) continue;
      seenVkIds.add(vkId);

      const videoUrl = _buildVideoUrl(vkId);

      const res = await fetchv2(
        videoUrl,
        _jsonHeaders(payload?.animeUrl || BASE_URL + "/")
      );

      const json = await res.json();
      const sources = json?.sources || {};

      const headers = {
        "User-Agent": _ua(),
        "Referer": payload?.animeUrl || BASE_URL + "/"
      };

      _appendVoiceoverStream(
        streams,
        opt?.voiceName || opt?.voiceStudio || opt?.name || "AniDub",
        sources,
        headers
      );
    }

    return JSON.stringify({
      streams,
      subtitle: DEFAULT_SUBTITLE
    });
  } catch (_) {
    return JSON.stringify({
      streams: [],
      subtitle: DEFAULT_SUBTITLE
    });
  }
}

function _defaultExport() {
  return {
    searchResults,
    extractDetails,
    extractEpisodes,
    extractStreamUrl
  };
}

try {
  globalThis.default = _defaultExport;
} catch (_) {}

try {
  this.default = _defaultExport;
} catch (_) {}

try {
  globalThis.module = globalThis.module || {};
  globalThis.module.exports = {
    default: _defaultExport
  };
} catch (_) {}