# Handoff: verify & fix the two kanzen (Luna) manga modules on Mac + iOS Simulator

You are a fresh agent on a Mac. Use the iOS Simulator tooling to run the real Luna app, load our two manga modules, reproduce the reported failures, and fix what is fixable. Everything below is verified background — do not re-derive it; go straight to the simulator work.

## Your mission (in priority order)

1. Build and run the Luna app in the iOS Simulator from https://github.com/cranci1/Luna (Xcode project `Luna.xcodeproj`, scheme "Luna", iOS 15+).
2. Add both modules via Modules → "+" with the manifest URLs below (DELETE any existing copy first — Kanzen caches the downloaded JS per module and only re-downloads when the local file is missing).
3. Reproduce and root-cause these:
   - a) The earlier "JS Error: TypeError: undefined is not an object" (reported on 2026-08-16 for both modules on the user's device; never reproduced in a faithful Node reproduction of kanzen's JS env). If it reproduces in the simulator, capture the exact exception text and the JS stack from the app's logs (`xcrun simctl spawn booted log stream --predicate 'process == "Luna"'` and Xcode console; the runner's exceptionHandler logs "JS Error: …").
   - b) allmanga chapter panels not rendering (root cause known — see below; validate by patching the app locally to add the header, then design the real plumbing).
   - c) comix search blocked by Cloudflare (root cause known — document the simulator outcome; likely unfixable in-module).

## The two modules (already written, converted, published)

Repo: https://github.com/xdfkenny/xdfkenny-sora-modules (branch `main`)

| Module | Kanzen manifest URL | Version | Source |
| :--- | :--- | :--- | :--- |
| Comix | https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/comix/comix.json | 1.1.2 | comix.to (comics/manga), "X-Scramble" protected API — pure-JS token + response decryption, self-contained |
| AllManga Manga | https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/allmanga-novels/allmanga-novels.json | 1.1.2 | allmanga.to, AllAnime manga build — GraphQL persisted queries; chapterPages gated by aaReq AES-GCM token (FALLBACK_KEYGEN build 114 / epoch 2954, identical to the anime allmanga module, verified working live) |

## What is already verified (trust, don't redo)

- **Manifest format (PascalCase, strict):** `Kanzen/KanzenModule/Models/Module.swift` — `ModuleData` decodes exactly `sourceName`, `iconURL`, `version`, `language`, `scriptURL`, `author:{name, iconURL}`. All other keys ignored. Any mismatch → "Failed to Add Module — The provided Module URL is invalid". This was the first failure; fixed in v1.1.1 (commit db0e65f).
- **JS contract:** `Kanzen/KanzenEngine/Model/KanzenModuleRunner.swift` calls async JS promises `searchResults(keyword, page)` → raw `[{id, title, imageURL}]`, `extractDetails(id)` → raw `{description, tags:[String]}`, `extractChapters(id)` → raw `{lang: [[numStr, [{id, title, chapter, scanlation_group}]]]}`, `extractImages(id)` → raw `[String]` of image URLs. NO JSON.stringify (unlike Sora anime modules).
- **Function names are versioned:** commit `88e1a8da` (2026-06-28, "Renamed function") changed the JS calls from `searchContent`/`getContentData`/`getChapters`/`getChapterImages` to `searchResults`/`extractDetails`/`extractChapters`/`extractImages`. Our modules define BOTH sets (aliases) since v1.1.2 (commit 373026b), so any Luna build finds its functions.
- **Kanzen JS environment** (`Kanzen/KanzenEngine/Utils/Extensions/JavaScriptCore.swift`, stable since the first Kanzen merge 2025-11-24): defines `fetch(url, options)` with options dict `{method, headers, body}` and response `{status, headers, data, text(), json()}` where `json()` returns a JS Error object on parse failure; `console.log(String)` + `console.print(JSValue)`; `setTimeout`; `KanzenBundle` (bundled htmlparser2 + cssSelect for DOM-free HTML parsing). **No fetchv2.**
- **allmanga-novels live results** (Node harness faithfully emulating the env above, 2026-08-16): One Piece → 26 search results → details → 1219 chapters (`{en: [...]}`) → 204 image URLs for chapter 0, under BOTH name conventions.
- **comix in the harness:** comix.to serves a Cloudflare "Just a moment…" interstitial to non-browser HTTP stacks (also confirmed by the user in-app). Module degrades to `[]`, no crash. Not a code bug.

## Root cause of the allmanga panels failure (verified via curl, 2026-08-16)

The chapter image CDN requires a platform header on EVERY request:

- `aln.youtube-anime.com/…` → 301 → `ytimgf.youtube-anime.com/…`
- `ytimgf` and the `wp.youtube-anime.com` proxy: **403 without the header, 200 with** either:
  - `Referer: https://allmanga.to/` (or `https://mkissa.to/`), or
  - `Origin: https://allmanga.to` (or `https://mkissa.to`) — Origin works too; a random Origin (`example.com`) does NOT.
- `Sec-Fetch-Site` headers do NOT help. UA is irrelevant (app-style UA passes with the header, fails without).
- Public image relays all fail: images.weserv.nl, wsrv.nl, allorigins, corsproxy (they can't forge the header).

Kanzen loads reader images with plain URL requests (`webToonViewController.swift`: `imageView.kf.setImage(with: url, options:)`; paged reader similar) — no Referer/Origin, no per-module header support → panels 403. The module cannot fix this (it only returns URL strings). **The fix is app-side: include `Referer` (or `Origin`) = module's `baseUrl` on chapter-image requests.** The module manifest already carries `baseUrl` (e.g. `https://allmanga.to/`); pipe it into the reader's image loading. Simulator tasks 3b:
1. Hardcode `Referer: https://allmanga.to/` on the image requests (or use a Kingfisher `requestModifier`) → confirm panels render → proves the mechanism.
2. Then implement it properly: per-module image headers from `ModuleData.baseUrl`, and note it as the upstream feature request for the Luna/Kanzen devs.

## Notes that will save you time

- Official module repo https://github.com/DawudOsman/KanzenModules is STALE: modules there use the old pre-rename function names and therefore fail in current Luna ("JS function not found"). The creator's manifests are still the minimal-format reference (just the six ModuleData keys). The 2026-06-28 rename is why "nothing in the module library worked".
- When testing: adding a module that was already added and cached behaves like "module already exists" → delete it first (Modules list → swipe/delete), then re-add the URL, which re-downloads the JS.
- The commited public module files (comix, allmanga-novels, manifests) are final for this round; if you change the JS in xdfkenny-sora-modules, bump the manifest `version` and tell the user to delete + re-add.
- Do NOT modify crane1/Luna app code in a way that leaves uncommitted garbage; if you patch it, fork/note your changes. Do NOT touch the anime/video modules in xdfkenny-sora-modules.
- The one open mystery is the transient "TypeError: undefined is not an object" — if you get an actual JS exception + stack from the simulator, attach it to the diagnosis; if the current code just works in the simulator, say so explicitly (the user needs a definitive answer).

## Deliverables for the user
1. Does each module load + search in the simulator build of current Luna? (screenshots)
2. Do allmanga chapter panels render after the app-side Referer/Origin patch? (screenshots + which approach you used)
3. Does comix resolve at all from the simulator network, or is it still Cloudflare-blocked?
4. Any reproduction of the old "TypeError: undefined is not an object" with exact message/stack, or a confirmed "does not reproduce on current code".
5. The patch diff for the image-header support so it can become an upstream feature request.