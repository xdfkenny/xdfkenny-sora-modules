/* audit_examples.js — full-stack health check for every module in examples/
 *
 * Tests the local (disk) manifest + script for each module folder in
 * examples/ against the Sora module contracts:
 *   video : searchResults → extractDetails → extractEpisodes → extractStreamUrl
 *   novel : searchResults → extractDetails → extractChapters → extractText
 *   manga : searchResults → extractDetails → extractChapters → extractImages
 *
 * Uses the same sandbox + curl/cookie-jar fetcher as server.js (no browser
 * globals; fetchv2 shimmed). Writes test/audit-examples.json + .md report.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXAMPLE_ROOT_DIR = path.resolve(ROOT, process.env.AUDIT_DIR || 'examples');
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY) || 6;
const STEP_TIMEOUT = Number(process.env.AUDIT_STEP_TIMEOUT) || 25000;
const MODULE_TIMEOUT = Number(process.env.AUDIT_MODULE_TIMEOUT) || 130000;

/* Some third-party module sources ship top-level `main()` scaffolding that
   fires an async reference error on load (e.g. mangapark.js calling an
   undefined helper). Swallow so one broken module can't kill the audit run. */
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.stack ? reason.stack : String(reason);
  fs.appendFileSync(path.join(__dirname, 'audit-rejections.log'), '[' + new Date().toISOString() + '] ' + msg + '\n');
});

/* Keyword per module id. Falls back to type-based defaults ("one piece"). */
const KEYWORDS = {
  kisskh: 'lovely runner',
  asia2tv: 'lovely runner',
  donghuastream: '海贼王',
  luciferdonghua: '海贼王',
  xiaoxintv: '海贼王',
  rumanhua1: '海贼王',
};

/* ------------------------------------------------------------------ */
/* network shim (same as server.js)                                    */
/* ------------------------------------------------------------------ */
const FORBIDDEN_HEADERS = new Set([
  'host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'upgrade'
]);

function parseHeaderDump(dump) {
  const map = new Map();
  if (!dump) return map;
  const lines = String(dump).split(/\r?\n/);
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'set-cookie') {
      map.set(name, (map.get(name) || '') + (map.has(name) ? '\n' : '') + value);
    } else {
      map.set(name, value);
    }
  }
  return map;
}

let curlPath = null;
function resolveCurl(cb) {
  if (curlPath !== null) return cb(curlPath);
  execFile('curl', ['--version'], { timeout: 5000 }, (err) => {
    curlPath = err ? '' : 'curl';
    if (err) execFile('curl.exe', ['--version'], { timeout: 5000 }, (err2) => {
      if (!err2) curlPath = 'curl.exe';
      cb(curlPath);
    });
    else cb(curlPath);
  });
}

function curlRequest(url, opts) {
  return new Promise((resolve, reject) => {
    resolveCurl((bin) => {
      if (!bin) return reject(new Error('curl no disponible'));
      const method = opts.method || 'GET';
      const tmp = path.join(os.tmpdir(), 'xdf_audit_' + process.pid + '_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.txt');
      const args = ['-sS', '--max-time', '25'];
      if (method === 'HEAD') args.push('-I');
      else args.push('-L', '--compressed', '-X', method);
      for (const k in (opts.headers || {})) args.push('-H', k + ': ' + opts.headers[k]);
      if (opts.body != null) args.push('--data-binary', opts.body);
      args.push('-D', tmp, '-w', '\n__XDF_STATUS__%{http_code}');
      args.push(url);
      execFile(bin, args, { maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
        let headers = null;
        try { headers = parseHeaderDump(fs.readFileSync(tmp, 'utf8')); } catch (e) { /* ignore */ }
        try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
        if (err) return reject(new Error('curl: ' + (err.message || err)));
        const mark = '\n__XDF_STATUS__';
        const idx = stdout.lastIndexOf(mark);
        const status = idx >= 0 ? parseInt(stdout.slice(idx + mark.length).trim(), 10) : 0;
        const text = idx >= 0 ? stdout.slice(0, idx) : stdout;
        resolve({ ok: status >= 200 && status < 300, status, text, headers });
      });
    });
  });
}

