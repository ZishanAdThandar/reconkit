# User Guide

ReconKit lives in a Firefox **sidebar** (the small panel on the left). The
toolbar button toggles it (`Alt+Shift+R`). Six workspaces are available; the
command palette (`Ctrl+K`, or the search button) reaches anything quickly.

The footer always shows the current status, plus the author’s pages (about ·
links), and the footer links open externally — ReconKit never loads them inside
its own panel.

## The target chip

The chip below the brand shows the **active tab’s hostname**. Click it for:
copy hostname / copy URL / analyze website / DNS-IP intelligence / OSINT
lookups / open the panel in a full tab. This is the simplest way to start most
workflows: open the site you are researching, then analyze.

## Tools

Pick a tool on the left, type (or paste) input, set options, and press
**Run** (`Ctrl+Enter`). Every tool is local and instant.

| Tool | Notes |
| --- | --- |
| Hashing | SHA-1/256/384/512 + MD5 + CRC-32; optional uppercase hex / Base64 view |
| Hash identifier | length/prefix heuristic for common digests (bcrypt, Argon2…) |
| CRC-32 | optional seed (decimal) |
| ROT — all shifts | every shift 1–25 + ROT47; digits rotation toggle |
| Caesar | configurable shift; digits optional |
| Atbash / Vigenère / Morse | classic ciphers; Vigenère works `a-z/A-Z` only |
| XOR | string or hex key; includes **single-byte key brute force**; auto text/hex output |
| Base64 / Base64URL | UTF-8 aware; URL-safe alphabet and padding toggles; tolerant decode |
| Hex | encode/decode; tolerates `0x`, spaces, colons |
| URL encoding | component / form (`+`) variants, lenient decode (Latin-1 fallback) |
| HTML entities | five core entities or all non-ASCII as numeric; decode supports named + numeric (decimal/hex) |
| Unicode escape | surrogate / code-point styles, unescape, code-point listing, NFC/NFD/NFKC/NFKD |
| ASCII ⇄ binary | 8-bit groups, custom separator |
| JWT decoder & verifier | header/payload + readable timestamps; HS256/384/512 verify with a secret |
| Encoding identifier | heuristic candidates for Base64 / hex / binary / URL / JWT / text |
| Base conversion | bases 2–62; letters are case-insensitive |
| RSA calculator | encrypt/decrypt small values with `n`,`e`,`c` and optional `d` or `p`,`q`; offline factoring fallback for small moduli; all inputs hex |
| Case conversion | 14 formats incl. camelCase, snake_case, CONSTANT_CASE |
| Reverse | characters / words / lines |
| Text statistics | counts, unique words, byte size |
| Random generator | UUID v4, hex blobs, readable passwords (WebCrypto) |

Right-clicking a selection elsewhere in Firefox also offers *Analyze / Decode /
Hash selected text*, and “Search selected text on…” submenu.

## Website

Analyzes the active tab (or the URL you right-clicked). The snapshot shows:

- **Target overview** — URL structure, secure-context status, path/query/fragment.
- **Document metadata** — title, language, charset, meta tags, canonical, favicon.
- **Technology markers** — frameworks/CDNs detected from DOM, scripts, meta and
  headers (heuristic, deduped, with source clicks).
- **Security & response headers** — CSP, HSTS, X-Frame-Options, COOP/COEP/CORP,
  Referrer-Policy, Permissions-Policy, plus server/cloudfront/CF hints; advisory
  notes for missing protections. Observed via same-origin `HEAD`.
- **Inventory** — links (internal/external/mailto/fragment), scripts, forms
  (incl. action method/externality), styles; sampled examples; external origins.
- **Cookies** — page-visible names/values (HttpOnly not exposed by the page).
  Enable *Enhanced cookie analysis* in Settings to see flags via the browser
  cookies API.
- **Information not determined** — every area that failed is listed openly.

`Re-scan` forces a fresh snapshot; `DNS / IP` and `OSINT lookups` jump to the
related workspaces seeded with the current target.

## OSINT

Enter a URL, hostname, domain or IP (or click *Use current tab*), then *Build
links*. ReconKit constructs links for the applicable groups:

- Search engines · code search · certificate transparency · archives ·
  passive DNS · domain intelligence · IP/network intelligence · security
  assessment.

Each row shows the exact URL (copy it) and an **Open** button. Use “Open all”
inside a group when you want the whole sweep — tabs open at your discretion,
and the requirement is explicit so you control which services learn your query.

## DNS / IP

Enter a hostname or IP (or use the current tab):

- **DNS records** — A, AAAA, CNAME, MX, NS, TXT via Google Public DNS (DoH).
- **Certificates & subdomains** — crt.sh transparency search, unique name list
  (copyable) + 25 newest entries.
- **Network / ASN intelligence** — ipinfo.io: IP, rDNS, org/ASN, geo, timezone.
- **Related passive intelligence** — one-row shortcuts to the OSINT services
  that apply to this target.

## Files

Drop a file anywhere on the panel (or click to browse). Everything is local:

- file name/size/MIME/type by **magic bytes**, SHA-256 + MD5 of the exact bytes
- Shannon entropy profile (detect encrypted/compressed vs plaintext payloads)
- printable strings with offsets
- image dimensions, **PNG text chunks**, **JPEG EXIF** (camera, timestamps,
  GPS with a maps link when present)

External stego/metadata services stay hidden until you opt in. Consent is
stored locally and can be removed anytime.

## Settings

- **Appearance** — System / Dark (calm) / Light (paper). The header button
  toggles dark↔light instantly and persists the choice.
- **Optional permissions** — enable *Enhanced cookie analysis* (`cookies`) and
  *System DNS resolution* (`dns`) with one click; disable the same way.
- **Data & privacy** — clear local caches, export/import settings as JSON.
- **About** — version, extension ID, manifest details.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+R` | toggle the sidebar |
| `Alt+Shift+A` | analyze the current website (opens the panel in a tab) |
| `Ctrl/Cmd+K` | command palette |
| `Ctrl+Enter` | run the active tool |
| `Esc` | close palette / target menu |

## Limitations

- Pages you cannot script (`about:`, `moz-extension:`, store pages) show
  “restricted page type” instead of failing silently.
- Header probing is best-effort: CORS, redirects and server quirks can block
  it — the analyzer tells you when that happened.
- External services may rate-limit keyless use; the OSINT view is designed for
  you to paste/copy and run at your own pace.
- ReconKit is a passive aid: it does not bypass authentication or perform
  active scanning.