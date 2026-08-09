# Novel Modules (Sora / Luna / Tsumi / Hiyoku)

How text-content ("novels") modules work, based on the 9 reference implementations in [`novel-examples/`](../novel-examples/).

| Module | Author | Approach | Manifest | Script |
| :--- | :--- | :--- | :--- | :--- |
| NovelBin | 50/50 | HTML search + AJAX chapter archive | `novelbin.json` | `novelbin.js` |
| ReadNovelFull | 50/50 | HTML search + AJAX chapter archive | `readnovelfull.json` | `readnovelfull.js` |
| NovelNext | 50/50 | HTML search + AJAX chapter archive | `novelnext.json` | `novelnext.js` |
| ReadNovels | 50/50 | API JSON + Next.js `__NEXT_DATA__` | `readnovels.json` | `readnovels.js` |
| LnCrawler | 50/50 | REST API (paginated) | `lncrawler.json` | `lncrawler.js` |
| LightNovelWorld | 50/50 | API search + HTML chapters | `lightnovelworld.json` | `lightnovelworld.js` |
| NovelFire | ibro | AJAX live-search JSON + URL-pattern chapters | `novelfire.json` | `novelfire.js` |
| NovelBuddy | ibro | HTML search + chapters REST API | `novelbuddy.json` | `novelbuddy.js` |
| MangaWorld Novels | Soony5 | HTML regex + inline JSON (`"pages":`) | `mangaworld.json` | `mangaworld.js` |

## 1. Manifests — what's different for novels

Normal video manifests list `HLS`/`MP4` under `streamType`; novel manifests instead:

```json
{
  "sourceName": "NovelBin",
  "version": "1.0.0",
  "language": "English",
  "languageType": ["Translated"],          // 50/50 style; optional
  "streamType": "novels",                  // replaces HLS/MP4
  "quality": "N/A",                        // no video quality
  "baseUrl": "https://novelbin.com/",
  "searchBaseUrl": "https://novelbin.com/search/?wd=%s",
  "scriptUrl": "https://git.luna-app.eu/50n50/sources/raw/branch/main/novelbin/novelbin.js",
  "type": "novels",                        // category for the module library
  "asyncJS": true,
  "novel": true,                           // flags text module to the host
  "downloadSupport": false,
  "supportsSora": true,                    // optional host compatibility flags
  "supportsTsumi": true,
  "supportsHiyoku": true
}
```

Key fields:

| Field | Value | Notes |
| :--- | :--- | :--- |
| `type` | `novels` | Library categorization (schema-valid option). |
| `streamType` | `novels` | Signals a text module, not HLS/MP4. |
| `quality` | `N/A` | No resolution concept for text. |
| `novel` | `true` | Required for hosts to treat it as a novels module. |
| `languageType` | `["Translated"]` | 50/50 convention (original / translated). ibro skips it. |
| `supportsSora`/`Tsumi`/`Hiyoku` | `true` | Advertises compatibility with each Sora-family host. |

## 2. Script functions — the novels contract

Novel scripts **replace the video pair** `extractEpisodes` + `extractStreamUrl` with **`extractChapters` + `extractText`**. The two shared functions remain.

| Function | Input | Returns | Purpose |
| :--- | :--- | :--- | :--- |
| `searchResults(keyword)` | string | JSON string of `[{title, href, image}]` | Find novels by keyword |
| `extractDetails(url)` | novel URL | JSON string of `[{description, aliases, airdate}]` | Synopsis + metadata for the detail page |
| `extractChapters(url)` | novel URL | JSON string of `[{title, href, number}]` | Chapter list (replaces `extractEpisodes`) |
| `extractText(url)` | chapter URL | **raw HTML string** of the chapter body | Chapter content (replaces `extractStreamUrl`) |

No reference module defines `extractEpisodes`/`extractStreamUrl` — hosts switch on the `novel`/`type` flag and call the chapter/text pair instead.

## 3. Function contracts in detail

### searchResults
```js
results.push({ title: decodeHtmlEntities(linkMatch[2]), href: linkMatch[1], image });
return JSON.stringify(results);            // stringified, not raw array
```
- Always `JSON.stringify` the result (host parses the string).
- Error fallback: `[{title: "Error", href: "", image: ""}]`.

