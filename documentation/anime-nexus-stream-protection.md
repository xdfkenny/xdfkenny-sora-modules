# AnimeNexus stream protection — investigation (2026-09-08)

Status of `anime-nexus` (registry `modules.json` entry, v1.0.0 at commit
`6e73595`): **search / details / episodes work; streaming is not achievable
inside the Sora module contract.**

Subtask of the 2026-09-08 full-module audit. Companion write-up of the
authoritative third-party analysis:
https://gist.github.com/50n50/2ac8f15374ba5933a3f0e7373e10ebd7

## Summary

| Layer | State | Evidence |
| :--- | :--- | :--- |
| Search / details / episodes | PASS | 48 results for a sample query; 476 episodes extracted |
| Stream *metadata* endpoint | PASS (with fingerprint) | `GET /sanctum/csrf-cookie` + `X-Client-Fingerprint`/`X-Fingerprint` headers → 200 `{data:{hls, subtitles, video_meta, next, thumbnails}}` |
| HLS manifest (`video.m3u8`) | BLOCKED | 403 even with session cookie + fingerprint + fake `token`/`requestType`/`sessionId` params; no REST token endpoint exists |
| Token service (`prd-socket.anime.nexus`) | BLOCKED | WebSocket-only (`transport=polling` → `400 Transport unknown`); `/video` namespace replies `authentication-error AUTH_TIMEOUT` (Turnstile/altcha attestation + AES-GCM wire secret now required) |
| Per-segment fetch | BLOCKED | Each segment needs a fresh socket token — cannot be injected by the app's AVPlayer |

**Conclusion: AnimeNexus streams require a stateful WebSocket → token →
attestation pipeline that the Sora runtime (bare JavaScriptCore/QuickJS:
`fetchv2` only, no WebSocket, no timers, no crypto stack) cannot run, and a
per-segment token contract that the consumer player cannot fulfill. Module
cannot be fixed; a self-hosted reverse proxy is the only viable architecture.**

---

## The module today

- `anime-nexus/anime-nexus.js` implements `searchResults`, `extractDetails`,
  `extractEpisodes`, `extractStreamUrl` (all async, all `JSON.stringify`).
- `extractStreamUrl` currently returns `{streams:[]}` because it only performs
  the **unauthenticated** stream fetch — without the fingerprint headers the
  stream endpoint returns 404/403 and the code falls into the `catch` fallback.
- Verdict: searchable but stream-tab-empty. Keep in registry (user decision).

## Verified HTTP flow (works from a normal runtime)

Plain Node `fetch` is sufficient — no TLS fingerprinting defense observed; the
site gates on headers + cookies + a server-side token service.

```
# 1. bootstrap a session cookie (Laravel Sanctum, 204, sets anime_nexus_session)
GET https://api.anime.nexus/sanctum/csrf-cookie

# 2. fetch stream metadata (200 with fingerprint headers + cookie; 404 without)
GET https://api.anime.nexus/api/anime/details/episode/stream?id={episodeId}&fillers=true&recaps=true
Headers:
  X-Client-Fingerprint: {uuid}:{uuid}     # any two UUID-ish values work
  X-Fingerprint:        {same value}
  Cookie:               anime_nexus_session={from step 1}
  Origin/Referer:       https://anime.nexus/
```

Response contains `data.hls` =
`https://api.anime.nexus/api/anime/video/{videoId}/stream/video.m3u8`,
plus `subtitles` (e.g. `en`) and `thumbnails`.

```js
// Quick reference (module-shaped):
const csrf = await fetchv2(SITE + "/sanctum/csrf-cookie",
  { "User-Agent": UA, "Accept": "application/json" }, "GET");
// fetchv2 response carries set-cookie into the per-module cookie jar (server.js:99)
const meta = await fetchv2(
  SITE + "/api/anime/details/episode/stream?id=" + id
    + "&fillers=true&recaps=true",
  { "Accept": "application/json", "Origin": SITE + "/", "Referer": SITE + "/",
    "User-Agent": UA,
    "X-Client-Fingerprint": FP, "X-Fingerprint": FP }, "GET");
```

## The blocking layer — tokenized HLS

- The m3u8 cannot be fetched with just session cookie + fingerprint:
  `403` — proven via curl and Node `fetch`, with and without
  `?token=&requestType=manifest&sessionId=` params.
