/* xdfkenny modules — Soft Cryo dashboard
 * Status checks for every module (manifest / script / provider),
 * Sora–Luna config generator, and a minimalist test playground.
 */

'use strict';

const STATUS_LABEL = { ok: 'OK', warn: 'Warning', fail: 'Failed', testing: 'Testing…' };
const REQUIRED_FIELDS = ['sourceName', 'version', 'language', 'streamType', 'quality', 'baseUrl', 'searchBaseUrl', 'scriptUrl', 'type'];
const REQUIRED_FN = ['searchResults', 'extractDetails', 'extractEpisodes', 'extractStreamUrl'];

const REPO_URL = 'https://github.com/xdfkenny/xdfkenny-sora-modules';
const RAW_REPO = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules';

const grid = document.getElementById('grid');
const runAllBtn = document.getElementById('runAll');
const autoChk = document.getElementById('autoChk');
const lastRun = document.getElementById('lastRun');
const heroCount = document.getElementById('heroCount');
const counters = {
  total: document.getElementById('cTotal'),
  ok: document.getElementById('cOk'),
  warn: document.getElementById('cWarn'),
  fail: document.getElementById('cFail')
};

let entries = [];
const cards = new Map();
let running = false;
let serverAvailable = null;

const serverBanner = document.getElementById('serverBanner');
const copyCmdBtn = document.getElementById('copyCmd');

/* ---------- small helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.host + u.pathname.replace(/\/[^/]*$/, '/…');
  } catch (e) {
    return String(url).slice(0, 60);
  }
}

function host(url) {
  try { return new URL(url).host; } catch (e) { return String(url); }
}

function humanBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function sevRank(s) { return s === 'fail' ? 2 : s === 'warn' ? 1 : 0; }

/* ---------- nav + decorations ---------- */

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});

navLinks.addEventListener('click', (ev) => {
  if (ev.target.closest('.nav-link')) {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

function makeSnow() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.querySelector('.hero-snow');
  if (!host) return;
  const flakes = 26;
  for (let i = 0; i < flakes; i++) {
    const f = el('span', 'snowflake');
    const size = 3 + Math.random() * 4;
    f.style.width = size + 'px';
    f.style.height = size + 'px';
    f.style.left = Math.random() * 100 + '%';
    f.style.animationDuration = (9 + Math.random() * 12) + 's';
    f.style.animationDelay = (-Math.random() * 18) + 's';
    host.appendChild(f);
  }
}

function countUp(node, target) {
  const duration = 900;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = Math.round(eased * target);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function watchHeroCount() {
  const hero = document.querySelector('.hero');
  if (!hero || !('IntersectionObserver' in window)) {
    if (heroCount) heroCount.textContent = entries.length;
    return;
  }
  const io = new IntersectionObserver((list) => {
    for (const entry of list) {
      if (entry.isIntersecting) {
        countUp(heroCount, entries.length);
        io.disconnect();
      }
    }
  }, { threshold: 0.35 });
  io.observe(hero);
}

/* ---------- JSON config (Sora / Luna) ---------- */

const configJson = document.getElementById('configJson');
const copyJsonBtn = document.getElementById('copyJson');
const copyLabel = document.getElementById('copyLabel');

async function buildConfig(modules) {
  const out = [];
  for (const entry of modules) {
    let url = entry.manifestUrl;
    try {
      const resp = await fetch(entry.manifestUrl, { cache: 'no-store' });
      if (resp.ok) {
        const m = await resp.json();
        if (m && m.scriptUrl) url = m.scriptUrl;
      }
    } catch (e) { /* fall back to manifestUrl */ }
    out.push({ name: entry.name, url });
  }
  return {
    name: 'xdfkenny-modules',
    source: REPO_URL,
    modules: out
  };
}

function highlightJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  let html = '';
  let i = 0;
  const isKey = (end) => {
    let k = end;
    while (k < json.length && /\s/.test(json[k])) k++;
    return json[k] === ':';
  };
  while (i < json.length) {
    const ch = json[i];
    if (ch === '"') {
      let j = i + 1;
      let s = '"';
      while (j < json.length) {
        const c = json[j];
        if (c === '\\') { s += c + (json[j + 1] || ''); j += 2; continue; }
        s += c; j++;
        if (c === '"') break;
      }
      html += isKey(j)
        ? '<span class="tok-key">' + esc(s) + '</span>'
        : '<span class="tok-val">' + esc(s) + '</span>';
      i = j;
    } else if (/[0-9tfn-]/.test(ch)) {
      const m = json.slice(i).match(/^(true|false|null|-?\d+(?:\.\d+)?)/);
      if (m) {
        html += '<span class="tok-lit">' + m[0] + '</span>';
        i += m[0].length;
        continue;
      }
      html += esc(ch); i++;
    } else {
      html += esc(ch); i++;
    }
  }
  return html;
}

async function renderConfig() {
  const data = await buildConfig(entries);
  configJson.innerHTML = highlightJSON(data);
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); resolve(); }
    catch (e) { reject(e); }
    ta.remove();
  });
}

