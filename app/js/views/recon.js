/**
 * ReconKit — Recon view: tech stack of the current page + one-click lookups.
 * Shows detected technologies for the active tab, quick links (BuiltWith,
 * Shodan, Censys, crt.sh) built from the current domain, and the full OSINT
 * catalog. URLs are constructed locally and open in new tabs — external
 * services are never embedded or bypassed.
 */
'use strict';
var Rec = window.Rec = window.Rec || {};
Rec.views = Rec.views || {};

Rec.views.recon = (() => {
  const { h, esc, el, toast, copyBtn, spinner } = Rec.ui;
  let targetInput = '';

  // Featured one-click lookups, chosen by target type.
  const FEATURED_DOMAIN = [
    ['builtwith', 'BuiltWith'], ['shodan-host', 'Shodan'],
    ['censys-hosts', 'Censys'], ['crtsh', 'crt.sh']
  ];
  const FEATURED_IP = [
    ['shodan-ip', 'Shodan'], ['censys-ip', 'Censys'],
    ['ipinfo', 'IPinfo'], ['virustotal-ip', 'VirusTotal']
  ];

  async function targetCtx() {
    const src = targetInput.trim() || (Rec.target && Rec.target.host) || '';
    let ip = null;
    if (src && !/^\d{1,3}(\.\d{1,3}){3}$/.test(src) && !src.includes(':')) {
      // Attempt cached resolution via background (dns.google A record)
      try {
        const key = 'rk:ip:' + src;
        let cached = (await browser.storage.session.get(key))[key];
        if (!cached) {
          const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(src)}&type=A&random_padding=1`);
          if (res.ok) {
            const j = await res.json();
            cached = j.Answer && j.Answer.find((a) => a.type === 1) ? j.Answer.find((a) => a.type === 1).data : null;
            if (cached) await browser.storage.session.set({ [key]: cached });
          }
        }
        ip = cached;
      } catch (e) { ip = null; }
    }
    const ctx = RekServices.buildContext(src || Rec.target.url, { ip: ip || undefined });
    // fill in from target when empty
    if (!targetInput.trim() && Rec.target && !ctx.host) {
      return RekServices.buildContext(Rec.target.url || Rec.target.host, { ip: ip || undefined });
    }
    return ctx;
  }

  function renderLinks(grouped) {
    const { groups, order, ctx } = grouped;
    const container = h('div', {});
    for (const g of order) {
      const items = groups[g];
      const list = h('div', {});
      const table = h('table', { class: 'data' });
      table.appendChild(h('tr', {}, [h('th', {}, 'Service'), h('th', {}, 'Query URL'), h('th', {}, '')]));
      for (const s of items) {
        const tr = h('tr', {});
        const nameCell = h('td', {}, [
          h('div', {}, esc(s.name)),
          s.note ? h('div', { class: 'small faint' }, esc(s.note)) : null
        ]);
        const urlCell = h('td', { class: 'wrap' }, [
          h('span', { class: 'mono small' }, esc(s.url)),
        ]);
        const btnCell = h('td', {}, h('div', { class: 'row' }, [
          h('button', { class: 'btn sm primary', onclick: () => openUrls([s.url]) }, 'Open'),
          copyBtn(s.url)
        ]));
        tr.appendChild(nameCell); tr.appendChild(urlCell); tr.appendChild(btnCell);
        table.appendChild(tr);
      }
      list.appendChild(h('div', { class: 'spread', style: 'margin:10px 0 4px' }, [
        h('div', { class: 'small', style: 'text-transform:uppercase;letter-spacing:.5px;color:var(--text-faint);font-weight:600' }, esc(g)),
        items.length > 2 ? h('button', { class: 'btn sm ghost', onclick: () => {
          if (confirm(`Open ${items.length} tabs from “${g}”? They will open in your browser.`)) openUrls(items.map((i) => i.url));
        } }, `Open all (${items.length})`) : null
      ]));
      list.appendChild(table);
      container.appendChild(list);
    }
    return container;
  }

  function openUrls(urls) {
    browser.runtime.sendMessage({ type: 'rk:open-tabs', urls }).then((r) => {
      toast(`Opened ${r.opened} tab(s)`);
    });
  }

  /** Tech stack of the current page (live snapshot via the content sniffer). */
  function renderTechStack(container) {
    const card = h('div', { class: 'card', style: 'margin-top:10px' }, [
      h('h3', {}, 'Tech stack (current page)'),
      h('div', { id: 'recon-tech-body' })
    ]);
    container.appendChild(card);
    const body = el('recon-tech-body');
    if (!Rec.target || Rec.target.tabId == null) {
      body.appendChild(h('div', { class: 'faint' }, 'No current page to analyze — open ReconKit from the page you want to inspect, or use the Website analyzer.'));
      return;
    }
    body.appendChild(spinner('Reading page snapshot…'));
    browser.runtime.sendMessage({ type: 'rk:sniff', tabId: Rec.target.tabId })
      .then((snap) => {
        const b = el('recon-tech-body');
        if (!b) return;
        b.replaceChildren();
        if (!snap || !snap.ok) {
          b.appendChild(h('div', { class: 'faint' }, esc((snap && (snap.reason || snap.error)) || 'Page not scriptable (restricted page type or not fully loaded).')));
          b.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [
            h('button', { class: 'btn sm primary', onclick: () => Rec.nav.go('analyzer') }, 'Open Website analyzer'),
            h('button', { class: 'btn sm', onclick: () => render() }, 'Retry')
          ]));
          return;
        }
        const tech = snap.tech || [];
        if (!tech.length) {
          b.appendChild(h('div', { class: 'faint' }, 'No technology markers detected (heuristic).'));
        } else {
          b.appendChild(h('div', { class: 'pill-row' }, tech.map((t) =>
            h('span', { class: 'tag acc tech-pill', title: esc(t.source) }, esc(t.name)))));
        }
        b.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' }, [
          esc(snap.rootDomain || snap.hostname || ''),
          snap.protocol ? ' · ' + esc(snap.protocol) + '://' : '',
          esc(snap.title || ''),
          ' · snapshot ' + new Date(snap.sniffedAt).toLocaleTimeString(),
          snap.fromCache ? ' (cached)' : ' (live)'
        ]));
        b.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [
          h('button', { class: 'btn sm primary', onclick: () => Rec.nav.go('analyzer') }, 'Full analysis')
        ]));
      })
      .catch(() => {
        const b = el('recon-tech-body');
        if (b) b.replaceChildren();
      });
  }

  /** Featured one-click lookups formed from the current target. */
  function renderQuickLookups(container, ctx) {
    const featured = ctx.isIp ? FEATURED_IP : FEATURED_DOMAIN;
    const links = RekServices.linksFor(ctx);
    const pick = featured
      .map(([id, name]) => ({ id, name, item: links.find((l) => l.id === id) }))
      .filter((x) => x.item);
    if (!pick.length) return;
    const card = h('div', { class: 'card', style: 'margin-top:10px' }, [
      h('h3', {}, 'One-click lookups'),
      h('p', { class: 'small faint', style: 'margin:2px 0 8px' },
        'Built from ' + esc(ctx.host) + ' — click to open the service in a new tab (their terms & logging policies apply).'),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, pick.map((x) =>
        h('button', { class: 'btn sm primary rq-btn', 'data-id': x.id, 'data-url': x.item.url,
          title: esc(x.item.url), onclick: () => openUrls([x.item.url]) }, esc(x.name))))
    ]);
    container.appendChild(card);
  }

  function render() {
    const view = el('view-recon');
    view.replaceChildren();
    const inputRow = h('div', { class: 'card' }, [
      h('h3', {}, 'Target'),
      h('div', { class: 'row', style: 'margin-bottom:8px' }, [
        h('input', { id: 'recon-target', type: 'text', placeholder: 'domain, hostname, URL or IP', value: targetInput, style: 'flex:1', oninput: (e) => { targetInput = e.target.value; } }),
        h('button', { class: 'btn', onclick: () => { targetInput = (Rec.target && (Rec.target.host || '')) || ''; if (el('recon-target')) el('recon-target').value = targetInput; render(); } }, 'Use current tab'),
        h('button', { class: 'btn primary', onclick: () => render() }, 'Build links')
      ]),
      h('div', { class: 'small faint' }, 'Service links are constructed locally and open in new tabs. No data about your target is sent to ReconKit — only to the service you explicitly open.')
    ]);
    view.appendChild(inputRow);
    const out = h('div', {});
    view.appendChild(out);
    out.appendChild(spinner('Resolving target…'));
    targetCtx().then((ctx) => {
      out.replaceChildren();
      const summary = h('div', { class: 'row', style: 'margin-bottom:10px;gap:8px' }, [
        h('span', { class: 'tag acc' }, esc(ctx.host || 'no host')),
        ctx.rootDomain && !ctx.isIp ? h('span', { class: 'tag' }, 'root: ' + esc(ctx.rootDomain)) : null,
        ctx.isIp ? h('span', { class: 'tag warn' }, 'IP target') : null,
        ctx.ip ? h('span', { class: 'tag okk' }, 'IP: ' + esc(ctx.ip)) : null
      ]);
      out.appendChild(summary);
      renderTechStack(out);
      if (!ctx.host) {
        out.appendChild(h('div', { class: 'card faint' }, 'Enter a target or click “Use current tab”.'));
        return;
      }
      renderQuickLookups(out, ctx);
      const grouped = RekServices.groupedLinks(ctx);
      out.appendChild(h('div', { class: 'small', style: 'text-transform:uppercase;letter-spacing:.5px;color:var(--text-faint);font-weight:600;margin:14px 0 4px' }, 'More lookups'));
      out.appendChild(renderLinks(grouped));
      if (grouped.order.length === 0) {
        out.appendChild(h('div', { class: 'faint' }, 'No applicable services for this target.'));
      }
      view.querySelector('#recon-target').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') render();
      });
      out.appendChild(h('div', { class: 'small faint', style: 'margin-top:12px' },
        'Third-party services operate under their own terms. External lookups require internet access and may log queries — review each service’s policy before use.' +
        (ctx.ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(targetInput) ? ' IP shown was resolved via Google DNS-over-HTTPS (A record).' : '')));
    });
  }

  function open(params) {
    if (params && params.url) targetInput = params.url;
    else if (params && params.host) targetInput = params.host;
    render();
  }

  return { id: 'recon', label: 'Recon', open };
})();