# Examples/ — Sora module audit (9/10/2026, 9:16:52 PM)

Every module folder under `examples/` (excluding `.archive`, `.tools`, `.gitea`) was loaded locally with a `fetchv2`/curl sandbox and run through its full contract pipeline. Keywords: `one piece` (video/manga), `solo leveling` (novels), with per-site overrides. A site "UP/DOWN" column shows whether its `baseUrl` responded from this environment — DOWN ≠ module broken, UP + 0 results = search endpoint/regex issue or JS-gated content.

| Status | Count |
| --- | --- |
| **ACTIVE** | 56 |
| **PARTIAL** | 55 |
| **INACTIVE** | 67 |

## ACTIVE — full pipeline resolves

| Module | Site | Steps |
| --- | --- | --- |
| `123anime/123anime.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `aether/aether.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `airflix/airflix.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `aksv/aksv.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `an1me/an1me.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `anidub/anidub.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `aniliberty/aniliberty.json` | DOWN | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `anime-sama/anime-sama.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animeav1/animeav1.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animedefenders/animedefenders.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animegg/animegg.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animeland/animeland.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animelib/animelib.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animenosub/animenosub.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `AnimeUnity/module.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animevost/animevost.json` | DOWN | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `AnimeWorld/module.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `anineko/anineko.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `anitube/anitube.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `aniwave/aniwave.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `blackCloverPace/blackCloverPace.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `borucut/borucut.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `chireads/chireads.json` | UP | ✓search ✓details ✓chapters ✓text — search → chapters → text |
| `concentratedBleach/concentratedBleach.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `dbzRecut/dbzRecut.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `dragonballrecut/dragonballrecut.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `gidonline/gidonline.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `imdb/imdb.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `iptv-org/iptv-org.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `kisskh/kisskh.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `lmanime/lmanime.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `lncrawler/lncrawler.json` | UP | ✓search ✓details ✓chapters ✓text — search → chapters → text |
| `mangabuddy/mangabuddy.json` | n/a | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `mangadex/mangadex.json` | n/a | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `mangafreak/mangafreak.json` | n/a | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `mangaworld/mangaworld.json` | n/a | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `monoschinos2/monoschinos2.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `nakanime/nakanime.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `nimegami/nimegami.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `nivod/nivod.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `onetouch/onetouch.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `onigashima/onigashima.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `onwave/onwave.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `otaku-streamers/otaku-streamers.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `peachify/peachify.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `readnovels/readnovels.json` | UP | ✓search ✓details ✓chapters ✓text — search → chapters → text |
| `scan-sama/scan-sama.json` | UP | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `streamcloud/streamcloud.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `StreamingUnity/module.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `toontales/toontales.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `vidcore/vidcore.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `videasy/videasy.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `vidfast/vidfast.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `voir-anime/voir-anime.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `weebcentral/weebcentral.json` | n/a | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `xpass/xpass.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |

## PARTIAL — search works, later step fails

