const API_BASE = "https://onwavedub.org/api/v1";
const SITE_BASE = "https://onwavedub.org";
const DEFAULT_SUBTITLE = "https://none.com";

const STREAM_PICKER_MODE = "voiceover-only";

function _streamTitle(kind, quality) {
	const q = Number.isFinite(quality) && quality > 0 ? `${quality}p` : "";

	if (STREAM_PICKER_MODE === "server-only") {
		if (kind === "onwave") return q ? `OnWave - Main ${q}` : "OnWave - Main";
		if (kind === "mirror") return q ? `OnWave - Mirror ${q}` : "OnWave - Mirror";
		if (kind === "kodik") return q ? `OnWave - Kodik ${q}` : "OnWave - Kodik";
	}

	if (kind === "onwave") return q ? `OnWave ${q}` : "OnWave";
	if (kind === "mirror") return q ? `OnWave зеркало ${q}` : "OnWave зеркало";
	if (kind === "kodik") return q ? `Kodik ${q}` : "Kodik";

	return q ? `Stream ${q}` : "Stream";
}

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

function _absUrl(url, base) {
	if (!url) return "";
	const raw = String(url).trim();
	if (!raw) return "";
	if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
	if (raw.startsWith("//")) return "https:" + raw;

	const origin = String(base || SITE_BASE).replace(/\/+$/, "");
	return origin + "/" + raw.replace(/^\/+/, "");
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

function _packEpisode(payload) {
	return "onwave:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackEpisode(href) {
	const raw = String(href || "");
	if (!raw.startsWith("onwave:")) return null;

	return _safeJsonParse(decodeURIComponent(raw.slice("onwave:".length)), null);
}

function _extractAnimeId(input) {
	const raw = String(input || "").trim();
	if (!raw) return "";

	const packed = _unpackEpisode(raw);
	if (packed && packed.animeId != null) return String(packed.animeId);

	if (/^\d+$/.test(raw)) return raw;

	const m = raw.match(/\/anime\/(\d+)/i);
	if (m && m[1]) return m[1];

	return raw;
}

function _playerPriority(player) {
	return Number.isFinite(player?.priority) ? player.priority : 999;
}

function _pickPlayer(players, predicate) {
	const list = (Array.isArray(players) ? players : []).filter(predicate);
	if (!list.length) return null;

	list.sort((a, b) => _playerPriority(a) - _playerPriority(b));
	return list[0];
}

function _isKodikPlayer(player) {
	const name = String(player?.name || "").toLowerCase();
	const link = String(player?.link || "").toLowerCase();

	return (
		name.includes("kodik") ||
		link.includes("kodikplayer.com") ||
		link.includes("kodik.info")
	);
}

function _cleanVoiceoverName(name) {
	const raw = String(name || "").trim();
	if (!raw) return "Kodik";

	const cleaned = raw
		.replace(/\s*\((?:kodik|кодик)\)\s*$/i, "")
		.replace(/\s*[-–—]\s*(?:kodik|кодик)\s*$/i, "")
		.trim();

	return cleaned || "Kodik";
}

function _packKodikPlayer(player) {
	if (!player?.link) return null;

	return {
		name: _cleanVoiceoverName(player?.name),
		link: String(player.link),
		priority: _playerPriority(player),
		translationTeamId: player?.translationTeamId ?? null
	};
}

async function _apiGet(url) {
	return fetchv2(url, {
		"User-Agent": _ua(),
		"Accept": "application/json",
		"Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
		"Referer": SITE_BASE + "/",
		"Origin": SITE_BASE
	});
}

function _buildOnWaveVideoBase(playerLink) {
	const abs = _absUrl(playerLink, "https://anisurf.site");
	if (!abs) return "";

	if (/\/videos\/[^/]+\/streams\/source\.mp4/i.test(abs)) {
		return abs.split("/streams/source.mp4")[0];
	}

	if (/\/videos\/[^/]+\/streams\/v\d+\/segment_index\.m3u8/i.test(abs)) {
		return abs.replace(/\/streams\/v\d+\/segment_index\.m3u8.*$/i, "");
	}

	try {
		const u = new URL(abs);
		const id = u.searchParams.get("id");
		if (!id) return "";

		const origin =
			u.hostname.toLowerCase().includes("anisurf.ru")
				? "https://anisurf.ru"
				: "https://anisurf.site";

		return `${origin}/videos/${id}`;
	} catch (_) {
		const m = abs.match(/[?&]id=([a-z0-9-]+)/i);
		if (!m || !m[1]) return "";

		const isRu = /anisurf\.ru/i.test(abs);
		const origin = isRu ? "https://anisurf.ru" : "https://anisurf.site";

		return `${origin}/videos/${m[1]}`;
	}
}

async function _urlExists(url, referer) {
	if (!url) return false;

	try {
		const res = await fetchv2(url, {
			"User-Agent": _ua(),
			"Referer": referer || "https://anisurf.site/"
		});

		if (!res) return false;

		if (typeof res.status === "number" && (res.status < 200 || res.status >= 400)) {
			return false;
		}

		if (typeof res.text === "function") {
			const text = await res.text();
			if (!text) return false;

			if (String(url).includes(".m3u8")) {
				return text.includes("#EXTM3U") || text.includes("#EXT-X-");
			}

			return true;
		}

		return true;
	} catch (_) {
		return false;
	}
}

async function _appendOnWaveQualityStreams(streams, playerLink, kind, referer) {
	const videoBase = _buildOnWaveVideoBase(playerLink);
	if (!videoBase) return;

	const base = videoBase.replace(/\/+$/, "");

	const url1080 = `${base}/streams/v1/segment_index.m3u8`;
	const url720 = `${base}/streams/v0/segment_index.m3u8`;
	const sourceMp4 = `${base}/streams/source.mp4`;

	const headers = {
		"User-Agent": _ua(),
		"Referer": referer || "https://anisurf.site/"
	};

	const has1080 = await _urlExists(url1080, headers.Referer);
	const has720 = await _urlExists(url720, headers.Referer);

	if (has1080) {
		streams.push({
			title: _streamTitle(kind, 1080),
			streamUrl: url1080,
			url1080,
			url720: has720 ? url720 : null,
			url480: null,
			headers
		});
	}

	if (has720) {
		streams.push({
			title: _streamTitle(kind, 720),
			streamUrl: url720,
			url1080: has1080 ? url1080 : null,
			url720,
			url480: null,
			headers
		});
	}

	if (!has1080 && !has720) {
		streams.push({
			title: _streamTitle(kind, 1080),
			streamUrl: sourceMp4,
			url1080: sourceMp4,
			url720: null,
			url480: null,
			headers
		});
	}
}

function _appendKodikQualityStreams(streams, qualities, voiceName) {
	const qualityMap = {
		720: null,
		480: null,
		360: null
	};

	for (const quality in qualities || {}) {
		const srcRaw = qualities?.[quality]?.src;

		const src = srcRaw
			? String(srcRaw).startsWith("//")
				? "https:" + String(srcRaw)
				: String(srcRaw)
			: "";

		if (!src) continue;

		const numeric = parseInt(String(quality).replace(/[^\d]/g, ""), 10) || 0;

		if (numeric === 720 && !qualityMap[720]) qualityMap[720] = src;
		if (numeric === 480 && !qualityMap[480]) qualityMap[480] = src;
		if (numeric === 360 && !qualityMap[360]) qualityMap[360] = src;
	}

	for (const quality of [720, 480, 360]) {
		const streamUrl = qualityMap[quality];
		if (!streamUrl) continue;

		streams.push({
			title: `${voiceName || "Kodik"} ${quality}p`,
			streamUrl,
			url1080: null,
			url720: qualityMap[720],
			url480: qualityMap[480],
			url360: qualityMap[360],
			headers: {
				"User-Agent": _ua(),
				"Referer": SITE_BASE + "/"
			}
		});
	}
}

async function searchResults(keyword) {
	try {
		const query = String(keyword || "").trim();
		if (!query) return JSON.stringify([]);

		const url = `${API_BASE}/catalog?query=${encodeURIComponent(query)}`;
		const response = await _apiGet(url);
		const data = await response.json();

		const items = Array.isArray(data?.items) ? data.items : [];

		const out = items.map(item => ({
			title: String(item?.title || "Unknown"),
			image: _absUrl(item?.poster || "", SITE_BASE),
			href: String(item?.id || ""),
			_score: _scoreTitle(item?.title || "", query)
		}));

		out.sort((a, b) => a._score - b._score);

		return JSON.stringify(out.map(({ _score, ...rest }) => rest));
	} catch (_) {
		return JSON.stringify([]);
	}
}

async function extractDetails(animeIdOrUrl) {
	try {
		const animeId = _extractAnimeId(animeIdOrUrl);
		if (!animeId) return JSON.stringify([]);

		const response = await _apiGet(`${API_BASE}/anime/${encodeURIComponent(animeId)}`);
		const data = await response.json();

		const aliases = [];

		if (data?.originalTitle) aliases.push(`Original: ${data.originalTitle}`);
		if (data?.alternateTitle) aliases.push(`Alt: ${data.alternateTitle}`);
		if (Number.isFinite(data?.length)) aliases.push(`Duration: ${data.length}m`);
		if (Number.isFinite(data?.episodesTotal)) aliases.push(`Episodes: ${data.episodesTotal}`);

		if (Array.isArray(data?.studios) && data.studios.length) {
			aliases.push(`Studios: ${data.studios.join(", ")}`);
		}

		return JSON.stringify([
			{
				description: data?.description || "No description available",
				aliases: aliases.join(" | "),
				airdate: data?.airedAt ? String(data.airedAt).slice(0, 10) : "Unknown"
			}
		]);
	} catch (_) {
		return JSON.stringify([]);
	}
}

async function extractEpisodes(animeIdOrUrl) {
	try {
		const animeId = _extractAnimeId(animeIdOrUrl);
		if (!animeId) return JSON.stringify([]);

		const response = await _apiGet(`${API_BASE}/anime/${encodeURIComponent(animeId)}`);
		const data = await response.json();

		const episodes = Array.isArray(data?.episodes) ? data.episodes : [];

		const out = episodes
			.map((episode, index) => {
				const players = Array.isArray(episode?.players) ? episode.players : [];

				const onwave = _pickPlayer(players, player => {
					const name = String(player?.name || "").toLowerCase();
					return name === "onwave" || (name.includes("onwave") && !name.includes("зеркало"));
				});

				const mirror = _pickPlayer(players, player => {
					const name = String(player?.name || "").toLowerCase();
					return name.includes("зеркало") || name.includes("mirror");
				});

				const kodikPlayers = players
					.filter(_isKodikPlayer)
					.sort((a, b) => _playerPriority(a) - _playerPriority(b))
					.map(_packKodikPlayer)
					.filter(Boolean);

				if (!onwave && !mirror && !kodikPlayers.length) return null;

				const number = Number.isFinite(episode?.episode)
					? episode.episode
					: Number.isFinite(episode?.index)
						? episode.index
						: index + 1;

				const payload = {
					animeId: String(animeId),
					season: Number.isFinite(episode?.season) ? episode.season : 1,
					episode: number,
					label: String(episode?.label || ""),
					players: {
						onwave: onwave?.link ? String(onwave.link) : "",
						onwaveMirror: mirror?.link ? String(mirror.link) : "",
						kodikList: kodikPlayers
					}
				};

				return {
					href: _packEpisode(payload),
					number,
					title: episode?.label ? String(episode.label) : `Episode ${number}`
				};
			})
			.filter(Boolean)
			.sort((a, b) => Number(a.number) - Number(b.number));

		return JSON.stringify(out);
	} catch (_) {
		return JSON.stringify([]);
	}
}

async function extractStreamUrl(href) {
	try {
		const payload = _unpackEpisode(href);

		if (!payload) {
			return JSON.stringify({
				streams: [],
				subtitle: DEFAULT_SUBTITLE
			});
		}

		const streams = [];

		const onwaveLink = payload?.players?.onwave || "";
		if (onwaveLink) {
			await _appendOnWaveQualityStreams(
				streams,
				onwaveLink,
				"onwave",
				"https://anisurf.site/"
			);
		}

		const mirrorLink = payload?.players?.onwaveMirror || "";
		if (mirrorLink) {
			await _appendOnWaveQualityStreams(
				streams,
				mirrorLink,
				"mirror",
				"https://anisurf.ru/"
			);
		}

		const legacyKodik = payload?.players?.kodik
			? [{ name: "Kodik", link: payload.players.kodik }]
			: [];

		const kodikList = Array.isArray(payload?.players?.kodikList)
			? payload.players.kodikList
			: legacyKodik;

		for (const kodikPlayer of kodikList) {
			const kodikLink = _absUrl(kodikPlayer?.link || "", SITE_BASE);
			const voiceName = _cleanVoiceoverName(kodikPlayer?.name || "Kodik");

			if (
				kodikLink &&
				(kodikLink.includes("kodikplayer.com") || kodikLink.includes("kodik.info"))
			) {
				try {
					const qualitiesJson = await kodikParser(kodikLink);
					const qualities = _safeJsonParse(qualitiesJson, {});
					_appendKodikQualityStreams(streams, qualities, voiceName);
				} catch (_) {}
			}
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

async function kodikParser(url) {
	try {
		const headers = {
			"Referer": SITE_BASE + "/",
			"User-Agent": _ua()
		};

		const response = await fetchv2(url, headers);
		const htmlText = await response.text();

		const urlParamsMatch = htmlText.match(/var\s+urlParams\s*=\s*'([^']+)'/);
		const videoInfoTypeMatch = htmlText.match(/vInfo\.type\s*=\s*'([^']+)'/);
		const videoInfoHashMatch = htmlText.match(/vInfo\.hash\s*=\s*'([^']+)'/);
		const videoInfoIdMatch = htmlText.match(/vInfo\.id\s*=\s*'([^']+)'/);

		const urlParams = urlParamsMatch ? _safeJsonParse(urlParamsMatch[1], {}) : {};
		const videoInfoType = videoInfoTypeMatch ? videoInfoTypeMatch[1] : "";
		const videoInfoHash = videoInfoHashMatch ? videoInfoHashMatch[1] : "";
		const videoInfoId = videoInfoIdMatch ? videoInfoIdMatch[1] : "";

		const finalData =
			`d=${urlParams.d || ""}` +
			`&d_sign=${urlParams.d_sign || ""}` +
			`&pd=${urlParams.pd || ""}` +
			`&pd_sign=${urlParams.pd_sign || ""}` +
			`&ref=${urlParams.ref || ""}` +
			`&ref_sign=${urlParams.ref_sign || ""}` +
			`&bad_user=false&cdn_is_working=true` +
			`&type=${videoInfoType}` +
			`&hash=${videoInfoHash}` +
			`&id=${videoInfoId}` +
			`&info=%7B%7D`;

		const headers2 = {
			"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
			"Referer": SITE_BASE + "/",
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
				const qualityArray = apiJson.links[quality];
				const first = Array.isArray(qualityArray) ? qualityArray[0] : null;

				if (!first?.src) continue;

				qualities[quality] = {
					src: decode(first.src),
					type: first.type || "application/x-mpegURL"
				};
			}
		}

		return JSON.stringify(qualities, null, 2);
	} catch (_) {
		return JSON.stringify({
			error: "kodik_parse_failed"
		});
	}
}

function decode(input) {
	const map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	let out = "";
	let buffer = 0;
	let count = 0;

	const rotated = [];
	const source = String(input || "");

	for (let i = 0; i < source.length; i++) {
		const ch = source[i];

		if (/[a-zA-Z]/.test(ch)) {
			const code = ch.charCodeAt(0);
			const max = ch <= "Z" ? 90 : 122;
			const shifted = code + 18;

			rotated.push(String.fromCharCode(shifted <= max ? shifted : shifted - 26));
		} else {
			rotated.push(ch);
		}
	}

	const rot = rotated.join("");

	for (let j = 0; j < rot.length; j++) {
		const ch = rot[j];

		if (ch === "=") break;

		const val = map.indexOf(ch);
		if (val === -1) continue;

		buffer = (buffer << 6) | val;
		count += 6;

		if (count >= 8) {
			count -= 8;
			out += String.fromCharCode((buffer >> count) & 0xff);
		}
	}

	return out;
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