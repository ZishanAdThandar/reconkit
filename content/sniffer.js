/**
 * ReconKit — Page snapshotter (content script).
 * Collects *passive, local* information about the current page: document
 * structure, metadata, technology indicators, links/forms/scripts inventory,
 * cookies visible to the page, and security-related response headers
 * (best-effort same-origin HEAD request).
 *
 * Nothing is uploaded. The snapshot is sent only to the extension background.
 * Heuristic; "cannot determine" states are reported explicitly.
 */
(function () {
  'use strict';
  if (window.__RK_SNIFFER__) return;

  const cap = (arr, n) => arr.length > n ? arr.slice(0, n) : arr;

  async function fetchHeaders() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const opts = { method: 'HEAD', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal };
      let res;
      try {
        res = await fetch(location.href, opts);
      } catch (e) {
        // Some servers reject HEAD — retry with GET but never read the body.
        res = await fetch(location.href, Object.assign({}, opts, { method: 'GET' }));
      }
      clearTimeout(timer);
      const got = {};
      res.headers.forEach((v, k) => {
        if (!got[k]) got[k] = [];
        got[k].push(v);
      });
      return { status: res.status, ok: res.ok, got, headersError: null };
    } catch (e) {
      return { status: null, ok: false, got: {}, headersError: e.name === 'AbortError' ? 'timeout' : 'network' };
    }
  }

  const SECURITY_HEADERS = [
    'content-security-policy', 'strict-transport-security', 'x-frame-options',
    'x-content-type-options', 'referrer-policy', 'permissions-policy',
    'cross-origin-opener-policy', 'cross-origin-embedder-policy',
    'cross-origin-resource-policy', 'x-xss-protection'
  ];

  function catalogueHeaders(got) {
    const entries = [];
    for (const name of SECURITY_HEADERS) {
      const values = got[name] || [];
      entries.push({ name, lower: name, present: values.length > 0, value: values.join('; ') || null });
    }
    const meta = [
      'server', 'x-powered-by', 'via', 'x-cache', 'x-served-by', 'x-backend',
      'x-generator', 'x-amz-cf-id', 'x-amz-cf-pop', 'cf-ray', 'cf-cache-status',
      'x-azure-ref', 'x-netlify-*', 'x-vercel-*', 'x-ts', 'x-timer'
    ];
    for (const name of meta) {
      const values = got[name] || [];
      if (values.length) entries.push({ name, lower: name, present: true, value: values.join('; '), meta: true });
    }
    return entries;
  }

  function advisories(headers) {
    const ad = [];
    const get = (n) => headers.find((h) => h.lower === n);
    const csp = get('content-security-policy');
    if (csp) {
      const v = String(csp.value || '').toLowerCase();
      if (v.includes("script-src") && v.includes("'unsafe-inline'")) ad.push(`CSP allows 'unsafe-inline' for scripts — check whether dynamic code injection is possible.`);
      if (v.includes('upgrade-insecure-requests')) ad.push('CSP includes upgrade-insecure-requests.');
      if (!v.includes("'unsafe-inline'")) ad.push('CSP present (nonce/hash friendly).');
    } else {
      ad.push('No Content-Security-Policy header observed.');
    }
    const hsts = get('strict-transport-security');
    if (hsts && /preload/i.test(String(hsts.value))) ad.push('HSTS preload directive present.');
    const x = get('x-frame-options');
    const co = get('cross-origin-opener-policy');
    if (!x && !co) ad.push('No clickjacking protection header observed (X-Frame-Options / COOP).');
    return ad;
  }

  function techStack() {
    const d = RekLib.detect;
    const out = [];
    // DOM markers (documentElement text) — safe under isolation.
    out.push(...d.fromDomMarkers(document));
    // script srcs
    const srcs = [];
    const scripts = document.querySelectorAll('script');
    scripts.forEach((s) => { if (s.src) srcs.push(s.src); });
    out.push(...d.fromScriptSources(srcs));
    // generic CDN hosts from script origins
    srcs.slice(0, 40).forEach((src) => {
      try { out.push(...d.fromHost(new URL(src, location.href).hostname)); } catch (e) { /* ignore */ }
    });
    // meta generators
    const gen = document.querySelector('meta[name="generator"]');
    if (gen) out.push(...d.fromMetaGenerators(gen.getAttribute('content') || ''));
    // window globals via wrappedJSObject (Firefox) — best effort
    try {
      const w = window.wrappedJSObject || window;
      out.push(...d.fromWindow(w));
    } catch (e) { /* isolation may block — SDK-level safe */ }
    return d.dedupe(out);
  }

  async function run() {
    const t0 = Date.now();
    const u = new URL(location.href);
    const params = [];
    u.searchParams.forEach((v, k) => params.push([k, v]));

    // Document metadata
    const meta = [];
    document.querySelectorAll('meta').forEach((m) => {
      if (meta.length >= 40) return;
      const key = m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv');
      const content = m.getAttribute('content');
      if (key && content != null) meta.push({ key, content: content.slice(0, 300) });
    });
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const favEl = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    const baseEl = document.querySelector('base');

    // Scripts
    let scripts = { total: 0, inline: 0, external: 0, origins: [], samples: [] };
    document.querySelectorAll('script').forEach((s, i) => {
      scripts.total++;
      if (s.src) {
        scripts.external++;
        try {
          const o = new URL(s.src, location.href).origin;
          if (!scripts.origins.includes(o)) scripts.origins.push(o);
        } catch (e) { /* ignore */ }
        if (scripts.samples.length < 8) scripts.samples.push(s.src.slice(0, 160));
      } else {
        scripts.inline++;
      }
    });

    // Styles
    const sheets = document.querySelectorAll('link[rel="stylesheet"]');
    const styleTags = document.querySelectorAll('style');
    const styles = { total: sheets.length + styleTags.length, external: sheets.length, inline: styleTags.length };

    // Links
    const links = { total: 0, internal: 0, external: 0, mailto: 0, tel: 0, hashOnly: 0, relative: 0, origins: [], samples: [] };
    document.querySelectorAll('a[href]').forEach((a) => {
      if (links.total > 3000) return;
      links.total++;
      const href = a.getAttribute('href');
      const text = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      let kind = 'external';
      try {
        const target = new URL(href, location.href);
        if (href.startsWith('#')) { links.hashOnly++; kind = 'hash'; }
        else if (href.startsWith('mailto:')) { links.mailto++; kind = 'mailto'; }
        else if (href.startsWith('tel:')) { links.tel++; kind = 'tel'; }
        else if (target.origin === u.origin) { links.internal++; kind = 'internal'; }
        else {
          links.external++;
          if (!links.origins.includes(target.origin)) links.origins.push(target.origin);
        }
        if (kind === 'internal' && !href.startsWith('#') && !href.startsWith('/') && !/^[a-z]+:/.test(href) && !href.startsWith('?')) links.relative++;
      } catch (e) { /* malformed href */ }
      if (links.samples.length < 8) links.samples.push({ text, href: href.slice(0, 200), kind });
    });

    // Forms
    let forms = { total: 0, withAction: 0, externalAction: 0, password: 0, autocompleteOff: 0, samples: [] };
    document.querySelectorAll('form').forEach((f) => {
      forms.total++;
      const action = f.getAttribute('action');
      let externalNow = false;
      if (action) {
        forms.withAction++;
        try {
          const a = new URL(action, location.href);
          externalNow = a.origin !== u.origin;
          if (externalNow) forms.externalAction++;
        } catch (e) { /* ignore */ }
      }
      forms.password += f.querySelectorAll('input[type="password"]').length;
      if (forms.samples.length < 5) {
        const inputs = f.querySelectorAll('input, select, textarea').length;
        forms.samples.push({ action: action || '(none — posts to self)', method: (f.getAttribute('method') || 'GET').toUpperCase(), external: externalNow, inputs });
      }
      f.querySelectorAll('input').forEach((inp) => { if (inp.getAttribute('autocomplete') === 'off') forms.autocompleteOff++; });
    });

    // Cookies (page-visible only)
    const cookies = (document.cookie || '').split(';').map((kv) => kv.trim()).filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return { name: eq === -1 ? kv : kv.slice(0, eq).trim(), value: eq === -1 ? '' : kv.slice(eq + 1).slice(0, 200) };
    }).slice(0, 40);

    // Titles/meta
    const title = (document.title || '').slice(0, 300);
    const lang = document.documentElement.lang || null;
    const charset = document.characterSet || null;

    const headersRaw = await fetchHeaders();
    const headerEntries = catalogueHeaders(headersRaw.got);
    const tech = techStack();

    const snapshot = {
      ok: true,
      tabId: null,
      sniffedAt: Date.now(),
      secure: !!window.isSecureContext,
      url: u.href,
      title, lang, charset,
      hostname: u.hostname,
      rootDomain: RekLib.rootDomain(u.hostname),
      protocol: u.protocol.replace(':', ''),
      port: u.port || (u.protocol === 'https:' ? '443' : u.protocol === 'http:' ? '80' : ''),
      path: u.pathname,
      hash: u.hash.replace(/^#/, ''),
      searchRaw: u.search.replace(/^\?/, '') || null,
      queryParams: params,
      readyState: document.readyState,
      contentType: document.contentType || null,
      meta, canonical: canonicalEl ? canonicalEl.getAttribute('href') : null,
      favicon: favEl ? favEl.href : null,
      baseHref: baseEl ? baseEl.href : null,
      scripts, styles, links, forms, cookies,
      cookieVisibility: 'page-only (HttpOnly cookies are not exposed to page scripts)',
      tech,
      headers: {
        status: headersRaw.status,
        ok: headersRaw.ok,
        error: headersRaw.headersError,
        entries: headerEntries,
        advisories: advisories(headerEntries)
      },
      performance: {
        elapseMs: Date.now() - t0,
        navType: performance.getEntriesByType('navigation')[0] ? performance.getEntriesByType('navigation')[0].type : null
      }
    };
    return snapshot;
  }

  const sniffer = { run };
  window.__RK_SNIFFER__ = sniffer;

  // Auto-warm the background cache when pages load (idempotent, lightweight).
  if (typeof browser !== 'undefined' && browser.runtime) {
    run()
      .then((snap) => browser.runtime.sendMessage({ type: 'rk:auto-snapshot', snapshot: snap }))
      .catch(() => { /* background may be asleep; harmless */ });
  }
})();