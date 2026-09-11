const API_BASE = "https://api.animevost.org/v1/";
const FORM_CT  = "application/x-www-form-urlencoded; charset=UTF-8";
const SITE_BASE = "https://animevost.org";
const DEFAULT_SUBTITLE = "https://none.com";

function encodeForm(fields) {
  return Object.keys(fields)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(fields[k])}`)
    .join("&");
}

async function postForm(url, fields) {
  const bodyStr = encodeForm(fields);

  try {
    const resA = await fetchv2(url, { "Content-Type": FORM_CT }, "POST", bodyStr);
    if (resA && typeof resA.text === "function") return resA;
  } catch (_) {}

  return await fetchv2(url, {
    method: "POST",
    headers: { "Content-Type": FORM_CT },
    body: bodyStr
  });
}

async function parseJsonSafe(res) {
  const txt = await res.text();

  try {
    return JSON.parse(txt);
  } catch (_) {
    return JSON.parse(txt.replace(/^\uFEFF/, "").trim());
  }
}

function cleanTitle(raw) {
  if (!raw || typeof raw !== "string") return "Unknown title";

  let t = raw.split(" /")[0];
  return t.replace(/\s*\[.*?\]\s*$/g, "").trim() || "Unknown title";
}

function htmlToText(html) {
  if (!html || typeof html !== "string") return "";

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanUrl(url) {
  const s = String(url || "").trim();
  return s || null;
}

function _safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function makeHrefFromPayload(obj) {
  return `animevost://payload/${encodeURIComponent(JSON.stringify(obj || {}))}`;
}

function readPayloadFromHref(href) {
  const m = String(href || "").match(/^animevost:\/\/payload\/(.+)$/);
  if (!m) return null;

  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch (_) {
    return null;
  }
}

function parseIdFromAny(hrefOrId) {
  const p = readPayloadFromHref(hrefOrId);
  if (p && p.id) return parseInt(p.id, 10);

  const m1 = String(hrefOrId || "").match(/^animevost:\/\/release\/(\d+)$/);
  if (m1) return parseInt(m1[1], 10);

  const m2 = String(hrefOrId || "").match(/[?&]id=(\d+)/);
  if (m2) return parseInt(m2[1], 10);

  if (/^\d+$/.test(String(hrefOrId || ""))) {
    return parseInt(hrefOrId, 10);
  }

  return null;
}

function _packEpisode(payload) {
  return "animevost:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackEpisode(href) {
  const raw = String(href || "");
  if (!raw.startsWith("animevost:")) return null;

  return _safeJsonParse(decodeURIComponent(raw.slice("animevost:".length)), null);
}

function _streamHeaders() {
  return {
    "User-Agent": "Mozilla/5.0",
    "Referer": SITE_BASE + "/"
  };
}

async function searchResults(keyword) {
  try {
    let res  = await postForm(API_BASE + "search", { name: String(keyword) });
    let json = await parseJsonSafe(res);

    if (json?.error || !Array.isArray(json?.data) || json.data.length === 0) {
      res  = await postForm(API_BASE + "search", { name: `"${String(keyword)}"` });
      json = await parseJsonSafe(res);
    }

    if (json?.error) {
      return JSON.stringify([]);
    }

    const list = Array.isArray(json?.data) ? json.data : [];
    if (!list.length) {
      return JSON.stringify([]);
    }

    const tiles = list.map(item => {
      const payload = {
        id: item.id,
        title: cleanTitle(item.title),
        description: htmlToText(item.description || ""),
        year: item.year || "",
        type: item.type || "",
        image: item.urlImagePreview || ""
      };

      return {
        title: payload.title,
        image: payload.image,
        href: makeHrefFromPayload(payload)
      };
    });

    return JSON.stringify(tiles);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractDetails(href) {
  try {
    const p = readPayloadFromHref(href);

    const out = [{
      description: p?.description || "No description available.",
      aliases: `Type: ${p?.type || "Unknown"}`,
      airdate: p?.year ? String(p.year) : "Unknown"
    }];

    return JSON.stringify(out);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractEpisodes(href) {
  try {
    const p  = readPayloadFromHref(href);
    const id = p?.id ?? parseIdFromAny(href);

    if (!id) {
      return JSON.stringify([]);
    }

    const res = await postForm(API_BASE + "playlist", { id: String(id) });
    const arr = await parseJsonSafe(res);

    if (!Array.isArray(arr)) {
      return JSON.stringify([]);
    }

    const out = arr.map((ep, idx) => {
      const name = ep?.name || "";
      const m = name.match(/(\d+)/);
      const num = m ? parseInt(m[1], 10) : (idx + 1);

      const url1080 = null;
      const url720 = cleanUrl(ep?.hd);
      const url480 = cleanUrl(ep?.std);

      const fallback = url720 || url480;
      if (!fallback) return null;

      return {
        href: _packEpisode({
          url1080,
          url720,
          url480,
          fallback
        }),
        number: num,
        title: name || `Episode ${num}`,
        image: ep?.preview || ""
      };
    }).filter(Boolean);

    return JSON.stringify(out);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractStreamUrl(href) {
  try {
    const payload = _unpackEpisode(href);

    // Backward compatibility for old AnimeVost episode href format.
    if (!payload) {
      return href;
    }

    const url1080 = cleanUrl(payload.url1080);
    const url720 = cleanUrl(payload.url720);
    const url480 = cleanUrl(payload.url480);
    const fallback = cleanUrl(payload.fallback);

    const headers = _streamHeaders();
    const streams = [];

    if (url1080) {
      streams.push({
        title: "1080p",
        streamUrl: url1080,
        url1080,
        url720,
        url480,
        headers
      });
    }

    if (url720) {
      streams.push({
        title: "720p",
        streamUrl: url720,
        url1080,
        url720,
        url480,
        headers
      });
    }

    if (url480) {
      streams.push({
        title: "480p",
        streamUrl: url480,
        url1080,
        url720,
        url480,
        headers
      });
    }

    if (!streams.length && fallback) {
      streams.push({
        title: "720p",
        streamUrl: fallback,
        url1080: null,
        url720: fallback,
        url480: null,
        headers
      });
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