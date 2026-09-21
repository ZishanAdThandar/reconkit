# ReconKit

A privacy-first, local-first **security research & reconnaissance toolkit** for
Firefox — built as a single lightweight WebExtension with no build step.

Everything is a small, dependency-free set of classic scripts: you are looking
at the entire code base. Core processing (hashing, encoding, ciphertext
wrangling) runs **on your device**. External lookups are
**opt-in, explicit, and clearly disclosed** — ReconKit never uploads your data,
never reads your history beyond the active tab you point it at, and collects no
telemetry.

> **Terms of use.** ReconKit is a research aid. Use it only on systems and data
> you own or are explicitly authorized to analyze.

---

## What it does

| Workspace | Capabilities |
| --- | --- |
| **Utilities** | 22 local crypto/text utilities: SHA-1/256/384/512, MD5, CRC-32, hash identification, ROT (all shifts + ROT47), Caesar, Atbash, Vigenère, XOR (incl. single-byte key recovery), Morse, URL & HTML encoders, Unicode escapes + normalization, JWT decode + HMAC verify, encoding identifier, base conversion (2–62), **encoding converter (text/binary/octal/decimal/hex/Base32/36/58/62/64/64URL)**, RSA calculator (BigInt, factor fallback), case conversion, reverse, whitespace removal, text statistics, cryptographic random generators |
| **Website** | Passive snapshot of the current page: URL structure, meta data, technology markers, security/response headers (best-effort), links/forms/scripts inventory, page-visible cookies, plus an explicit “could not be determined” list |
| **Recon** | Tech stack of the current page plus one-click lookups for a host/domain/IP across 40+ free public services (BuiltWith, Shodan, Censys, crt.sh quick links; search engines, code search, archives, passive DNS, domain/IP intelligence, security assessment) — built locally, opened in new tabs |
| **DNS / IP** | Live DNS records (A/AAAA/CNAME/MX/NS/TXT via DoH), certificate transparency & subdomain harvesting (crt.sh), ASN/network metadata (ipinfo.io) |
| **Integration** | Right-click menus (analyze/decode/hash selection, page & link actions, one-tap lookups), keyboard shortcuts (Alt+Shift+R popup, Alt+Shift+A analyzer, Ctrl+K palette), dark-only UI with a per-page dark reader toggle (moon button), command palette |

The extension ID is `reconkit@zishanhack.com`. Firefox 115+, Manifest V3.

## Quick start

```bash
npm install          # dev tooling only (web-ext, for lint/run/package)
npm test             # library test suite (Node >= 18, no browser needed)
npm run lint         # web-ext lint
npm run build        # tests + manifest validation + dist/reconkit-<version>.zip
npm run icons        # regenerate icons/icon-*.png
```

**Install in Firefox:**

```
1. about:debugging → This Firefox → Load Temporary Add-on
2. select dist/reconkit-1.0.0.zip  (or manifest.json for a dev run)
3. toolbar button opens the ReconKit popup (Alt+Shift+R)
```

Or during development: `npm start` (web-ext run).

## Privacy in one paragraph

- **Local by default.** Every crypto/encoding/file feature runs in the extension
  page with no network access.
- **No telemetry, no analytics, no history collection, no hardcoded keys.**
- **Targeted network only.** DNS/IP queries go to `dns.google`, `crt.sh` and
  `ipinfo.io` (host permissions, listed in `manifest.json`). Everything else
  opens as a normal browser tab in the service you *click*.
- **Files never auto-upload, by design.** No file analysis is shipped; nothing
  is ever sent anywhere.
- **Optional permission** (`cookies`) is opt-in from Settings and can
  be revoked at any time.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the full statement.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the extension is put together
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — using every workspace
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — running, testing, packaging
- [docs/EXTENDING.md](docs/EXTENDING.md) — adding tools, services and views
- [docs/PRIVACY.md](docs/PRIVACY.md) — data flow, permissions, third parties

## Project layout

```
manifest.json          MV3 manifest (extension ID reconkit@zishanhack.com)
background/            event page + context menus
content/               passive page snapshotter (content script)
lib/                   environment-agnostic tool layer (pure JS, shared with tests)
services/              external OSINT service catalog (URL builders)
app/                   action popup / full-tab application (HTML + CSS + vanilla JS views)
icons/                 generated PNG icons
tools/                 icon generator + build script
test/                  Node test suite for lib/
docs/                  documentation
```

## Credits

ReconKit is an open research companion project by
**ZishanAdThandar** ([Firefox Add-ons profile](https://addons.mozilla.org/en-US/firefox/user/10398388/)).
Author site: [zishanhack.com/about/](https://zishanhack.com/about/) · link
collection: [zishanhack.com/links/](https://zishanhack.com/links/)

MIT License.