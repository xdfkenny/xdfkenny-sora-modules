const API_BASE = "https://api.yani.tv";
const IMAGE_REFERER = "https://site.yummyani.me/";
const PASSTHROUGH = "https://passthrough-worker.simplepostrequest.workers.dev/?simple=";

function _ua() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
}

function _absUrl(u) {
  if (!u) return "";
  const s = String(u);
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return "https:" + s;
  return s;
}

function _wrapImage(url) {
  const abs = _absUrl(url);
  if (!abs) return "";
  return (
    PASSTHROUGH +
    encodeURIComponent(abs) +
    "&referer=" +
    encodeURIComponent(IMAGE_REFERER)
  );
}

function _safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

function scoreTitle(title, keyword) {
  const t = String(title || "").toLowerCase().trim();
  const k = String(keyword || "").toLowerCase().trim();
  if (!t || !k) return 99;
  if (t === k) return 0;
  if (t.startsWith(k)) return 1;
  if (t.includes(k)) return 2;
  return 3;
}

// Prefer voiceovers order (edit freely)
function _dubbingRank(name) {
  const s = String(name || "").toLowerCase();

  const order = [
    "anilibria",
    "aniliberty",
    "jam",
    "anidub",
    "shiza",
    "studio band",
    "studioband",
    "dream cast",
    "dreamcast",
    "crunchyroll",
    "sub",
    "субтит"
  ];

  for (let i = 0; i < order.length; i++) {
    if (s.includes(order[i])) return i;
  }
  return 999;
}

// Pack episode payload into href string
function _pack(obj) {
  return "yummy:" + encodeURIComponent(JSON.stringify(obj || {}));
}

function _unpack(href) {
  const s = String(href || "");
  if (!s.startsWith("yummy:")) return null;
  return _safeJsonParse(decodeURIComponent(s.slice("yummy:".length)), null);
}

async function _apiGet(url) {
  const headers = {
    "User-Agent": _ua(),
    "Accept": "application/json",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "Referer": IMAGE_REFERER,
    "Origin": IMAGE_REFERER
  };
  return fetchv2(url, headers);
}

// ------------------------- searchResults -------------------------
async function searchResults(keyword) {
  const results = [];
  try {
    const url = `${API_BASE}/search?limit=30&offset=0&q=${encodeURIComponent(keyword)}`;
    const res = await _apiGet(url);
    const json = await res.json();

    const arr = Array.isArray(json?.response) ? json.response : [];
    for (const item of arr) {
      const title = item?.title || "Unknown";
      const poster =
        item?.poster?.fullsize ||
        item?.poster?.mega ||
        item?.poster?.huge ||
        item?.poster?.big ||
        item?.poster?.medium ||
        item?.poster?.small ||
        "";

      // Use anime_id as stable href
      const href = item?.anime_id != null ? String(item.anime_id) : (item?.anime_url || "");

      results.push({
        title,
        image: _wrapImage(poster),
        href,
        _score: scoreTitle(title, keyword)
      });
    }

    results.sort((a, b) => a._score - b._score);
    return JSON.stringify(results.map(({ _score, ...rest }) => rest));
  } catch (err) {
    return JSON.stringify([{ title: err?.message || "Error", image: "Error", href: "Error" }]);
  }
}

// ------------------------- extractDetails -------------------------
async function extractDetails(animeIdOrUrl) {
  try {
    const url = `${API_BASE}/anime/${encodeURIComponent(String(animeIdOrUrl))}?need_videos=false`;
    const res = await _apiGet(url);
    const json = await res.json();
    const data = json?.response || {};

    const other = Array.isArray(data?.other_titles) ? data.other_titles : [];
    return JSON.stringify([{
      description: data?.description || "No description available",
      airdate: data?.year != null ? String(data.year) : "Unknown",
      aliases: other.length ? other.join(", ") : ""
    }]);
  } catch (_) {
    return JSON.stringify([{ description: "Error", airdate: "Error", aliases: "" }]);
  }
}

