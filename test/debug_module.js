/* debug_module.js — print RAW step outputs for one or more examples/ modules.
 *
 * Usage: node test/debug_module.js <folder> [more...]
 * Prints search count + first result, details, episodes (video) or chapters
 * (novel/manga), and the RAW extractStreamUrl / extractText / extractImages
 * output so failures can be diagnosed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXAMPLES = path.resolve(ROOT, process.env.AUDIT_DIR || 'examples');

/* ---- fetcher (from audit_examples.js) ---- */
const FORBIDDEN_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'upgrade']);
function parseHeaderDump(dump) {
  const map = new Map();
  if (!dump) return map;
  for (const line of String(dump).split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    map.set(name, (map.get(name) || '') + (map.has(name) ? '\n' : '') + value);
  }
  return map;
}
let curlPath = null;
function resolveCurl(cb) {
  if (curlPath !== null) return cb(curlPath);
  execFile('curl', ['--version'], { timeout: 5000 }, (err) => {
    curlPath = err ? '' : 'curl';
    if (err) execFile('curl.exe', ['--version'], { timeout: 5000 }, (err2) => { if (!err2) curlPath = 'curl.exe'; cb(curlPath); });
    else cb(curlPath);
  });
}
function curlRequest(url, opts) {
  return new Promise((resolve, reject) => {
    resolveCurl((bin) => {
      if (!bin) return reject(new Error('curl no disponible'));
      const method = opts.method || 'GET';
      const tmp = path.join(os.tmpdir(), 'xdf_dbg_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.txt');
      const args = ['-sS', '--max-time', '20'];
      if (method === 'HEAD') args.push('-I');
      else args.push('-L', '--compressed', '-X', method);
      for (const k in (opts.headers || {})) args.push('-H', k + ': ' + opts.headers[k]);
      if (opts.body != null) args.push('--data-binary', opts.body);
      args.push('-D', tmp, '-w', '\n__XDF_STATUS__%{http_code}');
      args.push(url);
      execFile(bin, args, { maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
        let headers = null;
        try { headers = parseHeaderDump(fs.readFileSync(tmp, 'utf8')); } catch (e) {}
        try { fs.unlinkSync(tmp); } catch (e) {}
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
    try { return await curlRequest(url, opts); } catch (e) {}
  }
  const fetchOpts = { method: opts.method || 'GET', headers: {}, redirect: 'follow' };
  for (const k in (opts.headers || {})) fetchOpts.headers[k] = opts.headers[k];
  if (opts.body != null) fetchOpts.body = opts.body;
  const resp = await fetch(url, fetchOpts);
  return { ok: resp.ok, status: resp.status, text: await resp.text(), headers: resp.headers };
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
      if (setCookies) for (const part of String(setCookies).split('\n')) {
        const kv = part.split(';')[0];
        const eq = kv.indexOf('=');
        if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
      }
    }
    const text = resp.text;
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: '', url: url,
      headers: resp.headers || new Map(),
      text: async () => text,
      json: async () => { try { return JSON.parse(text); } catch (e) { throw new Error('JSON invalid from ' + url + ': ' + e.message); } }
    };
  };
}

function loadModule(src) {
  const fetcher = makeFetcher();
  const factory = new Function('fetch', 'fetchv2', 'window', 'console', 'location', 'module', 'exports',
    src + '\n;return {' +
    'searchResults, extractDetails,' +
    'extractEpisodes: typeof extractEpisodes !== "undefined" ? extractEpisodes : null,' +
    'extractStreamUrl: typeof extractStreamUrl !== "undefined" ? extractStreamUrl : null,' +
    'extractChapters: typeof extractChapters !== "undefined" ? extractChapters : null,' +
    'extractText: typeof extractText !== "undefined" ? extractText : null,' +
    'extractImages: typeof extractImages !== "undefined" ? extractImages : null};');
  const windowShim = { fetch: fetcher, fetchv2: fetcher };
  return factory(fetcher, fetcher, windowShim, { log: () => {}, error: () => {}, warn: () => {}, info: () => {} }, undefined, { exports: {} }, {});
}

const truncate = (s, n) => { const str = String(s); return str.length > n ? str.slice(0, n) + '…<truncated>' : str; };
const looks = (o) => /^[\s{"[\d-]/.test(String(o));

async function debugModule(folder, relScript) {
  const dir = path.join(EXAMPLES, folder);
  console.log('\n==========================================================');
  console.log('### ' + folder + (relScript ? ' [' + relScript + ']' : ''));
  const jsFile = relScript ? path.join(dir, relScript) : path.join(dir, folder + '.js');
  if (!fs.existsSync(jsFile)) { console.log('NO SCRIPT ' + jsFile); return; }
  let mod;
  try { mod = loadModule(fs.readFileSync(jsFile, 'utf8')); }
  catch (e) { console.log('LOAD FAIL: ' + e.message); return; }
  if (typeof mod.searchResults !== 'function') { console.log('NO searchResults — exports:', Object.keys(mod)); return; }

  const kw = process.env.KEYWORD || 'one piece';
  try {
    const raw = await Promise.race([mod.searchResults(kw), new Promise((_, rej) => setTimeout(() => rej(new Error('search timeout')), 25000))]);
    const arr = (Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch (e) { return [raw]; } })()) || [];
    console.log('search: count=' + arr.length);
    if (arr[0]) console.log('  first: ' + truncate(JSON.stringify(arr[0]).slice(0, 300), 300));
    else { console.log('  (no results)'); return; }
    const first = arr[0];
    const href = first.href || first.id || first.url || '';
    const mangaId = first.id || href || '';

    try {
      const d = await mod.extractDetails(mod.extractImages ? (mangaId || kw) : href);
      console.log('details: ' + truncate(JSON.stringify(typeof d === 'string' ? JSON.parse(d) : d).slice(0, 300), 300));
    } catch (e) { console.log('details ERROR: ' + e.message); }

    if (mod.extractStreamUrl) {
      let eps;
      try {
        const er = await Promise.race([mod.extractEpisodes(href), new Promise((_, rej) => setTimeout(() => rej(new Error('eps timeout')), 25000))]);
        eps = Array.isArray(er) ? er : JSON.parse(er);
        console.log('episodes: count=' + (eps ? eps.length : 0));
        if (eps && eps[0]) console.log('  firstEp: ' + truncate(JSON.stringify(eps[0]).slice(0, 200), 200));
      } catch (e) { console.log('episodes ERROR: ' + e.message); eps = []; }
      const epHref = (eps[0] && (eps[0].href || eps[0].url)) || href;
      try {
        const sr = await Promise.race([mod.extractStreamUrl(epHref || href), new Promise((_, rej) => setTimeout(() => rej(new Error('stream timeout')), 30000))]);
        console.log('stream RAW: ' + truncate(JSON.stringify(sr), 1200));
      } catch (e) { console.log('stream ERROR: ' + e.message); }
    }

    if (mod.extractChapters && !mod.extractStreamUrl) {
      if (mod.extractText) {
        try {
          const cr = await Promise.race([mod.extractChapters(href), new Promise((_, rej) => setTimeout(() => rej(new Error('ch timeout')), 25000))]);
          const chs = Array.isArray(cr) ? cr : JSON.parse(cr);
          console.log('chapters: count=' + (chs ? chs.length : 0));
          const ch = chs && chs[0];
          console.log('  firstCh: ' + truncate(JSON.stringify(ch).slice(0, 200), 200));
          const chHref = (ch && (ch.href || ch.url)) || href;
          const t = await mod.extractText(chHref);
          console.log('text RAW: ' + truncate(String(t), 600));
        } catch (e) { console.log('chapters/text ERROR: ' + e.message); }
      } else {
        try {
          const cr = await Promise.race([mod.extractChapters(mangaId || href), new Promise((_, rej) => setTimeout(() => rej(new Error('ch timeout')), 25000))]);
          const ch = (typeof cr === 'string') ? (() => { try { return JSON.parse(cr); } catch (e) { return cr; } })() : cr;
          console.log('chapters RAW: ' + truncate(JSON.stringify(ch), 600));
          let chapterId = '';
          if (ch && typeof ch === 'object' && !Array.isArray(ch)) {
            const langs = Object.keys(ch);
            for (const lang of langs) {
              const v = ch[lang];
              if (Array.isArray(v) && v[0]) {
                chapterId = Array.isArray(v[0]) ? (v[0][1] && v[0][1][0] && v[0][1][0].id) : (v[0].id || '');
                if (chapterId) break;
              }
            }
          } else { const a = [].concat(ch || []); chapterId = a[0] && (a[0].id || (a[0].chapter && a[0].chapter.id)) || ''; }
          if (chapterId && mod.extractImages) {
            const imgs = await Promise.race([mod.extractImages(chapterId), new Promise((_, rej) => setTimeout(() => rej(new Error('img timeout')), 30000))]);
            console.log('images: count=' + ((imgs && imgs.length) || 0) + ' RAW: ' + truncate(JSON.stringify(imgs), 400));
          } else if (!chapterId) { console.log('  (no chapter id found for images)'); }
        } catch (e) { console.log('chapters/images ERROR: ' + e.message); }
      }
    }
  } catch (e) {
    console.log('search ERROR: ' + e.message);
  }
}

(async () => {
  const names = process.argv.slice(2);
  if (!names.length) { console.log('usage: node test/debug_module.js <folder> [<relScript>] [<folder> <relScript> ...]'); process.exit(0); }
  for (let i = 0; i < names.length; i += 2) {
    const n = names[i];
    // optional companion arg: a script path relative to the module folder
    const rel = (i + 1 < names.length && names[i + 1].endsWith('.js')) ? names[i + 1] : undefined;
    await debugModule(n, rel);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL: ' + e); process.exit(1); });