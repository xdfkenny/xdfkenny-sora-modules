# Feature request: per-module headers for manga chapter images (Kanzen reader)

*Ready to paste into the Luna/Kanzen issue tracker. Authors: xdfkenny module maintainers, 2026-08-16.*

---

**Title:** Kanzen manga reader cannot attach Referer/Origin headers to chapter-image requests — referer-gated image CDNs return 403, so panels never render (video side already supports stream headers)

## Summary

Manga modules return chapter pages as a plain array of image URL strings, and the Kanzen reader loads them with headerless URL requests (`kf.setImage(with: url)` in `Kanzen/Views/Reader/WebToon/webToonViewController.swift`, similar in the paged reader). Several image CDNs gate access on a platform `Referer`/`Origin` header. When a module targets such a CDN, every chapter panel 403s even though search, details, chapters, and the image URL list all work.

## Precedent: the video side already sends request headers

Anime modules already return `headers` per stream, and the player honors them when fetching playlists and segments. Example — the allmanga anime module (`allmanga.js`):

```js
out.streams.push({
  streamUrl: l.link,
  headers: { 'Referer': (l.headers && l.headers.Referer) || CLOCK_BASE + '/', 'User-Agent': UA }
});
```

The equivalent channel does not exist for manga images. A module has no way to influence the reader's image requests.

## Concrete evidence (live test, 2026-08-16)

Target: `https://ytimgf.youtube-anime.com/images133/…/1.jpg` (the allmanga.to manga CDN; `aln.youtube-anime.com` 301-redirects to it):

| Request headers | Result |
| :--- | :--- |
| (none) | **403** |
| `Sec-Fetch-Site: same-origin` + `Sec-Fetch-Mode: no-cors` | 403 |
| `Referer: https://example.com/` | 403 |
| `Origin: https://example.com` | 403 |
| `Referer: https://allmanga.to/` | **200** (3.6 MB image) |
| `Origin: https://allmanga.to` | **200** |
| `Referer: https://mkissa.to/` | **200** |
| `Origin: https://mkissa.to` | **200** |

Notes: the gate is header-only (an app-style `User-Agent` passes with the header); `Sec-Fetch-*` does not help; public image relays (images.weserv.nl, wsrv.nl, allorigins, corsproxy) cannot forge the header and all fail. `aln.youtube-anime.com`, `ytimgf.youtube-anime.com`, and the `wp.youtube-anime.com` thumbnail proxy all enforce the same gate.

## Reproducer

1. Add the AllManga Manga module: `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/allmanga-novels/allmanga-novels.json`
2. Search, open a title, open any chapter → chapter list loads, reader opens, but every panel is blank/403.

## Proposed fix (any of these works)

1. **Use the module's `baseUrl` as Referer/Origin on page-image requests (minimal, recommended).** The Kanzen module manifest already carries `baseUrl` (e.g. `https://allmanga.to/`). Pass it into the reader and apply it via a Kingfisher `requestModifier` (or `ImageDownloader.default.setHeader`) on the image URLs of that module. No contract change.
2. **Optional `imageHeaders` field in the manifest** for sources that need something other than `baseUrl`.
3. **Extend `extractImages` to optionally return `{url, headers}` objects** (keep plain strings as the compatible default).

## Impact

Any manga/comic source whose CDN is referer-gated currently cannot render panels in Kanzen — module authors have no workaround. With (1), existing modules work unchanged and new ones can target gated CDNs. This mirrors the header support the video player already has, so the model is proven in-app.