async function httpRequest(url, opts) {
  if (curlPath !== '') {
    try { return await curlRequest(url, opts); }
    catch (e) { /* fall back to fetch */ }
  }
  const fetchOpts = { method: opts.method || 'GET', headers: {}, redirect: 'follow' };
  for (const k in (opts.headers || {})) fetchOpts.headers[k] = opts.headers[k];
  if (opts.body != null) fetchOpts.body = opts.body;
  const resp = await fetch(url, fetchOpts);
  return { ok: resp.ok, status: resp.status, text: await resp.text(), finalUrl: resp.url, headers: resp.headers };
}

function makeFetcher() {
  const jar = new Map();
  return async function fetcher(url, headers, method, body) {
    const cleanHeaders = {};
    let hasCookie = false;
    for (const k in (headers || {})) {
      if (FORBIDDEN_HEADERS.has(String(k).toLowerCase())) continue;
      if (String(k).toLowerCase() === 'cookie') hasCookie = true;
      cleanHeaders[k] = headers[k];
    }
    if (jar.size && !hasCookie) {
      const parts = [];
      for (const [name, value] of jar) parts.push(name + '=' + value);
      cleanHeaders['Cookie'] = parts.join('; ');
    }
    const resp = await httpRequest(url, { method: method || 'GET', headers: cleanHeaders, body });
    if (resp.headers) {
      const setCookies = resp.headers.get ? resp.headers.get('set-cookie') : null;
      if (setCookies) {
        for (const part of String(setCookies).split('\n')) {
          const kv = part.split(';')[0];
          const eq = kv.indexOf('=');
          if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
        }
      }
    }
    const text = resp.text;
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: '',
      url: resp.finalUrl || url,
      headers: resp.headers || new Map(),
      text: async () => text,
      json: async () => {
        try { return JSON.parse(text); }
        catch (e) { throw new Error('JSON invalid from ' + url + ': ' + e.message); }
      }
    };
  };
}

/* ------------------------------------------------------------------ */
/* module sandbox                                                      */
/* ------------------------------------------------------------------ */
function loadModule(src) {
  const fetcher = makeFetcher();
  const sandboxConsole = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
  const factory = new Function(
    'fetch', 'fetchv2', 'window', 'console', 'location', 'module', 'exports',
    src + '\n;return {' +
      'searchResults, extractDetails,' +
      'extractEpisodes: typeof extractEpisodes !== "undefined" ? extractEpisodes : null,' +
      'extractStreamUrl: typeof extractStreamUrl !== "undefined" ? extractStreamUrl : null,' +
      'extractChapters: typeof extractChapters !== "undefined" ? extractChapters : null,' +
      'extractText: typeof extractText !== "undefined" ? extractText : null,' +
      'extractImages: typeof extractImages !== "undefined" ? extractImages : null' +
    '};'
  );
  const windowShim = { fetch: fetcher, fetchv2: fetcher };
  return factory(fetcher, fetcher, windowShim, sandboxConsole, undefined, { exports: {} }, {});
}

/* ------------------------------------------------------------------ */
/* discovery                                                           */
/* ------------------------------------------------------------------ */
function localScriptFor(dir, basename) {
  const target = (basename || '').replace(/^.*\//, '').split('?')[0];
  if (!target) return null;
  const candidates = [target];
  if (target.startsWith('_')) candidates.push(target.slice(1));
  else candidates.push('_' + target);
  const hits = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      if (!fs.statSync(fp).isDirectory()) hits.push(fp);
      else walk(fp);
    }
  })(dir);
  const lower = candidates.map(c => c.toLowerCase());
  const found = hits.find(fp => lower.includes(path.basename(fp).toLowerCase()));
  return found || null;
}

