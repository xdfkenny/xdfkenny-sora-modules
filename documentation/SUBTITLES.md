# Softsub subtitles for Sora-family modules — how it works, how to implement

Everything below was learned building/auditing hydrahd (v1.x–v2.2.1) and the
stremio-subs-test harness (v0.2.x). No theory — all verified live.

---

## 1. The pipeline (5 steps)

```
IMDb ID (+ s/e) ──> providers (parallel, individually caught)
                      ├─ Stremio OpenSubtitles v3 addon   (keyless, all langs)
                      ├─ OS REST search                   (keyless, eng, names!)
                      └─ HLS playlist embedded tracks     (from the stream itself)
                ──> merge + dedupe by URL
                ──> validate episode (release-name parsing)  <-- DO NOT SKIP
                ──> curate ONE track per language
                ──> emit in app shapes (English first = auto-load default)
```

You need: `imdbId` (`tt…`), and for series the season + episode numbers.
Everything else is HTTP.

---

## 2. Provider A — Stremio OpenSubtitles v3 addon (the workhorse)

Keyless. This method originated with xdfkenny (see credit comment in
`hydrahd/hydrahd.js`).

**Request:**
- Movies:  `GET https://opensubtitles-v3.strem.io/subtitles/movie/tt0182576.json`
- Series:  `GET https://opensubtitles-v3.strem.io/subtitles/series/tt0182576%3A20%3A5.json`

Headers:
```
Accept: application/json
Referer: https://app.strem.io/
```

**CRITICAL — series MUST use the colon path `imdbId:s:e`** (URL-encode the
colons). The documented query form `?season=20&episode=5` is **silently
ignored** by the addon and answers with wrong/whole-show tracks. Measured:
colon path → 91 correct-episode tracks; query params → 3 wrong ones.

**Response:** `{ "subtitles": [ { "url": "...", "lang": "eng" }, ... ] }`

Download URLs look like:
```
https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1958351161
```
The path segment `subencoding-stremio-utf8` = plain UTF-8 text. Other variants
carry a legacy codepage param (`?senc=cp1250` style). **Prefer utf8/senc-free
URLs** when deduping; mojibake subs are a codec problem, not a sync problem.

**Known defect you must handle:** the s:e mapping is polluted. For Family Guy
S01E01 both this API AND OS REST list *other seasons' premieres* ("Blue
Harvest" S06E01, "Lottery Fever" S10E01, …) as results. See §5.

---

## 3. Provider B — OS REST (keyless, gives you release NAMES)

```
GET https://rest.opensubtitles.org/search/episode-5/imdbid-182576/season-20/sublanguageid-eng
```
- imdbid WITHOUT the `tt` prefix.
- Header **required**: `X-User-Agent: <any known client string>` (e.g.
  `trailers.to-UA`). Without it the API rejects you.
- Response: array of rows. Use two fields:
  - `IDSubtitleFile` → download via
    `https://dl.opensubtitles.org/en/download/filead/<IDSubtitleFile>`
    → plain UTF-8 SRT, no gzip, no token. Works everywhere.
  - `SubFileName` → release name ("Family.Guy.S22E05….srt"). This is your
    ground truth for episode validation (§5).

Same endpoint without `episode-/season-` segments searches movies.
Throttled — cache per episode, one call is enough.

---

## 4. Provider C — tracks embedded in the stream's HLS master playlist

Some hosts ship subtitle renditions in the m3u8 itself:

