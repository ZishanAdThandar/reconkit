# Extending ReconKit

ReconKit is deliberately plain: no framework, no build step, so extending it is
a matter of writing small, self-contained files.

## Adding a local tool

1. In `app/js/tools-registry.js` call the internal `$` helper:

   ```js
   $('mytool', 'Ciphers', 'My cipher',
     'One-line description shown under the tool name.',
     [ { key: 'shift', label: 'Shift', type: 'num', def: 4 } ],      // opts
     (ctx) => ({ outputs: [ { label: 'Result', text: transform(ctx.text, ctx.opts.shift), kind: 'mono' } ] }));
   ```

   - `ctx.text` — the input box content; `ctx.opts.<key>` — option values.
   - Return `{ outputs: [{ label, text, kind: 'mono'|'text' }], note? }` or
     `{ error: '…' }`.
2. If the logic is reusable/testable, move it into **lib/** as a module and
   expose both lib API and tool:
   - `lib/mytool.js` → `(function(g){ … g.RekLib.module('mytool', () => ({…})); })`
   - add the `<script>` after its dependency in `app/app.html`,
   - add it to the `LIBS` array in `test/run-tests.mjs` and write tests,
   - add an option to the palette automatically? Tools appear in the palette
     automatically via `Rec.tools.list` — nothing else to do.

## Adding an OSINT service

Append an entry to `SERVICES` in `services/services.js`:

```js
{ id: 'my-service', group: 'Domain intelligence', name: 'My Service',
  target: ['domain'],
  build: (c) => `https://example.com/search?q=${encodeURIComponent(c.rootDomain)}` }
```

- `target` declares when the service applies: `host`, `domain` (uses
  `rootDomain`), `url`, or `ip`. If more than one field is needed, list them.
- `build(ctx)` receives `{ url, host, rootDomain, protocol, port, ip, isIp,
  searchValue }`. For search-style engines use `c.searchValue` (host or URL,
  or IP).
- Set `requires: 'file'` + `note` for file-analysis services; those appear in
  the Files view only and stay behind the consent gate.
- No new code in views is required — the OSINT/DNS views and context menu pick
  the catalog up automatically.

## Adding a view

1. Register with `Rec.views.<id> = { id, label, open(params) }` and mount your
   DOM inside `el('view-<id>')`.
2. Add a `<main id="view-<id>" class="view"></main>` in `app/app.html`, a nav
   button with `data-view="<id>"`, and the script tag.
3. `boot.js` already routes `#/<id>` and the palette lists all views; the
   context menu can deep-link through `#/<id>` with a payload.

## Adding context-menu actions

In `background/context-menu.js`:

- create the item in `buildMenus()` (nest under a parent for grouping),
- handle its id in the `onClicked` listener. Use `storePayload` + `openApp`
  (deep-link with payload) or open a service URL directly with
  `browser.tabs.create`. Searchable selection engines belong in
  `SEL_SEARCH`.

## Everything you must keep

- **Locality**: new tools must not require network; new fetches need a declared
  `host_permissions` entry and a PRIVACY.md note.
- **IDs**: a tool/service `id` is stable API once shipped.
- **Consent**: anything that would send a user’s file or secrets off-device
  needs explicit, documented consent (see the Files view pattern).
- **Tests**: any new lib logic ships with vectors in `test/run-tests.mjs`.
- **Docs**: update `docs/USER_GUIDE.md` (feature) and `docs/ARCHITECTURE.md`
  (structure) with the change.