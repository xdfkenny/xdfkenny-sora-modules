# Kanzen/Luna manga-module verification report (2026-08-16)

Answers the five deliverables in `documentation/mac-simulator-handoff-prompt.md`.

> **FINAL UPDATE (2026-08-16, evening):** full in-app verification happened after
> all — the user ran the iOS build natively on this Mac (SIP disabled,
> "Designed for iPhone" mode). That run surfaced a **fourth bug** (upstream):
> opening a chapter crashed with `EXC_BREAKPOINT` in `EnvironmentObject.error()`
> because the reader's `fullScreenCover` loses the inherited SwiftUI environment
> on Mac idiom. Fixed (`Luna-Kanzen-reader-mac-crash-fix.patch`, re-injects
> `settings`/`favouriteManager` at the presentation point). With both fixes the
> user confirmed the app **"is working perfectly"**: modules add, allmanga
> search/details/chapters load, chapter panels render (Referer fix active), no
> JS errors.
>
> **PIPELINE UPDATE (2026-08-16, late):** the upstream submission —
> **cranci1/Luna PR #42** (https://github.com/cranci1/Luna/pull/42) — was run
> through the Astra PR pipeline (scan → program → review, verdicts posted as PR
> comments since fork PRs can't carry `pipeline:*` labels or self-approvals):
>
> - 🔍 **Scan:** 2 findings — [medium] the reader's own chapter-list sheet
>   (`ChapterList`, reads `@EnvironmentObject settings`) would hit the same
>   Mac-idiom crash; [nit] `ModuleImageHeaders` statics raced across Kingfisher
>   downloader threads. Both fixed (`a28b0a2`, `93b470f`; lock version
>   re-verified against the live CDN).
> - 🔎 **Review round 1 (independent): REQUEST_CHANGES** — [medium] KF 8.x
>   `ImagePrefetcher` ignores `KingfisherManager.defaultOptions` (private
>   manager), so reader prefetches still 403'd on gated CDNs; [nit]
>   `favouriteViewWrapper` catch dropped the underlying error.
> - 🛠 **Program round 2:** prefetcher gets `ModuleImageHeaders.kingfisherOptions`
>   explicitly + catch logs `error.localizedDescription` (`ddbf712`, `800e4f4`)
>   — plus a user-reported feature in the same area: **long-strip chapters
>   rendered "full screen but low quality"** (single tall strip images exceed the
>   GPU texture limit — 8192px A9-era / 16384px A12+ — so iOS renders them
>   heavily downscaled). `ReaderImageSizing` (`c763941`) caps the decoded longest
>   edge at 8192 device px via `DownsamplingImageProcessor` (aspect preserved,
>   never upscales — ordinary pages bit-identical), applied consistently across
>   paged reader / webtoon reader / prefetcher so processed cache keys match;
>   the webtoon `isCached` pre-check uses the processor-qualified key. Harness
>   proof vs KF 8.10.0: 1000×24000 strip → 341×8192 capped; 1500×2250 panel
>   unchanged; prefetch of a gated panel completes and caches correctly.
> - 🔎 **Review round 2: APPROVE** (points↔pixels math, cache-key consistency,
>   layout interactions, no-regression checks all verified against KF source).
>
> Final gate per pipeline = maintainer's manual merge. Test IPA (main + all 7
> commits): https://github.com/xdfkenny/Luna/releases/tag/v1.1.0-kanzen-fixes
> (SHA-256 `c6c0e53a…`, CI run 31975376076).

**Original methodology note** (pre–in-app-run): the Mac initially had no full
Xcode, so every layer below SwiftUI was first verified in a faithful re-creation
of Kanzen's module runtime built with the CLT Swift toolchain:
`documentation/kanzen-sim/main.swift` compiles to `kanzen_sim` and replicates,
line for line:

- `Kanzen/KanzenEngine/Utils/Extensions/JavaScriptCore.swift` — `fetch(url, options)`
  via `URLSession.shared`, response `{status, headers, data(base64), text(), json()}`
  with `json()` returning a JS Error object on parse failure, `console.log/print`,
  `setTimeout`, and the real `KanzenBundle` (`bundle.js` evaluated verbatim).
- `Kanzen/KanzenEngine/Model/KanzenModuleRunner.swift` — the exact
  `objectForKeyedSubscript` → `call(withArguments:)` → `invokeMethod("then"/"catch")`
  guard chain and the `exceptionHandler` that logs `JS Error: …`.

This is the **same JavaScriptCore + same macOS network egress** an iOS Simulator
run on this machine would use; only SwiftUI/UIKit rendering and Kanzen's own view
plumbing were not executed.

Run it:

