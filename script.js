/* xdfkenny modules — Soft Cryo module library
 * Loads modules.json, renders the module library grid (with search &
 * category/app filters), each card offering Add to Sora + Copy JSON,
 * plus the Manifest Creator and FAQ accordion.
 */

'use strict';

const grid = document.getElementById('grid');
const heroCount = document.getElementById('heroCount');
const cTotal = document.getElementById('cTotal');
const cShowing = document.getElementById('cShowing');

let entries = [];
const cards = new Map();

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

function host(url) {
  try { return new URL(url).host; } catch (e) { return String(url); }
}

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

/* ---------- module links (Add to Sora / Copy JSON) ---------- */

// Manifest links always point straight at their source (GitHub raw, etc.)
// so both "Add to Sora" and "Copy JSON" share one resolved URL per module.
function resolveManifestUrl(url) {
  return url;
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

/* ---------- card rendering ---------- */

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

  card.append(head, body);
  grid.appendChild(card);

  cards.set(entry.id, { card, entry, meta, desc, links, ver });
}

/* ---------- library search & filters ---------- */

const libSearch = document.getElementById('libSearch');
const libSearchClear = document.getElementById('libSearchClear');

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

  /* Quick Actions Row — Add to Sora + Copy JSON only */
  const quickActions = el('div', 'card-quick-actions');

  const targetUrl = resolveManifestUrl(entry.manifestUrl);

  const btnCopyJson = document.createElement('button');
  btnCopyJson.className = 'btn-card-action';
  btnCopyJson.type = 'button';
  btnCopyJson.innerHTML = '<span class="material-symbols-outlined icon-sm">content_copy</span> Copy JSON';
  btnCopyJson.title = 'Copy manifest JSON link for Sora/Luna';
  btnCopyJson.onclick = () => {
    copyText(targetUrl).then(() => flashCopied(btnCopyJson, 'Copied!'));
  };

  const btnAddSora = document.createElement('a');
  btnAddSora.className = 'btn-card-action btn-card-sora';
  btnAddSora.innerHTML = '<span class="material-symbols-outlined icon-sm">add_link</span> Add to Sora';
  btnAddSora.title = 'Add module to Sora app';
  btnAddSora.href = 'sora://default_page?url=' + encodeURIComponent(targetUrl);

  quickActions.append(btnCopyJson, btnAddSora);
  ref.links.appendChild(quickActions);

  filterAndRenderLibrary();
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

async function loadManifest(entry) {
  try {
    const resp = await fetch(entry.manifestUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const m = await resp.json();
    entry.manifest = m;
    fillManifest(entry, m);
  } catch (e) {
    const ref = cards.get(entry.id);
    if (ref) ref.desc.textContent = 'Could not load manifest (' + (e && e.message ? e.message : e) + ').';
  }
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
  if (cTotal) cTotal.textContent = entries.length;
  filterAndRenderLibrary();

  heroCount.textContent = entries.length;
  watchHeroCount();
  makeSnow();

  initManifestCreator();
  initFAQ();

  await Promise.all(entries.map(loadManifest));
}

boot();

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
