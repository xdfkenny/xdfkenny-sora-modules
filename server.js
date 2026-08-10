/* xdfkenny modules — status server
 *
 * Serves the static status page AND runs real media-load tests (search →
 * details → episodes → stream) server-side, bypassing browser CORS.
 *
 * Usage:  node server.js   (then open http://localhost:8765/)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8765;
const CACHE_TTL = 5 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const sourceCache = new Map();
const manifestCache = new Map();

function cacheGet(cache, key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.value;
  return null;
}

function cacheSet(cache, key, value) {
  cache.set(key, { value, t: Date.now() });
}

async function fetchText(url) {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
  return await resp.text();
}

async function loadManifest(manifestUrl) {
  let cached = cacheGet(manifestCache, manifestUrl);
  if (cached) return cached;
  const text = await fetchText(manifestUrl);
  const json = JSON.parse(text);
  cacheSet(manifestCache, manifestUrl, json);
  return json;
}

async function loadSource(scriptUrl) {
  let cached = cacheGet(sourceCache, scriptUrl);
  if (cached) return cached;
  const src = await fetchText(scriptUrl);
  cacheSet(sourceCache, scriptUrl, src);
  return src;
}

/* ---------- module sandbox ---------- */

const FORBIDDEN_HEADERS = new Set([
  'host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'upgrade'
]);

/* Parse a curl -D header dump into a Map (lowercased keys; set-cookie
   accumulates every Set-Cookie value, newline-joined). */
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

/* fetchv2/fetch shim: returns a Response-like object the modules can read.
   Maintains a per-module cookie jar (like fetchv2's documented session
   handling): Set-Cookie from every response is absorbed and replayed on the
   next request, so multi-step flows (gate → challenge → POST) keep their
   session without the module touching cookies directly. */
function makeFetcher() {
  const jar = new Map(); // cookie name -> value
  return async function soraFetch(url, headers, method, body) {
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
        catch (e) { throw new Error('JSON inválido desde ' + url + ': ' + e.message); }
      }
    };
  };
}

/* System curl first (passes Cloudflare TLS checks that Node's undici fails),
   falls back to global fetch when curl is unavailable. */
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
      const tmp = path.join(os.tmpdir(), 'xdf_hdrs_' + process.pid + '_' + Date.now() + '.txt');
      const args = ['-sS', '--max-time', '30'];
      if (method === 'HEAD') {
        args.push('-I');
      } else {
        args.push('-L', '--compressed', '-X', method);
      }
      for (const k in (opts.headers || {})) args.push('-H', k + ': ' + opts.headers[k]);
      if (opts.body != null) args.push('--data-binary', opts.body);
      args.push('-D', tmp, '-w', '\n__XDF_STATUS__%{http_code}');
      args.push(url);
      execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
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
    catch (e) { /* fall through to fetch */ }
  }
  const fetchOpts = { method: opts.method || 'GET', headers: {}, redirect: 'follow' };
  for (const k in (opts.headers || {})) fetchOpts.headers[k] = opts.headers[k];
  if (opts.body != null) fetchOpts.body = opts.body;
  const resp = await fetch(url, fetchOpts);
  return { ok: resp.ok, status: resp.status, text: await resp.text(), finalUrl: resp.url, headers: resp.headers };
}

function loadModule(src) {
  const fetcher = makeFetcher();
  const sandboxConsole = { log: () => {}, error: () => {}, warn: () => {} };
  const factory = new Function(
    'fetch', 'fetchv2', 'window', 'console', 'location',
    src + '\n;return {' +
      'searchResults, extractDetails,' +
      'extractEpisodes: typeof extractEpisodes !== "undefined" ? extractEpisodes : null,' +
      'extractStreamUrl: typeof extractStreamUrl !== "undefined" ? extractStreamUrl : null,' +
      'extractChapters: typeof extractChapters !== "undefined" ? extractChapters : null,' +
      'extractText: typeof extractText !== "undefined" ? extractText : null' +
    '};'
  );
  return factory(fetcher, fetcher, { fetch: fetcher, fetchv2: fetcher }, sandboxConsole, undefined);
}

/* ---------- media test ---------- */

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  if (value && typeof value === 'object') return [value];
  return [];
}

/* Stream responses vary between the legacy [{quality,url}] format and the
   modern {streams:[{title,streamUrl,headers}], subtitle} envelope. */
function normalizeStreams(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return normalizeStreams(JSON.parse(value)); }
    catch (e) { return []; }
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.streams)) return value.streams;
    if (value.streamUrl || value.url) return [value];
    return [value];
  }
  return [];
}

function mapStream(s) {
  return {
    quality: s.quality || s.title || '',
    url: s.url || s.streamUrl || '',
    subtitles: Array.isArray(s.subtitles) ? s.subtitles.join(', ') : (s.subtitles || '')
  };
}

