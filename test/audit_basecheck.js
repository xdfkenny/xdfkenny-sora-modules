/* audit_basecheck.js — check reachability of every module's baseUrl (HEAD/GET, follow redirects). */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXAMPLES = path.resolve(ROOT, process.env.AUDIT_DIR || 'examples');
const CONCURRENCY = 10;
const TIMEOUT = 12000;

const units = [];
(function walkDirs(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('.')) continue;
    const fp = path.join(dir, f);
    if (!fs.statSync(fp).isDirectory()) continue;
    if (['v1', 'v2', 'arabic', 'dub', 'hardsub', '.gitea'].includes(f)) continue;
    const subjs = [];
    (function collect(d) {
      for (const g of fs.readdirSync(d)) {
        const gp = path.join(d, g);
        if (fs.statSync(gp).isDirectory()) {
          if (['v1', 'v2'].includes(g)) continue;
          collect(gp);
        } else if (g.toLowerCase().endsWith('.json')) subjs.push(gp);
      }
    })(fp);
    for (const jp of subjs) {
      try {
        const m = JSON.parse(fs.readFileSync(jp, 'utf8').replace(/^\uFEFF/, ''));
        units.push({ id: path.relative(EXAMPLES, jp).replace(/\\/g, '/'), baseUrl: m.baseUrl || m.baseURL || '', searchBase: m.searchBaseUrl || m.searchBaseURL || '' });
      } catch (e) { /* ignore bad json */ }
    }
  }
})(EXAMPLES);

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function check(url) {
  const out = { url: url || '', ok: false, status: 0, code: '', note: '' };
  if (!url) { out.note = 'no baseUrl'; return out; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*' }
    });
    out.ok = resp.ok;
    out.status = resp.status;
    out.final = resp.url || url;
  } catch (e) {
    out.code = e.name || String(e).slice(0, 80);
    out.note = e.message ? e.message.split('\n')[0].slice(0, 90) : '';
  } finally {
    clearTimeout(timer);
  }
  return out;
}

(async () => {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < units.length) {
      const u = units[idx++];
      const r = { id: u.id, ...(await check(u.baseUrl)) };
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const outPath = path.join(__dirname, (process.env.AUDIT_OUT || 'audit-examples') + '-basecheck.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  for (const r of results.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log('[' + (r.ok ? 'UP' : 'DOWN') + '] ' + r.id.padEnd(32) + ' ' + (r.ok ? '(' + r.status + ')' : r.code + ' ' + r.note) + ' ' + (r.url || '{}'));
  }
  console.log('\n' + results.length + ' checked → ' + outPath);
})().catch(e => { console.error('FATAL ' + e); process.exit(1); });