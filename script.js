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

const moduleLinks = document.getElementById('moduleLinks');
const copyJsonBtn = document.getElementById('copyJson');
const copyLabel = document.getElementById('copyLabel');

function shortManifest(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch (e) {
    return String(url);
  }
}

let linkSourceMode = 'host';

function resolveManifestUrl(url, mode) {
  if (mode === 'github') return url;
  try {
    let rel = url;
    const match = url.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
    if (match) rel = match[1];
    const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    return new URL(rel, base).href;
  } catch (e) {
    return url;
  }
}

function moduleLinksJSON(modules) {
  return JSON.stringify({
    name: 'xdfkenny-modules',
    source: linkSourceMode === 'host' ? window.location.origin : REPO_URL,
    modules: modules.map((e) => ({ name: e.name, url: resolveManifestUrl(e.manifestUrl, linkSourceMode) }))
  }, null, 2);
}

function flashCopied(btn, text) {
  const orig = btn.textContent;
  const was = btn.dataset.copied;
  btn.textContent = text || 'Copied!';
  btn.classList.add('copied');
  btn.dataset.copied = 'true';
  setTimeout(() => {
    btn.textContent = orig;
    btn.classList.remove('copied');
    btn.dataset.copied = was || '';
  }, 1500);
}

function renderModuleLinks(modules) {
  moduleLinks.textContent = '';
  for (const entry of modules) {
    const card = el('div', 'module-link-card');
    card.dataset.id = entry.id;

    const targetUrl = resolveManifestUrl(entry.manifestUrl, linkSourceMode);
    const icon = el('span', 'module-link-icon', entry.name.charAt(0));
    const name = el('span', 'module-link-name', entry.name);
    const url = el('span', 'module-link-url', shortManifest(targetUrl));
    const hint = el('span', 'module-link-hint', linkSourceMode === 'host' ? 'Host link' : 'GitHub link');

    const btn = el('button', 'btn btn-secondary btn-tiny module-copy', 'Copy link');
    btn.type = 'button';
    btn.title = 'Copy ' + targetUrl;
    btn.addEventListener('click', () => {
      copyText(targetUrl)
        .then(() => flashCopied(btn, 'Copied!'))
        .catch(() => flashCopied(btn, 'Copy failed'));
    });

    card.append(icon, name, url, hint, btn);
    moduleLinks.appendChild(card);
  }
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

function renderConfig() {
  const btnHost = document.getElementById('btnSourceHost');
  const btnGithub = document.getElementById('btnSourceGithub');

  if (btnHost && btnGithub) {
    btnHost.addEventListener('click', () => {
      linkSourceMode = 'host';
      btnHost.classList.add('active');
      btnGithub.classList.remove('active');
      renderModuleLinks(entries);
    });
    btnGithub.addEventListener('click', () => {
      linkSourceMode = 'github';
      btnGithub.classList.add('active');
      btnHost.classList.remove('active');
      renderModuleLinks(entries);
    });
  }

  renderModuleLinks(entries);

  copyJsonBtn.addEventListener('click', () => {
    copyText(moduleLinksJSON(entries))
      .then(() => flashCopied(copyJsonBtn, 'Copied!'))
      .catch(() => flashCopied(copyJsonBtn, 'Copy failed'));
  });

  const btnAddAllSora = document.getElementById('btnAddAllSora');
  if (btnAddAllSora) {
    btnAddAllSora.addEventListener('click', () => {
      const manifestUrl = resolveManifestUrl(
        RAW_REPO + '/main/modules.json', linkSourceMode
      );
      const soraUrl = 'sora://default_page?url=' + encodeURIComponent(manifestUrl);
      window.location.href = soraUrl;
    });
  }
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

/* ---------- library search & filters ---------- */

const libSearch = document.getElementById('libSearch');
const libSearchClear = document.getElementById('libSearchClear');
const cShowing = document.getElementById('cShowing');

let activeCategory = 'all';
let activeApp = 'all';
let searchQuery = '';

function filterAndRenderLibrary() {
  let visibleCount = 0;
  for (const entry of entries) {
    const ref = cards.get(entry.id);
    if (!ref) continue;
    const m = entry.manifest || {};

    /* 1. Category match */
    let matchCat = true;
    const catType = (m.type || entry.id || '').toLowerCase();
    if (activeCategory === 'anime') {
      matchCat = catType.includes('anime') || catType.includes('show') || catType.includes('movie') || entry.id === 'yfsp' || entry.id === 'hydrahd' || entry.id === 'anidb' || entry.id === 'henaojara' || entry.id === 'flixlatam';
    } else if (activeCategory === 'manga') {
      matchCat = catType.includes('manga') || catType.includes('novel') || entry.id.includes('manga') || entry.id === 'comix';
    } else if (activeCategory === 'torrent') {
      matchCat = entry.id === 'torrentio' || catType.includes('torrent') || catType.includes('debrid');
    }

    /* 2. App match */
    let matchApp = true;
    if (activeApp === 'sora') {
      matchApp = m.supportsSora !== false;
    } else if (activeApp === 'luna') {
      matchApp = m.supportsLuna !== false;
    } else if (activeApp === 'shirox') {
      matchApp = m.supportsShirox === true;
    }

    /* 3. Search query match */
    let matchSearch = true;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const text = [
        entry.name, entry.id, m.sourceName, m.description, m.language, m.type, m.quality, m.streamType
      ].filter(Boolean).join(' ').toLowerCase();
      matchSearch = text.includes(q);
    }

    const show = matchCat && matchApp && matchSearch;
    ref.card.style.display = show ? '' : 'none';
    if (show) visibleCount++;
  }
  if (cShowing) cShowing.textContent = visibleCount;
}

function setupLibraryControls() {
  if (libSearch) {
    libSearch.addEventListener('input', () => {
      searchQuery = String(libSearch.value || '').trim();
      if (libSearchClear) libSearchClear.hidden = !searchQuery;
      filterAndRenderLibrary();
    });
  }

  if (libSearchClear) {
    libSearchClear.addEventListener('click', () => {
      if (libSearch) libSearch.value = '';
      searchQuery = '';
      libSearchClear.hidden = true;
      filterAndRenderLibrary();
    });
  }

  const categoryContainer = document.getElementById('categoryFilters');
  if (categoryContainer) {
    categoryContainer.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.filter-pill');
      if (!btn) return;
      categoryContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.category || 'all';
      filterAndRenderLibrary();
    });
  }

  const appContainer = document.getElementById('appFilters');
  if (appContainer) {
    appContainer.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.filter-pill-app');
      if (!btn) return;
      appContainer.querySelectorAll('.filter-pill-app').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeApp = btn.dataset.app || 'all';
      filterAndRenderLibrary();
    });
  }
}

