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
    theme: 'auto',
    consent: { externalFileServices: false },
    recentTargets: []
  }
};

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */
async function activeTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
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
    const results = await browser.tabs.executeScript(tId, {
      code: '(async () => (window.__RK_SNIFFER__ ? await window.__RK_SNIFFER__.run() : null))()'
    });
    const snap = results && results[0];
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
        const tab = await activeTab();
        if (!tab) return { target: null };
        return { target: parseTargetFromUrl(tab.url), tab: { id: tab.id, url: tab.url, title: tab.title } };
      })();
    }
    case 'rk:open-tabs': {
      return openTabs(msg.urls || []).catch((e) => ({ opened: 0, error: String(e) }));
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