| Module | Site | Steps |
| --- | --- | --- |
| `111movies/111movies.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `1tamilcrow/1tamilcrow.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `allmanga/allmanga.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `anify/anify.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `anikoto/anikoto.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `animeheaven/animeheaven.json` | UP | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `animeportal/animeportal.json` | UP | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `animesdigital/animesdigital.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `animex/animex.json` | UP | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `animex/animex.json` | UP | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `aniworld/AniWorldEngSub.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `aniworld/AniWorldGerDub.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `aniworld/AniWorldGerSub.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `anizone/anizone.json` | UP | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `anoboye/anoboye.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `asia2tv/asia2tv.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `bingebox/bingebox.json` | DOWN | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `bingeflex/bingeflex.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `dessin-anime/dessin-anime.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `doramaland/doramaland.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `filmo/filmo_en.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `filmo/filmo.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `flickystream/flickystream.json` | DOWN/TypeError | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `hdrezka/hdrezka.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `hexa/hexa.json` | UP | ✓search ✓details ✓episodes ✗stream — stream: timeout 35000ms in stream |
| `kinoger/kinoger.json` | UP | ✓search ✓details ✓episodes ✗stream — stream: networkFetch is not defined |
| `latanime/latanime.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `movix/movix.json` | DOWN/TypeError | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `nakios/nakios.json` | DOWN/TypeError | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `narucannon/narucannon.json` | UP | ✓search ✗details ✗episodes ✓stream — details: Invalid URL format; episodes: Invalid URL format |
| `net3lix/net3lix.json` | DOWN/TypeError | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `novelnext/novelnext.json` | DOWN/TypeError | ✓search ✓details ✓chapters ✗text — text (empty) |
| `onepace/onepace.json` | UP | ✓search ✗details ✗episodes ✓stream — details: Invalid URL format; episodes: Invalid URL format |
| `onepace/onepaceEs.json` | UP | ✓search ✗details ✗episodes ✓stream — details: Invalid URL format; episodes: Invalid URL format |
| `onepace/onepaceFr.json` | UP | ✓search ✗details ✗episodes ✓stream — details: Invalid URL format; episodes: Invalid URL format |
| `onePieceFilmRedAmaLeeScore/onePieceFilmRedAmaLeeScore.json` | UP | ✓search ✓details ✗episodes ✓stream — episodes: Invalid URL format |
| `onePieceTreasureEdition/onePieceTreasureEdition.json` | UP | ✓search ✗details ✗episodes ✓stream — details: Invalid URL format; episodes: Invalid URL format |
| `rebuildOfNaruto/rebuildOfNaruto.json` | UP | ✓search ✗details ✗episodes ✓stream — details: Invalid URL format; episodes: Invalid URL format |
| `ristoanime/ristoanime.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `rive/rive.json` | DOWN/TypeError | ✓search ✓details ✓episodes ✗stream — stream: networkFetch is not defined |
| `sameband/sameband.json` | UP | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `shizaproject/shizaproject.json` | UP | ✓search ✓details ✗episodes ✗stream — episodes (empty); stream (empty) |
| `vidapi/vidapi.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `vidify/vidify.json` | DOWN/AbortError | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `vidlink/vidlink.json` | UP | ✓search ✓details ✓episodes ✗stream — stream: Cannot read properties of null (reading 'stream') |
| `vidnest/vidnest.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `vidrock/vidrock.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `vidsrcCC/vidsrcCC.json` | DOWN/AbortError | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `vidup/vidup.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `vidzee/vidzee.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `vixsrc/vixsrc.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `wavewatch/wavewatch.json` | DOWN/TypeError | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `xprime/xprime.json` | DOWN/TypeError | ✓search ✓details ✓episodes ✗stream — stream: Cannot read properties of null (reading 'ok') |
| `yummyanime/yummyanime2.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `yuYuHakushoPace/yuYuHakushoPace.json` | UP | ✓search ✗details ✗episodes ✓stream — details: Invalid URL format; episodes: Invalid URL format |

## INACTIVE — search/load fails

