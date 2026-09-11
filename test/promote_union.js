/* promote_union.js — promote ACTIVE modules from the git.luna-app.eu/_union
 * library into repo-root folders, following the repo manifest format.
 *
 * For each folder with at least one ACTIVE unit (test/audit-union.json):
 *   - NEW folder (not yet at root): full copy of union/<folder> -> root/<folder>,
 *     then every manifest inside is normalized:
 *       * scriptUrl/scriptURL -> raw.githubusercontent URL of the copied script
 *       * module.json renamed to <folder>.json (sobet convention)
 *       * local icon (icon.png/icon.jpg/... at folder root) -> own raw URL
 *       * type/streamType/quality conventions ensured for mangas/novels
 *   - EXISTING root folder: union files copied over (code refresh), root
 *     manifest merged with union manifest (root fields win), scriptUrl rewired.
 * Then modules.json entries are added for every newly promoted folder.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UNION = path.join(ROOT, 'git.luna-app.eu', '_union');
const RAW = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/';
const RAW_REPO = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules';

const audit = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-union.json'), 'utf8'));

// ---- collect ACTIVE units grouped by folder ----
const activeUnits = new Map(); // folder -> [{ relJson, reason }]
for (const r of audit.results) {
  if (r.status.level !== 'ACTIVE') continue;
  const idx = r.id.indexOf('/');
  const folder = r.id.slice(0, idx);
  const relJson = r.id.slice(idx + 1);
  if (!activeUnits.has(folder)) activeUnits.set(folder, []);
  activeUnits.get(folder).push({ relJson, reason: r.status.reason });
}

// ---- display metadata for modules.json ----
const DISPLAY = {
  '123anime': '123Anime', aether: 'Aether', airflix: 'AirFlix', an1me: 'An1me',
  anidub: 'AniDub', 'anime-sama': 'AnimeSama', animeav1: 'AnimeAv1',
  animedefenders: 'AnimeDefenders', animelib: 'AnimeLib', animenosub: 'AnimeNoSub',
  AnimeUnity: 'AnimeUnity', AnimeWorld: 'AnimeWorld', anineko: 'AniNeko',
  anitube: 'AniTube', aniwave: 'AniWave', blackCloverPace: 'Black Clover Pace',
  borucut: 'Boruto Cut', chireads: 'ChiReads', concentratedBleach: 'Concentrated Bleach',
  dbzRecut: 'DBZ Recut', dragonballrecut: 'DragonBall Recut', gidonline: 'GidOnline',
  imdb: 'IMDb', mangabuddy: 'MangaBuddy', mangafreak: 'MangaFreak',
  mangaworld: 'MangaWorld', monoschinos2: 'MonosChinos 2', nakanime: 'Nakanime',
  onigashima: 'Onigashima', 'otaku-streamers': 'Otaku Streamers', peachify: 'Peachify',
  readnovels: 'ReadNovels', 'scan-sama': 'Scan Sama', streamcloud: 'StreamCloud',
  StreamingUnity: 'StreamingUnity', toontales: 'ToonTales', vidcore: 'VidCore',
  videasy: 'VidEasy', vidfast: 'VidFast', 'voir-anime': 'VoirAnime',
  weebcentral: 'WeebCentral', xpass: 'XPass'
};
const CAT = {
  chireads: 'novels', lncrawler: 'novels', readnovels: 'novels',
  mangabuddy: 'mangas', mangafreak: 'mangas', mangaworld: 'mangas',
  mangadex: 'mangas', 'scan-sama': 'mangas', weebcentral: 'mangas',
  imdb: 'movies/shows/anime', 'voir-anime': 'movies/shows/anime',
  streamcloud: 'movies/shows/anime', xpass: 'movies/shows/anime',
  airflix: 'movies/shows/anime', gidonline: 'movies/shows/anime',
  StreamingUnity: 'movies/shows/anime', aether: 'movies/shows/anime',
  aniwave: 'anime', 'otaku-streamers': 'anime'
};

function prettyName(folder) {
  if (DISPLAY[folder]) return DISPLAY[folder];
  return folder.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function categoryFor(folder, type) {
  if (CAT[folder]) return CAT[folder];
  if (String(type).includes('manga')) return 'mangas';
  if (String(type).includes('novel')) return 'novels';
  return 'anime';
}
function queryFor(folder, type) {
  if (String(type).includes('novel')) return 'solo leveling';
  return 'one piece';
}

const toPosix = p => p.split(path.sep).join('/');

// find a file by basename inside dir (recursive); prefer shallowest.
function findScript(dir, basename) {
  const hits = [];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== '.git') walk(path.join(d, e.name), depth + 1); }
      else if (e.name.toLowerCase() === basename.toLowerCase()) hits.push({ p: path.join(d, e.name), depth });
    }
  };
  walk(dir, 0);
  hits.sort((a, b) => a.depth - b.depth);
  return hits[0] ? path.relative(dir, hits[0].p) : null;
}

function findLocalIcon(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|gif|webp|ico)$/i.test(f));
  const pref = ['icon.png', 'icon.jpg', 'icon.jpeg', 'icon.ico', 'favicon.png', 'apple-touch-icon.png'];
  for (const p of pref) if (files.includes(p)) return p;
  return files[0] || null;
}

function normalizeType(j, out) {
  const t = String(j.type || '');
  out.type = t || (j.novel ? 'novels' : j.streamType === 'mangas' ? 'mangas' : 'anime');
  if (t.includes('manga') || j.streamType === 'mangas') {
    out.streamType = j.streamType || 'mangas';
    out.quality = j.quality || 'N/A';
    out.type = 'mangas';
  } else if (t.includes('novel') || j.novel === true) {
    out.streamType = j.streamType || 'novels';
    out.quality = j.quality || 'N/A';
    out.type = 'novels';
    out.novel = true;
  }
  if (out.novel) out.type = 'novels';
  if (j.asyncJS === undefined) out.asyncJS = true; else out.asyncJS = j.asyncJS;
}

/* normalize one manifest file (path inside the promoted root folder) */
function normalizeManifest(rootFolderDir, folder, relJson, renameTo) {
  const full = path.join(rootFolderDir, relJson);
  if (!fs.existsSync(full)) { console.error('  ! manifest missing: ' + relJson); return null; }
  const j = JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
  const out = { ...j };

  // script URL rewire
  const scriptBasename = path.basename(out.scriptUrl || out.scriptURL || '');
  const relScript = findScript(rootFolderDir, scriptBasename);
  if (relScript) {
    out.scriptUrl = RAW + folder + '/' + toPosix(relScript);
    out.scriptURL = out.scriptUrl;
  } else {
    console.error('  ! cannot resolve script ' + (scriptBasename || '(none)') + ' in ' + folder);
  }

  // local icon
  const icon = findLocalIcon(rootFolderDir);
  if (icon && !/^https:\/\//.test(out.iconUrl || '')) {
    // keep the union icon if it is already absolute/working; only override for
    // icons pointing at git.luna-app.eu raw (unreachable from clients)
  }
  if (icon && String(out.iconUrl || '').includes('git.luna-app.eu')) {
    out.iconUrl = RAW + folder + '/' + icon;
    out.iconURL = out.iconUrl;
  }

  normalizeType(j, out);
  if (renameTo && relJson.toLowerCase() === 'module.json') {
    fs.renameSync(full, path.join(rootFolderDir, renameTo));
  }
  // write back
  const target = (relJson.toLowerCase() === 'module.json' && renameTo)
    ? path.join(rootFolderDir, renameTo) : full;
  fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  return out;
}