function discoverUnits() {
  const dirs = fs.readdirSync(EXAMPLE_ROOT_DIR)
    .filter(d => !d.startsWith('.'))
    .map(d => path.join(EXAMPLE_ROOT_DIR, d))
    .filter(p => fs.statSync(p).isDirectory());
  const units = [];
  for (const dir of dirs) {
    const folderName = path.basename(dir);
    const jsons = [];
    (function walk(d) {
      for (const f of fs.readdirSync(d)) {
        const fp = path.join(d, f);
        if (fs.statSync(fp).isDirectory()) {
          if (['v1', 'v2', 'arabic', 'dub', 'hardsub', '.gitea'].includes(f)) continue;
          walk(fp);
        } else if (f.toLowerCase().endsWith('.json')) {
          jsons.push(fp);
        }
      }
    })(dir);
    for (const jsonPath of jsons) {
      let manifest = null;
      try {
        manifest = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
      } catch (e) {
        units.push({ id: folderName + '/' + path.basename(jsonPath), folderName, manifestPath: jsonPath, scriptPath: null, manifest: null, error: 'bad manifest JSON: ' + e.message });
        continue;
      }
      const scriptUrl = manifest.scriptUrl || manifest.scriptURL || '';
      let scriptPath = localScriptFor(dir, scriptUrl);
      if (!scriptPath) {
        const fallback = path.join(dir, folderName + '.js');
        if (fs.existsSync(fallback)) scriptPath = fallback;
      }
      if (!scriptPath) {
        const anyJs = (function collect(d) {
          const out = [];
          for (const f of fs.readdirSync(d)) {
            const fp = path.join(d, f);
            if (fs.statSync(fp).isDirectory()) {
              if (['v1', 'v2'].includes(f)) continue;
              out.push(...collect(fp));
            } else if (f.toLowerCase().endsWith('.js')) out.push(fp);
          }
          return out;
        })(dir);
        if (anyJs.length === 1) scriptPath = anyJs[0];
      }
      const sourceName = manifest.sourceName || folderName;
      units.push({
        id: folderName + '/' + path.basename(jsonPath),
        folderName,
        sourceName,
        manifestPath: jsonPath,
        scriptPath,
        manifest,
        type: String(manifest.type || '').toLowerCase(),
        isNovel: manifest.novel === true || String(manifest.streamType || '').includes('novels') || String(manifest.type || '').includes('novels'),
        isManga: ['mangas', 'manga'].includes(String(manifest.type || '').toLowerCase())
      });
    }
  }
  return units.sort((a, b) => a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function errText(e) {
  const msg = e && e.message ? e.message : String(e);
  return msg.slice(0, 240);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout ' + ms + 'ms in ' + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeArray(value, isManga) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { return []; }
  }
  if (value && typeof value === 'object') return [value];
  return [];
}

function normalizeStreams(value) {
  const PLACEHOLDER = /error\.org|\/error\/|files\.catbox\.moe\/avolvc\.mp4|files\.catbox\.moe\/.*\.mp4\?.*dummy/i;
  const isReal = (u) => typeof u === 'string' && /^(https?:|data:)/i.test(u) && !PLACEHOLDER.test(u);
  if (typeof value === 'string') {
    const t = value.trim();
    if (isReal(t)) return [{ streamUrl: t }];
    if (/^(https?:|data:)/i.test(t) && !isReal(t)) return [];
    try { return normalizeStreams(JSON.parse(value)); }
    catch (e) { return []; }
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(...normalizeStreams(item));
    return out;
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.streams)) return normalizeStreams(value.streams);
    const u = value.streamUrl || value.url || value.src || value.source || value.file || value.link;
    if (isReal(u)) return [value];
    return [];
  }
  return [];
}

const isErrorish = (obj) =>
  obj && (obj.title === 'Error' || obj.href === 'Error' ||
    (typeof obj.title === 'string' && /error|failed|not found|sin resultados|no results/i.test(obj.title)));

/* ------------------------------------------------------------------ */
/* per-module test                                                     */
/* ------------------------------------------------------------------ */
async function runUnit(unit) {
  const out = {
    id: unit.id,
    source: unit.sourceName,
    type: unit.type,
    manifest: path.relative(ROOT, unit.manifestPath).replace(/\\/g, '/'),
    keyword: null,
    status: null,
    load: null,
    steps: {}
  };
  const start = Date.now();
  try { out.status = await runUnitInner(unit, out); }
  catch (e) { out.status = { level: 'INACTIVE', reason: 'unexpected: ' + errText(e) }; }
  out.ms = Date.now() - start;
  return out;
}