// ------------------------- extractEpisodes -------------------------
// UNIQUE by episode number.
// Store ALL voiceover options inside href payload; stream picker shows them.
async function extractEpisodes(animeIdOrUrl) {
  try {
    const raw = String(animeIdOrUrl || "").trim();
    let animeId = null;

    if (/^\d+$/.test(raw)) {
      animeId = raw;
    } else {
      const infoUrl = `${API_BASE}/anime/${encodeURIComponent(raw)}?need_videos=false`;
      const infoRes = await _apiGet(infoUrl);
      const infoJson = await infoRes.json();
      const info = infoJson?.response || {};
      animeId = info?.anime_id != null ? String(info.anime_id) : null;
    }

    if (!animeId) return JSON.stringify([]);

    const url = `${API_BASE}/anime/${encodeURIComponent(animeId)}/videos`;
    const res = await _apiGet(url);
    const json = await res.json();

    const vids = Array.isArray(json?.response) ? json.response : [];

    // Keep only Kodik entries (we parse Kodik)
    const kodikVids = vids.filter(v => {
      const iframe = String(v?.iframe_url || "");
      const player = String(v?.data?.player || "").toLowerCase();
      return (
        iframe.includes("kodik.info") ||
        iframe.includes("kodikplayer.com") ||
        player.includes("kodik")
      );
    });

    // Group by episode number
    const byNum = new Map(); // num -> { num, options: [...], opening?, ending?, duration?, skips? }

    for (const v of kodikVids) {
      const num = parseFloat(v?.number) || 0;
      if (!num) continue;

      const iframeUrl = _absUrl(v?.iframe_url || "");
      if (!iframeUrl) continue;

      const dubbing = String(v?.data?.dubbing || "").trim() || "Unknown voiceover";
      const player = String(v?.data?.player || "Kodik").trim();

      const opening =
        v?.skips?.opening &&
        Number.isFinite(v.skips.opening.time) &&
        Number.isFinite(v.skips.opening.length)
          ? { start: v.skips.opening.time, stop: v.skips.opening.time + v.skips.opening.length }
          : undefined;

      const ending =
        v?.skips?.ending &&
        Number.isFinite(v.skips.ending.time) &&
        Number.isFinite(v.skips.ending.length)
          ? { start: v.skips.ending.time, stop: v.skips.ending.time + v.skips.ending.length }
          : undefined;

      const skips =
        (v?.skips?.opening && Number.isFinite(v.skips.opening.time) && Number.isFinite(v.skips.opening.length)) ||
        (v?.skips?.ending && Number.isFinite(v.skips.ending.time) && Number.isFinite(v.skips.ending.length))
          ? {
              opening:
                v?.skips?.opening &&
                Number.isFinite(v.skips.opening.time) &&
                Number.isFinite(v.skips.opening.length)
                  ? { time: v.skips.opening.time, length: v.skips.opening.length }
                  : null,
              ending:
                v?.skips?.ending &&
                Number.isFinite(v.skips.ending.time) &&
                Number.isFinite(v.skips.ending.length)
                  ? { time: v.skips.ending.time, length: v.skips.ending.length }
                  : null
            }
          : undefined;

      const duration = Number.isFinite(v?.duration) && v.duration > 0 ? v.duration : undefined;

      if (!byNum.has(num)) {
        byNum.set(num, { num, options: [], opening, ending, duration, skips });
      }

      const ep = byNum.get(num);

      if (!ep.opening && opening) ep.opening = opening;
      if (!ep.ending && ending) ep.ending = ending;
      if (!ep.duration && duration) ep.duration = duration;
      if (!ep.skips && skips) ep.skips = skips;

      ep.options.push({
        dubbing,
        player,
        iframe_url: iframeUrl,
        opening,
        ending
      });
    }

    const out = Array.from(byNum.values())
      .sort((a, b) => a.num - b.num)
      .map(ep => {
        ep.options.sort((x, y) => _dubbingRank(x.dubbing) - _dubbingRank(y.dubbing));

        const payload = {
          animeId,
          number: ep.num,
          options: ep.options
        };

        const item = {
          href: _pack(payload),
          number: ep.num,
          title: `Episode ${ep.num}`
        };

        const primary = ep.options[0];
        if (primary?.opening) item.opening = primary.opening;
        if (primary?.ending) item.ending = primary.ending;

        if (ep.skips) item.skips = ep.skips;
        if (ep.duration) item.duration = ep.duration;

        return item;
      });

    return JSON.stringify(out);
  } catch (err) {
    console.log("extractEpisodes error:", err?.message || err);
    return JSON.stringify([]);
  }
}

