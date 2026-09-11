# Examples/ — Sora module audit (9/10/2026, 9:42:56 PM)

Every module folder under `examples/` (excluding `.archive`, `.tools`, `.gitea`) was loaded locally with a `fetchv2`/curl sandbox and run through its full contract pipeline. Keywords: `one piece` (video/manga), `solo leveling` (novels), with per-site overrides. A site "UP/DOWN" column shows whether its `baseUrl` responded from this environment — DOWN ≠ module broken, UP + 0 results = search endpoint/regex issue or JS-gated content.

| Status | Count |
| --- | --- |
| **ACTIVE** | 62 |
| **PARTIAL** | 4 |
| **INACTIVE** | 3 |

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
| `AnimeUnity/AnimeUnity.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `animevost/animevost.json` | DOWN | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `AnimeWorld/AnimeWorld.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `anineko/anineko.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `anitube/anitube.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `aniwave/aniwave.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `blackCloverPace/blackCloverPace.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `borucut/borucut.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `chireads/chireads.json` | UP | ✓search ✓details ✓chapters ✓text — search → chapters → text |
| `comix/comix.json` | UP | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `concentratedBleach/concentratedBleach.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `dbzRecut/dbzRecut.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `dragonballrecut/dragonballrecut.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `flixlatam/flixlatam.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `gidonline/gidonline.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `henaojara/henaojara.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `hydrahd/hydrahd-shirox.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `hydrahd/hydrahd.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `imdb/imdb.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `iptv-org/iptv-org.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `kissasian/kissasian.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
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
| `onetouch/onetouch.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `onigashima/onigashima.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `onwave/onwave.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `otaku-streamers/otaku-streamers.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `peachify/peachify.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `readnovels/readnovels.json` | UP | ✓search ✓details ✓chapters ✓text — search → chapters → text |
| `scan-sama/scan-sama.json` | UP | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `streamcloud/streamcloud.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `StreamingUnity/StreamingUnity.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `toontales/toontales.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `vidcore/vidcore.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `videasy/videasy.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `vidfast/vidfast.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `voir-anime/voir-anime.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `weebcentral/weebcentral.json` | n/a | ✓search ✓details ✓chapters ✓images — search → chapters → images |
| `xpass/xpass.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |
| `yummyanime/yummyanime.json` | UP | ✓search ✓details ✓episodes ✓stream — full pipeline resolves |

## PARTIAL — search works, later step fails

| Module | Site | Steps |
| --- | --- | --- |
| `allmanga-novels/allmanga-novels.json` | UP | ✓search ✓details ✓chapters ✗images — images (empty) |
| `allmanga/allmanga.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `torrentio/torrentio.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |
| `yfsp/yfsp.json` | UP | ✓search ✓details ✓episodes ✗stream — stream (empty) |

## INACTIVE — search/load fails

| Module | Site | Steps |
| --- | --- | --- |
| `anidb/anidb.json` | DOWN | ✗search — search (empty) |
| `anime-nexus/anime-nexus.json` | DOWN | ✗search — search (empty) |
| `nivod/nivod.json` | UP | ✗search — search (empty) |

## Failure reasons

| Reason | Modules |
| --- | --- |
| no playable stream | 3: `allmanga/allmanga.json`, `torrentio/torrentio.json`, `yfsp/yfsp.json` |
| search: 0 results | 3: `anidb/anidb.json`, `anime-nexus/anime-nexus.json`, `nivod/nivod.json` |
| chapters ok but no images | 1: `allmanga-novels/allmanga-novels.json` |

## Evidence — ACTIVE modules

**`123anime/123anime.json`** (123Anime, anime, one piece, site UP)
- search: 28 results, e.g. One Piece | One Piece: Heroines | One Piece: Dr. Chopper's Adventure Checkup - The Last Records That a Genius Left Behind
- stream: 1 source(s), e.g. `https://stream-proxy-397vf67bnod.simplepostrequest.workers.dev/?url=https%3A%2F%2Fimgcdn44`
**`aether/aether.json`** (Aether, shows/movies/anime, one piece, site UP)
- search: 20 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://brandpositioningstudio.site/HXST6ZQIP/pl/H4sIAAAAAAAAAwXB21KEIBgA4FdClM26q1kPm0qJ8`
**`airflix/airflix.json`** (Airflix, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://brandpositioningstudio.site/HXST6ZQIP/pl/H4sIAAAAAAAAAw3O25KCIAAA0F8CodJ9ZAzLgkaux`
**`aksv/aksv.json`** (AK.SV, movies/shows, one piece, site UP)
- search: 5 results, e.g. ONE PIECE الموسم الثاني | ون بيس مدبلج | One Piece الموسم الاول
- stream: 1 source(s), e.g. `https://s205d1.downet.net/download/1789177316/6aa35c640c72d/One.Piece.S02E01.WEB-DL.AKWAM.`
**`an1me/an1me.json`** (An1me, anime, one piece, site UP)
- search: 105 results, e.g. Anime | Anime | Anime
- stream: 1 source(s), e.g. `https://an1me.to/anime_attribute/sub/`
**`anidub/anidub.json`** (AniDub, anime, one piece, site UP)
- search: 40 results, e.g. Любовный Ван-Пис | Ван-Пис: Героини | Ван-Пис: Запись приключений доктора Чоппера — Баллада отца и дочери
- stream: 1 source(s), e.g. `https://vd575.okcdn.ru/?expires=1789177320100&srcIp=201.208.188.171&pr=90&srcAg=CHROME&ms=`
**`aniliberty/aniliberty.json`** (AniLiberty, anime, one piece, site DOWN/)
- search: 11 results, e.g. Ван-Пис | Ван-Пис: Героини | Ванпанчмен
- stream: 3 source(s), e.g. `https://cache.libria.fun/videos/media/ts/10290/1/1080/6e7f45803b46cbc95dc61af79f55cb93.m3u`
**`anime-sama/anime-sama.json`** (Anime-Sama, anime, one piece, site UP)
- search: 5 results, e.g. One Piece | One Outs | One Punch Man
- stream: 3 source(s), e.g. `https://prx-1328-ant.vmpx.online/hls2/01/02888/3c5re3dv0g4u_,n,l,.urlset/master.m3u8?t=sk4`
**`animeav1/animeav1.json`** (AnimeAV1, anime, one piece, site UP)
- search: 20 results, e.g. One Piece | One Piece: Heroines | One Piece: Gyojin Tou-hen
- stream: 1 source(s), e.g. `https://player.zilla-networks.com/m3u8/7601658844858539e438dceee32e7924`
**`animedefenders/animedefenders.json`** (AnimeDefenders, anime, one piece, site UP)
- search: 20 results, e.g. ONE PIECE HEROINES | ONE PIECE: Gyojin Tou-hen | ONE PIECE STAMPEDE
- stream: 2 source(s), e.g. `https://playeng.animeapps.top/r2/cachesub/202607051717001080p67330700373019392/index.m3u8`
**`animegg/animegg.json`** (AnimeGG, anime, one piece, site UP)
- search: 78 results, e.g. One Piece: Episode of Merry - Mou Hitori no Nakama no Monogatari | One Piece | Toriko
- stream: 1 source(s), e.g. `https://www.animegg.org/play/265000/video.mp4?for=101789090939186`
**`animeland/animeland.json`** (AnimeLand, anime, one piece, site UP)
- search: 9 results, e.g. One Piece Adventure of Nebulandia | One Piece Episode of Sorajima | One Piece Densetsu no Log! Akagami no Shanks!
- stream: 1 source(s), e.g. `https://animesource.me/cache/opnebulandiadub1.html.mp4`
**`animelib/animelib.json`** (AnimeLib, anime, one piece, site UP)
- search: 60 results, e.g. ONE PIECE | One Piece Film: Red | One Piece: Baron Omatsuri and the Secret Island
- stream: 6 source(s), e.g. `https://cloud.solodcdn.com/useruploads/8d53f9b5-059c-49d9-9141-b5eb96b3af1f/8a48e1f657b1ef`
**`animenosub/animenosub.json`** (AnimeNoSub, anime, one piece, site UP)
- search: 9 results, e.g. One Piece: Heroines | ONE PIECE Season 2 (Live Action) | One Piece DUB
- stream: 2 source(s), e.g. `https://box-1400-p10.vmeas.cloud/hls2/04/02598/g4keh8hl6py5_,n,l,.urlset/master.m3u8?t=tdK`
**`AnimeUnity/AnimeUnity.json`** (AnimeUnity, anime, one piece, site UP)
- search: 30 results, e.g. One Piece | One Piece: Oounabara ni Hirake! Dekkai Dekkai Chichi no Yume! (ITA) | One Piece: Oounabara ni Hirake! Dekkai Dekkai Chichi no Yume!
- stream: 1 source(s), e.g. `https://au-d1-05.vix-content.net/download/4/2/91/291bf7a2-8a8d-4c43-bdc7-474263feebcb/1080`
**`animevost/animevost.json`** (AnimeVost, anime, one piece, site DOWN/)
- search: 24 results, e.g. Ван Пис: Бегство | Ван Пис (пайлот) | Ван Пис (фильм первый)
- stream: 2 source(s), e.g. `http://video.animetop.info/720/2147414641.mp4`
**`AnimeWorld/AnimeWorld.json`** (AnimeWorld, anime, one piece, site UP)
- search: 40 results, e.g. One Piece | One Piece (ITA) | One Piece: Episode of Skypiea
- stream: 1 source(s), e.g. `https://srv26-marte.sweetpixel.org/DDL/ANIME/OnePieceSUBITA/OnePiece_Ep_0001_SUB_ITA.mp4`
**`anineko/anineko.json`** (AniNeko, anime, one piece, site UP)
- search: 30 results, e.g. One Piece | Toriko | One Piece Movie 9: Episode of Chopper Plus - Fuyu ni Saku, Kiseki no Sakura
- stream: 6 source(s), e.g. `https://znOMC6AzQ2DC.premilkyway.com/hls2/01/12839/7s8h2dhneqk7_o/master.m3u8?t=cW1cyGVE9g`
**`anitube/anitube.json`** (AniTube, anime, one piece, site UP)
- search: 6 results, e.g. One Piece: Heroines – Todos os Episódios | One Piece: A Série 2ª Temporada Dublado – Todos os Episódios | One Piece Log – Fish-Man Island Saga – Todos os Episódios
- stream: 1 source(s), e.g. `https://cdn-s01.mywallpaper-4k-image.net/stream/o/one-piece-heroines/01.mp4/index.m3u8`
**`aniwave/aniwave.json`** (Aniwave, anime, one piece, site UP)
- search: 24 results, e.g. One Piece | One Piece: Clockwork Island Adventure | One Piece: The Movie
- stream: 2 source(s), e.g. `https://ru-cdn2.echovideo.to/cdn/092e3d2d14736a0ad53867906eb1495fdefdbcea5dbde581b5705e2a3`
**`blackCloverPace/blackCloverPace.json`** (Black Clover Pace, anime, one piece, site UP)
- search: 2 results, e.g. Black Clover Pace [SUB] | Black Clover Pace [DUB]
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/d7xNJbwb?download`
**`borucut/borucut.json`** (Borucut, anime, one piece, site UP)
- search: 5 results, e.g. Chunin Exams/Versus Momoshiki Arc | Mujina Bandits Arc | Ao/Vessel Arc
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/Ly7PvjBu?download`
**`chireads/chireads.json`** (ChiReads, novels, solo leveling, site UP)
- search: 43 results, e.g. Le Maître des Secrets | Lord of the Mysteries | 诡秘之主 | La Tribulation des Myriades de Races_万族之劫 | Le Monde des Mages | Warlock of the Magus World | 巫界术士
- text: 11689 chars
**`comix/comix.json`** (Comix, mangas, one piece, site UP)
- search: 28 results, e.g. Youth Set Meal | Nobody | Tsuyoshi - Daremo Katenai, Aitsu ni wa
- images: 306
**`concentratedBleach/concentratedBleach.json`** (Concentrated Bleach, anime, one piece, site UP)
- search: 6 results, e.g. 01 - Substitute Soul Reaper [Sub] | 02 - Soul Society [Sub] | 03 - Arrancar [Sub]
- stream: 1 source(s), e.g. `https://pixeldrain.com/api/filesystem/%2FrwPVCu7Z%2F01%20-%20Substitute%20Soul%20Reaper%20`
**`dbzRecut/dbzRecut.json`** (DBZ Recut, anime, one piece, site UP)
- search: 4 results, e.g. Saiyan Arc | Freeza Arc | Cell Arc
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/3ftz4zKv?download`
**`dragonballrecut/dragonballrecut.json`** (Dragon Ball Recut, anime, one piece, site UP)
- search: 1 results, e.g. Dragon Ball Recut
- stream: 1 source(s), e.g. `https://archive.org/download/dragon-ball-recut/Dragon.Ball.Recut.E01.v2.Bulma.and.Son.Goku`
**`flixlatam/flixlatam.json`** (FlixLatam, movies/shows/anime, one piece, site UP)
- search: 10 results, e.g. One Piece | One Piece | ONE PIECE FILM RED
- stream: 1 source(s), e.g. `https://morencius.com/stream/MhX43trFtnhnyXWw0dW7ew/hjkrhuihghfvu/1789134138/25568081/mast`
**`gidonline/gidonline.json`** (GidOnline, anime/movies/shows, one piece, site UP)
- search: 3 results, e.g. Сериал: Ван-Пис | Ван-Пис: Красный | Аниме: Ван-Пис
- stream: 2 source(s), e.g. `https://hye1eaipby4w.interkh.com/06_22_25/06/22/19/KVP26X5F/77OYDCX4.mp4/master.m3u8?fckz2`
**`henaojara/henaojara.json`** (AnimeJara, anime/movies, one piece, site UP)
- search: 3 results, e.g. One Piece Live Action | One Piece: Stampede | One Piece TV
- stream: 1 source(s), e.g. `https://strm6.uqload.vc/hls2/02/02210/9azmo0k9pkwj_n/master.m3u8?t=sx_hYRHy224Q1ot81d7mtio`
**`hydrahd/hydrahd-shirox.json`** (HydraHD (Shirox), movies/shows/anime, one piece, site UP)
- search: 14 results, e.g. One Piece | ONE PIECE | One Piece Film Red
- stream: 5 source(s), e.g. `https://moon.peakstorm.top/vd/SUpVaFlTVExFMkJ0UUptenBSczJuZzp4bHVFem5SbzhsaHpZRjE2Y0RNUEFq`
**`hydrahd/hydrahd.json`** (HydraHD, movies/shows/anime, one piece, site UP)
- search: 14 results, e.g. One Piece | ONE PIECE | One Piece Film Red
- stream: 5 source(s), e.g. `https://moon.peakstorm.top/vd/SUpVaFlTVExFMkJ0UUptenBSczJuZzp4bHVFem5SbzhsaHpZRjE2Y0RNUEFq`
**`imdb/imdb.json`** (IMDb, shows/movies/anime, one piece, site UP)
- search: 55 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://brandpositioningstudio.site/HXST6ZQIP/pl/H4sIAAAAAAAAAwXB226DIAAA0F_iEk27x05lKmBVL`
**`iptv-org/iptv-org.json`** (IPTV-org, anime/movies/shows, one piece, site UP)
- search: 6 results, e.g. One Piece | One Piece | One Piece
- stream: 1 source(s), e.g. `https://jmp2.uk/plu-624b1c8d4321e200073ee421.m3u8`
**`kissasian/kissasian.json`** (KissAsian, movies/shows/anime, one piece, site UP)
- search: 1 results, e.g. One Piece
- stream: 1 source(s), e.g. `https://player.dramavideo.se/media/soon.mp4`
**`kisskh/kisskh.json`** (Kisskh, anime/movies/shows, lovely runner, site UP)
- search: 21 results, e.g. Lovely Runner | My Lovely Liar | Lovely Writer
- stream: 1 source(s), e.g. `https://hls.cdnvideo11.shop/hls07/8792/Ep1_index.m3u8?v=iju4hadrvsv`
**`lmanime/lmanime.json`** (LmAnime, anime, one piece, site UP)
- search: 2 results, e.g. The Chosen One | Keyboard Immortal
- stream: 1 source(s), e.g. `https://cdndirector.dailymotion.com/cdn/manifest/video/x9rix6o.m3u8?sec=IVZ3R0LJ6GRGLdFHPL`
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
- stream: 7 source(s), e.g. `https://box-1552-e.vmeas.cloud/hls2/03/02108/na2vrsevfe89_,n,l,.urlset/master.m3u8?t=8j0lQ`
**`nimegami/nimegami.json`** (Nimegami, anime, one piece, site UP)
- search: 7 results, e.g. One Piece Film: Red | One Piece Film: Z | One Piece Film: Gold
- stream: 2 source(s), e.g. `https://cdn-cf.berkasdrive.com/public/8f9f02cb6a74f3e541a83625e1df3c2f14e83be8-AQ1Xpj.mp4?`
**`onetouch/onetouch.json`** (OneTouch TV, shows/movies/anime, one piece, site UP)
- search: 2 results, e.g. One Piece Season 2: Into the Grand Line (2026) | One Piece (2023)
- stream: 1 source(s), e.g. `https://aapanel.devcorp.me/assets/0056513e-4d5c-51ea-ad15-51cbc6086cd5.m3u8`
**`onigashima/onigashima.json`** (Onigashima Paced, anime, one piece, site UP)
- search: 1 results, e.g. Onigashima Paced
- stream: 1 source(s), e.g. `https://pixeldrain.net/api/file/ZDs9YsGk?download`
**`onwave/onwave.json`** (OnWave, anime, one piece, site UP)
- search: 24 results, e.g. Ван-Пис | Ван-Пис 14: Паническое бегство | Ван Пис 2
- stream: 3 source(s), e.g. `https://cloud.solodcdn.com/useruploads/6af7b6ba-2fcc-4b38-81b9-2d142fcc8618/07c5c0a8ce50da`
**`otaku-streamers/otaku-streamers.json`** (Otaku-Streamers, anime, one piece, site UP)
- search: 8 results, e.g. One Piece | One Piece: Strong World | One Piece Film Z
- stream: 1 source(s), e.g. `https://vid17.otaku-streamers.com/s/-mV-SsMgggal6onAYvtGLCUTQRJzgXVFMGsyHB7ajYmW5hc_jR8dxo`
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
**`StreamingUnity/StreamingUnity.json`** (StreamingUnity, shows/movies, one piece, site UP)
- search: 60 results, e.g. ONE PIECE | Pieces of a Woman | Giorno per giorno
- stream: 1 source(s), e.g. `https://vixcloud.co/playlist/682356?token=1551770293ac60bd968089787f1c538e&expires=1794274`
**`toontales/toontales.json`** (ToonTales, shows, one piece, site UP)
- search: 9 results, e.g. Blue Rhythm | Grand Canyonscope | The Barnyard Concert
- stream: 1 source(s), e.g. `https://ww.toontales.net/dd/blue-rhythm.mp4`
**`vidcore/vidcore.json`** (VidCore, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 3 source(s), e.g. `https://moon.peakstorm.top/r2/cdn2/Z2ZFNG1yRlgyUzh2cVkzNVd1V0FRUTpzOGlUYzU1Mzc3SE5qNDdPa3d`
**`videasy/videasy.json`** (VidEasy, shows/movies/anime, one piece, site UP)
- search: 70 results, e.g. ONE PIECE | One Piece | One Piece Heroines
- stream: 8 source(s), e.g. `https://moon.peakstorm.top/r2/cdn1/b1Q1R2dEbTBIT1JXb0NIenZwT3lUUTplQktrZWYxLUhZWkRUMXY2UjF`
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
**`yummyanime/yummyanime.json`** (yummyanime, anime, one piece, site UP)
- search: 30 results, e.g. Ван-Пис: Приключения доктора Чоппера — Маскарад предателей | Ван-Пис | Ван-Пис: Остров Рыболюдей
- stream: 1 source(s), e.g. `https://cloud.solodcdn.com/useruploads/d9284598-85e3-482c-b8fb-6944baa3be36/8d836e5fa89c12`
