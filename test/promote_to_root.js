/* promote_to_root.js — promote ACTIVE modules from examples/ to repo root.
 *
 * For each module: copies <mod>.js (plus any non-json assets) into root/<mod>/
 * and writes <mod>.json in the xdfkenny-sora-modules manifest format:
 *   - scriptUrl/scriptURL -> raw github URL of the new location
 *   - iconUrl/iconURL normalized
 *   - baseUrl + searchBaseUrl (with %s) guaranteed
 *   - streamType/quality normalized for novels/mangas
 * Then registers each module in modules.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'examples');
const RAW = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main/';
const RAW_REPO = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules';

/* module folder -> extra metadata for modules.json + manifest overrides */
const PROMOTE = {
  aniliberty:   { name: 'AniLiberty',   category: 'anime',               query: 'one piece' },
  animegg:      { name: 'AnimeGG',      category: 'anime',               query: 'one piece' },
  animevost:    { name: 'AnimeVost',    category: 'anime',               query: 'one piece' },
  'iptv-org':   { name: 'IPTV-org',     category: 'movies/shows/anime',  query: 'one piece' },
  kisskh:       { name: 'Kisskh',       category: 'movies/shows/anime',  query: 'lovely runner' },
  lmanime:      { name: 'LmAnime',      category: 'anime',               query: 'one piece' },
  lncrawler:    { name: 'LnCrawler',    category: 'novels',              query: 'solo leveling' },
  mangadex:     { name: 'MangaDex',     category: 'mangas',              query: 'one piece', baseUrl: 'https://mangadex.org/', searchBaseUrl: 'https://mangadex.org/search?q=%s', streamType: 'mangas', quality: 'N/A' },
  nimegami:     { name: 'Nimegami',     category: 'anime',               query: 'one piece' },
  nivod:        { name: 'Nivod',        category: 'movies/shows/anime',  query: 'one piece' },
  onetouch:     { name: 'OneTouch TV',  category: 'shows/movies/anime',  query: 'one piece' },
  onwave:       { name: 'OnWave',       category: 'anime',               query: 'one piece' },
  yummyanime:   { name: 'YummyAnime',   category: 'anime',               query: 'one piece' }
};

function ensureUrlWithParam(url, base) {
  if (!url) return null;
  if (url.includes('%s')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'q=%s';
}

function transformManifest(folder, json) {
  const meta = PROMOTE[folder] || {};
  const out = {};

  // pick icon url (both aliases kept like root modules do)
  let icon = json.iconUrl || json.iconURL || '';
  if (meta && json.iconURL && !json.iconUrl) icon = json.iconURL;
  out.iconUrl = icon;
  if (icon) out.iconURL = icon;

  out.author = json.author || { name: 'xdfkenny' };
  if (out.author.iconURL && !out.author.icon) out.author.icon = out.author.iconURL;
  delete out.author.iconURL;

  out.description = json.description || (json.sourceName ? json.sourceName + ' — Sora module promoted from the examples library.' : '');
  out.version = json.version || '1.0.0';
  out.language = json.language || 'English';
  out.streamType = meta.streamType || json.streamType || (String(json.type || '').includes('manga') ? 'mangas' : 'HLS');
  out.quality = meta.quality || json.quality || (out.streamType === 'mangas' || out.streamType === 'novels' ? 'N/A' : '1080p');
  out.baseUrl = meta.baseUrl || json.baseUrl || (json.type === 'mangas' ? 'https://mangadex.org/' : '');
  out.searchBaseUrl = meta.searchBaseUrl || ensureUrlWithParam(json.searchBaseUrl || json.searchBaseURL || out.baseUrl, out.baseUrl) || '';
  out.scriptUrl = RAW + folder + '/' + folder + '.js';
  out.scriptURL = out.scriptUrl;
  out.type = json.type || (out.streamType === 'novels' ? 'novels' : out.streamType === 'mangas' ? 'mangas' : 'anime');
  if (json.novel === true) { out.novel = true; out.type = 'novels'; }
  out.asyncJS = true;
  if (json.streamAsyncJS !== undefined) out.streamAsyncJS = json.streamAsyncJS;

  for (const key of ['downloadSupport', 'combo', 'softsub', 'supportsMojuru', 'supportsDartotsu',
    'supportsSora', 'supportsLuna', 'supportsAnymex', 'supportsTsumi', 'supportsHiyoku',
    'supportsShirox', 'supportsEclipse', 'note', 'languageType']) {
    if (json[key] !== undefined) out[key] = json[key];
  }
  return out;
}

const promoted = [];
for (const folder of Object.keys(PROMOTE)) {
  const srcDir = path.join(EXAMPLES, folder);
  const dstDir = path.join(ROOT, folder);
  if (!fs.existsSync(srcDir)) { console.error('MISSING examples/' + folder); continue; }
  if (fs.existsSync(dstDir)) { console.error('TARGET EXISTS: ' + folder + ' — skipping'); continue; }
  fs.mkdirSync(dstDir, { recursive: true });

  // copy all non-json files (js + icons)
  for (const f of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, f);
    if (fs.statSync(s).isDirectory()) continue;
    if (f.toLowerCase().endsWith('.json')) continue;
    fs.copyFileSync(s, path.join(dstDir, f));
  }

  // load manifest and transform
  const json = JSON.parse(fs.readFileSync(path.join(srcDir, folder + '.json'), 'utf8').replace(/^\uFEFF/, ''));
  const out = transformManifest(folder, json);
  fs.writeFileSync(path.join(dstDir, folder + '.json'), JSON.stringify(out, null, 2) + '\n');
  promoted.push({ folder, meta: PROMOTE[folder], manifest: out });
  console.log('PROMOTED ' + folder + '/');
}

/* ---- modules.json registration ---- */
const indexPath = path.join(ROOT, 'modules.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const existing = new Set(index.modules.map(m => m.id));
let added = 0;
for (const p of promoted) {
  if (existing.has(p.folder)) continue;
  index.modules.push({
    id: p.folder,
    name: p.meta.name,
    iconUrl: p.manifest.iconUrl || '',
    category: p.meta.category,
    branch: 'main',
    manifestUrl: RAW_REPO + '/main/' + p.folder + '/' + p.folder + '.json',
    sampleQuery: p.meta.query
  });
  added++;
}
index.lastUpdated = '2026-09-09';
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log('Registered ' + added + ' new modules in modules.json (total ' + index.modules.length + ').');
console.log('PROMOTED: ' + promoted.map(p => p.folder).join(', '));