/* xdfkenny modules — home page
 * Minimal landing: topbar, snow-animated hero and a live module-count
 * pill fed from modules.json (with a raw-GitHub fallback).
 */

'use strict';

const RAW_REPO = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules';

/* ---------- small helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/* ---------- nav ---------- */

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

/* ---------- hero snow ---------- */

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

/* ---------- live module count ---------- */

let moduleTarget = 0;

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
  const heroCount = document.getElementById('heroCount');
  if (!heroCount) return;
  const hero = document.querySelector('.hero');
  if (!hero || !('IntersectionObserver' in window)) {
    heroCount.textContent = moduleTarget;
    return;
  }
  const io = new IntersectionObserver((list) => {
    for (const entry of list) {
      if (entry.isIntersecting) {
        countUp(heroCount, moduleTarget);
        io.disconnect();
      }
    }
  }, { threshold: 0.35 });
  io.observe(hero);
}

async function loadModuleCount() {
  let data;
  try {
    const resp = await fetch('modules.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    data = await resp.json();
  } catch (e) {
    try {
      const fb = await fetch(RAW_REPO + '/main/modules.json', { cache: 'no-store' });
      if (!fb.ok) throw new Error('HTTP ' + fb.status);
      data = await fb.json();
    } catch (e2) {
      data = null;
    }
  }
  moduleTarget = data && Array.isArray(data.modules) ? data.modules.length : 0;
  watchHeroCount();
}

makeSnow();
loadModuleCount();