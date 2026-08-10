# Sora reader fix: send a Referer for novel chapter images

Applies to Sora (`cranci1/Sora`, open source). One-line root cause:

```swift
// Sora/Views/ReaderView/ReaderView.swift (HTMLView.updateUIView)
webView.loadHTMLString(htmlTemplate, baseURL: nil)
```

`baseURL: nil` makes the WKWebView send **no Referer** for `<img>`
subresources. Any novel module whose image CDN validates the Referer
(e.g. AllManga Novels → `aln.youtube-anime.com`, verified: 403 without a
platform Referer, 200 with `allmanga.to`/`mkissa.to`) renders broken "?"
images in the app even though it works in a browser and in the Node
harness.

## The fix

Load the HTML with the **module's own `baseUrl`** as the base URL. WKWebView
then sends `Referer: {baseUrl-origin}/` for image requests. Safe for every
existing module: open CDNs (mangaworld, comix) ignore the Referer, prose
modules (NovelBin/NovelFire) have no images, and referer-locked CDNs accept
their own platform's origin.

### Patch — `Sora/Views/ReaderView/ReaderView.swift`

```diff
 struct HTMLView: UIViewRepresentable {
     let htmlContent: String
     let fontSize: CGFloat
     let fontFamily: String
     let fontWeight: String
     let textAlignment: String
     let lineSpacing: CGFloat
     let margin: CGFloat
     @Binding var isAutoScrolling: Bool
     let autoScrollSpeed: Double
     let colorPreset: (name: String, background: String, text: String)
     let chapterHref: String?
+    let moduleBaseUrl: String?          // module manifest "baseUrl"
```

At the `HTMLView(` call site inside `ReaderView`:

```diff
 HTMLView(
     htmlContent: htmlContent,
     fontSize: fontSize,
     fontFamily: selectedFont,
     fontWeight: fontWeight,
     textAlignment: textAlignment,
     lineSpacing: lineSpacing,
     margin: margin,
     isAutoScrolling: $isAutoScrolling,
     autoScrollSpeed: autoScrollSpeed,
     colorPreset: colorPresets[selectedColorPreset],
     chapterHref: chapterHref,
+    moduleBaseUrl: ModuleManager().modules
+        .first(where: { $0.id.uuidString == moduleId })?.metadata.baseUrl,
     onProgressChanged: { progress in
```

In `updateUIView`:

```diff
-            webView.loadHTMLString(htmlTemplate, baseURL: nil)
+            webView.loadHTMLString(htmlTemplate,
+                                   baseURL: moduleBaseUrl.flatMap { URL(string: $0) })
```

(The `ReaderView` already resolves the module in `ensureModuleLoaded()` —
`ModuleManager().modules.first(where: { $0.id.uuidString == moduleId })` —
so the lookup pattern is consistent with existing code. `Module` is
`ScrapingModule`; `baseUrl` lives in `metadata.baseUrl`.)

### What it fixes

| Module | baseUrl → Referer | CDN behavior | Result |
| :--- | :--- | :--- | :--- |
| AllManga Novels | `https://allmanga.to/` | needs platform Referer | ✅ loads |
| MangaWorld | `https://www.mangaworld.mx/` | open | ✅ loads |
| Comix | `https://comix.to/` | open | ✅ loads |
| NovelBin / NovelFire | any | no images | unaffected |

## Things that do NOT fix it (verified, do not retry)

- **The keygen / aaReq token is irrelevant here.** It gates only the GraphQL
  API (`api.allanime.day`); the chapter image CDN is a separate Cloudflare
  WAF rule on `ytimgf.youtube-anime.com` that checks the `Referer` header
  (403 body = CF "Sorry, you have been blocked"). URL-token bypasses all
  fail: `?token=`, `?referer=`, `?sig=&expires=`, `?aaReq=`, and keygen
  params `?k=&buildId=&epoch=` → 403. Path tricks (encoded slashes, `//`,
  `/./`, case variants) → 403, Cloudflare normalizes them. Allowlist is
  exactly the platform domains (`allmanga.to`, `mkissa.to`, `allanime.day` →
  200; everything else, even `youtube-anime.com` itself, → 403). The reader
  JS builds image URLs as plain `head + path` (no token) — verified in the
  site bundle.
- `<base href>` / `referrerpolicy` attributes in module HTML — the Referer
  header is derived from the document URL, not the base tag
- Data-URI prefetch from the module — the JS bridge only exposes
  `.text()`/`.json()`, no binary/base64
- Public image relays (weserv, corsproxy.io, allorigins, codetabs, photon,
  DuckDuckGo, statically) — they all get 403 from the upstream CDN, which
  itself rejects referer-less fetches
- `wp.youtube-anime.com` proxy and `ytimgf.fast4speed.rsvp` mirror — also
  referer-gated
