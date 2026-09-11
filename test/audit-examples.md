# Examples/ module audit — 2026-09-09 06:07:44

| Status | Count |
| --- | --- |
| **ACTIVE** | 14 |
| **PARTIAL** | 36 |
| **INACTIVE** | 66 |

## ACTIVE — full pipeline resolves

- **aniliberty/aniliberty.json** — AniLiberty (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **animeav1/animeav1.json** — AnimeAV1 (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **animegg/animegg.json** — AnimeGG (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **animeland/animeland.json** — AnimeLand (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **animevost/animevost.json** — AnimeVost (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **iptv-org/iptv-org.json** — IPTV-org (anime/movies/shows) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **lncrawler/lncrawler.json** — LnCrawler (novels) — steps: search ✓, details ✓, chapters ✓, text ✓
- **mangadex/mangadex.json** — MangaDex (mangas) — steps: search ✓, details ✓, chapters ✓, images ✓
- **nimegami/nimegami.json** — Nimegami (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **nivod/nivod.json** — Nivod (anime/movies/shows) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **onetouch/onetouch.json** — OneTouch TV (shows/movies/anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **onwave/onwave.json** — OnWave (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **toontales/toontales.json** — ToonTales (shows) — steps: search ✓, details ✓, episodes ✓, stream ✓
- **yummyanime/yummyanime.json** — YummyAnime (anime) — steps: search ✓, details ✓, episodes ✓, stream ✓

## PARTIAL — search works but a later step fails

- **123anime/123anime.json** — 123Anime — no playable stream (empty)
- **1tamilcrow/1tamilcrow.json** — 1TamilCrow — no playable stream (empty)
- **aksv/aksv.json** — AK.SV — no playable stream (empty)
- **anidub/anidub.json** — AniDub — episodes failed (empty)
- **animedefenders/animedefenders.json** — AnimeDefenders — no playable stream (empty)
- **animeheaven/animeheaven.json** — AnimeHeaven — episodes failed (empty)
- **animeindo/animeindo.json** — AnimeIndo — no playable stream (empty)
- **animenana/animenana.json** — AnimeNana — no playable stream (empty)
- **animenix/animenix.json** — AnimeNix — episodes failed (empty)
- **animenosub/animenosub.json** — AnimeNoSub — no playable stream (empty)
- **animesdigital/animesdigital.json** — AnimesDigital — no playable stream (empty)
- **animetoast/animetoast.json** — AnimeToast — no playable stream (empty)
- **animeunity/animeuntiy.json** — AnimeUnity — no playable stream (empty)
- **animeworld/animeworld.json** — AnimeWorld — no playable stream (empty)
- **anitube/anitube.json** — AniTube — no playable stream (empty)
- **aniworld/AniWorldEngSub.json** — AniWorld (ENG SUB) — no playable stream (empty)
- **aniworld/AniWorldGerDub.dev.json** — AniWorld (Local Test) — no playable stream (empty)
- **aniworld/AniWorldGerDub.json** — AniWorld (GER DUB) — no playable stream (empty)
- **aniworld/AniWorldGerSub.json** — AniWorld (GER SUB) — no playable stream (empty)
- **anoboye/anoboye.json** — Anoboye — no playable stream (empty)
- **asia2tv/asia2tv.json** — Asia2TV — no playable stream (empty)
- **cuevana3/cuevana3.json** — Cuevana3 — no playable stream (empty)
- **hexa/hexa.json** — Hexa — no playable stream (fetch failed) | errors: stream: fetch failed
- **kickassanimes/kickassanimes.json** — KickAssAnimes — episodes failed (empty)
- **lmanime/lmanime.json** — LmAnime — episodes failed (timeout 25000ms in episodes) | errors: episodes: timeout 25000ms in episodes
- **mangafreak/mangafreak.json** — MangaFreak — search ok but manga pipeline broken
- **monoschinos2/monoschinos2.json** — Monoschinos2 — episodes failed (empty)
- **poseidonhd2/poseidonhd2.json** — PoseidonHD2 — no playable stream (empty)
- **readnovels/readnovels.json** — ReadNovels — chapters ok, text failed (empty)
- **sameband/sameband.json** — SameBand — episodes failed (empty)
- **shizaproject/shizaproject.json** — ShizaProject — episodes failed (empty)
- **topstreamfilm/topstreamfilm.json** — TopStreamFilm — episodes failed (empty)
- **videasy/videasy.json** — VidEasy — no playable stream (Cannot read properties of null (reading 'json')) | errors: stream: Cannot read properties of null (reading 'json')
- **vidfast/vidfast.json** — VidFast — no playable stream (Could not find data in page) | errors: stream: Could not find data in page
- **vidlink/vidlink.json** — VidLink — no playable stream (Cannot read properties of null (reading 'stream')) | errors: stream: Cannot read properties of null (reading 'stream')
- **youtube/youtube.json** — YouTube — no playable stream (empty)

## INACTIVE — search/load fails

- **1movies/1movies.json** — 1Movies — search: 0 results
- **an1me/an1me.json** — An1me — search: 0 results
- **anicrush/anicrush.json** — AniCrush — search: 0 results
- **anihq/anihq.json** — AniHQ — search: 0 results
- **anime-sama/anime-sama.json** — Anime-Sama — search: timeout 25000ms in search
- **animebalkan/animebalkan.json** — AnimeBalkan — search: 0 results
- **animekai/animekai.json** — AnimeKai — search: 0 results
- **animekhor/animekhor.json** — AnimeKhor — search: timeout 25000ms in search
- **animeler/animeler.json** — Animeler — search: 0 results
- **animelib/animelib.json** — AnimeLib — search: 0 results
- **animepahe/animepahe.json** — AnimePahe — search: 0 results
- **animesaturn/animesaturn.json** — AnimeSaturn — search: 0 results
- **animesrbija/animesrbija.json** — AnimeSRBIJA — search: 0 results
- **animeweek/animeweek.json** — AnimeWeek — search: 0 results
- **animexin/animexin.json** — AnimeXin — search: 0 results
- **animez/animez.json** — Animez — search: 0 results
- **aniwatch/aniwatch.json** — AniWatch — search: 0 results
- **ashi/ashi.json** — Ashi (あし) - Literally Everything — search: 0 results
- **chireads/chireads.json** — ChiReads — search: 0 results
- **coflix/coflix.json** — CoFlix — search: 0 results
- **comix/comix.json** — Comix — search: 0 results
- **crimsonfansubs/crimsonfansubs.json** — CrimsonFanSubs — search: 0 results
- **dev/dev.json** — Development — search: 0 results
- **donghuastream/donghuastream.json** — DonghuaStream — search: 0 results
- **dora-video/dora-video.json** — Dora-Video — search: 0 results
- **faselhd/faselhd.json** — FaselHD — search: 0 results
- **filmpalast/filmpalast.json** — Filmpalast — search: 0 results
- **fireanime/fireanime.json** — FireAnime English (SUB) — search: 0 results
- **fireanime/FireAnimeGer.json** — FireAnime SUB — search: 0 results
- **fireanime/FireAnimeGerDub.json** — FireAnime DUB — search: 0 results
- **gojowtf/gojowtf.json** — Animetsu — search: fetch failed
- **hdfilme/hdfilme.json** — HDFilme — search: 0 results
- **hianime/hianime.json** — HiAnime — search: 0 results
- **himovies/himovies.json** — HiMovies — search: 0 results
- **kaido/kaido.json** — Kaido — search: 0 results
- **kaliscan/kaliscan.json** — KaliScan — load | sandbox load failed: searchResults is not defined
- **kawaiifu/kawaiifu.json** — Kawaiifu — search: 0 results
- **kimcartoon/kimcartoon.json** — KimCartoon — search: 0 results
- **kisskh/kisskh.json** — Kisskh — search: 0 results
- **luciferdonghua/luciferdonghua.json** — LuciferDonghua — search: 0 results
- **mangabuddy/mangabuddy.json** — MangaBuddy — search: 0 results
- **mangacloud/mangacloud.json** — MangaCloud — search: 0 results
- **mangafire/mangafire.json** — MangaFire — search: fetch failed
- **mangakatana/mangakatana.json** — MangaKatana — search: 0 results
- **mangapark/mangapark.json** — MangaPark — search: 0 results
- **mangapub/mangapub.json** — MangaPub — search: 0 results
- **mangataro/mangataro.json** — MangaTaro — search: 0 results
- **novelbin/novelbin.json** — NovelBin — search: 0 results
- **novelnext/novelnext.json** — NovelNext — search: 0 results
- **readnovelfull/readnovelfull.json** — ReadNovelFull — search: 0 results
- **rumanhua1/rumanhua.json** — RumanHua1 — search: fetch failed
- **s.to/sToEngDub.json** — s.to (ENG DUB) — search: 0 results
- **s.to/sToGerDub.json** — s.to (GER DUB) — search: 0 results
- **senshi/senshi.json** — Senshi — search: 0 results
- **streamingunity/streamingunity.json** — StreamingUnity — search: Cannot read properties of null (reading 'text')
- **tidal/tidal.json** — Tidal — search: 0 results
- **tiktok/tiktok.json** — Tiktok — search: 0 results
- **tokyoinsider/tokyoinsider.json** — TokyoInsider — search: 0 results
- **turkish123/turkish123.json** — Turkish123 — search: 0 results
- **veranimes/veranimes.json** — VerAnimes — search: 0 results
- **veziseriale/veziseriale.json** — Veziseriale — search: 0 results
- **watchanimeworld/watchanimeworld.json** — WatchAnimeWorld — search: 0 results
- **weebcentral/weebcentral.json** — WeebCentral — search: 0 results
- **wikipedia/wikipedia.json** — Public Domain in the US — search: 0 results
- **witanime/witanime.json** — WitAnime — search: 0 results
- **xiaoxintv/xiaoxintv.json** — XiaoXintv — search: 0 results
