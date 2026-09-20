/**
 * ReconKit — Website analyzer view.
 * Displays a passive snapshot of the current (or targeted) page.
 * Distinguishes "detected" from "could not be determined".
 */
'use strict';
var Rec = window.Rec = window.Rec || {};
Rec.views = Rec.views || {};

Rec.views.analyzer = (() => {
  const { h, esc, el, kvTable, statusTag, copyBtn, spinner, notDetermined } = Rec.ui;
  let currentUrl = null;

  function card(title, body, hint) {
    return h('div', { class: 'card' }, [
      h('h3', {}, [esc(title), hint ? h('span', { class: 'hint' }, '  — ' + esc(hint)) : null]),
      body
    ]);
  }

  function metaSection(meta) {
    if (!meta || !meta.length) return h('div', { class: 'faint' }, 'No meta tags found.');
    const t = h('table', { class: 'data' });
    t.appendChild(h('tr', {}, [h('th', {}, 'Key'), h('th', {}, 'Content')]));
    for (const m of meta) t.appendChild(h('tr', {}, [h('td', { class: 'mono' }, esc(m.key)), h('td', { class: 'wrap' }, esc(m.content))]));
    return t;
  }

  function techSection(snap) {
    if (!snap.tech || !snap.tech.length) {
      return h('div', { class: 'faint' }, 'No technology markers detected (heuristic).');
    }
    return h('div', { class: 'pill-row' }, snap.tech.map((t) =>
      h('span', { class: 'tag acc', title: esc(t.source) }, esc(t.name))));
  }

  function headerAssessment(snap) {
    const headers = snap.headers;
    if (!headers) return notDetermined('No response headers available.');
    const rows = headers.entries.map((e) => {
      const probe = e.present ? null : 'not sent in observed response (may still be enforced elsewhere)';
      const cell = h('td', { class: 'wrap mono' });
      if (e.present) {
        cell.appendChild(h('span', {}, esc(e.value || '')));
        cell.appendChild(h('span', { class: 'faint' }, '  '));
      } else {
        cell.appendChild(h('span', { class: 'faint' }, esc(probe)));
      }
      const tr = h('tr', {}, [h('td', { class: 'mono' }, esc(e.name)), cell]);
      return tr;
    });
    const t = h('table', { class: 'data' });
    t.appendChild(h('tr', {}, [h('th', {}, 'Header'), h('th', {}, 'Observed value')]));
    rows.forEach((r) => t.appendChild(r));
    const wrap = h('div', {});
    wrap.appendChild(t);
    if (headers.advisories && headers.advisories.length) {
      wrap.appendChild(h('div', { class: 'small', style: 'margin-top:8px' }, headers.advisories.map((a) =>
        h('div', { style: 'display:flex;gap:6px;align-items:flex-start' }, [h('span', { class: 'tag warn' }, 'note'), h('span', { class: 'muted' }, esc(a))]))));
    }
    wrap.appendChild(h('div', { class: 'small faint', style: 'margin-top:8px' },
      headers.error == null
        ? `Observed via same-origin HEAD request (status ${headers.status ?? 'unknown'}).`
        : `Header read failed (${headers.error}) — may be blocked by CORS, redirects or page policy.`));
    return wrap;
  }

  function inventorySection(snap) {
    const d = [];
    const { links, scripts, forms, styles } = snap;
    d.push(kvTable([
      ['Links total', links.total],
      ['Internal', links.internal], ['External', links.external],
      ['mailto:', links.mailto], ['tel:', links.tel], ['Fragment only (#)', links.hashOnly],
      ['Relative (site-relative)', links.relative],
      ['Unique external origins', (links.origins || []).length],
      ['Scripts total', scripts.total], ['Inline scripts', scripts.inline], ['External scripts', scripts.external],
      ['External script origins', (scripts.origins || []).length],
      ['Style sheets', styles.external + ' external / ' + styles.inline + ' inline'],
      ['Forms', forms.total], ['Forms with action', forms.withAction], ['Forms posting externally', forms.externalAction],
      ['Password fields', forms.password], ['autocomplete="off" inputs', forms.autocompleteOff]
    ]));

    const cols = [];
    if (links.samples && links.samples.length) {
      const lt = h('table', { class: 'data' });
      lt.appendChild(h('tr', {}, [h('th', {}, 'Link'), h('th', {}, 'Type')]));
      links.samples.forEach((s) => lt.appendChild(h('tr', {}, [h('td', { class: 'wrap' }, esc(s.text || s.href)), h('td', { class: 'mono' }, esc(s.kind))])));
      cols.push(card('Sample links', lt));
    }
    if ((scripts.samples || []).length) {
      cols.push(card('Sample script sources', h('div', { class: 'out mono' }, esc(scripts.samples.join('\n')))));
    }
    if ((forms.samples || []).length) {
      const ft = h('table', { class: 'data' });
      ft.appendChild(h('tr', {}, [h('th', {}, 'Action'), h('th', {}, 'Method'), h('th', {}, 'xt'), h('th', {}, 'Inputs')]));
      forms.samples.forEach((f) => ft.appendChild(h('tr', {}, [
        h('td', { class: 'wrap' }, esc(f.action)), h('td', { class: 'mono' }, esc(f.method)),
        h('td', {}, f.external ? h('span', { class: 'tag warn' }, 'external') : h('span', { class: 'tag' }, 'local')),
        h('td', { class: 'mono' }, String(f.inputs))
      ])));
      cols.push(card('Sample forms', ft));
    }
    if (links.origins && links.origins.length) {
      cols.push(card('Unique external origins', h('div', { class: 'out mono' }, esc(links.origins.slice(0, 40).join('\n')))));
    }
    return h('div', {}, [d, h('div', { class: 'section-gap' }), cols.length ? cols : null]);
  }

  function cookiesSection(snap) {
    const cookies = snap.cookies || [];
    const t = h('table', { class: 'data' });
    t.appendChild(h('tr', {}, [h('th', {}, 'Name'), h('th', {}, 'Value (page-visible)')]));
    if (!cookies.length) t.appendChild(h('tr', {}, [h('td', { colspan: '2', class: 'faint' }, 'No cookies visible to page scripts.'), h('td', {})]));
    for (const c of cookies.slice(0, 25)) {
      t.appendChild(h('tr', {}, [h('td', { class: 'mono' }, esc(c.name)), h('td', { class: 'wrap mono' }, esc(c.value.length > 90 ? c.value.slice(0, 90) + '…' : c.value))]));
    }
    const body = h('div', {}, [
      t,
      h('div', { class: 'small faint', style: 'margin-top:6px' }, esc(snap.cookieVisibility || '')),
      h('div', { class: 'small faint' }, 'HttpOnly, Secure and SameSite flags are not exposed to page scripts. Enable “Enhanced cookie analysis” in Settings to read flags through the browser cookies API.')
    ]);
    return body;
  }

  function undeterminedSection(snap) {
    const items = [];
    if (snap.restricted) items.push(['Page analysis', snap.reason || 'restricted page type']);
    if (snap.headers && snap.headers.error) items.push(['Response headers', 'could not read: ' + snap.headers.error]);
    if (!snap.restricted && snap.headers == null) items.push(['Response headers', 'not collected']);
    if (!snap.restricted && snap.cookieVisibility) items.push(['Cookie flags (HttpOnly/Secure/SameSite)', 'not visible to page context']);
    if (snap.restricted) items.push(['Technology markers', 'page not scriptable']);
    if (!items.length) {
      return h('div', { class: 'faint' }, 'All requested areas were measured. Some values are heuristic — verify actively where a finding matters.');
    }
    return kvTable(items.map(([a, b]) => [a, null, b]));
  }

  function overview(snap) {
    const sq = (snap.queryParams || []).map(([k, v]) => `${k}=${v.length > 60 ? v.slice(0, 60) + '…' : v}`).join('\n') || '(none)';
    const rows = [
      ['URL', snap.url],
      ['Hostname', snap.hostname],
      ['Root domain', snap.rootDomain],
      ['Protocol', snap.protocol],
      ['Port', snap.port],
      ['Path', snap.path || '/'],
      ['Query parameters', snap.queryParams.length ? `${snap.queryParams.length} parameter(s)` : '(none)'],
      ['Fragment', snap.hash || '(none)'],
      ['Secure context', snap.secure ? 'yes' : 'no'],
      ['Page title', snap.title || '(empty)'],
      ['Language', snap.lang], ['Charset', snap.charset], ['Ready state', snap.readyState],
      ['Content type', snap.contentType],
      ['Canonical', snap.canonical], ['Favicon', snap.favicon], ['Base href', snap.baseHref]
    ];
    return kvTable(rows);
  }

  function renderSnap(snap, owner) {
    const root = el('view-analyzer');
    root.replaceChildren();
    if (!snap || !snap.ok) {
      const why = snap && (snap.reason || snap.error) || 'Unable to analyze this page.';
      root.appendChild(card('Page analysis unavailable', h('div', { class: 'error-box' }, esc(why))));
      root.appendChild(card('Actions', h('div', { class: 'row' }, [
        h('button', { class: 'btn sm primary', onclick: () => reload() }, 'Try again'),
        h('button', { class: 'btn sm', onclick: () => Rec.nav.go('recon') }, 'Open Recon lookups')
      ])));
      return;
    }
    currentUrl = snap.url;

    const header = h('div', { class: 'spread', style: 'margin-bottom:12px' }, [
      h('div', {}, [
        h('h2', { style: 'margin:0;font-size:15px' }, esc(snap.rootDomain || snap.hostname || 'Website analysis')),
        h('div', { class: 'small muted wrap' }, esc(snap.url))
      ]),
      h('div', { class: 'row' }, [
        h('span', { class: 'small faint' }, 'snapshot ' + new Date(snap.sniffedAt).toLocaleTimeString()),
        statusTag(snap.fromCache ? 'cached' : 'live', 'ok'),
        copyBtn(snap.url),
        h('button', { class: 'btn sm' , onclick: () => reload() }, 'Re-scan'),
        h('button', { class: 'btn sm', onclick: () => Rec.nav.go('domain') }, 'DNS / IP'),
        h('button', { class: 'btn sm primary', onclick: () => Rec.nav.go('recon') }, 'Recon lookups')
      ])
    ]);
    root.appendChild(header);
    root.appendChild(card('Target overview', overview(snap)));
    root.appendChild(card('Document metadata', metaSection(snap.meta)));
    root.appendChild(card('Technology markers (heuristic)', techSection(snap), 'detected from DOM, scripts, headers and meta — not exhaustive'));
    root.appendChild(card('Security & response headers', headerAssessment(snap)));
    root.appendChild(card('Inventory', inventorySection(snap)));
    root.appendChild(card('Cookies', cookiesSection(snap)));
    root.appendChild(card('Information not determined', undeterminedSection(snap)));
  }

  async function reload() {
    const view = el('view-analyzer');
    view.replaceChildren();
    view.appendChild(h('div', { style: 'padding:20px' }, spinner('Analyzing current page…')));
    let snap;
    if (Rec.target && Rec.target.tabId != null) {
      snap = await browser.runtime.sendMessage({ type: 'rk:sniff', tabId: Rec.target.tabId });
    } else {
      snap = await browser.runtime.sendMessage({ type: 'rk:sniff' });
    }
    renderSnap(snap, null);
  }

  function open(params) {
    const view = el('view-analyzer');
    view.replaceChildren();
    view.appendChild(h('div', { style: 'padding:20px' }, spinner('Analyzing current page…')));
    (async () => {
      let snap = null;
      if (params && params.url) {
        // Targeted (right-click) analysis: try that tab, else parse URL only.
        if (params.tabId != null) {
          try { snap = await browser.runtime.sendMessage({ type: 'rk:sniff', tabId: params.tabId }); } catch (e) { snap = null; }
        }
        if (!snap || !snap.ok) {
          // Still show URL structure without a live page snapshot.
          renderTargetOnly(params.url);
          return;
        }
      } else {
        snap = await browser.runtime.sendMessage({ type: 'rk:sniff' });
      }
      renderSnap(snap, null);
    })();
  }

  /** Minimal view when a URL is targeted but its tab can't be scripted. */
  function renderTargetOnly(url) {
    let parsed = null;
    try { parsed = new URL(url); } catch (e) { /* not URL */ }
    const root = el('view-analyzer');
    root.replaceChildren();
    const rows = parsed ? [
      ['URL', parsed.href], ['Hostname', parsed.hostname], ['Root domain', RekLib.rootDomain(parsed.hostname)],
      ['Protocol', parsed.protocol.replace(':', '')], ['Port', parsed.port || (parsed.protocol === 'https:' ? '443' : '80')],
      ['Path', parsed.pathname], ['Query', parsed.search || '(none)'], ['Fragment', parsed.hash || '(none)']
    ] : [['URL', url], ['Note', 'Not a parseable http(s) URL']];
    root.appendChild(card('Target (no live snapshot)', kvTable(rows)));
    root.appendChild(card('Actions', h('div', { class: 'row' }, [
      h('button', { class: 'btn sm primary', onclick: () => Rec.nav.go('recon') }, 'Open Recon lookups'),
      h('button', { class: 'btn sm', onclick: () => Rec.nav.go('domain') }, 'DNS / IP intelligence')
    ])));
  }

  return { id: 'analyzer', label: 'Website', open, reload };
})();