copyJsonBtn.addEventListener('click', async () => {
  const text = configJson.textContent;
  try {
    await copyText(text);
  } catch (e) { /* noop */ }
  copyLabel.textContent = 'Copied!';
  copyJsonBtn.classList.add('copied');
  setTimeout(() => {
    copyLabel.textContent = 'Copy JSON';
    copyJsonBtn.classList.remove('copied');
  }, 2000);
});

/* ---------- playground ---------- */

const pgModule = document.getElementById('pgModule');
const pgKeyword = document.getElementById('pgKeyword');
const pgParams = document.getElementById('pgParams');
const pgRun = document.getElementById('pgRun');
const pgClear = document.getElementById('pgClear');
const pgOutput = document.getElementById('pgOutput');
const pgStatus = document.getElementById('pgStatus');
const pgStatusText = document.getElementById('pgStatusText');

function setPgStatus(state, text) {
  pgStatus.className = 'pg-status' + (state ? ' is-' + state : '');
  pgStatusText.textContent = text;
}

function fillPlaygroundSelect() {
  pgModule.textContent = '';
  for (const entry of entries) {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.name;
    pgModule.appendChild(opt);
  }
}

function mockResult(id, keyword) {
  return {
    module: id,
    keyword,
    simulated: true,
    note: 'Run `node server.js` for live provider tests',
    search: {
      ok: true,
      count: 3,
      items: [
        { title: keyword + ' — episode 1', href: 'https://example.com/' + encodeURIComponent(keyword) + '/1' },
        { title: keyword + ' — episode 2', href: 'https://example.com/' + encodeURIComponent(keyword) + '/2' },
        { title: keyword + ' — movie', href: 'https://example.com/' + encodeURIComponent(keyword) + '-movie' }
      ]
    },
    details: { ok: true, description: 'Simulated details for «' + keyword + '».', airdate: '2026', aliases: keyword },
    episodes: { ok: true, count: 12, items: [1, 2, 3, 4, 5, 6, 7, 8] },
    stream: {
      ok: true,
      count: 2,
      items: [
        { quality: '720p', url: 'https://example.com/stream-720.m3u8' },
        { quality: '1080p', url: 'https://example.com/stream-1080.m3u8' }
      ]
    }
  };
}

async function runPlayground() {
  const id = pgModule.value;
  const keyword = String(pgKeyword.value || '').trim();
  if (!keyword) {
    setPgStatus('err', 'Enter a keyword');
    return;
  }
  pgRun.disabled = true;
  setPgStatus('run', 'Testing module…');
  pgOutput.innerHTML = '<div class="pg-loading"><span class="dot"></span>Testing module…</div>';

  const avail = await ensureServer();
  if (avail) {
    try {
      const resp = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, keyword })
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'HTTP ' + resp.status);
      setPgStatus('ok', 'Status: 200 OK');
      pgOutput.innerHTML = highlightJSON(data.result);
    } catch (e) {
      setPgStatus('err', 'Status: Error');
      pgOutput.innerHTML = '<div class="pg-error">Error: ' + esc(e && e.message ? e.message : e) + '</div>';
    }
  } else {
    await delay(800);
    setPgStatus('ok', 'Status: 200 OK · simulated');
    pgOutput.innerHTML = highlightJSON(mockResult(id, keyword));
  }

  pgRun.disabled = false;
}

