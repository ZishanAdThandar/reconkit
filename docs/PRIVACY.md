# Privacy

ReconKit is built on a simple rule: **reconnaissance of data you are authorized
to analyze, done locally, with every external step disclosed and opt-in.**

This document is the privacy statement. It mirrors what is enforced in code and
in `manifest.json`, and `tools/build.mjs` fails the build if the manifest ever
grows over-reaching permissions.

## Local by default

All of the following run entirely inside the extension page with **no network
access**:

- Digests (SHA-1/256/384/512, MD5, CRC-32) and hash identification
- Every cipher (ROT/Caesar/Atbash/Vigenère/XOR/Morse) and every encoder
  (URL/HTML/Unicode, plus the encoding converter covering
  text/binary/octal/decimal/hex/Base32/36/58/62/64/64URL)
- Encryption identification, base conversion, RSA math, case transforms,
  text statistics, random generators
- JWT decode and HMAC verification (a secret you enter is never transmitted)
- No file analysis is shipped — nothing about your files ever leaves the
  browser through ReconKit.

## No collection

- No telemetry, analytics, counters, or beaconing.
- No browsing history is stored or read beyond the *active tab* you are
  analyzing, and only when you ask (target chip → views, popup actions,
  context-menu actions).
- Page snapshots live in an in-memory cache (30 s freshness) inside the
  extension background process and are cleared on tab close/navigation. They
  are never written to disk and never sent anywhere.
- No API keys are stored or hard-coded. ReconKit uses only free, keyless,
  public interfaces.

## Targeted network usage (disclosed)

| Purpose | Endpoints | When |
| --- | --- | --- |
| DNS records | `dns.google` DoH (also reachable at `cloudflare-dns.com`) | DNS/IP view |
| Cert transparency / subdomains | `crt.sh` | DNS/IP view, OSINT links |
| ASN / network metadata | `ipinfo.io` | DNS/IP view; IP hint in OSINT view |

These are the only sites ReconKit *fetches from code*, and they are the only
`host_permissions`. Every other service (search engines, Shodan, urlscan,
VirusTotal, SecurityHeaders, …) is just a **link** in the OSINT view that opens
in a new tab when you click it — the query is sent by your browser to that
service, under that service’s own terms.

**Additional consent paths:**

- The **optional permission** `cookies` (cookie flags/HttpOnly visibility) is
  enabled solely by the user in the Settings view and can be revoked there.
  (Firefox does not support `dns` as an optional permission, so system-resolver
  features are not offered; DNS lookups go through public DoH instead.)

## What we do not do

- We do not auto-upload files, screenshots, or extracted metadata — and no file
  analysis tools are shipped at all.
- We do not read HTTP request/response bodies anywhere (the header probe uses
  `HEAD`, and the `GET` fallback never reads the body).
- We do not store passwords, secrets, or session tokens; cookie *values* shown
  by the page snapshot are limited to what the page itself can see via
  `document.cookie` and are displayed on screen only.
- We do not run background scans; every lookup happens when you trigger it.

## Review

The whole extension is plain source you can read: `manifest.json`, `background/`,
`content/`, `app/`, `lib/`, `services/`. The build validates manifest
permissions and referenced files, and the test suite pins library behavior.

If you find a leak, a over-broad request, or anything that contradicts this
statement, please treat it as a bug and report it.