function errText(e) {
  const msg = e && e.message ? e.message : String(e);
  return msg.slice(0, 300);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout ' + ms + 'ms en ' + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runMediaTest(entry, keyword) {
  const out = { module: entry.id, keyword, search: null, details: null };

  let manifest;
  let mod;
  try {
    manifest = await loadManifest(entry.manifestUrl);
    const src = await loadSource(manifest.scriptUrl);
    mod = loadModule(src);
  } catch (e) {
    return { ...out, search: { ok: false, error: 'No se pudo cargar el módulo: ' + errText(e) } };
  }
  // Novels swap the video pair (extractEpisodes/extractStreamUrl) for
  // extractChapters/extractText — see documentation/NovelModules.md.
  const isNovel = manifest.novel === true || String(manifest.type || '').includes('novels');

  /* search */
  let results = [];
  try {
    const raw = await withTimeout(mod.searchResults(keyword), 25000, 'search');
    results = normalizeArray(raw);
    out.search = {
      ok: true,
      count: results.length,
      items: results.slice(0, 5).map(r => ({ title: r.title, href: r.href, image: r.image }))
    };
  } catch (e) {
    out.search = { ok: false, error: errText(e) };
  }

  const first = results[0];
  if (!first || !first.href) {
    out.details = { ok: false, error: 'sin resultados de búsqueda' };
    if (isNovel) { out.chapters = { ok: false, error: 'sin resultados de búsqueda' }; out.text = { ok: false, error: 'sin resultados de búsqueda' }; }
    else { out.episodes = { ok: false, error: 'sin resultados de búsqueda' }; out.stream = { ok: false, error: 'sin resultados de búsqueda' }; }
    return out;
  }

  /* details */
  try {
    const d = await withTimeout(mod.extractDetails(first.href), 25000, 'details');
    const parsed = normalizeArray(d)[0] || {};
    out.details = {
      ok: true,
      description: parsed.description,
      aliases: parsed.aliases,
      airdate: parsed.airdate
    };
  } catch (e) {
    out.details = { ok: false, error: errText(e) };
  }

  /* novel pair: chapters + text (image or prose chapters) */
  if (isNovel) {
    out.chapters = null;
    out.text = null;

    let chapters = [];
    try {
      const rawCh = await withTimeout(mod.extractChapters(first.href), 25000, 'chapters');
      chapters = normalizeArray(rawCh);
      out.chapters = {
        ok: true,
        count: chapters.length,
        items: chapters.slice(0, 8).map(ch => typeof ch === 'object'
          ? { title: ch.title, number: ch.number, href: ch.href }
          : { title: String(ch) })
      };
    } catch (e) {
      out.chapters = { ok: false, error: errText(e) };
    }

    const chUrl = (chapters[0] && chapters[0].href) || first.href;
    try {
      // extractText returns a raw HTML fragment (reader view), not JSON.
      const raw = await withTimeout(mod.extractText(chUrl), 40000, 'text');
      const html = typeof raw === 'string' ? raw : String(raw || '');
      out.text = {
        ok: html.length > 0 && !/^(<p>Error|<p>Nessun|no content|error)/i.test(html),
        htmlLength: html.length,
        images: (html.match(/<img/g) || []).length,
        sample: html.slice(0, 200)
      };
    } catch (e) {
      out.text = { ok: false, error: errText(e) };
    }
    return out;
  }

  /* video pair: episodes + stream */
  out.episodes = null;
  out.stream = null;

  /* episodes */
  let episodes = [];
  try {
    const rawEps = await withTimeout(mod.extractEpisodes(first.href), 25000, 'episodes');
    episodes = normalizeArray(rawEps);
    out.episodes = {
      ok: true,
      count: episodes.length,
      items: episodes.slice(0, 8).map(ep => typeof ep === 'object' ? { number: ep.number, href: ep.href } : { number: ep })
    };
  } catch (e) {
    out.episodes = { ok: false, error: errText(e) };
  }

  /* stream (first episode, or the result URL itself for movies) */
  let epUrl = null;
  if (episodes.length) {
    const ep = episodes[0];
    epUrl = (typeof ep === 'object' && ep.href) ? ep.href : first.href;
  }
  const streamSource = epUrl || first.href;
  if (!streamSource) {
    out.stream = { ok: false, error: 'sin fuente de stream' };
    return out;
  }
  try {
    const streams = await withTimeout(mod.extractStreamUrl(streamSource), 40000, 'stream');
    const arr = normalizeStreams(streams);
    out.stream = {
      ok: true,
      count: arr.length,
      items: arr.slice(0, 6).map(mapStream)
    };
  } catch (e) {
    out.stream = { ok: false, error: errText(e) };
  }

  return out;
}

/* ---------- http ---------- */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === 'GET' && route === '/api/health') {
    return sendJson(res, 200, { ok: true, server: true });
  }

  if (req.method === 'POST' && route === '/api/test') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const { id, keyword } = body;
      if (!id) return sendJson(res, 400, { ok: false, error: 'falta id' });
      if (!keyword || !String(keyword).trim()) return sendJson(res, 400, { ok: false, error: 'falta keyword' });

      const indexText = fs.readFileSync(path.join(ROOT, 'modules.json'), 'utf8');
      const index = JSON.parse(indexText);
      const entry = (index.modules || []).find(m => m.id === id);
      if (!entry) return sendJson(res, 404, { ok: false, error: 'módulo no encontrado: ' + id });

      const result = await withTimeout(runMediaTest(entry, String(keyword).trim()), 120000, 'módulo');
      return sendJson(res, 200, { ok: true, result });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: errText(e) });
    }
  }

  /* static files */
  if (req.method === 'GET' || req.method === 'HEAD') {
    let filePath;
    if (route === '/' || route === '/index.html') filePath = path.join(ROOT, 'index.html');
    else {
      const clean = path.normalize(route).replace(/^([.][.][\\/]|([\\/])?[.][.][\\/])+/, '');
      filePath = path.join(ROOT, clean);
    }
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
    return;
  }

  res.writeHead(405); res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log('xdfkenny status server → http://localhost:' + PORT);
});
