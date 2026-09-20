/**
 * ReconKit — Application bootstrap.
 * Settings, theme, target tracking, navigation, payload handoff, status bar.
 */
'use strict';
const Rec = window.Rec = window.Rec || {};

Rec.settings = (() => {
  const defaults = { theme: 'auto', consent: { externalFileServices: false } };
  let cache = null;
  async function get() {
    if (cache) return cache;
    try {
      const o = (await browser.storage.local.get('settings')).settings;
      cache = Object.assign({}, defaults, o || {});
    } catch (e) { cache = Object.assign({}, defaults); }
    return cache;
  }
  async function set(patch) {
    const cur = await get();
    Object.assign(cur, patch);
    try { await browser.storage.local.set({ settings: cur }); } catch (e) {}
    return cur;
  }
  function invalidate() { cache = null; }
  return { defaults, get, set, invalidate };
})();

Rec.theme = (() => {
  function resolve(theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }
  async function apply() {
    const s = await Rec.settings.get();
    const mode = resolve(s.theme);
    document.documentElement.setAttribute('data-theme', mode);
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.title = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      btn.innerHTML = mode === 'dark'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg>';
    }
    return mode;
  }
  async function toggle() {
    const s = await Rec.settings.get();
    const currentMode = await apply();
    await Rec.settings.set({ theme: currentMode === 'dark' ? 'light' : 'dark' });
    await apply();
  }
  function init() {
    apply();
    if (typeof matchMedia !== 'undefined') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply());
    }
    document.getElementById('btn-theme').addEventListener('click', toggle);
  }
  return { apply, toggle, init, resolve };
})();

Rec.nav = (() => {
  const VIEW_IDS = ['tools', 'analyzer', 'recon', 'domain', 'files', 'settings'];
  let current = 'tools';
  let pendingPayload = null;

  function parseHash() {
    const m = /^#\/([a-z]+)/.exec(location.hash || '');
    return m && VIEW_IDS.includes(m[1]) ? m[1] : null;
  }

  function go(viewId, params) {
    if (!VIEW_IDS.includes(viewId)) viewId = 'tools';
    current = viewId;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === viewId));
    document.querySelectorAll('main.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + viewId));
    const view = Rec.views[viewId];
    if (view && view.open) {
      const merged = params || null;
      view.open(pendingPayload && !params ? pendingPayload : merged);
    }
    pendingPayload = null;
    if (location.hash !== '#/' + viewId) history.replaceState(null, '', '#/' + viewId);
    return viewId;
  }

  function init() {
    document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    window.addEventListener('hashchange', () => { const v = parseHash(); if (v) go(v); });
  }

  return { go, init, is: (id) => current === id, setPayload: (p) => { pendingPayload = p; } };
})();

Rec.target = {
  tabId: null,
  url: null, host: null, rootDomain: null, ip: null, title: null,
  async refresh() {
    try {
      const r = await browser.runtime.sendMessage({ type: 'rk:get-target' });
      if (r && r.target) {
        this.tabId = r.tab && r.tab.id != null ? r.tab.id : null;
        this.url = r.target.url; this.host = r.target.host; this.rootDomain = r.target.rootDomain; this.title = r.tab ? r.tab.title : null;
      } else {
        this.tabId = null; this.url = null; this.host = null; this.rootDomain = null;
      }
      renderChip();
    } catch (e) { /* background not ready */ }
    return this;
  }
};

function renderChip() {
  const label = document.getElementById('target-label');
  const dot = document.getElementById('target-dot');
  const t = Rec.target;
  if (t.host) { label.textContent = t.host; dot.classList.remove('off'); }
  else { label.textContent = 'no target'; dot.classList.add('off'); }
}