// ------------------------- extractStreamUrl -------------------------
// Build streams list: one entry per voiceover option (best quality per option)
async function extractStreamUrl(href) {
  try {
    const payload = _unpack(href);
    const options = Array.isArray(payload?.options) ? payload.options : [];

    if (!options.length) {
      return JSON.stringify({ streams: [], subtitle: "https://none.com" });
    }

    options.sort((a, b) => _dubbingRank(a.dubbing) - _dubbingRank(b.dubbing));

    const streams = [];

    for (const opt of options) {
      const iframeUrl = _absUrl(opt?.iframe_url);
      if (
        !iframeUrl ||
        (!iframeUrl.includes("kodik.info") && !iframeUrl.includes("kodikplayer.com"))
      ) {
        continue;
      }

      const qualitiesJson = await kodikParser(iframeUrl);
      const qualities = _safeJsonParse(qualitiesJson, {});
      let bestUrl = "";
      let bestQ = 0;
      let url1080 = null;
      let url720 = null;
      let url480 = null;

      for (const q in qualities) {
        const srcRaw = qualities?.[q]?.src;
        const src = srcRaw ? (String(srcRaw).startsWith("//") ? "https:" + String(srcRaw) : String(srcRaw)) : "";
        if (!src) continue;
        const n = parseInt(String(q).replace(/[^\d]/g, ""), 10) || 0;

        if (n >= 1080 && !url1080) url1080 = src;
        if (n === 720 && !url720) url720 = src;
        if (n === 480 && !url480) url480 = src;

        if (n > bestQ) {
          bestQ = n;
          bestUrl = src;
        }
      }

      if (!bestUrl) continue;

      const finalUrl = bestUrl;

      // Fallback quality mapping for sources with uncommon labels.
      if (!url1080 && bestQ >= 1080) url1080 = finalUrl;
      if (!url720 && bestQ >= 720 && bestQ < 1080) url720 = finalUrl;
      if (!url480 && bestQ >= 480 && bestQ < 720) url480 = finalUrl;

      streams.push({
        title: `${opt.dubbing} (Kodik)`,
        streamUrl: finalUrl,
        url1080,
        url720,
        url480,
        headers: {
          "User-Agent": _ua(),
          "Referer": IMAGE_REFERER
        }
      });
    }

    return JSON.stringify({
      streams,
      subtitle: "https://none.com"
    });
  } catch (err) {
    console.log("extractStreamUrl error:", err?.message || err);
    return JSON.stringify({ streams: [], subtitle: "https://none.com" });
  }
}

// ------------------------- kodikParser -------------------------
async function kodikParser(url) {
  try {
    const headers = {
      "Referer": IMAGE_REFERER,
      "User-Agent": _ua()
    };

    const response = await fetchv2(url, headers);
    const htmlText = await response.text();

    const urlParamsMatch = htmlText.match(/var\s+urlParams\s*=\s*'([^']+)'/);
    const videoInfoTypeMatch = htmlText.match(/vInfo\.type\s*=\s*'([^']+)'/);
    const videoInfoHashMatch = htmlText.match(/vInfo\.hash\s*=\s*'([^']+)'/);
    const videoInfoIdMatch = htmlText.match(/vInfo\.id\s*=\s*'([^']+)'/);

    const urlParams = urlParamsMatch ? _safeJsonParse(urlParamsMatch[1], {}) : {};
    const videoInfo_type = videoInfoTypeMatch ? videoInfoTypeMatch[1] : "";
    const videoInfo_hash = videoInfoHashMatch ? videoInfoHashMatch[1] : "";
    const videoInfo_id = videoInfoIdMatch ? videoInfoIdMatch[1] : "";

    const finalData =
      `d=${urlParams.d || ""}` +
      `&d_sign=${urlParams.d_sign || ""}` +
      `&pd=${urlParams.pd || ""}` +
      `&pd_sign=${urlParams.pd_sign || ""}` +
      `&ref=${urlParams.ref || ""}` +
      `&ref_sign=${urlParams.ref_sign || ""}` +
      `&bad_user=false&cdn_is_working=true` +
      `&type=${videoInfo_type}&hash=${videoInfo_hash}&id=${videoInfo_id}&info=%7B%7D`;

    const headers2 = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Referer": IMAGE_REFERER,
      "User-Agent": _ua(),
      "X-Requested-With": "XMLHttpRequest"
    };

    const apiResponse = await fetchv2(
      "https://kodikplayer.com/ftor",
      headers2,
      "POST",
      finalData
    );
    const apiJson = await apiResponse.json();

    const qualities = {};
    if (apiJson?.links) {
      for (const quality in apiJson.links) {
        const qArr = apiJson.links[quality];
        const first = Array.isArray(qArr) ? qArr[0] : null;
        if (!first?.src) continue;

        qualities[quality] = {
          src: decode(first.src),
          type: first.type || "application/x-mpegURL"
        };
      }
    }

    return JSON.stringify(qualities, null, 2);
  } catch (err) {
    console.log("kodikParser error:", err?.message || err);
    return JSON.stringify({ error: "kodik_parse_failed" });
  }
}

// ------------------------- decode (Kodik) -------------------------
function decode(input) {
  const map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "", b = 0, c = 0;

  const r = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (/[a-zA-Z]/.test(ch)) {
      const cc = ch.charCodeAt(0);
      const max = ch <= "Z" ? 90 : 122;
      const sh = cc + 18;
      r.push(String.fromCharCode(sh <= max ? sh : sh - 26));
    } else {
      r.push(ch);
    }
  }

  const rot = r.join("");
  for (let j = 0; j < rot.length; j++) {
    const ch = rot[j];
    if (ch === "=") break;
    const v = map.indexOf(ch);
    if (v === -1) continue;

    b = (b << 6) | v;
    c += 6;

    if (c >= 8) {
      c -= 8;
      out += String.fromCharCode((b >> c) & 0xff);
    }
  }
  return out;
}

// ------------------------- export hook -------------------------
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
  globalThis.module.exports = { default: _defaultExport };
} catch (_) {}