// ---- main loop ----
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules.json'), 'utf8'));
const existingIds = new Set(index.modules.map(m => m.id));
const candidates = [...activeUnits.keys()].sort();
const newlyPromoted = [];
const refreshed = [];

for (const folder of candidates) {
  const srcDir = path.join(UNION, folder);
  if (!fs.existsSync(srcDir)) { console.error('MISSING union/' + folder); continue; }
  const dstDir = path.join(ROOT, folder);
  const isRefresh = fs.existsSync(dstDir);

  // copy union folder -> root
  fs.mkdirSync(dstDir, { recursive: true });
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    fs.cpSync(path.join(srcDir, e.name), path.join(dstDir, e.name), { recursive: true, force: true });
  }

  if (isRefresh) {
    // merge manifests: root manifest wins on present fields
    let changed = 0;
    for (const { relJson } of activeUnits.get(folder)) {
      const srcM = path.join(srcDir, relJson);
      if (!fs.existsSync(srcM)) continue;
      const dstM = path.join(dstDir, relJson);
      if (!fs.existsSync(dstM)) continue;
      const u = JSON.parse(fs.readFileSync(srcM, 'utf8').replace(/^\uFEFF/, ''));
      let r = {};
      try { r = JSON.parse(fs.readFileSync(dstM, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { r = {}; }
      const merged = { ...u, ...r };
      const relScript = findScript(dstDir, path.basename(u.scriptUrl || u.scriptURL || ''));
      if (relScript) {
        merged.scriptUrl = RAW + folder + '/' + toPosix(relScript);
        merged.scriptURL = merged.scriptUrl;
      }
      normalizeType({ ...u, ...r }, merged);
      fs.writeFileSync(dstM, JSON.stringify(merged, null, 2) + '\n');
      changed++;
    }
    refreshed.push(folder);
    console.log('REFRESHED ' + folder + '/ (' + changed + ' manifest(s))');
  } else {
    // new folder: normalize every json manifest under it
    const jsons = [];
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name), rel + '/' + e.name);
        else if (e.name.endsWith('.json')) jsons.push((rel + '/' + e.name).replace(/^\//, ''));
      }
    };
    walk(dstDir, '');
    for (const relJson of jsons) normalizeManifest(dstDir, folder, relJson, folder + '.json');
    newlyPromoted.push(folder);
    console.log('PROMOTED ' + folder + '/ (' + jsons.length + ' manifest(s))');
  }
}

// ---- modules.json registration ----
let added = 0;
for (const folder of newlyPromoted) {
  if (existingIds.has(folder)) continue;
  const dir = path.join(ROOT, folder);
  const primary = folder + '.json';
  const primaryPath = path.join(dir, primary);
  const manifestFile = fs.existsSync(primaryPath) ? primary
    : (fs.readdirSync(dir).find(f => f.endsWith('.json')) || primary);
  const man = JSON.parse(fs.readFileSync(path.join(dir, manifestFile), 'utf8').replace(/^\uFEFF/, ''));
  index.modules.push({
    id: folder,
    name: prettyName(folder),
    iconUrl: man.iconUrl || '',
    category: categoryFor(folder, man.type),
    branch: 'main',
    manifestUrl: RAW_REPO + '/main/' + folder + '/' + manifestFile,
    sampleQuery: queryFor(folder, man.type)
  });
  added++;
}
index.lastUpdated = '2026-09-10';
fs.writeFileSync(path.join(ROOT, 'modules.json'), JSON.stringify(index, null, 2) + '\n');
console.log('\nNewly promoted: ' + newlyPromoted.length + ' | refreshed: ' + refreshed.length);
console.log('New: ' + newlyPromoted.join(', '));
console.log('Refreshed: ' + refreshed.join(', '));
console.log('modules.json modules: ' + index.modules.length + ' (+' + added + ')');