/**
 * ReconKit — Background event page (Manifest V3, Firefox).
 * Responsibilities:
 *  - on-demand page snapshots (cached per tab, fresh for 30 s)
 *  - passive snapshot cache fed by declared content scripts
 *  - RPC helpers used by the popup UI
 *  - keyboard shortcuts
 */
'use strict';

const RK = {
  cache: new Map(),           // tabId -> snapshot
  defaults: {
    theme: 'dark',
    recentTargets: []
  }
};

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */
async function activeTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) return tabs[0];
  } catch (e) { /* currentWindow mismatch */ }
  try {
    const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0] || null;
  } catch (e) { return null; }
}

function parseTargetFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname;
    return {
      url: u.href,
      host: host.toLowerCase(),
      rootDomain: RekLib.rootDomain(host),
      protocol: u.protocol.replace(':', ''),
      port: u.port || (u.protocol === 'https:' ? '443' : '80')
    };
  } catch (e) {
    return null;
  }
}

async function ensureDefaults() {
  try {
    const cur = await browser.storage.local.get('settings');
    if (!cur.settings) {
      await browser.storage.local.set({ settings: RK.defaults });
    }
  } catch (e) { /* storage unavailable */ }
}

/* ------------------------------------------------------------------ *
 * Snapshot service
 * ------------------------------------------------------------------ */
const RESTRICTED = (tabId, url, reason) => ({
  ok: false, restricted: true, tabId, url, reason, sniffedAt: Date.now()
});

async function sniff(tabId) {
  try {
    const tab = tabId ? await browser.tabs.get(tabId) : await activeTab();
    if (!tab) return RESTRICTED(null, null, 'No active tab.');
    const tId = tab.id;
    const url = tab.url || '';
    if (!/^(https?|file):/.test(url)) {
      return RESTRICTED(tId, url, 'This page type cannot be analyzed by a content script (e.g. about:, moz-extension:, data:).');
    }
    const cached = RK.cache.get(tId);
    if (cached && cached.url === url && Date.now() - cached.sniffedAt < 30000) {
      return Object.assign({}, cached, { fromCache: true });
    }
    // Ask the declared content script (already injected into http/https/file
    // pages) for a fresh snapshot. MV3: tabs.executeScript was removed, so we
    // use a message to our own content script instead — needs no host grants.
    let snap = null;
    try {
      snap = await browser.tabs.sendMessage(tId, { type: 'rk:sniff-request' });
    } catch (err) {
      return RESTRICTED(tId, url, 'Sniffer unavailable (page blocked, listener conflict, or extension needs reload).');
    }
    if (!snap || !snap.ok) {
      return RESTRICTED(tId, url, 'Sniffer unavailable (page blocked, listener conflict, or extension needs reload).');
    }
    snap.tabId = tId;
    RK.cache.set(tId, snap);
    return snap;
  } catch (e) {
    const msg = String(e && e.message || e);
    return RESTRICTED(tabId == null ? null : tabId, null,
      /No tab|invalid tab|no tab with id|cannot access/i.test(msg)
        ? 'This tab is not accessible (restricted page or permission).'
        : msg);
  }
}

function purge(tabId) {
  RK.cache.delete(tabId);
}

async function openTabs(urls) {
  const created = [];
  for (const url of urls.slice(0, 25)) {
    try {
      created.push(await browser.tabs.create({ url }));
    } catch (e) { /* skip unopenable */ }
  }
  return { opened: created.length };
}

/* ------------------------------------------------------------------ *
 * Dark reader (per-tab, persisted in session storage)
 * ------------------------------------------------------------------ */
async function darkGet(tabId) {
  try {
    const o = await browser.storage.session.get('rk:dark:' + tabId);
    return !!(o && o['rk:dark:' + tabId]);
  } catch (e) { return false; }
}
async function darkSet(tabId, value) {
  try {
    await browser.storage.session.set({ ['rk:dark:' + tabId]: !!value });
  } catch (e) { /* session storage unavailable */ }
}

/* ------------------------------------------------------------------ *
 * Messaging
 * ------------------------------------------------------------------ */
browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== 'string') return undefined;
  switch (msg.type) {
    case 'rk:sniff': {
      return sniff(msg.tabId).catch((e) => RESTRICTED(msg.tabId, null, String(e)));
    }
    case 'rk:auto-snapshot': {
      const tabId = sender && sender.tab ? sender.tab.id : null;
      if (tabId != null && msg.snapshot && msg.snapshot.ok) {
        msg.snapshot.tabId = tabId;
        RK.cache.set(tabId, msg.snapshot);
      }
      return Promise.resolve({ received: true });
    }
    case 'rk:get-target': {
      return (async () => {
        // Prefer the originating tab: popup and context-menu messages carry
        // sender.tab — the tab the user was actually on. tabs.query from the
        // event page can resolve to the wrong window in some Firefox popup
        // configurations, so it is only used as a fallback here.
        const tab = (sender && sender.tab && sender.tab.url) ? sender.tab : await activeTab();
        if (!tab || !tab.url) return { target: null, tab: tab ? { id: tab.id } : null };
        return { target: parseTargetFromUrl(tab.url), tab: { id: tab.id, url: tab.url, title: tab.title } };
      })();
    }
    case 'rk:open-tabs': {
      return openTabs(msg.urls || []).catch((e) => ({ opened: 0, error: String(e) }));
    }
    case 'rk:dark-toggle': {
      const dTab = msg.tabId;
      if (dTab == null) return Promise.resolve({ ok: false, reason: 'No tab.' });
      return browser.tabs.sendMessage(dTab, { type: 'rk:dark-toggle' })
        .then(async (r) => {
          if (!r || !r.ok) return { ok: false, reason: 'Page not scriptable for dark reader.' };
          await darkSet(dTab, !!r.dark);
          return { ok: true, dark: !!r.dark, tabId: dTab };
        })
        .catch(() => Promise.resolve({ ok: false, reason: 'Page not scriptable for dark reader.' }));
    }
    case 'rk:dark-get': {
      return darkGet(msg.tabId).then((dark) => ({ ok: true, dark, tabId: msg.tabId }));
    }
    case 'rk:clear-cache': {
      RK.cache.clear();
      return Promise.resolve({ cleared: true });
    }
    case 'rk:stats': {
      return Promise.resolve({ cachedTabs: RK.cache.size });
    }
    default:
      return undefined;
  }
});

/* ------------------------------------------------------------------ *
 * Tab lifecycle
 * ------------------------------------------------------------------ */
browser.tabs.onRemoved.addListener(purge);
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') purge(tabId);
});
browser.tabs.onActivated.addListener((info) => {
  // Keep the cache small; background may wake — harmless purge on switch.
  purge(info.tabId);
});

/* ------------------------------------------------------------------ *
 * Commands & lifecycle
 * ------------------------------------------------------------------ */
browser.commands.onCommand.addListener(async (command) => {
  if (command === 'reconkit-open-analyzer') {
    const url = browser.runtime.getURL('app/app.html#/analyzer');
    await browser.tabs.create({ url });
  }
});

(async function init() {
  await ensureDefaults();
  // Give the popup a few seconds of snapshot warm-up budget; mainly relies
  // on declared content scripts + on-demand sniffing.
  console.info('[ReconKit] background ready v' + (browser.runtime.getManifest().version));
})();

// Export helpers for other background scripts (loaded after this file).
globalThis.RK = RK;
globalThis.RK_helpers = { activeTab, parseTargetFromUrl, sniff, openTabs, purge };