pgRun.addEventListener('click', runPlayground);
pgKeyword.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') runPlayground();
});

pgClear.addEventListener('click', () => {
  pgKeyword.value = '';
  pgParams.value = '';
  pgOutput.innerHTML = '<p class="pg-empty">Awaiting input… ❄️</p>';
  setPgStatus('', 'Idle');
});

/* ---------- dashboard rendering ---------- */

function renderCard(entry) {
  const card = el('div', 'card');
  card.dataset.id = entry.id;

  const head = el('div', 'card-head');

  const iconWrap = el('div', 'card-icon');
  const img = document.createElement('img');
  img.alt = entry.name;
  img.loading = 'lazy';
  img.onerror = () => { img.replaceWith(el('div', '', entry.name.charAt(0))); };
  img.src = entry.iconUrl;
  iconWrap.appendChild(img);

  const headInfo = el('div');
  const titleRow = el('div', 'card-title-row');
  titleRow.appendChild(el('div', 'card-title', entry.name));
  const ver = el('span', 'ver', '–');
  ver.dataset.role = 'ver';
  titleRow.appendChild(ver);
  headInfo.appendChild(titleRow);
  headInfo.appendChild(el('div', 'card-branch', 'branch: ' + entry.branch));

  head.append(iconWrap, headInfo);

  const body = el('div', 'card-body');
  const meta = el('div', 'meta');
  meta.dataset.role = 'meta';
  meta.appendChild(el('span', 'chip', 'loading…'));
  body.appendChild(meta);

  const desc = el('p', 'desc', '');
  desc.dataset.role = 'desc';
  body.appendChild(desc);

  const links = el('div', 'links');
  links.dataset.role = 'links';
  body.appendChild(links);

  const statusWrap = el('div', 'status-wrap');

  const statusLine = el('div', 'status-line pending');
  statusLine.appendChild(el('span', 'status-dot'));
  const statusLabel = el('span', 'status-label', 'Pending');
  statusLabel.dataset.role = 'status';
  const score = el('span', 'status-score', '0/0');
  score.dataset.role = 'score';
  statusLine.append(statusLabel, score);
  statusWrap.appendChild(statusLine);

  const actions = el('div', 'status-actions');
  const retest = el('button', 'btn btn-soft btn-tiny', 'Retest');
  retest.type = 'button';
  retest.onclick = () => testModule(entry);
  const toggle = el('button', 'toggle-log', 'View details ▾');
  toggle.dataset.role = 'toggle';
  toggle.type = 'button';
  actions.append(retest, toggle);
  statusWrap.appendChild(actions);

  const checks = el('div', 'checks');
  checks.dataset.role = 'checks';
  statusWrap.appendChild(checks);

  toggle.onclick = () => {
    const open = checks.classList.toggle('open');
    toggle.textContent = open ? 'Hide details ▴' : 'View details ▾';
  };

  /* media load test */
  const media = el('div', 'media');
  media.appendChild(el('div', 'media-head', 'Content test'));

  const inputRow = el('div', 'media-row');
  const mediaInput = document.createElement('input');
  mediaInput.type = 'text';
  mediaInput.className = 'media-input';
  mediaInput.placeholder = 'keyword… e.g. one piece';
  mediaInput.value = entry.sampleQuery || '';
  const mediaBtn = el('button', 'btn btn-soft btn-tiny', 'Load');
  mediaBtn.type = 'button';
  inputRow.append(mediaInput, mediaBtn);
  media.appendChild(inputRow);

  const mediaHint = el('div', 'media-hint');
  mediaHint.dataset.role = 'mediaHint';
  mediaHint.textContent = 'Search a title and get real details, episodes and streams.';
  media.appendChild(mediaHint);

  const mediaResult = el('div', 'media-result');
  mediaResult.dataset.role = 'mediaResult';
  media.appendChild(mediaResult);

  card.append(head, body, statusWrap, media);
  grid.appendChild(card);

  mediaBtn.onclick = () => runMediaTest(entry, mediaInput.value);
  mediaInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') runMediaTest(entry, mediaInput.value);
  });

  cards.set(entry.id, { card, entry, checks, meta, desc, links, ver, statusLabel, score, toggle, mediaResult, mediaBtn, mediaInput, mediaHint });
}