| Module | Site | Steps |
| --- | --- | --- |
| `AllAnime/AllAnime.json` | UP | ✗search — search (empty) |
| `anibunker/anibunker.json` | DOWN | ✗search — search (empty) |
| `anidb/anidb.json` | DOWN | ✗search — search (empty) |
| `anihq/anihq.json` | UP | ✗search — search (empty) |
| `anikuro/anikuro.json` | UP | ✗search — search (empty) |
| `anime-base/anime-base-DUB.json` | UP |  — load |
| `anime-base/anime-base-ENGSUB.json` | UP |  — load |
| `anime-base/anime-base-SUB.json` | UP |  — load |
| `anime-ultra/anime-ultra.json` | UP | ✗search — search (empty) |
| `animekhor/animekhor.json` | UP | ✗search — search (empty) |
| `animepahe/animepahe.json` | DOWN/TypeError | ✗search — search (empty) |
| `animesrbija/animesrbija.json` | UP | ✗search — search (empty) |
| `animetsu/animetsu.json` | UP | ✗search — search: JSON invalid from https://animetsu.live/v2/api/anime/search/?query=one%20piece: Unexpected token '<', "<!doctype "... is not valid JSON |
| `animeverse/animeverse.json` | DOWN/AbortError | ✗search — search (empty) |
| `animeweek/animeweek.json` | UP | ✗search — search (empty) |
| `animexin/animexin.json` | UP | ✗search — search (empty) |
| `arabictoons/arabictoons.json` | UP | ✗search — search (empty) |
| `catflix/catflix.json` | UP | ✗search — search (empty) |
| `cinepulse/cinepulse.json` | DOWN/TypeError | ✗search — search (empty) |
| `comix/comix.json` | n/a | ✗search — search (empty) |
| `dev/dev.json` | UP | ✗search — search (empty) |
| `donghuastream/donghuastream.json` | UP | ✗search — search (empty) |
| `dramacool/dramacool.json` | DOWN/TypeError | ✗search — search (empty) |
| `filmpalast/filmpalast.json` | UP | ✗search — search (empty) |
| `fireanime/fireanime_DUB.json` | UP | ✗search — search (empty) |
| `fireanime/fireanime_ENG_SUB.json` | UP | ✗search — search (empty) |
| `fireanime/fireanime_SUB.json` | UP | ✗search — search (empty) |
| `hdfilme/hdfilme.json` | DOWN | ✗search — search (empty) |
| `hdtoday/hdtoday.json` | DOWN/TypeError | ✗search — search (empty) |
| `kaliscan/kaliscan.json` | n/a | ✗search — search (empty) |
| `kuudere/kuudere.json` | UP | ✗search — search (empty) |
| `lightnovelworld/lightnovelworld.json` | UP | ✗search — search (empty) |
| `livewatch/livewatch.json` | UP | ✗search — search (empty) |
| `luciferdonghua/luciferdonghua.json` | UP | ✗search — search (empty) |
| `lycoriscafe/lycoriscafe.json` | DOWN | ✗search — search (empty) |
| `mangafire/mangafire.json` | n/a | ✗search — search (empty) |
| `mangakatana/mangakatana.json` | n/a | ✗search — search (empty) |
| `mangapub/mangapub.json` | n/a | ✗search — search (empty) |
| `mangataro/mangataro.json` | n/a | ✗search — search (empty) |
| `miruro/miruro.json` | UP | ✗search — search (empty) |
| `moflix/moflix.json` | DOWN | ✗search — search (empty) |
| `myflixer/myflixer.json` | DOWN/TypeError | ✗search — search (empty) |
| `Nakastream/Nakastream.json` | UP | ✗search — search (empty) |
| `novelbin/novelbin.json` | DOWN/TypeError | ✗search — search: timeout 25000ms in search |
| `novelbuddy/novelbuddy.json` | UP | ✗search — search (empty) |
| `noveldot/noveldot.json` | UP | ✗search — search (empty) |
| `novelfire/novelfire.json` | UP | ✗search — search (empty) |
| `otakutsu/otakutsu.json` | UP | ✗search — search (empty) |
| `peak/peak.json` | DOWN/TypeError | ✗search — search (empty) |
| `purstream/purstream.json` | UP | ✗search — search (empty) |
| `ramaorientalfansub/ramaorientalfansub.json` | DOWN/TypeError | ✗search — search (empty) |
| `readnovelfull/readnovelfull.json` | UP | ✗search — search (empty) |
| `rgshows/rgshows.json` | DOWN/TypeError | ✗search — search (empty) |
| `rumanhua1/rumanhua.json` | n/a | ✗search — search: fetch failed |
| `s.to/s.to_ENG.json` | UP | ✗search — search (empty) |
| `s.to/s.to_GER.json` | UP | ✗search — search (empty) |
| `senshi/senshi.json` | DOWN/TypeError | ✗search — search (empty) |
| `sflix/sflix.json` | DOWN/TypeError | ✗search — search (empty) |
| `spacepowerfans/spacepowerfans.json` | UP | ✗search — search (empty) |
| `sudatchi/sudatchi.json` | DOWN | ✗search — search (empty) |
| `sunduq/sunduq.json` | UP | ✗search — search (empty) |
| `tanime/tanime.json` | DOWN/TypeError | ✗search — search: timeout 25000ms in search |
| `topcinema/topcinema.json` | DOWN/AbortError | ✗search — search: timeout 25000ms in search |
| `turkish123/turkish123.json` | UP | ✗search — search (empty) |
| `twitch-no-sub/Twitch_nosub.json` | UP | ✗search — search (empty) |
| `uaserial/uaserial.json` | DOWN/TypeError | ✗search — search (empty) |
| `xiaoxintv/xiaoxintv.json` | UP | ✗search — search (empty) |

## Failure reasons

