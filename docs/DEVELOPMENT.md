# Development

Everything runs without a bundler. `npm install` only brings `web-ext` (lint,
run, zip).

## Requirements

- Node ≥ 18 (tests use `node:test`)
- Firefox 115+ for running the extension
- system `zip` for `npm run build`

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | runs `test/run-tests.mjs` (loads every `lib/` module + `services/services.js` into the Node global, runs 28 vector-based tests) |
| `npm run lint` | `web-ext lint` over the extension root |
| `npm run icons` | regenerates `icons/icon-{16,32,48,96,128}.png` (pure-Node PNG writer, no deps) |
| `npm run build` | tests → manifest validation → `dist/reconkit-<version>.zip` |
| `npm start` | `web-ext run` — launches a Firefox profile with the extension loaded |

## Running in Firefox

```
about:debugging → This Firefox → Load Temporary Add-on
→ dist/reconkit-1.0.0.zip   (or manifest.json for source)
```

The toolbar button opens the popup (`Alt+Shift+R`). `Alt+Shift+A` opens the
analyzer in a tab. The extension ID `reconkit@zishanhack.com` is pinned in
`manifest.json` and enforced by the build.

## Testing the library layer

`test/run-tests.mjs` imports every module in load order, so the same code paths
execute under Node as in the browser. To add coverage for a lib feature, extend
the corresponding `test(...)` block with an authoritative vector (RFC vectors,
known-output fixtures, round trips, error cases).

## Layout rules

1. **lib/** files must stay environment-agnostic: no `browser.*`, no DOM, no
   network. They attach via `RekLib.module(name, factory)` reading
   `globalThis`.
2. **Services** belong in `services/services.js` as catalog entries — never
   hardcode URLs in views. Entries declare which target fields they need
   (`host/domain/url/ip`) and their `build(ctx)` returns the URL.
3. **Views** register themselves as `Rec.views.<id>` with `{ id, label,
   open(params) }`. `boot.js` routes `#/view` hashes to them; context-menu
   payloads arrive via `storage.session` (`rk:payload`) and are passed to
   `open(params)`.
4. Script order matters: see the `<script>` list in `app/app.html` and the
   `content_scripts` list in `manifest.json`. New lib modules must be added to
   both where relevant.
5. Any new permission/host change must be reflected in `manifest.json`,
   `docs/PRIVACY.md`, and validated by the build (unexpected permissions fail
   `npm run build`).

## Debugging the background

Event pages in MV3 wake on demand. `console.info('[ReconKit] background ready
v<version>')` appears once the background runs; message traffic (`rk:sniff` etc.)
can be traced by opening the extension’s internal console via
`about:debugging`. The popup app logs normally in its own devtools panel
(right-click inside the popup → Inspect).

## Packaging checklist

1. `npm test` green
2. `npm run lint` clean (only notes, no errors)
3. `npm run icons` if the brand changed
4. `npm run build` produces `dist/reconkit-<version>.zip`
5. Fresh-profile smoke test: popup opens dark & renders, analyze a page, one
   Recon lookup, DNS lookup, a file analysis, dark reader toggle on a page,
   context menu actions