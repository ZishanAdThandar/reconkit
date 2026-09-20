/**
 * ReconKit — OSINT / one-click lookups view.
 * Builds ready-to-open search URLs from the current target and opens them in
 * new tabs (external services are never embedded or bypassed).
 */
'use strict';
var Rec = window.Rec = window.Rec || {};
Rec.views = Rec.views || {};

Rec.views.recon = (() => {
  const { h, esc, el, toast, copyBtn, spinner } = Rec.ui;
  let targetInput = '';

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
      if (!ctx.host) {
        out.appendChild(h('div', { class: 'card faint' }, 'Enter a target or click “Use current tab”.'));
        return;
      }
      const grouped = RekServices.groupedLinks(ctx);
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

  return { id: 'recon', label: 'OSINT', open };
})();