| Reason | Modules |
| --- | --- |
| search: 0 results | 59: `AllAnime/AllAnime.json`, `anibunker/anibunker.json`, `anidb/anidb.json`, `anihq/anihq.json`, `anikuro/anikuro.json`, `anime-ultra/anime-ultra.json`, `animekhor/animekhor.json`, `animepahe/animepahe.json`, `animesrbija/animesrbija.json`, `animeverse/animeverse.json`, `animeweek/animeweek.json`, `animexin/animexin.json`, `arabictoons/arabictoons.json`, `catflix/catflix.json`, `cinepulse/cinepulse.json`, `comix/comix.json`, `dev/dev.json`, `donghuastream/donghuastream.json`, `dramacool/dramacool.json`, `filmpalast/filmpalast.json`, `fireanime/fireanime_DUB.json`, `fireanime/fireanime_ENG_SUB.json`, `fireanime/fireanime_SUB.json`, `hdfilme/hdfilme.json`, `hdtoday/hdtoday.json`, `kaliscan/kaliscan.json`, `kuudere/kuudere.json`, `lightnovelworld/lightnovelworld.json`, `livewatch/livewatch.json`, `luciferdonghua/luciferdonghua.json`, `lycoriscafe/lycoriscafe.json`, `mangafire/mangafire.json`, `mangakatana/mangakatana.json`, `mangapub/mangapub.json`, `mangataro/mangataro.json`, `miruro/miruro.json`, `moflix/moflix.json`, `myflixer/myflixer.json`, `Nakastream/Nakastream.json`, `novelbuddy/novelbuddy.json`, `noveldot/noveldot.json`, `novelfire/novelfire.json`, `otakutsu/otakutsu.json`, `peak/peak.json`, `purstream/purstream.json`, `ramaorientalfansub/ramaorientalfansub.json`, `readnovelfull/readnovelfull.json`, `rgshows/rgshows.json`, `s.to/s.to_ENG.json`, `s.to/s.to_GER.json`, `senshi/senshi.json`, `sflix/sflix.json`, `spacepowerfans/spacepowerfans.json`, `sudatchi/sudatchi.json`, `sunduq/sunduq.json`, `turkish123/turkish123.json`, `twitch-no-sub/Twitch_nosub.json`, `uaserial/uaserial.json`, `xiaoxintv/xiaoxintv.json` |
| no playable stream | 38: `111movies/111movies.json`, `1tamilcrow/1tamilcrow.json`, `allmanga/allmanga.json`, `anify/anify.json`, `anikoto/anikoto.json`, `animesdigital/animesdigital.json`, `aniworld/AniWorldEngSub.json`, `aniworld/AniWorldGerDub.json`, `aniworld/AniWorldGerSub.json`, `anoboye/anoboye.json`, `asia2tv/asia2tv.json`, `bingebox/bingebox.json`, `bingeflex/bingeflex.json`, `dessin-anime/dessin-anime.json`, `doramaland/doramaland.json`, `filmo/filmo_en.json`, `filmo/filmo.json`, `flickystream/flickystream.json`, `hdrezka/hdrezka.json`, `hexa/hexa.json`, `kinoger/kinoger.json`, `latanime/latanime.json`, `movix/movix.json`, `nakios/nakios.json`, `ristoanime/ristoanime.json`, `rive/rive.json`, `vidapi/vidapi.json`, `vidify/vidify.json`, `vidlink/vidlink.json`, `vidnest/vidnest.json`, `vidrock/vidrock.json`, `vidsrcCC/vidsrcCC.json`, `vidup/vidup.json`, `vidzee/vidzee.json`, `vixsrc/vixsrc.json`, `wavewatch/wavewatch.json`, `xprime/xprime.json`, `yummyanime/yummyanime2.json` |
| episodes failed | 16: `animeheaven/animeheaven.json`, `animeportal/animeportal.json`, `animex/animex.json`, `animex/animex.json`, `anizone/anizone.json`, `narucannon/narucannon.json`, `net3lix/net3lix.json`, `onepace/onepace.json`, `onepace/onepaceEs.json`, `onepace/onepaceFr.json`, `onePieceFilmRedAmaLeeScore/onePieceFilmRedAmaLeeScore.json`, `onePieceTreasureEdition/onePieceTreasureEdition.json`, `rebuildOfNaruto/rebuildOfNaruto.json`, `sameband/sameband.json`, `shizaproject/shizaproject.json`, `yuYuHakushoPace/yuYuHakushoPace.json` |
| load | 3: `anime-base/anime-base-DUB.json`, `anime-base/anime-base-ENGSUB.json`, `anime-base/anime-base-SUB.json` |
| search: timeout 25000ms in search | 3: `novelbin/novelbin.json`, `tanime/tanime.json`, `topcinema/topcinema.json` |
| chapters ok, text failed | 1: `novelnext/novelnext.json` |
| search: JSON invalid from https://animetsu.live/v2/api/anime/search/?query=one%20piece: Unexpected token '<', "<!doctype "... is not valid JSON | 1: `animetsu/animetsu.json` |
| search: fetch failed | 1: `rumanhua1/rumanhua.json` |

## Evidence — ACTIVE modules