```sh
cd documentation/kanzen-sim
swiftc -swift-version 5 main.swift -o kanzen_sim
./kanzen_sim ../../allmanga-novels/allmanga-novels.js \
  /path/to/Luna/Kanzen/KanzenEngine/Utils/Bundle/bundle.js new "one piece"
# convention arg: new = current Luna names, old = pre-2026-06-28 Luna names
```

---

## Deliverable 4 — the "JS Error: TypeError: undefined is not an object" mystery: **ROOT-CAUSED, exact repro**

### What the runner actually does with a missing JS function

`KanzenModuleRunner` guards like this (current main, `getChapterImages` shown; all
four entry points follow the same pattern):

```swift
guard let chaptersFunc = context.objectForKeyedSubscript("extractImages") else { ... }
```

**`objectForKeyedSubscript` never returns nil for a missing global** — it returns a
JSValue wrapping `undefined`, so the guard always passes. Then:

1. `chaptersFunc.call(withArguments:)` on `undefined` → JSC exception
   **"TypeError: undefined is not an object"** → fires `exceptionHandler` →
   logged as `JS Error: TypeError: undefined is not an object`. The call returns
   `undefined` (not nil), so the second guard passes too.
2. `promise.invokeMethod("then"/"catch")` on that `undefined` → the same
   exception **twice more** (evaluating `.then` / `.catch` on undefined).
3. The completion handler **never fires** → the UI silently hangs with no results.

Verified message phrasing in real JavaScriptCore (macOS 15.5 `jsc`), then
end-to-end in `kanzen_sim`:

| Module JS | Current Luna (new names) | Old Luna (pre-`88e1a8da`, old names) |
| :--- | :--- | :--- |
| **allmanga-novels v1.1.1** (new names only) | ✅ full chain OK | ❌ **`JS Error: TypeError: undefined is not an object`** ×3 per call |
| **allmanga-novels v1.1.2** (aliases) | ✅ 26 results → 1219 chapters → 204 panels | ✅ identical, via aliases |
| **comix v1.1.1** (new names only) | ✅ no crash (Cloudflare → 0 results) | ❌ **same TypeError** |
| **comix v1.1.2** (aliases) | ✅ no crash, 0 results | ✅ no crash, 0 results |
| **official MangadexTest** (stale, old names only) | ❌ **same TypeError** | (would work) |