async function runUnitInner(unit, out) {
  const keyword = KEYWORDS[unit.folderName] || (unit.isNovel ? 'solo leveling' : 'one piece');
  out.keyword = keyword;

  if (unit.error) { out.load = { ok: false, error: unit.error }; return { level: 'INACTIVE', reason: 'manifest' }; }
  if (!unit.scriptPath) { out.load = { ok: false, error: 'no script found' }; return { level: 'INACTIVE', reason: 'script' }; }

  let src;
  try {
    src = fs.readFileSync(unit.scriptPath, 'utf8');
  } catch (e) {
    out.load = { ok: false, error: 'read failed: ' + errText(e) };
    return { level: 'INACTIVE', reason: 'script' };
  }

  let mod = null;
  try {
    mod = loadModule(src);
  } catch (e) {
    out.load = { ok: false, error: 'sandbox load failed: ' + errText(e) };
    return { level: 'INACTIVE', reason: 'load' };
  }
  if (!mod || typeof mod.searchResults !== 'function') {
    out.load = { ok: false, error: 'no searchResults exported' };
    return { level: 'INACTIVE', reason: 'shape' };
  }
  out.load = { ok: true, script: path.relative(ROOT, unit.scriptPath).replace(/\\/g, '/') };

  const kind = unit.isNovel ? 'novel' : (unit.isManga ? 'manga' : 'video');
  // trust runtime shape as tie-breaker
  if (kind === 'video' && mod.extractChapters && !mod.extractStreamUrl) kind = mod.extractText ? 'novel' : (mod.extractImages ? 'manga' : 'video');

  /* --- search --- */
  let results = [];
  try {
    const raw = await withTimeout(mod.searchResults(keyword), STEP_TIMEOUT, 'search');
    results = normalizeArray(raw).filter(r => !isErrorish(r));
    out.steps.search = { ok: results.length > 0, count: results.length, sample: results.slice(0, 3).map(r => r.title || (r.id || '?')) };
  } catch (e) {
    out.steps.search = { ok: false, count: 0, error: errText(e) };
  }
  if (!out.steps.search.ok) {
    return { level: 'INACTIVE', reason: 'search: ' + (out.steps.search.error || '0 results') };
  }

  const first = results[0];
  const firstHref = first.href || first.id || first.url || '';
  const mangaId = first.id || first.href || '';

  /* --- details --- */
  try {
    const raw = await withTimeout(mod.extractDetails(kind === 'manga' ? mangaId || keyword : firstHref), STEP_TIMEOUT, 'details');
    const d = normalizeArray(raw)[0] || {};
    out.steps.details = { ok: true, description: d.description || d.desc || '', aliases: d.aliases || d.alternativeTitles || '', airdate: d.airdate || d.status || '' };
  } catch (e) {
    out.steps.details = { ok: false, error: errText(e) };
  }

  /* --- episodes / chapters --- */
  if (kind === 'video') {
    let episodes = [];
    try {
      const rawEps = await withTimeout(mod.extractEpisodes(firstHref), STEP_TIMEOUT, 'episodes');
      episodes = normalizeArray(rawEps).filter(ep => ep && !isErrorish(ep));
      out.steps.episodes = { ok: episodes.length > 0, count: episodes.length };
    } catch (e) {
      out.steps.episodes = { ok: false, count: 0, error: errText(e) };
    }
    const epHref = (episodes[0] && (episodes[0].href || episodes[0].url)) || firstHref;
    let streams = [];
    try {
      const rawS = await withTimeout(mod.extractStreamUrl(epHref || firstHref), STEP_TIMEOUT + 10000, 'stream');
      streams = normalizeStreams(rawS).filter(s => {
        if (!s) return false;
        const u = s.streamUrl || s.url || s;
        return typeof u === 'string' && /^(https?:|data:)/i.test(u);
      });
      out.steps.stream = { ok: streams.length > 0, count: streams.length, sample: streams.slice(0, 3).map(s => (s.streamUrl || s.url || s).slice(0, 90)) };
    } catch (e) {
      out.steps.stream = { ok: false, count: 0, error: errText(e) };
    }
    const ok = out.steps.search.ok && out.steps.details.ok && out.steps.episodes.ok && out.steps.stream.ok;
    if (ok) return { level: 'ACTIVE', reason: 'full pipeline resolves' };
    if (out.steps.search.ok && out.steps.episodes.ok && out.steps.stream.ok) return { level: 'PARTIAL', reason: 'details failed' };
    if (out.steps.search.ok && out.steps.episodes.ok && !out.steps.stream.ok) return { level: 'PARTIAL', reason: 'no playable stream (' + (out.steps.stream.error || 'empty') + ')' };
    if (out.steps.search.ok && !out.steps.episodes.ok) return { level: 'PARTIAL', reason: 'episodes failed (' + (out.steps.episodes.error || 'empty') + ')' };
    return { level: 'PARTIAL', reason: 'search ok but pipeline broken' };
  }

  if (kind === 'novel') {
    let chapters = [];
    try {
      const rawCh = await withTimeout(mod.extractChapters(firstHref), STEP_TIMEOUT, 'chapters');
      chapters = normalizeArray(rawCh).filter(c => c && !isErrorish(c));
      out.steps.chapters = { ok: chapters.length > 0, count: chapters.length };
    } catch (e) {
      out.steps.chapters = { ok: false, count: 0, error: errText(e) };
    }
    const chHref = (chapters[0] && (chapters[0].href || chapters[0].url)) || firstHref;
    let html = '';
    let textOk = false;
    try {
      const raw = await withTimeout(mod.extractText(chHref), STEP_TIMEOUT + 10000, 'text');
      let rawStr = typeof raw === 'string' ? raw : String(raw || '');
      // unwrap JSON envelopes like {"text":"..."} sometimes returned by novel sources
      const trimmed = rawStr.trim();
      if (trimmed.startsWith('{') && /"text"\s*:/.test(trimmed)) {
        try {
          const o = JSON.parse(trimmed);
          if (o && typeof o.text === 'string') rawStr = o.text;
        } catch (e) { /* keep raw */ }
      }
      html = rawStr;
      textOk = html.trim().length > 40 &&
        !/^(<p>Error|<p>Nessun|no content|error extracting|error fetching|error occurred)/i.test(html) &&
        !/error extracting text|error fetching text/i.test(html);
      out.steps.text = { ok: textOk, length: html.length, sample: html.slice(0, 120) };
    } catch (e) {
      out.steps.text = { ok: false, length: 0, error: errText(e) };
    }
    const ok = out.steps.search.ok && out.steps.details.ok && out.steps.chapters.ok && out.steps.text.ok;
    if (ok) return { level: 'ACTIVE', reason: 'search → chapters → text' };
    if (out.steps.search.ok && out.steps.chapters.ok && !out.steps.text.ok) return { level: 'PARTIAL', reason: 'chapters ok, text failed (' + (out.steps.text.error || 'empty') + ')' };
    return { level: 'PARTIAL', reason: 'search ok but novel pipeline broken' };
  }

  /* manga */
  let chaptersOk = false;
  let chapterCount = 0;
  let imageCount = 0;
  try {
    const rawCh = await withTimeout(mod.extractChapters(mangaId || firstHref), STEP_TIMEOUT, 'chapters');
    const chObj = (typeof rawCh === 'string') ? (() => { try { return JSON.parse(rawCh); } catch (e) { return {}; } })() : rawCh;
    // two shapes: Record<lang, tuples> or simple array
    if (chObj && typeof chObj === 'object' && !Array.isArray(chObj)) {
      const langs = Object.keys(chObj);
      for (const lang of langs) {
        const value = chObj[lang];
        if (Array.isArray(value)) {
          chapterCount += value.length;
          const firstChapter = value[0];
          const chapterId = Array.isArray(firstChapter) ? (firstChapter[1] && firstChapter[1][0] && firstChapter[1][0].id) : (firstChapter && firstChapter.id);
          if (chapterId) {
            try {
              const imgs = await withTimeout(mod.extractImages(chapterId), STEP_TIMEOUT + 10000, 'images');
              const arr = Array.isArray(imgs) ? imgs : ((typeof imgs === 'string') ? (() => { try { return JSON.parse(imgs); } catch (e) { return []; } })() : []);
              imageCount += arr.filter(u => typeof u === 'string' && /^(https?:|data:)/i.test(u)).length;
              if (imageCount > 0) break;
            } catch (e) { /* try next language */ }
          }
        }
      }
      chaptersOk = chapterCount > 0;
    } else {
      const arr = normalizeArray(rawCh);
      chapterCount = arr.length;
      chaptersOk = arr.length > 0;
      const firstChapter = arr[0];
      const chapterId = (firstChapter && (firstChapter.id || (firstChapter.chapter && firstChapter.chapter.id))) || '';
      if (chapterId && typeof mod.extractImages === 'function') {
        try {
          const imgs = await withTimeout(mod.extractImages(chapterId), STEP_TIMEOUT + 10000, 'images');
          const arrImgs = Array.isArray(imgs) ? imgs : [];
          imageCount = arrImgs.filter(u => typeof u === 'string' && /^(https?:|data:)/i.test(u)).length;
        } catch (e) { /* ignore */ }
      }
    }
    out.steps.chapters = { ok: chaptersOk, count: chapterCount };
    out.steps.images = { ok: imageCount > 0, count: imageCount };
  } catch (e) {
    out.steps.chapters = { ok: false, count: 0, error: errText(e) };
    out.steps.images = { ok: false, count: 0 };
  }
  const ok = out.steps.search.ok && out.steps.chapters.ok && imageCount > 0;
  if (ok) return { level: 'ACTIVE', reason: 'search → chapters → images' };
  if (out.steps.search.ok && out.steps.chapters.ok) return { level: 'PARTIAL', reason: 'chapters ok but no images (' + imageCount + ')' };
  return { level: 'PARTIAL', reason: 'search ok but manga pipeline broken' };
}