### extractDetails
```js
return JSON.stringify([{ description, aliases, airdate }]);   // single-object array
```
- `description` = plain-text synopsis (strip tags / collapse whitespace).
- `aliases`/`airdate` often hardcoded `'N/A'`; ibro's NovelFire packs author/rank/rating/genres into `aliases` as a multiline string.

### extractChapters
```js
chapters.push({ title, href });           // href is an absolute chapter URL
...
chapter.number = index + 1;               // host wants sequential ints
return JSON.stringify(chapters);
```
- `number` must be an **integer**, not a string; many scripts sort then re-number.
- Some sites expose the full chapter list as AJAX (`/ajax/chapter-archive?novelId=…` – NovelBin/NovelNext/ReadNovelFull), some as a REST API (NovelBuddy `/api/manga/{id}/chapters`, LnCrawler paginated `?page=N`), some by URL pattern (`/book/{slug}/chapter-{i}` – NovelFire).
- Mangaworld returns image-chapter pages (scans) instead of text chapters.

### extractText
```js
return content;                            // RAW HTML, not JSON
```
- Returns an HTML fragment (`<p>…</p>` blocks) — the player renders it as a reader view; JSON-wrapping it (`{text: …}`) is a mistake seen in some fallbacks.
- Cleaning pipeline (NovelFire is the reference): extract the content container → strip `<script>`/`<style>`, ad divs (`js-ad-slot`, `data-ad-slot`), notification boxes, junk tags → extract only `<p>` blocks → filter paragraphs by keyword (ads/disclaimers/login/nav) → join with `\n`.
- Images: keep `<img>` tags; LnCrawler normalizes relative image URLs against the API origin / `images_path`; Mangaworld rebuilds page URLs from an inline `"pages":` JSON array and emits styled `<img>` tags (scans). Image pages are fine inside the text HTML.
- Error fallback: `'<p>Error extracting text</p>'`.

## 4. Extraction patterns seen

1. **HTML regex scraping** — NovelBin/ReadNovelFull/NovelNext/MangaWorld: `soraFetch` the page, match rows/chapters with regex, `decodeHtmlEntities` titles.
2. **AJAX JSON** — NovelFire (`/ajax/searchLive` returns `{data:[{title, image, slug}]}`), chapter archives (`/ajax/chapter-archive?novelId=`).
3. **REST API** — LnCrawler (search/detail/chapters endpoints, `Promise.all` pagination) and NovelBuddy (`/api/manga/{id}/chapters?source=detail`).
4. **Next.js `__NEXT_DATA__`** — ReadNovels pulls description from `nextData.props.pageProps.dehydratedState.queries[0].state.data` (fragile, but no extra requests).

## 5. Shared helpers every script re-defines

```js
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);        // fallback to plain fetch
        } catch (error) {
            return null;
        }
    }
}

function decodeHtmlEntities(text) { /* entity map + regex replace */ }
```
- `fetchv2` = the high-performance host bridge (correct referer/session handling); `fetch` is the plain fallback.
- `decodeHtmlEntities` isn't built-in — copy the map (`&#x2014;`, `&amp;`, …) as all three authors do.

## 6. Checklist for building a novels module

1. Determine search endpoint (HTML page with `keyword`/`wd`/`q`/`%s`, or JSON API).
2. Manifest: `type: "novels"`, `streamType: "novels"`, `quality: "N/A"`, `novel: true`, `asyncJS: true`.
3. Implement `searchResults` → `{title, href, image}` stringified array.
4. Implement `extractDetails` → `[{description, aliases, airdate}]` (synopsis only is acceptable).
5. Implement `extractChapters` → `[{title, href, number=index+1}]`; prefer AJAX/API endpoints over paginated HTML.
6. Implement `extractText` → cleaned raw HTML fragment; strip ads, keep `<p>` and `<img>`.
7. Validate: `searchResults` + `extractChapters` + `extractText` round-trip on a real novel (test URLs, `console.log` output).
8. Add compatibility flags (`supportsSora`/`supportsTsumi`/`supportsHiyoku`) and register in the library index.