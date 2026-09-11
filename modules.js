/* xdfkenny modules — library page
 * Loads ../modules.json, renders the full module library grid with search,
 * category and app filters, and offers Add to Sora + Copy JSON per card.
 */

'use strict';

const RAW_REPO = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules';
const MODULES_JSON = '../modules.json';

const grid = document.getElementById('grid');
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

/* ---------- module links (Add to Sora / Copy JSON) ---------- */

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

/* ---------- card rendering ---------- */

function renderCard(entry) {
  const card = el('div', 'card');
  card.dataset.id = entry.id;
  if (entry.discontinued) card.classList.add('card-discontinued');

  const head = el('div', 'card-head');

  const iconWrap = el('div', 'card-icon');
  const img = document.createElement('img');
  img.alt = entry.name;
  img.loading = 'lazy';
  img.onerror = () => { img.replaceWith(el('div', '', entry.name.charAt(0))); };
  img.src = entry.iconUrl;
  iconWrap.appendChild(img);

  const headInfo = el('div', 'cufiy-head-info');
  const titleRow = el('div', 'card-title-row');
  titleRow.appendChild(el('div', 'card-title', entry.name));
  const ver = el('span', 'ver', '–');
  ver.dataset.role = 'ver';
  titleRow.appendChild(ver);
  headInfo.appendChild(titleRow);

  head.append(iconWrap, headInfo);

  const body = el('div', 'card-body');
  const meta = el('div', 'meta');
  meta.dataset.role = 'meta';
  meta.appendChild(el('span', 'chip', 'loading…'));
  body.appendChild(meta);

  const desc = el('p', 'desc', '');
  desc.dataset.role = 'desc';
  desc.style.display = 'none';
  body.appendChild(desc);

  const links = el('div', 'links');
  links.dataset.role = 'links';
  body.appendChild(links);

  card.append(head, body);

  if (entry.discontinued) {
    const badge = el('span', 'discontinued-badge');
    badge.innerHTML = '<span class="material-symbols-outlined icon-sm">block</span> Discontinued';
    card.appendChild(badge);
  }

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

    /* 1. Category match - purely data-driven from modules.json category / manifest type */
    let matchCat = true;
    const rawCat = String(entry.category || m.category || m.type || entry.id || '').toLowerCase();
    if (activeCategory === 'anime') {
      matchCat = rawCat.includes('anime');
    } else if (activeCategory === 'movie') {
      matchCat = rawCat.includes('movie') || rawCat.includes('show') || rawCat.includes('film');
    } else if (activeCategory === 'manga') {
      matchCat = rawCat === 'mangas' || rawCat.includes('manga');
    } else if (activeCategory === 'novel') {
      matchCat = rawCat === 'novels' || rawCat.includes('novel');
    } else if (activeCategory === 'torrent') {
      matchCat = rawCat.includes('torrent') || rawCat.includes('debrid');
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

function flagFor(lang) {
  const l = String(lang || '').toLowerCase();
  if (l.includes('english')) return '🇬🇧';
  if (l.includes('chinese') || l.includes('中文') || l.includes('zh')) return '🇨🇳';
  if (l.includes('spanish') || l.includes('español') || l.includes('latam')) return '🇪🇸';
  if (l.includes('japanese') || l.includes('japan') || l.includes('ja')) return '🇯🇵';
  if (l.includes('korean') || l.includes('ko')) return '🇰🇷';
  if (l.includes('french') || l.includes('fr')) return '🇫🇷';
  if (l.includes('portuguese') || l.includes('pt')) return '🇵🇹';
  if (l.includes('multi')) return '🌐';
  return '🌐';
}

function fillManifest(entry, m) {
  const ref = cards.get(entry.id);
  if (!ref) return;
  ref.ver.textContent = m.version || '?';

  ref.meta.textContent = '';

  /* Cufiy-style meta: flag + language + type icon (+ download) - no owner */
  const cufiyMeta = el('div', 'cufiy-meta');
  const flag = el('span', 'cufiy-flag', flagFor(m.language));
  cufiyMeta.appendChild(flag);
  cufiyMeta.appendChild(el('span', 'cufiy-lang', m.language || '—'));
  // type icons - show ALL categories the module belongs to (data-driven)
  const rawCat = String(entry.category || m.category || m.type || '').toLowerCase();
  const icons = [];
  if (rawCat.includes('anime')) icons.push('live_tv');
  if (rawCat.includes('movie') || rawCat.includes('show') || rawCat.includes('film')) icons.push('theaters');
  if (rawCat === 'mangas' || rawCat.includes('manga')) icons.push('auto_stories');
  if (rawCat === 'novels' || rawCat.includes('novel')) icons.push('menu_book');
  if (rawCat.includes('torrent') || rawCat.includes('debrid')) icons.push('download');
  // fallback if no match
  if (!icons.length) icons.push('movie');
  for (const ic of icons) {
    cufiyMeta.appendChild(el('span', 'material-symbols-outlined icon-sm cufiy-type', ic));
  }
  if (m.downloadSupport) {
    cufiyMeta.appendChild(el('span', 'material-symbols-outlined icon-sm cufiy-dl', 'cloud_download'));
  }
  ref.meta.appendChild(cufiyMeta);

  ref.desc.textContent = '';
  ref.desc.style.display = 'none';

  ref.links.textContent = '';

  /* Discontinued modules: no add/copy actions — just a muted, dead bar. */
  if (entry.discontinued) {
    ref.desc.textContent = m.description || 'This module has been discontinued and is no longer maintained.';
    ref.desc.style.display = '';
    const bar = el('div', 'discontinued-bar');
    bar.innerHTML = '<span class="material-symbols-outlined icon-sm">block</span> Discontinued';
    ref.links.appendChild(bar);
    filterAndRenderLibrary();
    return;
  }

  /* Cufiy-style split button: Add to Sora (80%) + copy link icon (20%) - no owner */
  const targetUrl = entry.manifestUrl;
  const actions = el('div', 'cufiy-actions');
  const btnAddSora = document.createElement('a');
  btnAddSora.className = 'cufiy-add';
  btnAddSora.innerHTML = 'Add to Sora';
  btnAddSora.title = 'Add module to Sora app';
  btnAddSora.href = 'sora://module?url=' + encodeURIComponent(targetUrl);
  const btnCopy = document.createElement('button');
  btnCopy.className = 'cufiy-copy';
  btnCopy.type = 'button';
  btnCopy.innerHTML = '<span class="material-symbols-outlined icon-sm">link</span>';
  btnCopy.title = 'Copy JSON link';
  btnCopy.onclick = () => {
    copyText(targetUrl).then(() => flashCopied(btnCopy, 'Copied!'));
  };
  actions.append(btnAddSora, btnCopy);
  ref.links.appendChild(actions);

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
    const resp = await fetch(MODULES_JSON, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    data = await resp.json();
  } catch (e) {
    // Fallback for file:// or CORS - try raw GitHub
    try {
      const fb = await fetch(RAW_REPO + '/main/modules.json', { cache: 'no-store' });
      if (!fb.ok) throw new Error('HTTP ' + fb.status);
      data = await fb.json();
    } catch (e2) {
      showState('Could not load <code>modules.json</code> (' + esc(e.message) + ').<br>Serve this folder over HTTP (e.g. <code>python -m http.server</code>) or enable GitHub Pages. Fallback also failed: ' + esc(e2.message));
      return;
    }
  }

  entries = Array.isArray(data.modules) ? data.modules : [];
  if (!entries.length) { showState('modules.json contains no modules.'); return; }

  grid.textContent = '';
  for (const entry of entries) renderCard(entry);
  setupLibraryControls();
  if (cTotal) cTotal.textContent = entries.length;
  filterAndRenderLibrary();

  await Promise.all(entries.map(loadManifest));
}

boot();