/* ------------------------------------------------------------------ */
/* concurrency + report                                                */
/* ------------------------------------------------------------------ */
async function runAll() {
  let units = discoverUnits();
  const filter = (process.env.AUDIT_FILTER || '').toLowerCase();
  const filterParts = filter ? filter.split('|').map(s => s.trim()).filter(Boolean) : [];
  if (filterParts.length) units = units.filter(u => filterParts.some(p => u.id.toLowerCase().includes(p)));
  console.log('Discovered ' + discoverUnits().length + ' module units.' + (filter ? ' (filter: ' + filter + ')' : ''));

  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < units.length) {
      const unit = units[idx++];
      const label = unit.id.padEnd(42);
      const t0 = Date.now();
      const res = await runUnit(unit).catch(e => ({ id: unit.id, source: unit.sourceName, status: { level: 'INACTIVE', reason: errText(e) }, steps: {}, ms: 0 }));
      res.ms = res.ms || (Date.now() - t0);
      results.push(res);
      console.log('[' + res.status.level.padEnd(8) + '] ' + label + ' (' + Math.round(res.ms) + 'ms) ' + (res.status.reason || ''));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const order = ['ACTIVE', 'PARTIAL', 'INACTIVE'];
  results.sort((a, b) => order.indexOf(a.status.level) - order.indexOf(b.status.level) || a.id.localeCompare(b.id));

  const summary = {};
  for (const lv of order) summary[lv] = results.filter(r => r.status.level === lv).length;

  const OUT = process.env.AUDIT_OUT || 'audit-examples';
  const reportPath = path.join(__dirname, OUT + '.json');
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), concurrency: CONCURRENCY, summary, results }, null, 2));
  console.log('\nWrote ' + reportPath);
  return { summary, results };
}