So the 2026-08-16 device report (both modules throwing this error) was
**module JS ≤ v1.1.1 running on a pre-rename Luna build** (or, symmetrically,
any old-names-only module — e.g. everything in the stale official
`DawudOsman/KanzenModules` repo — on current Luna, which is why "nothing in the
module library worked").

**Resolution:** already shipped. v1.1.2 (commit `373026b`) defines both name
sets, and does not reproduce the error under either convention in the faithful
JSC runtime. Users who still see it have a stale cached module JS — delete the
module in the app and re-add the manifest URL (Kanzen only re-downloads when the
local file is missing). A definitive on-device screenshot of the clean run is
the only piece still pending an Xcode-equipped machine.

*(v1.1.1 fixtures for the repro: `git show db0e65f:allmanga-novels/allmanga-novels.js`,
`git show db0e65f:comix/comix.js`; official module:
`DawudOsman/KanzenModules/MangadexTest/mangaDex.js`.)*

---

## Deliverable 1 — do the modules load + search? **Yes — confirmed in-app by the user (2026-08-16)**

Runtime evidence first: both manifests live and strict-decode against the app
model (verified by feeding the live URLs through `JSONDecoder` with the patched
`ModuleData`):

- `Comix v1.1.2` → scriptURL resolves; module JS loads with no exception in JSC.
- `AllManga Manga v1.1.2` → `searchResults("one piece", 0)` → **26 results**
  (One Piece first), `extractDetails` → description + 20 tags,
  `extractChapters` → **`{en: 1219}`**, `extractImages(ch 0)` → **204 panel
  URLs** (aaReq AES-GCM keygen flow works in pure JSC: "PersistedQueryNotFound;
  registering query text" → success). Identical results under old names.

## Deliverable 3 — comix from the simulator-class network: **still Cloudflare-blocked, not fixable in-module**

Through the sim's `URLSession` (same egress/TLS stack the simulator uses),
`https://comix.to/` answers Cloudflare's **"Just a moment…"** interstitial
(403 HTML) to the app's request profile. The module logs
`comix searchResults error: bad response: <!DOCTYPE html>…` and degrades to 0
results. **No crash, no JS Error** — the code is correct; the site refuses
non-browser clients. Unfixable in-module; would need an in-app browser/CF-clearance
feature upstream.

## Deliverable 2 — allmanga chapter panels + Referer patch: **confirmed rendering in-app by the user (2026-08-16, fixed build)**; mechanism proof below

Re-confirmed today against **real panel URLs produced by the module itself**
(`https://aln.youtube-anime.com/images133/ex9vXC6gWYY9bGkSo/0/sub/1.jpg`):

| Request | Result |
| :--- | :--- |
| panel, no header (aln → 301 → ytimgf) | **403** |
| panel + `Referer: https://allmanga.to/` | **200 image/jpeg** |
| panel + `Origin: https://allmanga.to` only | **200 image/jpeg** |
| search cover (`wp.youtube-anime.com` proxy), no header | **200** |

Covers are NOT gated (search grids render fine today); only chapter panels 403 —
exactly matching the reported symptom.

## Deliverable 5 — the app-side patch: **`Luna-Kanzen-reader-image-referer.patch`** (repo root)

Three files, no `project.pbxproj` changes required; applies cleanly with
`git apply` to current `cranci1/Luna` main (verified) and all three files pass
`swiftc -parse`:

1. `Kanzen/KanzenModule/Models/Module.swift` — decodes the optional manifest key
   **`baseUrl`** (manifests already carry it; strict decoder unaffected when
   absent) and adds `ModuleImageHeaders`, an `AnyModifier` (Kingfisher 8)
   installed once
   into `KingfisherManager.shared.defaultOptions` that attaches
   `Referer: <baseUrl>` to every Kingfisher request unless one is already set.
   This covers all reader image paths at once: webtoon `kf.setImage`
   (`webToonViewController.swift`), paged `KFImage` (`pageData.swift`), the
   `ImagePrefetcher` (`readerManager.swift`), plus search/detail covers.
2. `Kanzen/Views/Search/search.swift` — `ModuleImageHeaders.activate(for: module.moduleData)`
   where the module script is loaded.
3. `Kanzen/Views/Util/favouriteViewWrapper.swift` — same for the favourites path.

Behavior: no-op for modules without `baseUrl`; loading such a module clears the
header again. The modifier is app-wide while a `baseUrl` module was last loaded —
harmless for the anime side (TMDB etc. ignore Referer), noted in the patch
comment for upstream. Handoff step 3b.1 (hardcoded proof) is the same modifier
with a constant; the curl matrix above is the mechanism proof that hardcoding
would demonstrate on-device.

**Patch mechanics code-proven end-to-end (2026-08-16):** Kingfisher **8.10.0**
(Luna's exact pin from `Package.resolved`) was compiled from source with the CLT
toolchain and driven through `documentation/kanzen-sim/kf-referer-test.main.swift`,
which runs the patch's `ModuleImageHeaders` code byte-for-byte against the live
CDN via `KingfisherManager.shared.retrieveImage` (the same engine behind
`kf.setImage` / `KFImage` / `ImagePrefetcher`; `defaultOptions` merges in at
`KingfisherManager.currentDefaultOptions`):

| Phase | Result |
| :--- | :--- |
| modifier not installed | **403** (`KingfisherError` 2002 `invalidHTTPStatusCode`) |
| `activate(for: "https://allmanga.to/")` | **200, real 1500×2250 panel downloaded** |
| `activate(for: nil)` (module without baseUrl) | **403** again |

⚠️ Compile-fix discovered by this test: Kingfisher 8 renamed
`AnyRequestModifier` to **`AnyModifier`** — the patch uses `AnyModifier`;
the earlier name would not have compiled against Luna's pinned 8.10.0.

### Closing state (supersedes "what still needs Xcode")

The in-app run happened on the Mac itself (iOS-app-on-macOS), no Xcode/simulator
needed:

1. Stock CI build of current main → modules added, search/chapters worked.
2. Patched build → chapter open crashed (upstream Mac-idiom
   `EnvironmentObject` drop) → diagnosed from the crash report → fixed.
3. Fixed+patched build (`Luna-fixed-patched.ipa`) → **user-confirmed working**:
   module load/search/details/chapters + panels rendering, no JS errors —
   deliverables 1, 2 and 4 confirmed in-app; deliverable 3 (comix) stays
   Cloudflare-limited by the site, by design unfixable in-module.
4. Upstream submission: **cranci1/Luna PR #42** + unsigned test IPA on the fork
   release for users. CI compile-verified under real Xcode; pipeline-approved.

Artifacts: this report; `documentation/kanzen-sim/main.swift` (Kanzen runtime
simulator); `documentation/kanzen-sim/kf-referer-test.main.swift` (Kingfisher
Referer proof); `documentation/kanzen-sim/kf-quality-test.main.swift`
(long-strip decode-cap proof); and three Luna patches regenerated from the
FINAL PR #42 state (each apply-checked against pristine upstream main
68ff39b): `Luna-Kanzen-reader-image-referer.patch` (deliverable 5, final:
NSLock + explicit prefetcher options + catch logging),
`Luna-Kanzen-reader-mac-crash-fix.patch` (cover + chapter-list sheet),
`Luna-Kanzen-reader-image-sizing.patch` (long-strip decode cap).
Module JS/manifests unchanged — no version bump needed.