function fillManifest(entry, m) {
  const ref = cards.get(entry.id);
  if (!ref) return;
  ref.ver.textContent = m.version || '?';

  ref.meta.textContent = '';

  /* Tags & Category row */
  const tagsRow = el('div', 'card-tags-row');
  let catClass = 'cat-anime';
  let catLabel = 'Anime/Video';
  const idLow = entry.id.toLowerCase();
  if (idLow.includes('manga') || idLow.includes('novel') || idLow === 'comix') {
    catClass = 'cat-manga'; catLabel = 'Manga/Novel';
  } else if (idLow === 'torrentio') {
    catClass = 'cat-torrent'; catLabel = 'Torrent/Debrid';
  }
  tagsRow.appendChild(el('span', 'badge-cat ' + catClass, catLabel));

  if (m.supportsSora !== false) tagsRow.appendChild(el('span', 'badge-compat', 'Sora ✓'));
  if (m.supportsLuna !== false) tagsRow.appendChild(el('span', 'badge-compat', 'Luna ✓'));
  if (m.supportsShirox === true) tagsRow.appendChild(el('span', 'badge-compat', 'Shirox ✓'));

  ref.meta.appendChild(tagsRow);

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

  /* Quick Actions Row */
  const quickActions = el('div', 'card-quick-actions');

  const btnCopyJson = document.createElement('button');
  btnCopyJson.className = 'btn-card-action';
  btnCopyJson.type = 'button';
  btnCopyJson.innerHTML = '<span class="material-symbols-outlined icon-sm">content_copy</span> Copy JSON';
  btnCopyJson.title = 'Copy manifest link for Sora/Luna';
  btnCopyJson.onclick = () => {
    const targetUrl = resolveManifestUrl(entry.manifestUrl, linkSourceMode);
    copyText(targetUrl).then(() => flashCopied(btnCopyJson, 'Copied!'));
  };

  const btnCopyJs = document.createElement('button');
  btnCopyJs.className = 'btn-card-action';
  btnCopyJs.type = 'button';
  btnCopyJs.innerHTML = '<span class="material-symbols-outlined icon-sm">code</span> Copy JS';
  btnCopyJs.title = 'Copy script URL';
  btnCopyJs.onclick = () => {
    if (m.scriptUrl) copyText(m.scriptUrl).then(() => flashCopied(btnCopyJs, 'Copied!'));
  };

  const btnTest = document.createElement('button');
  btnTest.className = 'btn-card-action btn-play';
  btnTest.type = 'button';
  btnTest.innerHTML = '<span class="material-symbols-outlined icon-sm">play_arrow</span> Test';
  btnTest.title = 'Test module in Playground';
  btnTest.onclick = () => {
    if (pgModule) pgModule.value = entry.id;
    if (pgKeyword) pgKeyword.value = entry.sampleQuery || '';
    document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' });
  };

  const btnAddSora = document.createElement('a');
  btnAddSora.className = 'btn-card-action btn-card-sora';
  btnAddSora.innerHTML = '<span class="material-symbols-outlined icon-sm">add_link</span> Add to Sora';
  btnAddSora.title = 'Add module to Sora app';
  btnAddSora.href = '#'; // set after manifest resolves
  btnAddSora.addEventListener('click', (ev) => {
    const targetUrl = resolveManifestUrl(entry.manifestUrl, linkSourceMode);
    btnAddSora.href = 'sora://default_page?url=' + encodeURIComponent(targetUrl);
  });

  quickActions.append(btnCopyJson, btnCopyJs, btnTest, btnAddSora);
  ref.links.appendChild(quickActions);

  filterAndRenderLibrary();
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

  /* 5 · provider connectivity (browser probe)
     raw.githubusercontent is CORS-enabled, so manifest/script/sandbox work
     in a plain browser. The provider itself is not, so the in-browser probe
     is a network-level reachability check only — inside Sora it is resolved
     by the fetchv2 bridge. No Node server is required for the status grid. */
  await addCheck('Provider · ' + host(m && m.baseUrl || ''), async () => {
    if (!m || !m.baseUrl) return { ok: false, detail: 'Manifest has no baseUrl' };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      await fetch(m.baseUrl, { method: 'GET', mode: 'no-cors', redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      return { ok: true, detail: 'Reachable from browser (CORS opaque; fetchv2 resolves inside Sora)' };
    } catch (e) {
      clearTimeout(t);
      const note = e.name === 'AbortError' ? '10s timeout' : e.message;
      return { ok: false, detail: 'Unreachable from browser: ' + note + ' · resolves via fetchv2 inside Sora' };
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
  } else if (result.episodes) {
    addMediaStep(ref, 'fail', 'Episodes', (result.episodes && result.episodes.error) || 'unavailable');
  }

  if (result.chapters && result.chapters.ok) {
    const chs = (result.chapters.items || []).map(c => c.number !== undefined ? String(c.number) : (c.title || c.href));
    addMediaStep(ref, 'ok', 'Chapters', result.chapters.count + ' chapters' + (chs.length ? ' · first: ' + chs.slice(0, 6).join(', ') : ''));
    addMediaItems(ref, result.chapters.items.map(c => ({ label: c.title || ('Chapter ' + c.number), url: c.href })), 6);
  } else if (result.chapters) {
    addMediaStep(ref, 'fail', 'Chapters', (result.chapters && result.chapters.error) || 'unavailable');
  }

  if (result.text && result.text.ok) {
    addMediaStep(ref, 'ok', 'Text', result.text.images + ' image page(s) · ' + result.text.htmlLength + ' chars');
    if (result.text.sample) addMediaItems(ref, [{ label: 'sample', url: result.text.sample.slice(0, 140) }], 1);
  } else if (result.text) {
    addMediaStep(ref, 'fail', 'Text', (result.text && result.text.error) || (result.text && result.text.htmlLength === 0 ? 'empty response' : 'unavailable'));
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
  setupLibraryControls();
  updateSummary();
  fillPlaygroundSelect();

  heroCount.textContent = entries.length;
  watchHeroCount();
  makeSnow();

  await renderConfig();
  await runAll();
  initAnnouncements();
  renderFeatured(entries);
  initManifestCreator();
  initFAQ();

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

/* ============================================================
   Announcements
   ============================================================ */

const ANNOUNCEMENTS = [
  { text: '🎉 Torrentio Debrid module added — torrent magnet stream resolution via Real-Debrid, AllDebrid and Premiumize.' },
  { text: '⭐ Featured Modules section launched — handpicked quality picks highlighted on the library.' },
  { text: '🔗 One-click <b>Add to Sora</b> buttons are now available on every module card!' },
  { text: '🛠 Manifest Creator tool added — build your own Sora module manifest without writing JSON by hand.' },
  { text: '📖 FAQ section added — answers to common questions about installing and using Sora modules.' }
];

function initAnnouncements() {
  const bar = document.getElementById('announceBar');
  const track = document.getElementById('announceTrack');
  const prevBtn = document.getElementById('announcePrev');
  const nextBtn = document.getElementById('announceNext');
  const closeBtn = document.getElementById('announceClose');
  if (!bar || !track) return;

  let current = 0;
  const slides = [];

  ANNOUNCEMENTS.forEach((a, i) => {
    const slide = el('div', 'announce-slide' + (i === 0 ? ' active' : ''));
    slide.innerHTML = a.text;
    track.appendChild(slide);
    slides.push(slide);
  });

  function goTo(idx) {
    slides[current].classList.remove('active');
    current = (idx + slides.length) % slides.length;
    slides[current].classList.add('active');
  }

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));
  closeBtn.addEventListener('click', () => bar.setAttribute('hidden', ''));

  // Auto-rotate every 6s
  setInterval(() => goTo(current + 1), 6000);
}

/* ============================================================
   Featured modules
   ============================================================ */

const FEATURED_IDS = ['torrentio', 'yfsp', 'hydrahd', 'allmanga'];

const FEAT_META = {
  torrentio: { icon: '🧲', desc: 'Resolve torrent magnets via Debrid services — Real-Debrid, AllDebrid & more.' },
  yfsp: { icon: '🎌', desc: 'High-quality anime streaming with subtitle & dub support from YFSP.' },
  hydrahd: { icon: '🎬', desc: 'Movies & series in multiple qualities via HydraHD provider.' },
  allmanga: { icon: '📖', desc: 'Read manga and novels from AllManga with chapter-level support.' }
};

function renderFeatured(allEntries) {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  grid.textContent = '';

  const featured = FEATURED_IDS
    .map(id => allEntries.find(e => e.id === id))
    .filter(Boolean);

  if (!featured.length) {
    grid.innerHTML = '<p style="color:var(--fg-muted);font-size:0.85rem">Featured modules will appear after the library loads.</p>';
    return;
  }

  for (const entry of featured) {
    const meta = FEAT_META[entry.id] || { icon: '📦', desc: entry.name };
    const card = el('div', 'feat-card');

    const star = el('span', 'material-symbols-outlined feat-star', 'star');
    card.appendChild(star);

    const iconEl = el('div', 'feat-icon', meta.icon);
    card.appendChild(iconEl);

    const name = el('p', 'feat-name', entry.name);
    card.appendChild(name);

    const desc = el('p', 'feat-desc', meta.desc);
    card.appendChild(desc);

    const actions = el('div', 'feat-actions');

    const addBtn = document.createElement('a');
    addBtn.className = 'btn-sora';
    addBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">add_link</span> Add to Sora';
    addBtn.href = 'sora://default_page?url=' + encodeURIComponent(resolveManifestUrl(entry.manifestUrl, linkSourceMode));
    actions.appendChild(addBtn);

    const detailBtn = document.createElement('a');
    detailBtn.className = 'btn btn-soft btn-tiny';
    detailBtn.textContent = 'Details';
    detailBtn.href = '#' + entry.id;
    detailBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const cardEl = document.querySelector('[data-id="' + entry.id + '"]');
      if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    actions.appendChild(detailBtn);

    card.appendChild(actions);
    grid.appendChild(card);
  }
}

/* ============================================================
   Manifest Creator
   ============================================================ */

function initManifestCreator() {
  const genBtn = document.getElementById('crGenerate');
  const resetBtn = document.getElementById('crReset');
  const copyBtn = document.getElementById('crCopy');
  const codeEl = document.getElementById('crCode');
  if (!genBtn || !codeEl) return;

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function generateManifest() {
    const name = getVal('crName');
    const id = getVal('crId');
    const version = getVal('crVersion') || '1.0.0';
    const lang = getVal('crLang') || 'en';
    const scriptUrl = getVal('crScript');
    const description = getVal('crDescription');
    const author = getVal('crAuthor');
    const logoUrl = getVal('crLogo');

    if (!name || !id || !scriptUrl) {
      codeEl.textContent = '// ⚠️ Module Name, Module ID, and Script URL are required.';
      return;
    }

    const features = [];
    if (document.getElementById('crFeatSearch')?.checked) features.push('search');
    if (document.getElementById('crFeatEpisodes')?.checked) features.push('episodes');
    if (document.getElementById('crFeatStreams')?.checked) features.push('streams');
    if (document.getElementById('crFeatDownload')?.checked) features.push('downloads');

    const manifest = {
      sourceName: name,
      id,
      version,
      language: lang,
      scriptUrl,
      type: 'show',
      streamType: 'mp4',
      quality: '1080p',
      baseUrl: '',
      searchBaseUrl: ''
    };

    if (description) manifest.description = description;
    if (author) manifest.author = author;
    if (logoUrl) manifest.iconUrl = logoUrl;
    if (features.length) manifest.features = features;

    codeEl.textContent = JSON.stringify(manifest, null, 2);
  }

  genBtn.addEventListener('click', generateManifest);

  resetBtn.addEventListener('click', () => {
    ['crName','crId','crVersion','crScript','crDescription','crAuthor','crLogo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('crLang').value = 'en';
    document.getElementById('crFeatSearch').checked = true;
    document.getElementById('crFeatEpisodes').checked = true;
    document.getElementById('crFeatStreams').checked = true;
    document.getElementById('crFeatDownload').checked = false;
    codeEl.textContent = '// Fill the form and click Generate Manifest';
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const txt = codeEl.textContent;
      if (!txt || txt.startsWith('//')) return;
      copyText(txt).then(() => flashCopied(copyBtn, 'Copied!'));
    });
  }
}

/* ============================================================
   FAQ accordion
   ============================================================ */

function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  for (const item of faqItems) {
    const btn = item.querySelector('.faq-q');
    const answer = item.querySelector('.faq-a');
    if (!btn || !answer) continue;

    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      // Close all others
      faqItems.forEach(other => {
        if (other !== item) {
          other.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
          other.querySelector('.faq-a')?.classList.remove('open');
        }
      });

      btn.setAttribute('aria-expanded', String(!isOpen));
      answer.classList.toggle('open', !isOpen);
    });
  }
}
