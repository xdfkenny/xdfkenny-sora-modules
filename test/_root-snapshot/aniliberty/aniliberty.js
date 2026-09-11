const DEFAULT_IMAGE_HOST = "https://aniliberty.top";

function originFromApi(urlOrBase) {
  if (!urlOrBase) return DEFAULT_IMAGE_HOST;
  const raw = String(urlOrBase);
  const m = raw.match(/^(https?:\/\/[^/]+)\/api\/v1\/?/i);
  if (m && m[1]) return m[1];
  const m2 = raw.match(/^(https?:\/\/[^/]+)/i);
  return (m2 && m2[1]) ? m2[1] : DEFAULT_IMAGE_HOST;
}

function fullImg(path, host) {
  if (!path) return;
  if (path.startsWith("http")) return path;
  const base = host || DEFAULT_IMAGE_HOST;
  return `${base}${path}`;
}


function normalizeAniLibertyHlsUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    const adParams = [
      'isWithVideoAds',
      'isWithVideoAdsAlways',
      'withVideoAds',
      'videoAds',
      'ads',
      'ad',
    ];

    for (const key of adParams) {
      u.searchParams.delete(key);
    }

    return u.toString();
  } catch (_) {
    const parts = raw.split('?');
    if (parts.length < 2) return raw;
    const base = parts.shift();
    const query = parts.join('?');
    const kept = query
      .split('&')
      .filter(Boolean)
      .filter((part) => {
        const key = decodeURIComponent(part.split('=')[0] || '').toLowerCase();
        return ![
          'iswithvideoads',
          'iswithvideoadsalways',
          'withvideoads',
          'videoads',
          'ads',
          'ad',
        ].includes(key);
      });
    return kept.length ? `${base}?${kept.join('&')}` : base;
  }
}

function pickBestHls(ep) {
  return normalizeAniLibertyHlsUrl(ep?.hls_1080) || normalizeAniLibertyHlsUrl(ep?.hls_720) || normalizeAniLibertyHlsUrl(ep?.hls_480) || null;
}

function _packEpisode(payload) {
  return "aniliberty:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackEpisode(href) {
  const s = String(href || "");
  if (!s.startsWith("aniliberty:")) return null;
  return _safeJsonParse(decodeURIComponent(s.slice("aniliberty:".length)), null);
}

function _safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

async function checkApiStatus() {
  const domains = [
    "https://aniliberty.top/api/v1/",
    "https://anilibria.top/api/v1/",
    "https://anilibria.wtf/api/v1/"
  ];
  for (const base of domains) {
    try {
      const res = await fetchv2(base + "app/status");
      const data = await res.json();
      if (data?.is_alive || data?.result === "ok") return base;
    } catch (_) {}
  }
  return "https://aniliberty.top/api/v1/";
}

async function searchResults(keyword) {
  try {
    const base = await checkApiStatus();
    const origin = originFromApi(base);
    const url = `${base}app/search/releases?query=${encodeURIComponent(keyword)}&include=id,name.main,poster.src`;

    const res = await fetchv2(url);
    const data = await res.json();

    const out = (Array.isArray(data) ? data : []).map(it => ({
      title: it?.name?.main || "Unknown title",
      image: fullImg(it?.poster?.src, origin),
      href:
        `${base}anime/releases/${it.id}?` +
        [
          "include=name.main,poster.src,description,average_duration_of_episode",
          "episodes.ordinal,episodes.name,episodes.duration",
          "episodes.preview.src",
          "episodes.opening.start,episodes.opening.stop",
          "episodes.ending.start,episodes.ending.stop",
          "episodes.hls_1080,episodes.hls_720,episodes.hls_480"
        ].join(",")
    }));

    if (!out.length) {
      return JSON.stringify([]);;
    }
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify([]);;
  }
}

async function extractDetails(url) {
  try {
    const res = await fetchv2(url);
    const data = await res.json();

    const description = data?.description || "No description available.";
    const mins = Number.isFinite(data?.average_duration_of_episode)
      ? `${data.average_duration_of_episode}m`
      : "Unknown";

    const out = [{
      description,
      aliases: `Duration: ${mins}`,
      airdate: "Unknown"
    }];
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify([]);;
  }
}

async function extractEpisodes(url) {
  try {
    const res = await fetchv2(url);
    const data = await res.json();

    const origin = originFromApi(url);

    const eps = Array.isArray(data?.episodes) ? data.episodes : [];

    const out = eps.map((ep, idx) => {
      const url1080 = normalizeAniLibertyHlsUrl(ep?.hls_1080);
      const url720 = normalizeAniLibertyHlsUrl(ep?.hls_720);
      const url480 = normalizeAniLibertyHlsUrl(ep?.hls_480);
      const best = url1080 || url720 || url480;
      if (!best) return null;

      const num = Number.isFinite(ep?.ordinal)
        ? ep.ordinal
        : (Number.isFinite(ep?.sort_order) ? ep.sort_order : (idx + 1));

      const title = ep?.name ? String(ep.name) : `Episode ${num}`;
      const image = fullImg(ep?.preview?.src, origin);

      // Build skip blocks only if numbers present
      const opening = (ep?.opening && Number.isFinite(ep.opening.start) && Number.isFinite(ep.opening.stop))
        ? { start: ep.opening.start, stop: ep.opening.stop }
        : undefined;

      const ending = (ep?.ending && Number.isFinite(ep.ending.start) && Number.isFinite(ep.ending.stop))
        ? { start: ep.ending.start, stop: ep.ending.stop }
        : undefined;

      const entry = {
        href: _packEpisode({
          url1080,
          url720,
          url480,
          fallback: best
        }),
        number: num,
        title,
        image
      };

      // Attach only when available
      if (opening) entry.opening = opening;
      if (ending) entry.ending = ending;
      if (Number.isFinite(ep?.duration)) entry.duration = ep.duration; // seconds (optional)

      return entry;
    }).filter(Boolean);

    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractStreamUrl(url) {
  try {
    const payload = _unpackEpisode(url);
    if (!payload) {
      return url; // backward compatibility for old episode href format
    }

    const url1080 = normalizeAniLibertyHlsUrl(payload.url1080);
    const url720 = normalizeAniLibertyHlsUrl(payload.url720);
    const url480 = normalizeAniLibertyHlsUrl(payload.url480);
    const fallback = normalizeAniLibertyHlsUrl(payload.fallback);

    const streams = [];

    if (url1080) {
      streams.push({
        title: "1080p",
        streamUrl: url1080,
        url1080,
        url720,
        url480,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": DEFAULT_IMAGE_HOST + "/"
        }
      });
    }

    if (url720) {
      streams.push({
        title: "720p",
        streamUrl: url720,
        url1080,
        url720,
        url480,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": DEFAULT_IMAGE_HOST + "/"
        }
      });
    }

    if (url480) {
      streams.push({
        title: "480p",
        streamUrl: url480,
        url1080,
        url720,
        url480,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": DEFAULT_IMAGE_HOST + "/"
        }
      });
    }

    if (!streams.length) {
      return fallback;
    }

    return JSON.stringify({
      streams,
      subtitle: "https://none.com"
    });
  } catch (e) {
    return null;
  }
}