**`123anime/123anime.json`** (123Anime, anime, one piece, site UP)
- search: 28 results, e.g. One Piece | One Piece: Heroines | One Piece: Dr. Chopper's Adventure Checkup - The Last Records That a Genius Left Behind
- stream: 1 source(s), e.g. `https://stream-proxy-397vf67bnod.simplepostrequest.workers.dev/?url=https%3A%2F%2Fimgcdn44`
**`aether/aether.json`** (Aether, shows/movies/anime, one piece, site UP)
- search: 20 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://brandpositioningstudio.site/HXST6ZQIP/pl/H4sIAAAAAAAAAw3P7XaCIBgA4FsSGUv2LzX6UlwEL`
**`airflix/airflix.json`** (Airflix, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://brandpositioningstudio.site/HXST6ZQIP/pl/H4sIAAAAAAAAAwXBXVfCIBgA4L80WHhcdy1FRcHD1`
**`aksv/aksv.json`** (AK.SV, movies/shows, one piece, site UP)
- search: 5 results, e.g. ONE PIECE الموسم الثاني | ون بيس مدبلج | One Piece الموسم الاول
- stream: 1 source(s), e.g. `https://s205d1.downet.net/download/1789175700/6aa3561414726/One.Piece.S02E01.WEB-DL.AKWAM.`
**`an1me/an1me.json`** (An1me, anime, one piece, site UP)
- search: 105 results, e.g. Anime | Anime | Anime
- stream: 1 source(s), e.g. `https://an1me.to/anime_attribute/sub/`
**`anidub/anidub.json`** (AniDub, anime, one piece, site UP)
- search: 40 results, e.g. Любовный Ван-Пис | Ван-Пис: Героини | Ван-Пис: Запись приключений доктора Чоппера — Баллада отца и дочери
- stream: 1 source(s), e.g. `https://vd575.okcdn.ru/?expires=1789175702962&srcIp=201.208.188.171&pr=90&srcAg=CHROME&ms=`
**`aniliberty/aniliberty.json`** (AniLiberty, anime, one piece, site DOWN/)
- search: 11 results, e.g. Ван-Пис | Ван-Пис: Героини | Ванпанчмен
- stream: 3 source(s), e.g. `https://cache.libria.fun/videos/media/ts/10290/1/1080/6e7f45803b46cbc95dc61af79f55cb93.m3u`
**`anime-sama/anime-sama.json`** (Anime-Sama, anime, one piece, site UP)
- search: 5 results, e.g. One Piece | One Outs | One Punch Man
- stream: 3 source(s), e.g. `https://prx-1546-ant.vmpx.online/hls2/01/02888/3c5re3dv0g4u_,n,l,.urlset/master.m3u8?t=MDq`
**`animeav1/animeav1.json`** (AnimeAV1, anime, one piece, site UP)
- search: 20 results, e.g. One Piece | One Piece: Heroines | One Piece: Gyojin Tou-hen
- stream: 1 source(s), e.g. `https://player.zilla-networks.com/m3u8/7601658844858539e438dceee32e7924`
**`animedefenders/animedefenders.json`** (AnimeDefenders, anime, one piece, site UP)
- search: 20 results, e.g. ONE PIECE HEROINES | ONE PIECE: Gyojin Tou-hen | ONE PIECE STAMPEDE
- stream: 2 source(s), e.g. `https://playeng.animeapps.top/r2/cachesub/202607051717001080p67330700373019392/index.m3u8`
**`animegg/animegg.json`** (AnimeGG, anime, one piece, site UP)
- search: 78 results, e.g. One Piece: Episode of Merry - Mou Hitori no Nakama no Monogatari | One Piece | Toriko
- stream: 1 source(s), e.g. `https://www.animegg.org/play/265000/video.mp4?for=101789089307073`
**`animeland/animeland.json`** (AnimeLand, anime, one piece, site UP)
- search: 9 results, e.g. One Piece Adventure of Nebulandia | One Piece Episode of Sorajima | One Piece Densetsu no Log! Akagami no Shanks!
- stream: 1 source(s), e.g. `https://animesource.me/cache/opnebulandiadub1.html.mp4`
**`animelib/animelib.json`** (AnimeLib, anime, one piece, site UP)
- search: 60 results, e.g. ONE PIECE | One Piece Film: Red | One Piece: Baron Omatsuri and the Secret Island
- stream: 6 source(s), e.g. `https://cloud.solodcdn.com/useruploads/8d53f9b5-059c-49d9-9141-b5eb96b3af1f/8a48e1f657b1ef`
**`animenosub/animenosub.json`** (AnimeNoSub, anime, one piece, site UP)
- search: 9 results, e.g. One Piece: Heroines | ONE PIECE Season 2 (Live Action) | One Piece DUB
- stream: 2 source(s), e.g. `https://box-1400-p10.vmeas.cloud/hls2/04/02598/g4keh8hl6py5_,n,l,.urlset/master.m3u8?t=uxL`
**`AnimeUnity/module.json`** (AnimeUnity, anime, one piece, site UP)
- search: 30 results, e.g. One Piece | One Piece: Oounabara ni Hirake! Dekkai Dekkai Chichi no Yume! (ITA) | One Piece: Oounabara ni Hirake! Dekkai Dekkai Chichi no Yume!
- stream: 1 source(s), e.g. `https://au-d1-05.vix-content.net/download/4/2/91/291bf7a2-8a8d-4c43-bdc7-474263feebcb/1080`
**`animevost/animevost.json`** (AnimeVost, anime, one piece, site DOWN/)
- search: 24 results, e.g. Ван Пис: Бегство | Ван Пис (пайлот) | Ван Пис (фильм первый)
- stream: 2 source(s), e.g. `http://video.animetop.info/720/2147414641.mp4`
**`AnimeWorld/module.json`** (AnimeWorld, anime, one piece, site UP)
- search: 40 results, e.g. One Piece | One Piece (ITA) | One Piece: Episode of Skypiea
- stream: 1 source(s), e.g. `https://srv26-marte.sweetpixel.org/DDL/ANIME/OnePieceSUBITA/OnePiece_Ep_0001_SUB_ITA.mp4`
**`anineko/anineko.json`** (AniNeko, anime, one piece, site UP)
- search: 30 results, e.g. One Piece | Toriko | One Piece Movie 9: Episode of Chopper Plus - Fuyu ni Saku, Kiseki no Sakura
- stream: 6 source(s), e.g. `https://OkqtSs1gBbNcA8e.premilkyway.com/hls2/01/12839/7s8h2dhneqk7_o/master.m3u8?t=T3nBmOi`
**`anitube/anitube.json`** (AniTube, anime, one piece, site UP)
- search: 6 results, e.g. One Piece: Heroines – Todos os Episódios | One Piece: A Série 2ª Temporada Dublado – Todos os Episódios | One Piece Log – Fish-Man Island Saga – Todos os Episódios
- stream: 1 source(s), e.g. `https://cdn-s01.mywallpaper-4k-image.net/stream/o/one-piece-heroines/01.mp4/index.m3u8`
**`aniwave/aniwave.json`** (Aniwave, anime, one piece, site UP)
- search: 24 results, e.g. One Piece | One Piece: Clockwork Island Adventure | One Piece: The Movie
- stream: 2 source(s), e.g. `https://px.roburnt10.store/cdn/092e3d2d14736a0ad53867906eb1495fdefdbcea5dbde581b5705e2a318`
**`blackCloverPace/blackCloverPace.json`** (Black Clover Pace, anime, one piece, site UP)
- search: 2 results, e.g. Black Clover Pace [SUB] | Black Clover Pace [DUB]
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/d7xNJbwb?download`
**`borucut/borucut.json`** (Borucut, anime, one piece, site UP)
- search: 5 results, e.g. Chunin Exams/Versus Momoshiki Arc | Mujina Bandits Arc | Ao/Vessel Arc
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/Ly7PvjBu?download`
**`chireads/chireads.json`** (ChiReads, novels, solo leveling, site UP)
- search: 43 results, e.g. Le Maître des Secrets | Lord of the Mysteries | 诡秘之主 | La Tribulation des Myriades de Races_万族之劫 | Le Monde des Mages | Warlock of the Magus World | 巫界术士
- text: 11689 chars
**`concentratedBleach/concentratedBleach.json`** (Concentrated Bleach, anime, one piece, site UP)
- search: 6 results, e.g. 01 - Substitute Soul Reaper [Sub] | 02 - Soul Society [Sub] | 03 - Arrancar [Sub]
- stream: 1 source(s), e.g. `https://pixeldrain.com/api/filesystem/%2FrwPVCu7Z%2F01%20-%20Substitute%20Soul%20Reaper%20`
**`dbzRecut/dbzRecut.json`** (DBZ Recut, anime, one piece, site UP)
- search: 4 results, e.g. Saiyan Arc | Freeza Arc | Cell Arc
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/3ftz4zKv?download`
**`dragonballrecut/dragonballrecut.json`** (Dragon Ball Recut, anime, one piece, site UP)
- search: 1 results, e.g. Dragon Ball Recut
- stream: 1 source(s), e.g. `https://archive.org/download/dragon-ball-recut/Dragon.Ball.Recut.E01.v2.Bulma.and.Son.Goku`
**`gidonline/gidonline.json`** (GidOnline, anime/movies/shows, one piece, site UP)
- search: 3 results, e.g. Сериал: Ван-Пис | Ван-Пис: Красный | Аниме: Ван-Пис
- stream: 2 source(s), e.g. `https://hye1eaipby4w.interkh.com/06_22_25/06/22/19/KVP26X5F/77OYDCX4.mp4/master.m3u8?fckz2`
**`imdb/imdb.json`** (IMDb, shows/movies/anime, one piece, site UP)
- search: 55 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://brandpositioningstudio.site/HXST6ZQIP/pl/H4sIAAAAAAAAAw3MS3KDIAAA0CsJlDR2SUSnWk2jf`
**`iptv-org/iptv-org.json`** (IPTV-org, anime/movies/shows, one piece, site UP)
- search: 6 results, e.g. One Piece | One Piece | One Piece
- stream: 1 source(s), e.g. `https://jmp2.uk/plu-624b1c8d4321e200073ee421.m3u8`
**`kisskh/kisskh.json`** (Kisskh, anime/movies/shows, lovely runner, site UP)
- search: 21 results, e.g. Lovely Runner | My Lovely Liar | Lovely Writer
- stream: 1 source(s), e.g. `https://hls.cdnvideo11.shop/hls07/8792/Ep1_index.m3u8?v=iju4hadrvsv`
**`lmanime/lmanime.json`** (LmAnime, anime, one piece, site UP)
- search: 2 results, e.g. The Chosen One | Keyboard Immortal
- stream: 1 source(s), e.g. `https://cdndirector.dailymotion.com/cdn/manifest/video/x9rix6o.m3u8?sec=zCpu7YIhKBQsFNBKgj`
**`lncrawler/lncrawler.json`** (LnCrawler, novels, solo leveling, site UP)
- search: 4 results, e.g. Solo Leveling: Ragnarok | Solo Leveling | Awakening The Weakest Talent: Only I Level Up
- text: 9605 chars
**`mangabuddy/mangabuddy.json`** (MangaBuddy, mangas, one piece, site DOWN/)
- search: 24 results, e.g. One Piece | One Piece Episode A | One Piece dj - Boukyaku Countdown
- images: 51
**`mangadex/mangadex.json`** (MangaDex, mangas, one piece, site DOWN/)
- search: 36 results, e.g. One Piece | One Piece (Official Colored) | One Piece: Ace’s Story—The Manga
- images: 53
**`mangafreak/mangafreak.json`** (MangaFreak, mangas, one piece, site DOWN/)
- search: 7 results, e.g. One Piece | One Piece (Databook) | One Piece - Colored
- images: 15
**`mangaworld/mangaworld.json`** (MangaWorld, mangas, one piece, site DOWN/)
- search: 6 results, e.g. Nami VS Kalifa | One Piece | One Piece - Digital Colored Comics
- images: 37
**`monoschinos2/monoschinos2.json`** (Monoschinos2, anime, one piece, site UP)
- search: 30 results, e.g.  One Piece: Heroines |  One Piece Film: Gold Latino |  One Piece - Wano Especial
- stream: 1 source(s), e.g. `https://wwv.monoschinos2.net/ver/one-piece-heroines-episodio-1`
**`nakanime/nakanime.json`** (Nakanime, anime, one piece, site UP)
- search: 19 results, e.g. One Piece | One Piece : Kai | One Piece, film 1 : Le Film
- stream: 7 source(s), e.g. `https://box-1552-e.vmeas.cloud/hls2/03/02108/na2vrsevfe89_,n,l,.urlset/master.m3u8?t=W6BNj`
**`nimegami/nimegami.json`** (Nimegami, anime, one piece, site UP)
- search: 7 results, e.g. One Piece Film: Red | One Piece Film: Z | One Piece Film: Gold
- stream: 2 source(s), e.g. `https://cdn-cf.berkasdrive.com/public/8f9f02cb6a74f3e541a83625e1df3c2f14e83be8-AQ1Xpj.mp4?`
**`nivod/nivod.json`** (Nivod, anime/movies/shows, one piece, site UP)
- search: 10 results, e.g. 海贼王(真人版) 第一季 | 海贼王(真人版) 第三季 | 海贼王：女英雄们的故事
- stream: 14 source(s), e.g. `https://hd.ijycnd.com/play/7axmOjPb/index.m3u8`
**`onetouch/onetouch.json`** (OneTouch TV, shows/movies/anime, one piece, site UP)
- search: 2 results, e.g. One Piece Season 2: Into the Grand Line (2026) | One Piece (2023)
- stream: 1 source(s), e.g. `https://aapanel.devcorp.me/assets/58ac58f2-5450-5c08-b6aa-3fad7bd1ad20.m3u8`
**`onigashima/onigashima.json`** (Onigashima Paced, anime, one piece, site UP)
- search: 1 results, e.g. Onigashima Paced
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/ZDs9YsGk?download`
**`onwave/onwave.json`** (OnWave, anime, one piece, site UP)
- search: 24 results, e.g. Ван-Пис | Ван-Пис 14: Паническое бегство | Ван Пис 2
- stream: 3 source(s), e.g. `https://cloud.solodcdn.com/useruploads/6af7b6ba-2fcc-4b38-81b9-2d142fcc8618/07c5c0a8ce50da`
**`otaku-streamers/otaku-streamers.json`** (Otaku-Streamers, anime, one piece, site UP)
- search: 8 results, e.g. One Piece | One Piece: Strong World | One Piece Film Z
- stream: 1 source(s), e.g. `https://vid17.otaku-streamers.com/s/fdekzZ2hGL5IUeya16x17vbhZlvNkPHiHT6PjWKgR5LDNkp6m3QmYK`
**`peachify/peachify.json`** (Peachify, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 1 source(s), e.g. `https://vidlink.pro/tv/111110/1/1`
**`readnovels/readnovels.json`** (ReadNovels, novels, solo leveling, site UP)
- search: 15 results, e.g. Solo Leveling | Solo Leveling: Ragnarok | Solo Leveling: Ragnarok
- text: 16153 chars
**`scan-sama/scan-sama.json`** (Scan Sama, mangas, one piece, site UP)
- search: 3 results, e.g. One Piece - Scans (couleur) | One Piece - Scans (noir et blanc) | One Punch Man - Scans
- images: 55
**`streamcloud/streamcloud.json`** (StreamCloud, shows/movies, one piece, site UP)
- search: 20 results, e.g. One Piece - Staffel 2 | One Piece - Staffel 15 | One Piece - Staffel 13
- stream: 1 source(s), e.g. `https://ugc-cdn-caching-n3ad05wdiiynz8qnwf.cloudwindow-route.com/engine/download/01/16765/`
**`StreamingUnity/module.json`** (StreamingUnity, shows/movies, one piece, site UP)
- search: 60 results, e.g. ONE PIECE | Pieces of a Woman | Giorno per giorno
- stream: 1 source(s), e.g. `https://vixcloud.co/playlist/682356?token=1ccbfde5c41ef9812ae82033e0ac3ae8&expires=1794273`
**`toontales/toontales.json`** (ToonTales, shows, one piece, site UP)
- search: 9 results, e.g. Blue Rhythm | Grand Canyonscope | The Barnyard Concert
- stream: 1 source(s), e.g. `https://ww.toontales.net/dd/blue-rhythm.mp4`
**`vidcore/vidcore.json`** (VidCore, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://moon.peakstorm.top/r2/cdn2/Z2ZFNG1yRlgyUzh2cVkzNVd1V0FRUTpzOGlUYzU1Mzc3SE5qNDdPa3d`
**`videasy/videasy.json`** (VidEasy, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 7 source(s), e.g. `https://moon.peakstorm.top/r2/cdn1/b1Q1R2dEbTBIT1JXb0NIenZwT3lUUTplQktrZWYxLUhZWkRUMXY2UjF`
**`vidfast/vidfast.json`** (VidFast, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 1 source(s), e.g. `https://vidlink.pro/tv/111110/1/1`
**`voir-anime/voir-anime.json`** (VoirAnime, anime, one piece, site UP)
- search: 10 results, e.g. ONE PIECE HEROINES | One Piece Log: Fish-Man Island Saga | ONE PIECE FAN LETTER
- stream: 1 source(s), e.g. `https://ugc-cdn-caching-n3htrqvbfyjeooqofq.cloudwindow-route.com/engine/hls2/01/17691/uh25`
**`weebcentral/weebcentral.json`** (WeebCentral, mangas, one piece, site DOWN/)
- search: 6 results, e.g. One Piece | One Piece Party | Piece of Cake
- images: 15
**`xpass/xpass.json`** (XPass, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 1 source(s), e.g. `https://vidlink.pro/tv/111110/1/1`
