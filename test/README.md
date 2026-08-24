# Test harnesses

## `hydrahd-copy/` — verbatim baseline
Unmodified copies of the four hydrahd files as of commit `1fd46d6` (v2.2.1 /
shirox manifest 1.2.1). Reference snapshot only — nothing here is loaded by
the released manifests.

## `stremio-subs-test/` — isolated Stremio-v3 subtitle test module

A complete, installable Sora/Shirox/Luna/Eclipse module that uses **only** the
Stremio OpenSubtitles v3 endpoint (`opensubtitles-v3.strem.io`) for subtitles,
with the series path fix applied:

| | URL sent to v3 | Result |
|---|---|---|
| hydrahd ≤ 2.2.1 | `/subtitles/series/tt0944947.json?season=1&episode=5` | params silently ignored → wrong whole-show tracks |
| **this test module** | `/subtitles/series/tt0944947%3A1%3A5.json` | correct per-episode English tracks |

Verified via curl on 2026-08-24: the fixed shape returns file id `1952859873`
(`Game.Of.Thrones.S01E05.The.Wolf.and.the.Lion.HDTV.XviD-FQM.srt`), identical
to what the keyless OS REST search returns for S01E05.

### What's inside

- `searchResults` / `extractDetails` / `extractEpisodes` ride Cinemeta
  (same pattern as `examples/.archive/comet`), so there is no scraped site.
- `extractStreamUrl` calls **only** `resolveV3Subtitles()` — no OS REST, no
  community addon, no real stream resolvers.
- It also fetches the OLD query-param shape in parallel but logs it instead of
  emitting tracks, so the app log gives you an A/B count per title:
  `[SubTest] v3 series tt...:S1E5 colon-shape=12 tracks, legacy-query-shape=3 tracks`
- One labeled probe stream (`[SUB-TEST] probe stream`, Big Buck Bunny HLS)
  keeps the player reachable so the subtitle picker renders. Its video is NOT
  the searched title — judge the test by picker contents.
  Flip `INCLUDE_TEST_STREAM = false` in the JS if your build shows pickers
  without streams and you want zero streams.

### How to install & test

1. Push this folder to GitHub so `scriptUrl` resolves:
   `test/stremio-subs-test/stremio-subs-test.js` on `main`.
2. Add the manifest to your app (Sora → Modules → add):
   `https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/test/stremio-subs-test/stremio-subs-test.json`
3. Search e.g. "Game of Thrones", open **any episode of season 1+**.
4. Pass criteria:
   - Subtitle picker lists multiple languages labeled ("English", "Spanish"…).
   - For series, tracks correspond to the opened episode (check log line
     `colon-shape=` count > 0; legacy count will differ).
   - Movies behave exactly like before (plain id path — unchanged code path).

### Success → next step

If the picker fills correctly here, port the same one-line contentId change
into `hydrahd/hydrahd.js` `resolveStremioSubtitle()` and
`hydrahd/hydrahd-shirox.js`, bump versions, release.
