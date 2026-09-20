/**
 * ReconKit — Right-click (context menu) integration.
 * Menu tree is rebuilt on install/update/startup. Actions dispatch to the
 * sidebar application (opened as a tab when needed) or open services directly.
 */
'use strict';

const APP_URL = (hash) => browser.runtime.getURL('app/app.html' + (hash || ''));

/* Search engines offered for "search selected text". */
const SEL_SEARCH = [
  { id: 'ddg', name: 'DuckDuckGo', build: (s) => `https://duckduckgo.com/?q=${encodeURIComponent('"' + s + '"')}` },
  { id: 'google', name: 'Google', build: (s) => `https://www.google.com/search?q=${encodeURIComponent('"' + s + '"')}` },
  { id: 'github', name: 'GitHub', build: (s) => `https://github.com/search?q=${encodeURIComponent('"' + s + '"')}&type=code` },
  { id: 'grepapp', name: 'grep.app', build: (s) => `https://grep.app/search?q=${encodeURIComponent(s)}` }
];

/* One-tap services on the page menu, expanded from the clicked tab's host. */
const PAGE_SERVICES = [
  { id: 'crtsh', name: 'crt.sh certificates', build: (h) => `https://crt.sh/?q=%25.${h}` },
  { id: 'wayback', name: 'Wayback Machine', build: (h) => `https://web.archive.org/web/*/${h}*` },
  { id: 'shodan', name: 'Shodan', build: (h) => `https://www.shodan.io/search?query=hostname%3A${h}` },
  { id: 'censys', name: 'Censys', build: (h) => `https://search.censys.io/search?resource=hosts&q=${encodeURIComponent(h)}` },
  { id: 'securityheaders', name: 'SecurityHeaders.com', build: (h) => `https://securityheaders.com/?q=${h}` }
];

async function buildMenus() {
  try { await browser.contextMenus.removeAll(); } catch (e) { /* not created yet */ }
  const root = await browser.contextMenus.create({
    id: 'rk-root', title: 'ReconKit', contexts: ['page', 'selection', 'link']
  });

  // --- Selected text ---
  const sel = await browser.contextMenus.create({
    id: 'rk-sel', parentId: root, title: 'Selected text', contexts: ['selection']
  });
  await browser.contextMenus.create({ id: 'rk-sel-analyze', parentId: sel, title: 'Analyze selected text', contexts: ['selection'] });
  await browser.contextMenus.create({ id: 'rk-sel-decode', parentId: sel, title: 'Decode selected text', contexts: ['selection'] });
  await browser.contextMenus.create({ id: 'rk-sel-hash', parentId: sel, title: 'Hash selected text', contexts: ['selection'] });
  const selSearch = await browser.contextMenus.create({
    id: 'rk-sel-search', parentId: sel, title: 'Search selected text on…', contexts: ['selection']
  });
  for (const svc of SEL_SEARCH) {
    await browser.contextMenus.create({
      id: `rk-sel-search-${svc.id}`, parentId: selSearch, title: svc.name, contexts: ['selection']
    });
  }

  // --- Page ---
  const page = await browser.contextMenus.create({
    id: 'rk-page', parentId: root, title: 'Page', contexts: ['page']
  });
  await browser.contextMenus.create({ id: 'rk-page-analyze', parentId: page, title: 'Analyze current URL', contexts: ['page'] });
  await browser.contextMenus.create({ id: 'rk-page-domain', parentId: page, title: 'Domain / DNS intelligence', contexts: ['page'] });
  await browser.contextMenus.create({ id: 'rk-page-recon', parentId: page, title: 'Open OSINT lookups', contexts: ['page'] });
  const pageSvcs = await browser.contextMenus.create({
    id: 'rk-page-services', parentId: page, title: 'One-tap lookups', contexts: ['page']
  });
  for (const svc of PAGE_SERVICES) {
    await browser.contextMenus.create({
      id: `rk-page-svc-${svc.id}`, parentId: pageSvcs, title: svc.name, contexts: ['page']
    });
  }

  // --- Link ---
  const link = await browser.contextMenus.create({
    id: 'rk-link', parentId: root, title: 'Link', contexts: ['link']
  });
  await browser.contextMenus.create({ id: 'rk-link-analyze', parentId: link, title: 'Analyze linked URL', contexts: ['link'] });
  await browser.contextMenus.create({ id: 'rk-link-recon', parentId: link, title: 'OSINT for linked URL', contexts: ['link'] });

  // --- Open toolkit ---
  await browser.contextMenus.create({
    id: 'rk-open', parentId: root, title: 'Open ReconKit workspace', contexts: ['page', 'selection', 'link']
  });
}

async function storePayload(payload) {
  await browser.storage.session.set({ 'rk:payload': payload });
}

async function openApp(hash, payload) {
  if (payload) await storePayload(payload);
  await browser.tabs.create({ url: APP_URL(hash) });
}

function hostOf(pageUrl) {
  try { return new URL(pageUrl).hostname; } catch (e) { return null; }
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const select = (info.selectionText || '').trim();
  const pageUrl = info.pageUrl || (tab && tab.url) || '';
  const linkUrl = info.linkUrl || null;

  switch (info.menuItemId) {
    case 'rk-sel-analyze':
      return openApp('#/tools', { text: select, toolId: 'identifier' });
    case 'rk-sel-decode':
      return openApp('#/tools', { text: select });
    case 'rk-sel-hash':
      return openApp('#/tools', { text: select, toolId: 'hashing' });
    case 'rk-page-analyze':
      return openApp('#/analyzer', { url: pageUrl, tabId: tab && tab.id != null ? tab.id : null });
    case 'rk-page-domain':
      return openApp('#/domain', { url: pageUrl });
    case 'rk-page-recon':
      return openApp('#/recon', { url: pageUrl });
    case 'rk-link-analyze':
      return openApp('#/analyzer', { url: linkUrl });
    case 'rk-link-recon':
      return openApp('#/recon', { url: linkUrl });
    case 'rk-open':
      return openApp(null, null);
    default:
      break;
  }

  // One-tap service actions
  const selMatch = /^rk-sel-search-(.+)$/.exec(info.menuItemId);
  if (selMatch) {
    const svc = SEL_SEARCH.find((s) => s.id === selMatch[1]);
    if (svc && select) return browser.tabs.create({ url: svc.build(select) });
  }
  const pageMatch = /^rk-page-svc-(.+)$/.exec(info.menuItemId);
  if (pageMatch) {
    const svc = PAGE_SERVICES.find((s) => s.id === pageMatch[1]);
    const host = hostOf(pageUrl);
    if (svc && host) return browser.tabs.create({ url: svc.build(host) });
  }
});

browser.runtime.onInstalled.addListener(() => buildMenus());
browser.runtime.onStartup.addListener(() => buildMenus().catch(() => {}));
buildMenus().catch((e) => console.warn('[ReconKit] menu creation:', e));