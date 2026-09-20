/**
 * ReconKit — Application bootstrap.
 * Settings, theme, target tracking, navigation, payload handoff, status bar.
 */
'use strict';
var Rec = window.Rec = window.Rec || {};

Rec.settings = (() => {
  const defaults = { theme: 'dark' };
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
  // ReconKit is dark-only. No light mode, no system-follow: keeps the chrome
  // consistent with the dark page-darkening reader everywhere.
  function resolve() { return 'dark'; }
  async function apply() {
    document.documentElement.setAttribute('data-theme', 'dark');
    return 'dark';
  }
  function init() { return apply(); }
  return { apply, resolve, init };
})();

Rec.darkPage = (() => {
  // Dark reader: inverts the CONTENT of the current web page (per tab, opt-in).
  // The background forwards a toggle to the declared content script.
  let on = false;

  function paint() {
    const b = document.getElementById('btn-darkpage');
    if (!b) return;
    if (on) b.dataset.on = '1'; else delete b.dataset.on;
    b.title = on ? 'Dark reader: restore page to normal' : 'Dark reader: darken this page content';
  }

  async function refresh() {
    on = false;
    const t = Rec.target;
    if (t && t.tabId != null) {
      try {
        const r = await browser.runtime.sendMessage({ type: 'rk:dark-get', tabId: t.tabId });
        if (r && r.ok && r.dark) on = true;
      } catch (e) { /* background sleeping */ }
    }
    paint();
  }

  async function toggle() {
    const t = Rec.target;
    if (!t || t.tabId == null) {
      Rec.ui.toast('Open ReconKit from a web page to use the dark reader.');
      return;
    }
    try {
      const r = await browser.runtime.sendMessage({ type: 'rk:dark-toggle', tabId: t.tabId });
      if (!r || !r.ok) {
        Rec.ui.toast((r && r.reason) || 'This page cannot be darkened.');
        return;
      }
      on = !!r.dark;
    } catch (e) {
      Rec.ui.toast('This page cannot be darkened.');
      return;
    }
    paint();
    Rec.ui.toast(on ? 'Dark reader on — content darkened' : 'Dark reader off — content restored');
  }

  function init() {
    paint();
    document.getElementById('btn-darkpage').addEventListener('click', toggle);
  }

  return { init, refresh, toggle, isOn: () => on };
})();

Rec.nav = (() => {
  const VIEW_IDS = ['tools', 'analyzer', 'recon', 'domain', 'settings'];
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
    } catch (e) { /* background not ready */ }
    // Fallback: derive the target straight from the popup window when the
    // background could not resolve it (asleep, wrong-window quirk, whatever).
    if (!this.host) await this._deriveFromTabs();
    renderChip();
    return this;
  },
  async _deriveFromTabs() {
    if (typeof browser === 'undefined' || !browser.tabs || !browser.tabs.query) return;
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.url) return;
      const u = new URL(tab.url);
      if (!/^https?:$/.test(u.protocol)) return;
      const host = u.hostname.toLowerCase();
      this.tabId = tab.id;
      this.url = u.href;
      this.host = host;
      this.rootDomain = (typeof RekLib !== 'undefined' && RekLib.rootDomain) ? RekLib.rootDomain(host) : host;
      this.title = tab.title || null;
    } catch (e) { /* restricted page or parse error */ }
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
    ['Recon lookups', () => Rec.nav.go('recon')]
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
  Rec.darkPage.init();

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
  await Rec.darkPage.refresh();
  browser.tabs.onActivated.addListener(() => {
    Rec.target.refresh().then(() => { statusFor(Rec.target.host); return Rec.darkPage.refresh(); });
  });
  browser.tabs.onUpdated.addListener((_id, info) => {
    if (info.url || info.title) {
      Rec.target.refresh().then(() => Rec.darkPage.refresh());
    }
  });

  // Route to initial view (hash decides; payload may override)
  await consumePayload();
  const m = /^#\/([a-z]+)/.exec(location.hash || '');
  const initial = m && ['tools', 'analyzer', 'recon', 'domain', 'settings'].includes(m[1]) ? m[1] : null;
  Rec.nav.go(initial || 'tools');
}

document.addEventListener('DOMContentLoaded', init);