- No alternative REST token endpoints exist: `/api/anime/video/{id}/token`,
  `/manifest`, `/stream/token`, `/api/anime/details/episode/stream-token`,
  `/api/anime/details/episode/token` all return 404.
- Token issuance lives exclusively on the socket service
  `wss://prd-socket.anime.nexus/api/socket` (namespace `/video`).

## The token service

Engine.IO/Socket.IO v4 on uWebSockets.js. Reproduction:

```
# polling disabled — no plain-HTTP path to the token service:
GET wss://.../api/socket/?EIO=4&transport=polling
  → 400 {"code":0,"message":"Transport unknown"}

# websocket transport opens, then requires auth:
GET wss://.../api/socket/?EIO=4&transport=websocket
  &videoId={id}&fingerprint={fp}&m3u8Url={m3u8}
  → 0{"sid":...}                        # engine.io open
  client → "40/video"                   # socket.io join namespace
  → 42/video,["authentication-error",{"error":"Authentication timeout",
      "code":"AUTH_TIMEOUT","numericCode":101,...}]
  → 41/video (disconnect)
```

The client must complete an authentication handshake before `getToken` works.
The site's player bundle (`nexus-player.js`, ~2 MB obfuscated) now requires:
`wireSecret`, `attestRef`, `getTurnstileToken`, `useAttestation`,
`requestAltchaFallback`, `altchaTicket` — i.e. a Turnstile/altcha attestation
plus an AES-GCM wire-secret challenge. This is why the June-2026 gist script no
longer works unchanged: the site added an attestation round-trip since then.

Per the gist, a completed token flow also maintains a live token *pool*
(max 40 tokens, min threshold 35) and re-signs **each segment request** with a
fresh token (`requestType: "segment"`). The HLS the player receives is therefore
only meaningful while its consumer can keep requesting tokens — the app's native
player (AVPlayer parses m3u8 and fetches segments relative to the manifest
URL) cannot participate in that exchange.

## Why it cannot be fixed in-module

1. **No WebSocket in the Sora runtime** — the token service is
   WebSocket-only (polling returns `Transport unknown`). `fetchv2` cannot
   perform the 101 upgrade.
2. **Attestation** (Turnstile/altcha) is unsolvable headlessly and is now a
   hard precondition to joining `/video`.
3. **Per-segment tokens** — even a hypothetical manifest token would not
   survive AVPlayer's segment fetches; each segment needs a fresh socket token.
4. **No crypto/timers** — AES-GCM/HMAC + `setTimeout`-free token-pool pacing
   are unavailable in-app.

## Option — self-hosted token proxy (only known working architecture)

Mirror of the gist's design; turns protected AnimeNexus HLS into a clean
playable stream for the app's player.

```
AVPlayer ──> https://proxy.example.com/api/video/{videoId}/playlist.m3u8
                 │  proxy holds ONE session:
                 │    fingerprint + cookies + socket /video + token pool
                 │  mints per-manifest and per-segment tokens, rewrites
                 │    variant/segment URLs to itself, forwards range+segment
                 ▼
            api.anime.nexus + prd-socket.anime.nexus
```

Requirements / caveats:

- A persistent process (Node or Python) on a machine that can run the socket
  client + attestation. The repo's GitHub Actions/FTP deploy (static htdocs,
  `xdfkecraft.qzz.io/htdocs`) **cannot host it** — no long-running process.
- The gist author notes such a proxy is "slow and expensive" — tokens are
  per-request, so each segment costs a socket round-trip and the proxy must
  stay warm during playback.
- The module would then return the proxy URL with standard
  `{streams:[{streamUrl, headers}]}` shape; `videoId` is already available
  from `extractEpisodes` hrefs.
- A dedicated Cloudflare Worker is explicitly *not* a fallback — the gist
  lists Workers as blocked by the site WAF (as is datacenter/VPN egress, cf.
  the torrentio finding in the same audit).

## Recommendation

- Keep `anime-nexus` in the registry, searchable (details + episodes enrich
  the catalog), with the stream tab returning empty.
- Re-check the token pipeline only if the site drops the attestation layer or
  the Sora runtime gains WebSocket + crypto; until then treat streaming as
  not-fixable.
- If a playable integration is genuinely required, stand up the self-hosted
  proxy above and add a second manifest/entry pointing at it.