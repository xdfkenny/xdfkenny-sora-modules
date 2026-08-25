# Test harnesses

## `hydrahd-copy/` — verbatim baseline
Unmodified copies of the four hydrahd files as of commit `1fd46d6` (v2.2.1 /
shirox manifest 1.2.1). Reference snapshot only.

## `stremio-subs-test/` — HydraHD clone with experimental subtitle pipeline

**v0.2.2**: episode trust filter for the curation. Root cause of "right video,
wrong subtitles" on series (first seen on Family Guy): the subtitle APIs'
episode mapping is polluted with same-episode-number files from OTHER seasons
— live-verified on tt0182576:1:1, where BOTH v3 and OS REST list "The Thin
White Line" S03E01, "Blue Harvest" S06E01, "Road to the Multiverse" S08E01,
"And Then There Were Fewer" S09E01 and "Lottery Fever" S10E01 alongside the
true episode (API membership proves nothing — only release names do; content
check: zero overlap between the S09E01 file and any real S01E01 sub). Those
43-minute specials are routinely LARGER than the true 21-minute episode's
subs, so pure largest-bytes selection auto-loaded another episode's subtitles
outright.

Fix: parse each candidate's SubFileName from the OS REST episode search for an
s:e code (S01E01 / 1x01 / [3.01] / three-digit "101" forms) and classify:
verified = code matches the requested season+episode; blocked = provably
foreign (excluded from every language's pool); unknown = no parsable code.
Class outranks size — a verified track beats any bigger unknown one; size
breaks ties within a class. No name data -> all unknown -> legacy behavior.
Non-English languages benefit only via exclusions (their names are not
fetched); playlist-derived tracks carry no OS file id and stay unverified by
definition.

**v0.2.1**: audit fixes — probes keep custom Referer headers (playlist-derived
tracks no longer 403), engine-independent stable sort, FULL per-language
coverage replacing the 30-sample cap (subs5.strem.io ignores Range and sends
no Content-Length; API listing order shuffles between calls), hard cap raised
to 120, and one retry pass so a transient probe failure can't let a smaller
sibling outrank the true max.

**v0.2.0**: an exact copy of `hydrahd.js` v2.2.1 — same servers, same stream
resolvers, same real playback — with ONLY the subtitle pipeline changed:

1. **V3-only + colon-path fix.** Subtitles come solely from
   `opensubtitles-v3.strem.io` (no OS REST, no community addon). Series use
   the Stremio addon path convention `tt{id}:{s}:{e}.json` instead of query
   params, which v3 silently ignores (verified live: 91 correct S01E05 tracks
   vs 3 wrong ones on the legacy shape).
2. **Largest-bytes-per-language curation (the idea).** EVERY candidate track
   is downloaded and only the largest body per language is rendered (most
   complete translation). subs5.strem.io ignores Range and sends no
   Content-Length, so sampling cannot find the true max — full coverage is
   required and is what ships: chunked 10-wide fetches, 6 s timeout each,
   one sequential retry pass over failures, hard cap 120 candidates,
   deadline bail-outs (<9 s skip measuring entirely, <4 s stop mid-way),
   UTF-8-first fallback for anything unmeasured. Measured cost on GoT S01E05
   (91 tracks): 3.6-7.3 s wall, ~4 MB. Winner verified = true max of all 8
   English variants in 3 consecutive runs.

Everything else (Cinemeta synopsis, playlist subs, Beta labels, quality
probes) is untouched hydrahd code.

### Install & test

```
https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/test/stremio-subs-test/stremio-subs-test.json
```

Search a title, open a stream — playback should feel identical to HydraHD.
The picker now shows ONE entry per language ("English", "Spanish", …), where
each entry is the largest subtitle file found for that language. Watch the
`[SubTest]` log lines:
- `largest-bytes curation: eng=68615B,spa=63343B,...` — per-language winners
- `deadline too close for byte measuring` — fallback engaged (rare)

### Pass criteria → next step

If playback + one-track-per-language look right on device, port into the real
builds: (a) colon-path fix in `resolveStremioSubtitle()` of both
hydrahd.js and hydrahd-shirox.js, (b) decide whether largest-bytes curation
ships too or stays an experiment.
