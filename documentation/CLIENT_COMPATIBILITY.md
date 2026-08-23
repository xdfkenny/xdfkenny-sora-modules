# Client Compatibility Matrix for xdfkenny-sora-modules

> **Last Updated:** 2026-08-23  
> **Research Method:** GitHub repository analysis, web search, documentation review, and **full source-code audits** of Eclipse (`Soupy-dev/Eclipse`) and Mojuru (`mojuru-app/mojuru`)

---

## Executive Summary

This document maps the compatibility between the **xdfkenny-sora-modules** (JavaScript modules using `fetchv2` bridge) and the various anime/manga client applications that claim to support the "Sora module format."

### Key Finding: **Not all clients use the same module format**

The `supportsXxx` flags in module manifests are **aspirational** — they indicate *intent* to support, not verified compatibility. **Sora**, **Luna**, and **Shirox** are confirmed working (device-tested), and **Eclipse** is confirmed **by source-code audit** (it is a fork of Luna that kept both module engines intact). **Mojuru** is **not compatible** as currently shipped — see the Mojuru section for the three concrete blockers found in its code.

---

## Client Applications Analysis

### ✅ CONFIRMED COMPATIBLE (JavaScriptCore + fetchv2)

| Client | Repository | Platform | Module System | Status |
|--------|------------|----------|---------------|--------|
| **Sora** | [cranci1/Sora](https://github.com/cranci1/Sora) | iOS/macOS | JavaScriptCore, `fetchv2` bridge | ✅ Tested by xdfkenny |
| **Luna** | [cranci1/Luna](https://github.com/cranci1/Luna) | iOS/macOS | Kanzen Engine (JSCore + `fetchv2`) | ✅ Tested by xdfkenny |
| **Shirox** | [xibrox/Shirox](https://github.com/xibrox/Shirox) | iOS/macOS | "Community Modules" (JS-based) | ✅ hydrahd confirmed by Jay |
| **Eclipse** | [Soupy-dev/Eclipse](https://github.com/Soupy-dev/Eclipse) | iOS/tvOS | Luna fork — JSLoader (JSCore + `fetchv2`) for video, bundled Kanzen engine for manga/novels | ✅ **Code-verified 2026-08-23** (not yet device-tested) |

**Why they work:** All four use **JavaScriptCore** and expose a `fetchv2(url, headers, method, body)` bridge resolving to a response with `.status`, `.headers` and `.text()`/`.json()` methods. The module contract (`searchResults`, `extractDetails`, `extractEpisodes`, `extractStreamUrl`; manga: `extractChapters`, `extractImages`) matches exactly.

---

### ✅ ECLIPSE — Verified by source-code audit (fork of Luna)

Eclipse describes itself as built to "bridge Luna services (more well known as Sora modules) with Stremio addons." A full audit of its `main` branch confirms both Luna module engines survived the fork:

**Video path (`Eclipse/JSLoader/`):**
- `JavaScriptCore+Extensions.swift` registers a native `fetchv2(url, headers, method, body [, redirect] [, encoding])` block that resolves `{ status, headers, .text(), .json() }` — same signature and response shape as Sora/Luna. Our modules only use `.status` / `.text()` / `.json()` (hydrahd additionally guards header reads for both `Headers.get()` and dict styles).
- `JSController-Search/Details/Streams.swift` invoke exactly `searchResults`, `extractDetails`, `extractEpisodes`, `extractStreamUrl`. The repo even ships `EclipseTVTests/ServiceCompatibilityTests.swift` exercising this contract.
- Modules are added by pasting a manifest URL into the "JSON URL" field in Services settings.

**Manga/novel path (`Kanzen/`):**
- Bundles Luna's Kanzen engine. `KanzenModule/Models/Module.swift` decodes the identical manifest schema (`sourceName`, `author`, `iconUrl`, `version`, `language`, `scriptUrl`, optional `novel`) — our comix/allmanga-novels manifests decode as-is.
- `KanzenModuleRunner.invoke()` calls exactly `extractDetails`, `extractChapters`, `extractImages`, `extractText`; `KanzenEngine/Utils/Extensions/JavaScriptCore.swift` provides `fetchv2`.
- Modules are added by pasting a `module.json` URL in the Kanzen browse view.

**Sandbox hardening (none of it trips our modules):** http(s)-only targets, tracker-host blocklist (Google Analytics, Doubleclick, Facebook, Sentry), GET requests must not carry a body, 20 s script-load timeout, quarantine after 3 hung executions. Our modules target site APIs only and use standard flows.

---

### ❌ INCOMPATIBLE (Different module format)

| Client | Repository | Platform | Module Format | Why Incompatible |
|--------|------------|----------|---------------|------------------|
| **Mojuru** | [mojuru-app/mojuru](https://github.com/mojuru-app/mojuru) | iOS/Android (Expo React Native) | Own "Standard" plugin format + partial Sora adapter | See detailed analysis below |
| **Dartotsu / Dantotsu** | [AsrOfficialDev/ReDantotsu](https://github.com/AsrOfficialDev/ReDantotsu) | Android | **Aniyomi/Tachi extensions (Kotlin/Java)** | Uses compiled Kotlin extensions, not JS. `fetchv2` doesn't exist. |
| **AnymeX** | [RyanYuuki/AnymeX](https://github.com/RyanYuuki/AnymeX) | Flutter (Android/iOS) | **Tracking client only** | No streaming; uses AniList/MAL/Simkl APIs. Different extension system. |
| **Tsumiru** | [tsumiru.app](https://tsumiru.app) | Multi-platform | **Suwayomi server client** | Connects to self-hosted Suwayomi; not a module consumer. |
| **Hiyoku** | N/A | N/A | **Visual novel game** | Not an anime/manga app. Steam game "Hiyoku no Tori". |
| **Tsumi** | Likely Tsukime/Tsumiru | iOS/Android | **Anime discovery companion** | Not a streaming module consumer. |

---

### ❌ MOJURU — Incompatible per source-code audit (2026-08-23)

> **Correction to earlier research:** the previously cited `github.com/mojuru` org is unrelated (Komikku/Mihon manga extension repos). The actual app is **[mojuru-app/mojuru](https://github.com/mojuru-app/mojuru)** — an Expo/React Native (TypeScript, Hermes) streaming app. Its JS engine is fine; the blockers are in its plugin plumbing.

**Blocker 1 — Third-party Sora manifests can't reach its Sora adapter.** Mojuru has three plugin adapters (`lib/plugins/adapters/`). The `AlternativeAdapter` is genuinely Sora-aware: it reads our manifest fields (`sourceName`, `scriptUrl`, `asyncJS`, …), rewrites `fetchv2` → `fetchAlt` before evaluation, and calls `searchResults` / `extractEpisodes` / `extractStreamUrl`. But provider selection (`usePluginManager.ts:98-112`) auto-routes a pasted URL to that adapter **only if** the host is `git.luna-app.eu` or the URL contains `50n50`. Everything else — including our GitHub-hosted manifests — goes to the `StandardClientAdapter`, whose contract (`search()`, `fetchEpisodes()`) our modules don't implement. Result: the plugin installs but search/playback silently do nothing. There is no UI toggle to force the Alternative provider and no deep-link path.

**Blocker 2 — Contract gaps even via the Alternative adapter.** `fetchAlt` wraps native RN fetch and returns a real `Response` (our `.status`/`.text()`/`.json()` usage would actually work, and allmanga's per-stream `streamUrl` key matches), but: it expects root key `subtitles` while our video modules emit `subtitle`; it never calls `extractDetails`; and its `getEpisodeCount` paging loop relies on fragile last-page heuristics.

**Blocker 3 — No manga or novel support at all.** Grep of the entire `app/` tree finds zero manga/novel screens — it is video-only streaming. comix and allmanga-novels can never work regardless of adapters.

**What would change the verdict:** Mojuru whitelisting additional repos (or exposing a provider picker), plus honoring the `subtitle`/`extractDetails` parts of the Sora contract. Revisit if their Discord/GitHub announces broader Sora-module support.

---

## Module-Type Compatibility Breakdown

### Video Modules (`type: "anime"`)
- **Modules:** yfsp, hydrahd, allmanga, henaojara, anidb, flixlatam
- **Compatible with:** Sora, Luna, Shirox (hydrahd confirmed), Eclipse (code-verified)
- **Requires:** `extractEpisodes` + `extractStreamUrl` returning HLS/MP4

### Manga Modules (`type: "mangas"`, `streamType: "mangas"`)
- **Modules:** comix, allmanga-novels
- **Compatible with:** Luna (Kanzen manga reader), Eclipse (same Kanzen engine bundled — code-verified), Shirox (if manga support added)
- **Requires:** `searchResults`, `extractDetails`, `extractChapters`, `extractImages` returning raw arrays (NOT JSON-stringified)
- **Sora:** Unknown if manga module support exists

### Novel Modules (`type: "novels"`, `streamType: "novels"`, `novel: true`)
- **Modules:** (none in this repo yet)
- **Compatible with:** Sora, Luna, Tsumi, Hiyoku (per NovelModules.md)
- **Requires:** `extractChapters` + `extractText` instead of video functions

---

## Verified Test Results (from xdfkenny)

> **Eclipse:** `supportsEclipse: true` is based on the 2026-08-23 source-code audit above, not device testing. To finish verification: paste a module manifest URL into Eclipse's Services ("JSON URL") or Kanzen add-module dialog and run search → detail → stream/chapter.

| Module | Sora | Luna | Shirox | Notes |
|--------|------|------|--------|-------|
| yfsp | ✅ | ✅ | ❓ | |
| hydrahd | ✅ | ✅ | ✅ | Jay added Shirox support |
| allmanga | ✅ | ✅ | ❓ | |
| henaojara | ✅ | ✅ | ❓ | |
| anidb | ✅ | ✅ | ❓ | |
| flixlatam | ✅ | ✅ | ❓ | |
| comix | ❓ | ✅ (Kanzen) | ❓ | Manga module — Luna/Kanzen confirmed |
| allmanga-novels | ❓ | ✅ (Kanzen) | ❓ | Manga module |

---

## Recommended Manifest Updates

### For Video Modules (yfsp, hydrahd, allmanga, henaojara, anidb, flixlatam)
```json
{
  "supportsSora": true,
  "supportsLuna": true,
  "supportsShirox": true,
  "supportsEclipse": true,
  "supportsDartotsu": false,
  "supportsAnymex": false,
  "supportsTsumi": false,
  "supportsHiyoku": false,
  "supportsMojuru": false
}
```

### For Manga Modules (comix, allmanga-novels)
```json
{
  "supportsDartotsu": false,
  "supportsLuna": true,
  "supportsEclipse": true,
  "supportsAnymex": false,
  "supportsShirox": false,
  "supportsSora": false,
  "supportsTsumi": false,
  "supportsHiyoku": false,
  "supportsMojuru": false
}
```

> **Note:** Set `supportsSora` to `false` for manga modules unless Sora's manga support is confirmed.

---

## How to Verify Compatibility

1. **Install the client app** (TestFlight for iOS, APK for Android)
2. **Add module JSON URL** to the app's module/source manager
3. **Test search → detail → episode → stream** flow
4. **Check console logs** for `fetchv2` errors or JS exceptions
5. **Report results** in this document

---

## Adding New Client Flags

If a new client proves compatible:
1. Add `supportsNewClient: true` to working modules
2. Update this document with verification details
3. Consider if the client needs module-type specific flags (e.g., `supportsNewClientManga`)

---

## References

- [SORA_MODULES_GUIDE.md](./SORA_MODULES_GUIDE.md) — Module specification
- [MainJSON.md](./MainJSON.md) — Manifest field reference
- [NovelModules.md](./NovelModules.md) — Novel module contract
- [AvailableJavascriptMethods.md](./AvailableJavascriptMethods.md) — `fetchv2` API