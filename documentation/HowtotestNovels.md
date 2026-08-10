# How to test NOVELS modules (type: novels)

Novel modules replace the video pair (`extractEpisodes` + `extractStreamUrl`)
with the **chapters pair** (`extractChapters` + `extractText`). They are
flagged in the manifest with `"novel": true`, `"type": "novels"` and
`"streamType": "novels"`. The contract is documented in
[NovelModules.md](NovelModules.md) — read it first.

Two test paths, same as video modules:

## 1. Automated — the status server (`node server.js`)

The repo's own harness already understands novels (it reads the manifest and
switches to `extractChapters`/`extractText` automatically).

```bash
node server.js                     # http://localhost:8765
```

Then either:

- open `http://localhost:8765/`, click the module card, type a keyword, and
  press the media-test button (the card shows **Search / Details / Chapters /
  Text** steps for novel modules), or
- hit the API directly:

```bash
curl -s -X POST http://localhost:8765/api/test \
  -H "Content-Type: application/json" \
  -d '{"id":"allmanga-novels","keyword":"angel next door"}'
```

Expected result shape for novels:

```json
{
  "ok": true,
  "result": {
    "search":   { "ok": true, "count": 2, "items": [ { "title", "href", "image" } ] },
    "details":  { "ok": true, "description", "aliases", "airdate" },
    "chapters": { "ok": true, "count": 62, "items": [ { "title", "number", "href" } ] },
    "text":     { "ok": true, "htmlLength": 2114, "images": 14, "sample": "<img src=..." }
  }
}
```

Notes:
- The harness loads the module from the **manifest's `scriptUrl`** (GitHub raw),
  so after a push the CDN can lag a few minutes — check the module's log line
  (e.g. `module script loaded v1.0.1`) before blaming the module.
- `extractText` returns a **raw HTML fragment**, not JSON — the harness treats
  it as a string and counts `<img>` tags. Image-chapter novels (manga) should
  show `images > 0`; prose novels show a large `htmlLength` with few/no imgs.
- `text.ok` is `false` when the module returns its error fallback
  (`<p>Error extracting text</p>` or similar) or an empty string.

## 2. Manual — Node one-liner against the raw script

When you want to see the raw outputs (or debug mid-flow), run the module
directly in Node with a minimal fetch shim. `node` has `fetch` natively, so
only a tiny loader is needed:

```js
const fs = require('fs');
const src = fs.readFileSync('allmanga-novels/allmanga-novels.js', 'utf8') +
  '\nmodule.exports = { searchResults, extractDetails, extractChapters, extractText };';
fs.writeFileSync('/tmp/_novel_export.js', src);
const mod = require('/tmp/_novel_export.js');

(async () => {
  const s = JSON.parse(await mod.searchResults('angel next door'));   // [{title, href, image}]
  console.log('search:', s.length, s[0].href);
  const d = JSON.parse(await mod.extractDetails(s[0].href));          // [{description, aliases, airdate}]
  const c = JSON.parse(await mod.extractChapters(s[0].href));         // [{title, href, number}]
  console.log('chapters:', c.length, 'first:', c[0]);
  const t = await mod.extractText(c[0].href);                         // raw HTML string
  console.log('text:', t.length, 'chars,', (t.match(/<img/g) || []).length, 'imgs');
  console.log(t.slice(0, 300));
})();
```

If the script relies on `fetchv2` (most do), define it first:

```js
global.fetchv2 = (url, headers, method, body) => fetch(url, { method, headers, body });
```

## 3. Pass criteria per function

| Function | Input | Must return | Check |
| :--- | :--- | :--- | :--- |
| `searchResults(keyword)` | keyword | JSON string array of `{title, href, image}` | non-empty for a real title; hrefs point at the novel URL pattern; image absolute (normalize relative paths!) |
| `extractDetails(url)` | novel href | JSON string array of 1 `{description, aliases, airdate}` | description readable (tags stripped), airdate/aliases fall back to a sane value |
| `extractChapters(url)` | novel href | JSON string array of `{title, href, number}` | `number` = integer, sequential from 1; hrefs unique; fractional chapter numbers in the TITLE (`Chapter 25.5`) not in `number` |
| `extractText(url)` | chapter href | **raw HTML string** (not JSON) | non-empty; manga: one `<img>` per page, srcs absolute + fetchable (HTTP 200); prose: `<p>` paragraphs; error fallback is a short `<p>...` fragment |

## 4. Gotchas (learned the hard way)

- **Referer-locked image CDNs never render in the app.** The Sora novel
  reader loads the HTML with `webView.loadHTMLString(html, baseURL: nil)`
  (`Sora/Views/ReaderView/ReaderView.swift`), so the WebView sends **no
  Referer** for `<img>` requests. Any CDN that 403s hotlinks without a
  platform Referer (e.g. `aln.youtube-anime.com` for AllManga chapters —
  verified: 403 no-referer, 200 with `allmanga.to`/`mkissa.to` referer)
  shows broken-image placeholders in the app even though everything works
  in a browser and in the Node harness. Workarounds that do NOT work:
  data-URI prefetch (the JS bridge only exposes `.text()`/`.json()`, no
  binary), `<base href>`/`referrerpolicy` (the Referer header is derived
  from the document URL, not the base — verified in a real browser), and
  public image relays (weserv/corsproxy/allorigins/photon/DDG all get
  blocked upstream, which itself 403s referer-less fetches). MangaWorld's
  module only works because `cdn.mangaworld.mx` has no hotlink protection.
  Test a candidate module's image URLs FIRST: `curl -s -o /dev/null -w
  "%{http_code}" <img-url>` with NO `-e`/`-H "Referer:"` — if it is not 200,
  the module's images will not render in Sora.
- **No timers in the Sora app JSContext.** The app only injects
  `console`/`fetch`/`fetchv2` — calling `setTimeout`/`setInterval` crashes the
  module in-app (`Can't find variable: setTimeout`). Guard every timer use
  (see `timerSafe()` in hydrahd/allmanga-novels). The Node harness has timers,
  so a module can pass locally and still crash in-app — grep the script for
  `setTimeout`/`setInterval` before shipping.
- **Only the 4 novel functions are called.** The harness factory uses
  `typeof` guards, so `extractEpisodes`/`extractStreamUrl` may be absent — but
  any *other* top-level `ReferenceError` (undefined variable, missing function
  name) surfaces as `No se pudo cargar el módulo: ...` in the test result.
- **Persisted-query APIs can evict.** If the source uses GraphQL persisted
  queries (like allmanga-novels), a `PersistedQueryNotFound` error means the
  server cache was cleared — the module should re-send the query text once
  (register-and-execute) and then succeed. Test by calling `extractText` twice.
- **Crypto-gated endpoints may demand a specific Referer/Origin.** The
  AllAnime family answers `AA_CRYPTO_WRONG_REFERER` unless the canonical
  mirror referer (mkissa.to) is sent. Keep such headers explicit in the module.
- **Verify images actually load.** Count `<img>` tags is not enough — pick the
  first URL and `curl -sL -o /dev/null -w "%{http_code}"` it. Some CDNs 403
  without a Referer; the module should emit the exact URL the web player uses.

## 5. Before you call a novel module done

1. `node server.js` test passes on ≥2 different keywords/mangas
2. fractional/odd chapter titles render (`25.5`, `0`-prologues)
3. image URLs verified HTTP 200 with curl
4. script has zero unguarded `setTimeout`/`setInterval`
5. `extractText` error path returns the short fallback (not a throw)
6. manifest: `novel: true`, `type: novels`, `streamType: novels`,
   `quality: N/A`, `asyncJS: true`