function targetMenu() {
  const menu = document.getElementById('target-menu');
  const items = (entries) => entries.forEach(([label, fn]) => {
    menu.appendChild(Object.assign(document.createElement('button'), {
      className: 'tm-item', textContent: label, onclick: () => { menu.classList.add('hidden'); fn(); }
    }));
  });
  menu.replaceChildren();
  const t = Rec.target;
  items([
    ['Copy hostname', () => Rec.ui.copyText(t.host || '')],
    ['Copy URL', () => Rec.ui.copyText(t.url || '')],
    ['Analyze website', () => Rec.nav.go('analyzer')],
    ['DNS / IP intelligence', () => Rec.nav.go('domain')],
    ['OSINT lookups', () => Rec.nav.go('recon')]
  ]);
  menu.appendChild(Object.assign(document.createElement('div'), { className: 'tm-sep' }));
  items([['Open in a full tab', () => browser.tabs.create({ url: location.href })]]);
  const r = menu.getBoundingClientRect();
  const chip = document.getElementById('target-chip').getBoundingClientRect();
  menu.style.top = (chip.bottom + 6) + 'px';
  menu.style.left = Math.max(8, Math.min(chip.left, window.innerWidth - r.width - 8)) + 'px';
  menu.classList.remove('hidden');
}

async function consumePayload() {
  try {
    const o = await browser.storage.session.get('rk:payload');
    const p = o['rk:payload'];
    if (!p) return;
    await browser.storage.session.remove('rk:payload');
    // The deep-link hash (#/view) is the routing authority; payload.viewId is
    // a fallback for programmatic callers.
    const m = /^#\/([a-z]+)/.exec(location.hash || '');
    let view = (m && ['tools', 'analyzer', 'recon', 'domain'].includes(m[1])) ? m[1]
      : (p.viewId && ['tools', 'analyzer', 'recon', 'domain'].includes(p.viewId)) ? p.viewId : null;
    const params = {};
    if (view === 'tools') { if (p.toolId) params.toolId = p.toolId; if (typeof p.text === 'string') params.text = p.text; }
    if (view === 'analyzer') { if (p.url) params.url = p.url; if (p.tabId != null) params.tabId = p.tabId; }
    if (view === 'recon' || view === 'domain') { if (p.url) params.url = p.url; if (p.host) params.host = p.host; }
    if (view) Rec.nav.setPayload(params);
    else if (params.text) {
      // Written directly to the tools view (no hash present).
      Rec.nav.setPayload(params);
      Rec.nav.go('tools', params);
    }
  } catch (e) { /* no payload */ }
}

function statusFor(host) {
  document.getElementById('status-dot').style.background = host ? 'var(--ok)' : 'var(--text-faint)';
}

async function init() {
  // Detect context for the Settings label: action popup (narrow) vs full tab (wide).
  Rec.compact = window.innerWidth < 700;
  document.body.classList.add('full');
  document.getElementById('version-label').textContent = 'v' + browser.runtime.getManifest().version;

  Rec.theme.init();
  Rec.nav.init();
  Rec.palette.init();

  document.getElementById('target-chip').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('target-menu');
    if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
    targetMenu();
  });
  document.addEventListener('click', () => document.getElementById('target-menu').classList.add('hidden'));
  document.getElementById('btn-open-tab').addEventListener('click', () => browser.tabs.create({ url: location.href.split('#')[0] }));

  // Track target
  await Rec.target.refresh();
  statusFor(Rec.target.host);
  browser.tabs.onActivated.addListener(() => { Rec.target.refresh(); statusFor(Rec.target.host); });
  browser.tabs.onUpdated.addListener((_id, info) => {
    if (info.url || info.title) Rec.target.refresh();
  });

  // Route to initial view (hash decides; payload may override)
  await consumePayload();
  const m = /^#\/([a-z]+)/.exec(location.hash || '');
  const initial = m && ['tools', 'analyzer', 'recon', 'domain', 'files', 'settings'].includes(m[1]) ? m[1] : null;
  Rec.nav.go(initial || 'tools');

  // Files view initialises lazily via open().
}

document.addEventListener('DOMContentLoaded', init);