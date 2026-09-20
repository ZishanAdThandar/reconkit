# Architecture

ReconKit is a single Firefox WebExtension (Manifest V3, no bundler). Every file
is a classic script that runs as-is, which keeps the extension auditable and
lightweight.

```
┌───────────────────────────────────────────────────────────────┐
│  Firefox                                                      │
│  ┌──────────────┐  ┌──────────────────────┐  ┌─────────────┐  │
│  │ action popup                                          │  │
│  │ app/ (HTML+CSS+JS views)          background/         │  │
│  │  · Utilities / Website / Recon /  │ event page (MV3)  │  │
│  │    DNS-IP / Files / Settings      │  · snapshot cache │  │
│  │  · dark reader · target chip      │  · RPC (rk:*)     │  │
│  │                   │               │  · context menus  │  │
│  └───────────────────┼───────────────┴───────────────────┘  │
│                      │ runtime.sendMessage                      │
│  ┌───────────────────▼──────────────────────────────────────┐  │
│  │ content/sniffer.js  (declared content script)            │  │
│  │ passive DOM snapshot + same-origin HEAD header probe     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                        │                                        │
│  lib/  (pure JS, no browser APIs — shared Node test coverage)   │
│  services/ (OSINT URL catalog — pure data + builders)            │
└───────────────────────────────────────────────────────────────┘
```

## Layers

1. **lib/** — the environment-agnostic tool layer. Each file attaches one module
   to `globalThis.RekLib` (`RekLib.module('name', factory)`). No `browser.*`,
   no DOM, no network: the same files load in the extension pages and in the
   Node test runner. Ordering matters and is fixed by the script tags in
   `app/app.html` (core first). The content script only needs `lib-core.js`,
   `lib/detect.js` and itself.
2. **services/** — `services.js` is pure catalog data + URL builders
   (`RekServices`). It is used by the Recon view, the domain view, and the
   context menu to construct ready-to-open links for a host/domain/IP.
3. **content/sniffer.js** — runs at `document_idle` on `http/https/file`
   pages. Collects a *passive* snapshot (URL parts, meta, links, forms,
   scripts, cookies readable by the page, tech markers via `RekLib.detect`),
   then performs a same-origin `HEAD` (fallback `GET`, body never read) with an
   8 s timeout to sample security-related response headers. It sends the
   snapshot to the background as `rk:auto-snapshot` to warm a cache; the
   app can also force `rk:sniff`, and the background re-runs the sniffer on
   demand by messaging the declared content script (`tabs.sendMessage` with
   `rk:sniff-request`) — never `tabs.executeScript`, which MV3 removed.
4. **background/background.js** — event page. Holds a per-tab snapshot cache
   (fresh for 30 s), answers RPC messages, tracks the active tab for the
   popup, handles the `reconkit-open-analyzer` command. Background
   scripts are plain `browser.*` code (MV3 event page).
5. **background/context-menu.js** — builds the right-click tree
   (selection/page/link/search submenus), hands off context to the app through
   `storage.session` (`rk:payload`) plus a deep link (`app/app.html#/view`).
6. **app/** — the UI. `app.html` loads lib → services → `js/ui.js`,
   `js/tools-registry.js`, views, palette, boot. The same document is used for
   the action popup and a full tab (`btn-open-tab` / context menu) — `boot.js`
   detects the context and adds a `body.compact` (popup) or `body.full`
   (tab) class for the right layout.

## Data flow & state

- **Target**: the background answers `rk:get-target` with the active tab’s
  URL/host/root-domain (via `lib-core.rootDomain`, a compact public-suffix
  heuristic). The app shows it in the target chip; views use it to seed
  their inputs. Tab lifecycle events purge the snapshot cache.
- **Snapshots**: cached in-memory (`background/background.js`, `Map<tabId,
  snapshot>`), never written to disk. “Restricted page” and “not determined”
  states are first-class results, not silent failures.
- **Settings**: `storage.local.settings` — dark-only theme and the file
  analysis consent flag. Everything else (payloads, resolved-IP hints, per-tab
  dark reader state) lives in `storage.session` and is cleaned up.
- **Messages** (`rk:*`): `rk:sniff`, `rk:auto-snapshot`, `rk:get-target`,
  `rk:open-tabs`, `rk:dark-toggle`, `rk:dark-get`, `rk:clear-cache`, `rk:stats`.

## Permissions (why each one exists)

| Permission | Used for |
| --- | --- |
| `activeTab` | one-shot scripted access to the tab the user asks about |
| `tabs` | read the active tab URL/title for the target chip |
| `contextMenus` | right-click integration |
| `storage` | settings + payload handoff |
| `clipboardWrite` | copy buttons |
| `cookies` (optional) | Enhanced cookie analysis (flags/HttpOnly) — opt-in |

> Note: Firefox does not expose `dns` as an *optional* permission, so it is not
> offered. System-resolver features would require requesting it in the manifest
> as a fixed permission, which ReconKit deliberately avoids; DNS lookups use
> public DoH instead (see host permissions).

Host permissions cover only the three direct-fetch APIs: `crt.sh`,
`dns.google`/`cloudflare-dns.com` (DoH), and `ipinfo.io`.

## Constraints that shape the code

- Extension ID: `reconkit@zishanhack.com` — set via
  `browser_specific_settings.gecko.id` and enforced by `tools/build.mjs`.
- Firefox 115+ (MV3 event pages; the `action` popup works from 109+, and the
  `_execute_action` shortcut from 127+ — on older versions the toolbar button
  still opens the popup).
- No bundler: script order in `app.html` and the manifest defines the contract.
- Node ≥ 18 (`node:test`) runs the same lib files — the test vector set in
  `test/run-tests.mjs` is the authoritative behavior spec.