function fillManifest(entry, m) {
  const ref = cards.get(entry.id);
  if (!ref) return;
  ref.ver.textContent = m.version || '?';

  ref.meta.textContent = '';
  const chips = [
    ['type', m.type || '—'],
    ['language', m.language || '—'],
    ['stream', m.streamType || '—'],
    ['quality', m.quality || '—']
  ];
  for (const [k, v] of chips) {
    const c = el('span', 'chip');
    c.appendChild(el('b', '', k));
    c.appendChild(document.createTextNode(' ' + v));
    ref.meta.appendChild(c);
  }

  ref.desc.textContent = m.description || 'No description in manifest.';

  ref.links.textContent = '';
  const addLink = (label, url) => {
    const a = el('a', 'link', label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    ref.links.appendChild(a);
  };
  if (m.baseUrl) addLink(host(m.baseUrl), m.baseUrl);
  if (m.searchBaseUrl) addLink('search', m.searchBaseUrl);
  if (m.scriptUrl) addLink('script.js', m.scriptUrl);
}

function clearChecks(ref) {
  ref.checks.textContent = '';
}

function addCheckRow(ref, label) {
  const row = el('div', 'check testing');
  const ic = el('span', 'ic', '…');
  row.appendChild(ic);
  const txt = el('div');
  txt.appendChild(el('div', 'label', label));
  const detail = el('div', 'detail');
  detail.dataset.role = 'detail';
  txt.appendChild(detail);
  row.appendChild(txt);
  ref.checks.appendChild(row);
  return { row, ic, detail };
}

function setCheckResult(node, status, detail) {
  node.row.className = 'check ' + status;
  node.ic.textContent = status === 'ok' ? '✓' : status === 'warn' ? '!' : status === 'fail' ? '✕' : '…';
  if (detail) node.detail.textContent = detail;
}

function setCardStatus(ref, status, score) {
  ref.statusLabel.textContent = STATUS_LABEL[status] || status;
  ref.card.querySelector('.status-line').className = 'status-line ' + status;
  if (score !== undefined) ref.score.textContent = score;
  updateSummary();
}

function updateSummary() {
  let ok = 0, warn = 0, fail = 0, pending = 0;
  for (const { card } of cards.values()) {
    const line = card.querySelector('.status-line');
    if (!line) continue;
    if (line.classList.contains('ok')) ok++;
    else if (line.classList.contains('warn')) warn++;
    else if (line.classList.contains('fail')) fail++;
    else pending++;
  }
  counters.total.textContent = cards.size;
  counters.ok.textContent = ok;
  counters.warn.textContent = warn;
  counters.fail.textContent = fail;
}

/* ---------- module checks ---------- */

async function testModule(entry) {
  const ref = cards.get(entry.id);
  clearChecks(ref);
  setCardStatus(ref, 'testing', 'testing…');
  ref.toggle.disabled = false;

  let worst = 0;
  const count = { ok: 0, warn: 0, fail: 0 };

  const addCheck = async (label, fn) => {
    const node = addCheckRow(ref, label);
    try {
      const res = await fn();
      const status = res.warn ? 'warn' : (res.ok ? 'ok' : 'fail');
      if (res.warn) worst = Math.max(worst, 1);
      else if (!res.ok) worst = Math.max(worst, 2);
      count[status]++;
      setCheckResult(node, status, res.detail || '');
      return res;
    } catch (err) {
      count.fail++;
      worst = 2;
      setCheckResult(node, 'fail', (err && err.name ? err.name + ': ' : '') + (err && err.message ? err.message : err));
    }
  };

  /* 1 · manifest */
  await addCheck('Manifest · ' + shortUrl(entry.manifestUrl), async () => {
    const resp = await fetch(entry.manifestUrl, { cache: 'no-store' });
    if (!resp.ok) return { ok: false, detail: 'HTTP ' + resp.status + ' ' + resp.statusText };
    const text = await resp.text();
    let m;
    try { m = JSON.parse(text); }
    catch (e) { return { ok: false, detail: 'Invalid JSON: ' + e.message }; }
    entry.manifest = m;
    fillManifest(entry, m);
    return { ok: true, detail: 'HTTP ' + resp.status + ' · ' + humanBytes(text.length) + ' · valid JSON' };
  });

  const m = entry.manifest;

  /* 2 · required fields */
  await addCheck('Required manifest fields', async () => {
    if (!m) return { ok: false, detail: 'Manifest unavailable' };
    const missing = REQUIRED_FIELDS.filter(k => typeof m[k] !== 'string' || !m[k]);
    const warns = [];
    if (!/^\d+\.\d+\.\d+/.test(String(m.version || ''))) warns.push('version is not semver (X.Y.Z)');
    if (!/^https:\/\//.test(String(m.scriptUrl || ''))) warns.push('scriptUrl is not https');
    if (typeof m.asyncJS !== 'boolean') warns.push('asyncJS missing (assumed false)');
    if (missing.length) return { ok: false, detail: 'Missing: ' + missing.join(', ') };
    if (warns.length) return { ok: true, warn: true, detail: 'All present (' + REQUIRED_FIELDS.length + ') · ' + warns.join(' · ') };
    return { ok: true, detail: 'All present (' + REQUIRED_FIELDS.length + ' valid fields)' };
  });

  /* 3 · script */
  await addCheck('Script · ' + shortUrl(m && m.scriptUrl || ''), async () => {
    if (!m || !m.scriptUrl) return { ok: false, detail: 'Manifest has no scriptUrl' };
    const resp = await fetch(m.scriptUrl, { cache: 'no-store' });
    if (!resp.ok) return { ok: false, detail: 'HTTP ' + resp.status + ' ' + resp.statusText };
    entry.src = await resp.text();
    const ct = resp.headers.get('content-type') || '';
    return { ok: true, detail: 'HTTP ' + resp.status + ' · ' + humanBytes(entry.src.length) + (ct ? ' · ' + ct : '') };
  });

  /* 4 · sandbox load + functions */
  await addCheck('Sandbox load + required functions', async () => {
    if (!entry.src) return { ok: false, detail: 'Could not fetch script source' };
    let exported;
    try {
      exported = new Function(entry.src + '\n;return { searchResults: typeof searchResults, extractDetails: typeof extractDetails, extractEpisodes: typeof extractEpisodes, extractStreamUrl: typeof extractStreamUrl };')();
    } catch (e) {
      return { ok: false, detail: (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : e) };
    }
    const missing = REQUIRED_FN.filter(f => exported[f] !== 'function');
    if (missing.length) return { ok: false, detail: 'Not found: ' + missing.join(', ') };
    return { ok: true, detail: REQUIRED_FN.join(' · ') + ' ✓' };
  });

  /* 5 · provider connectivity */
  await addCheck('Provider · ' + host(m && m.baseUrl || ''), async () => {
    if (!m || !m.baseUrl) return { ok: false, detail: 'Manifest has no baseUrl' };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      await fetch(m.baseUrl, { method: 'GET', mode: 'no-cors', redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      return { ok: true, warn: true, detail: 'Reached in browser (opaque via CORS; resolved with fetchv2 in the app)' };
    } catch (e) {
      clearTimeout(t);
      return { ok: false, warn: true, detail: 'No browser response: ' + (e.name === 'AbortError' ? '10s timeout' : e.message) + ' · may still work in the app' };
    }
  });

  const final = worst === 0 ? 'ok' : worst === 1 ? 'warn' : 'fail';
  setCardStatus(ref, final, count.ok + '/' + (count.ok + count.warn + count.fail));
}

/* ---------- media load test ---------- */

async function ensureServer() {
  if (serverAvailable !== null) return serverAvailable;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch('/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    const data = resp.ok ? await resp.json() : null;
    serverAvailable = !!(data && data.ok && data.server);
  } catch (e) {
    serverAvailable = false;
  }
  serverBanner.hidden = serverAvailable;
  return serverAvailable;
}

function setMediaHint(ref, status, text) {
  ref.mediaHint.className = 'media-hint ' + status;
  ref.mediaHint.textContent = text;
}

function clearMediaResult(ref) {
  ref.mediaResult.textContent = '';
}

function addMediaStep(ref, status, label, detail) {
  const row = el('div', 'check ' + status);
  const ic = el('span', 'ic', status === 'ok' ? '✓' : status === 'warn' ? '!' : status === 'testing' ? '…' : '✕');
  row.appendChild(ic);
  const txt = el('div');
  txt.appendChild(el('div', 'label', label));
  const det = el('div', 'detail');
  if (detail) det.textContent = detail;
  txt.appendChild(det);
  row.appendChild(txt);
  ref.mediaResult.appendChild(row);
}

function addMediaItems(ref, items, max) {
  if (!items || !items.length) return;
  const wrap = el('div', 'media-items');
  for (const it of items.slice(0, max || 6)) {
    const chip = el('span', 'media-item');
    if (it.url) {
      const a = document.createElement('a');
      a.href = it.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = it.quality || it.url;
      a.title = it.url;
      chip.appendChild(a);
    } else {
      chip.textContent = it.label;
    }
    wrap.appendChild(chip);
  }
  if (items.length > (max || 6)) {
    wrap.appendChild(el('span', 'media-item more', '+' + (items.length - (max || 6)) + ' more'));
  }
  ref.mediaResult.appendChild(wrap);
}

function renderMediaState(ref, status, text) {
  clearMediaResult(ref);
  const row = el('div', 'check ' + status);
  row.appendChild(el('span', 'ic', status === 'testing' ? '…' : '✕'));
  const txt = el('div');
  txt.appendChild(el('div', 'label', text));
  row.appendChild(txt);
  ref.mediaResult.appendChild(row);
}

function renderMediaResult(ref, result) {
  clearMediaResult(ref);

  if (result.search && result.search.ok) {
    addMediaStep(ref, 'ok', 'Search «' + result.keyword + '»', result.search.count + ' results');
    addMediaItems(ref, result.search.items.map(i => ({ label: i.title || i.href, url: i.href })), 6);
  } else {
    addMediaStep(ref, 'fail', 'Search', (result.search && result.search.error) || 'no results');
  }

  if (result.details && result.details.ok) {
    const bits = [];
    if (result.details.airdate) bits.push('aired ' + result.details.airdate);
    if (result.details.aliases) bits.push('alias: ' + result.details.aliases);
    addMediaStep(ref, 'ok', 'Details', bits.join(' · '));
    if (result.details.description) {
      const d = el('div', 'desc media-desc', String(result.details.description).slice(0, 300));
      ref.mediaResult.appendChild(d);
    }
  } else {
    addMediaStep(ref, 'fail', 'Details', (result.details && result.details.error) || 'unavailable');
  }

  if (result.episodes && result.episodes.ok) {
    const eps = (result.episodes.items || []).map(e => String(e.number === undefined ? (e.href || '') : e.number));
    addMediaStep(ref, 'ok', 'Episodes', result.episodes.count + ' episodes' + (eps.length ? ' · first: ' + eps.slice(0, 8).join(', ') : ''));
  } else {
    addMediaStep(ref, 'fail', 'Episodes', (result.episodes && result.episodes.error) || 'unavailable');
  }

  if (result.stream && result.stream.ok && result.stream.count > 0) {
    addMediaStep(ref, 'ok', 'Streams', result.stream.count + ' source(s)');
    addMediaItems(ref, result.stream.items.map(s => ({ quality: s.quality || 'stream', url: s.url })), 3);
  } else {
    addMediaStep(ref, 'warn', 'Streams', (result.stream && result.stream.error) || (result.stream && result.stream.count === 0 ? 'no sources in this environment' : 'unavailable'));
  }
}

async function runMediaTest(entry, keyword) {
  keyword = String(keyword || '').trim();
  const ref = cards.get(entry.id);
  if (!keyword) {
    setMediaHint(ref, 'warn', 'Type a keyword to test the module.');
    return;
  }
  if (ref.mediaBtn.disabled) return;
  ref.mediaBtn.disabled = true;
  ref.mediaInput.disabled = true;
  setMediaHint(ref, 'testing', 'Testing «' + keyword + '»…');
  renderMediaState(ref, 'testing', 'Running search → details → episodes → stream…');

  try {
    const avail = await ensureServer();
    if (!avail) {
      setMediaHint(ref, 'fail', 'No local server: run node server.js and open this page from it.');
      renderMediaState(ref, 'fail', 'No /api/test server.');
      return;
    }
    const resp = await fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, keyword })
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'HTTP ' + resp.status);
    renderMediaResult(ref, data.result);
    setMediaHint(ref, 'ok', 'Done.');
  } catch (e) {
    renderMediaState(ref, 'fail', 'Error: ' + (e && e.message ? e.message : e));
    setMediaHint(ref, 'fail', 'Error while testing module.');
  } finally {
    ref.mediaBtn.disabled = false;
    ref.mediaInput.disabled = false;
  }
}

