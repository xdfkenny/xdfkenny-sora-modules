/* xdfkenny modules — Soft Cryo module library
 * Loads modules.json, renders the module library grid (with search &
 * category/app filters), each card offering Add to Sora + Copy JSON,
 * plus the Manifest Creator and FAQ accordion.
 */

'use strict';

const RAW_REPO = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules';

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

  const headInfo = el('div', 'cufiy-head-info');
  const titleRow = el('div', 'card-title-row');
  titleRow.appendChild(el('div', 'card-title', entry.name));
  const ver = el('span', 'ver', '–');
  ver.dataset.role = 'ver';
  titleRow.appendChild(ver);
  headInfo.appendChild(titleRow);
  // branch hidden per request - all xdfkenny/main anyway (cufiy no owner)

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
  const idLow = entry.id.toLowerCase();
  const cufiyMeta = el('div', 'cufiy-meta');
  const flag = el('span', 'cufiy-flag', flagFor(m.language));
  cufiyMeta.appendChild(flag);
  cufiyMeta.appendChild(el('span', 'cufiy-lang', m.language || '—'));
  // type icon - 5 distinct, data-driven from modules.json category / manifest type
  let typeIcon = 'movie';
  const rawCat = String(entry.category || m.category || m.type || '').toLowerCase();
  if (rawCat === 'mangas' || rawCat.includes('manga')) typeIcon = 'auto_stories';
  else if (rawCat === 'novels' || rawCat.includes('novel')) typeIcon = 'menu_book';
  else if (rawCat.includes('torrent') || rawCat.includes('debrid')) typeIcon = 'download';
  else if (rawCat.includes('movie') || rawCat.includes('show') || rawCat.includes('film')) typeIcon = 'theaters';
  else if (rawCat.includes('anime')) typeIcon = 'live_tv';
  const typeEl = el('span', 'material-symbols-outlined icon-sm cufiy-type', typeIcon);
  cufiyMeta.appendChild(typeEl);
  if (m.downloadSupport) {
    cufiyMeta.appendChild(el('span', 'material-symbols-outlined icon-sm cufiy-dl', 'cloud_download'));
  }
  ref.meta.appendChild(cufiyMeta);

  ref.desc.textContent = '';
  ref.desc.style.display = 'none';

  ref.links.textContent = '';

  /* Cufiy-style split button: Add to Sora (80%) + copy link icon (20%) - no owner */
  const targetUrl = resolveManifestUrl(entry.manifestUrl);
  const actions = el('div', 'cufiy-actions');
  const btnAddSora = document.createElement('a');
  btnAddSora.className = 'cufiy-add';
  btnAddSora.innerHTML = 'Add to Sora';
  btnAddSora.title = 'Add module to Sora app';
  btnAddSora.href = 'sora://default_page?url=' + encodeURIComponent(targetUrl);
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
    const resp = await fetch('modules.json', { cache: 'no-store' });
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

  if (heroCount) heroCount.textContent = entries.length;
  watchHeroCount();
  makeSnow();

  initRequestForm();
  initFAQ();

  await Promise.all(entries.map(loadManifest));
}

boot();

/* ============================================================
   Request Module - Discord webhook
   ============================================================ */

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1536128336164556840/2uJi102cuoLzLMfXrPemHkNazXix7TlW0bIjGy9AgPiKx0k_iZzd9FHDZj5TZCvJQsyJ';

function initRequestForm() {
  const submitBtn = document.getElementById('rqSubmit');
  const resetBtn = document.getElementById('rqReset');
  const statusEl = document.getElementById('rqStatus');
  if (!submitBtn) return;

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function setStatus(msg, ok) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'creator-status ' + (ok ? 'ok' : 'err');
  }

  resetBtn?.addEventListener('click', () => {
    ['rqName','rqLang','rqUrl','rqReason','rqDiscord'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    setStatus('', true);
  });

  submitBtn.addEventListener('click', async () => {
    const name = getVal('rqName');
    const lang = getVal('rqLang');
    const url = getVal('rqUrl');
    const reason = getVal('rqReason');
    const discord = getVal('rqDiscord');

    if (!name || !lang || !url || !reason || !discord) {
      setStatus('Please fill all required fields (name, language, URL, reason, Discord username).', false);
      return;
    }

    // basic URL validation
    try { new URL(url); } catch (e) {
      setStatus('Please enter a valid URL (https://...).', false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">hourglass_top</span> Sending...';
    setStatus('', true);

    const payload = {
      username: 'request module',
      embeds: [{
        title: 'New Module Request',
        color: 0x7EC8E3,
        fields: [
          { name: 'Module / Website', value: name.slice(0, 256), inline: false },
          { name: 'Language', value: lang.slice(0, 100), inline: true },
          { name: 'Discord', value: discord.slice(0, 100), inline: true },
          { name: 'URL', value: url.slice(0, 500), inline: false },
          { name: 'Reason', value: reason.slice(0, 1000), inline: false }
        ],
        footer: { text: 'xdfkenny modules — request form' },
        timestamp: new Date().toISOString()
      }]
    };

    try {
      const resp = await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const text = await resp.text().catch(()=> '');
        throw new Error(text || 'HTTP ' + resp.status);
      }
      setStatus('Request sent! We will contact you on Discord about the status.', true);
      ['rqName','rqUrl','rqReason'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    } catch (e) {
      setStatus('Failed to send: ' + (e.message || e) + ' — please try again or contact xdfkenny@gmail.com', false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">send</span> Send Request';
    }
  });
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