1. In the master playlist find `#EXT-X-MEDIA:...TYPE=SUBTITLES,...NAME="English",LANGUAGE="en",URI="..."`.
2. Fetch that URI (it's another m3u8).
3. Its lines are `.vtt` segment URLs — grab one and hand it to the app.

Gotchas:
- **Referer matters per host.** vixsrc-style CDNs 403 any request without
  their playout referer → the app silently renders an EMPTY track. Attach the
  right `Referer` header to every track you emit (see §7).
- Taking only the FIRST `.vtt` URL covers just the first segment chunk on
  hosts that segment subs; some hosts serve full-file VTT. Test per host.

These tracks are correct-episode by construction (they belong to the playing
file), but they carry no OS file id, so name-validation can't classify them —
treat as neutral.

---

## 5. Episode validation — the step that prevents "right video, wrong subs"

Live-proven failure (Family Guy tt0182576): for S01E01, BOTH APIs return five
foreign files — "The Thin White Line" (S03E01), "Blue Harvest" (S06E01),
"Road to the Multiverse" (S08E01), "And Then There Were Fewer" (S09E01),
"Lottery Fever" (S10E01). Those are 43-min specials ≈ 68KB; the true episode's
subs are ≈ 40KB. **Any "pick the biggest / pick the first" heuristic
deterministically loads another episode's dialogue.**

Fix — parse an s:e code out of the release NAME and classify:

```js
function parseSubEpisode(name) {
    const n = String(name || '');
    let m = n.match(/\bS(\d{1,2})[.\-_ ]?E(\d{1,3})\b/i); if (m) return { s:+m[1], e:+m[2] };
    m = n.match(/\b(\d{1,2})x(\d{1,3})\b/i);              if (m) return { s:+m[1], e:+m[2] };
    m = n.match(/\[(\d{1,2})\.(\d{1,3})\]/);               if (m) return { s:+m[1], e:+m[2] };
    m = n.match(/(?:^|[\s\-_.])(\d)(\d{2})(?:[\s\-_.]|$)/);if (m) return { s:+m[1], e:+m[2] }; // "101"
    return null;
}
```
- `verified`: parsed s:e == requested → outranks everything
- `blocked`:  parsed s:e != requested → drop from ALL languages
- `unknown`:  no code ("01 - Title.srt") → allowed, but loses to verified even
              when bigger
- Resolution tags like `1080p` cannot false-match: the three-digit rule needs
  boundary chars around all digits and rejects trailing letters.
- Priority order is **class > size**. Size only breaks ties inside a class.
- If you skip validation entirely: it works until it doesn't, then users get
  CBS promos over Peter Griffin. Don't skip it.

---

## 6. Curation (one track per language)

- Dedupe by URL. Group by `lang` (lowercase).
- English must be FIRST in what you emit — apps auto-load the first subtitle.
- Skip forced/signs/SDH-tagged entries when picking the default English.
- Rank languages: en, spa, por/pob, fre, deu, ita … rest alphabetically.
- Optional "largest bytes wins" (most complete translation): you must
  DOWNLOAD each candidate to know its size — `subs5` ignores Range and sends
  no Content-Length, and its listing order shuffles between calls, so
  sampling misses the max. If you do it: measure everything (cap ~120),
  chunked 10-wide fetches, 6s timeout each, one retry pass over failures,
  deadline bail-outs (<9s skip measuring, <4s stop mid-way). Cost ≈ 4MB /
  3–7s for a 90-track episode. Class beats size; UTF-8 URL beats encoded one
  among unmeasured.

---

## 7. Emitting into the app

Stream objects support:

| field | purpose |
|---|---|
| `subtitle` | default (auto-load) subtitle URL |
| `subtitleHeaders` | headers (Referer!) the app must send fetching it |
| `subtitles` | flat `[label,url,label,url,…]` pair-array → picker shows "English", "Spanish"… |
| `allSubtitles` | `[{url,label,headers}]` — what Shirox-family builds read |

Emit BOTH `subtitles` and `allSubtitles`; each client reads the key it knows.
Manifest needs `"softsub": true`.

Keep the per-track headers from §4 alive through curation — dropping them is
the #1 cause of "picker exists but track renders empty".

---

## 8. Runtime rules (Sora JS engine)

- **No `setTimeout`/`setInterval`** — ReferenceError kills the module. Wrap
  delays in helpers that check availability and resolve immediately otherwise.
- Fetch bridge quirks: try `fetchv2(url, headers, method, body)` first, fall
  back to plain `fetch`. Re-wrap responses so `.text()`/`.json()` are ALWAYS
  real promises (some bridges return sync values → `.catch` explodes). Send
  `Accept-Encoding: identity` — the bridge cannot decompress gzip/brotli and
  strem.io endpoints serve compressed JSON by default → empty-body parse
  failures.
- Catch EVERY provider individually. One rejected provider used to wipe all
  subtitles.
- Cache per-episode provider results (instant re-open). Cache successes, not
  transient failures.
- Budget: the app kills extraction around ~40s. Subtitles must never gate the
  stream list — run the worker detached, soft-race it, bail out of measuring
  when deadline nears.

---

## 9. Minimal reference implementation

```js
const OS_V3 = 'https://opensubtitles-v3.strem.io';
const OS_REST = 'https://rest.opensubtitles.org/search';

async function stremioSubs(imdbId, type, s, e) {
    const id = type === 'series' ? `${imdbId}:${encodeURIComponent(s)}:${encodeURIComponent(e)}` : imdbId;
    const r = await fetch(`${OS_V3}/subtitles/${type}/${id}.json`,
        { headers: { Accept: 'application/json', Referer: 'https://app.strem.io/' } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.subtitles || []).filter(x => x && x.url);
}

async function osRestRows(imdbId, s, e) {
    const r = await fetch(`${OS_REST}/episode-${e}/imdbid-${imdbId.replace(/^tt/i,'')}/season-${s}/sublanguageid-eng`,
        { headers: { 'X-User-Agent': 'trailers.to-UA', Accept: 'application/json' } });
    if (!r.ok) return [];
    return r.json(); // rows: { IDSubtitleFile, SubFileName }
}

// build trust classes (see §5), filter stremioSubs() output by file id,
// group by lang, verified-first + largest-first within class,
// emit english-first pairs + allSubtitles. Done.
```

---

## 10. Test checklist (do these before shipping)

1. Correct episode: play 3 scenes; text matches audio at start AND end
   (drift grows through the episode if a different cut/version synced).
2. Log the winning file id/name; confirm its name parses to the requested s:e.
3. Open picker: one entry per language, labels readable, no empty-rendering
   tracks (headers intact?).
4. Movie AND series; long-running show with many seasons (pollution case).
5. Kill network mid-run: no crash, streams still appear (subs are optional).