/* ---------- boot ---------- */

function showState(html) {
  grid.textContent = '';
  const box = el('div', 'state-box');
  if (html === 'loading') {
    box.appendChild(el('div', 'spinner'));
    box.appendChild(el('div', '', 'Loading module index…'));
  } else {
    box.innerHTML = html;
  }
  grid.appendChild(box);
}

async function runAll() {
  if (running) return;
  running = true;
  runAllBtn.disabled = true;
  for (const entry of entries) await testModule(entry);
  running = false;
  runAllBtn.disabled = false;
  lastRun.textContent = 'Last run: ' + new Date().toLocaleTimeString() + ' · ' + new Date().toLocaleDateString();
}

async function boot() {
  showState('loading');
  let data;
  try {
    const resp = await fetch('modules.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    data = await resp.json();
  } catch (e) {
    showState('Could not load <code>modules.json</code> (' + esc(e.message) + ').<br>Serve this folder over HTTP (e.g. <code>python -m http.server</code>) or enable GitHub Pages.');
    return;
  }

  entries = Array.isArray(data.modules) ? data.modules : [];
  if (!entries.length) { showState('modules.json contains no modules.'); return; }

  grid.textContent = '';
  for (const entry of entries) renderCard(entry);
  updateSummary();
  fillPlaygroundSelect();

  heroCount.textContent = entries.length;
  watchHeroCount();
  makeSnow();

  await renderConfig();
  await runAll();

  ensureServer();

  copyCmdBtn.addEventListener('click', () => {
    copyText('node server.js').catch(() => {});
  });

  let autoTimer = null;
  autoChk.addEventListener('change', () => {
    clearInterval(autoTimer);
    if (autoChk.checked) autoTimer = setInterval(runAll, 60000);
  });

  runAllBtn.addEventListener('click', runAll);
}

boot();