function summarizeForMarkdown(report) {
  const lines = [];
  lines.push('# Examples/ module audit — ' + new Date().toISOString().slice(0, 19).replace('T', ' '));
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('| --- | --- |');
  for (const lv of ['ACTIVE', 'PARTIAL', 'INACTIVE']) {
    lines.push('| **' + lv + '** | ' + (report.summary[lv] || 0) + ' |');
  }
  lines.push('');
  lines.push('## ACTIVE — full pipeline resolves');
  lines.push('');
  for (const r of report.results.filter(r => r.status.level === 'ACTIVE')) {
    lines.push('- **' + r.id + '** — ' + r.source + ' (' + r.type + ') — steps: ' + Object.keys(r.steps).filter(k => r.steps[k] && r.steps[k].ok).join(' ✓, ') + ' ✓');
  }
  lines.push('');
  lines.push('## PARTIAL — search works but a later step fails');
  lines.push('');
  for (const r of report.results.filter(r => r.status.level === 'PARTIAL')) {
    const fails = Object.keys(r.steps).filter(k => r.steps[k] && !r.steps[k].ok && r.steps[k].error);
    lines.push('- **' + r.id + '** — ' + r.source + ' — ' + (r.status.reason || '') + (fails.length ? ' | errors: ' + fails.map(k => k + ': ' + r.steps[k].error).join('; ') : ''));
  }
  lines.push('');
  lines.push('## INACTIVE — search/load fails');
  lines.push('');
  for (const r of report.results.filter(r => r.status.level === 'INACTIVE')) {
    lines.push('- **' + r.id + '** — ' + r.source + ' — ' + (r.status.reason || '') + (r.load && r.load.error ? ' | ' + r.load.error : ''));
  }
  lines.push('');
  return lines.join('\n');
}

(async () => {
  const report = await runAll();
  const OUT = process.env.AUDIT_OUT || 'audit-examples';
  const mdPath = path.join(__dirname, OUT + '.md');
  fs.writeFileSync(mdPath, summarizeForMarkdown(report));
  console.log('\nSUMMARY: ' + Object.entries(report.summary).map(([k, v]) => k + '=' + v).join('  '));
  console.log('Wrote ' + mdPath);
  process.exit(0);
})().catch(e => { console.error('FATAL: ' + e); process.exit(1); });