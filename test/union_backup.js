/* union_backup.js — build a flat union library from the git.luna-app.eu backup repos.
 *
 * For each module folder found in the prioritized backup repos, copies it (first
 * source wins on name collision) into <backup>/_union/. A folder counts as a
 * module when it contains a *.json manifest mentioning scriptUrl|scriptURL|sourceName.
 *
 * Priority: 50n50_sources -> Cufiy_sora-modules/modules -> sobet_sources ->
 * anonymous_sources -> Cufiy_services-fork -> MXFia19_sources -> Churly_AllAnime/AllAnime.
 * ibro_services is byte-identical to Cufiy_services-fork, so it is skipped.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKUP = path.join(ROOT, 'git.luna-app.eu');
const UNION = path.join(BACKUP, '_union');

const SOURCES = [
  '50n50_sources',
  'Cufiy_sora-modules/modules',
  'sobet_sources',
  'anonymous_sources',
  'Cufiy_services-fork',
  'MXFia19_sources',
  'Churly_AllAnime/AllAnime'
];

const looksLikeModule = (dir) => {
  let json;
  try { json = fs.readdirSync(dir); } catch (e) { return false; }
  return json.some(f => f.endsWith('.json') && (() => {
    try {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      return /"script(Url|URL)"|"sourceName"/.test(txt);
    } catch (e) { return false; }
  })());
};

const copyDir = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
};

const copied = new Set();
const skipped = [];

for (const srcRel of SOURCES) {
  const srcRoot = path.join(BACKUP, srcRel);
  if (!fs.existsSync(srcRoot)) { console.log('MISSING source: ' + srcRel); continue; }
  const entries = fs.readdirSync(srcRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name;
    if (name.startsWith('.') || name.startsWith('-')) continue;
    const srcDir = path.join(srcRoot, name);
    if (!looksLikeModule(srcDir)) continue;
    if (copied.has(name)) { skipped.push(name + ' (dup from ' + srcRel + ')'); continue; }
    copyDir(srcDir, path.join(UNION, name));
    copied.add(name);
    console.log('+ ' + name + '  <-  ' + srcRel);
  }
}

// special-case: Churly_AllAnime/AllAnime itself is one module (dir name AllAnime)
const allanime = path.join(BACKUP, 'Churly_AllAnime', 'AllAnime');
if (fs.existsSync(allanime) && !copied.has('AllAnime') && looksLikeModule(allanime)) {
  copyDir(allanime, path.join(UNION, 'AllAnime'));
  copied.add('AllAnime');
  console.log('+ AllAnime  <-  Churly_AllAnime/AllAnime');
}

console.log('\nUnion: ' + copied.size + ' module folders -> ' + UNION);
if (skipped.length) console.log('Skipped duplicates: ' + skipped.join(' | '));
console.log('Files copied: ' + (fs.readdirSync(UNION, { recursive: true }).length || 0) + ' entries');