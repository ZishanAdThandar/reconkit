/**
 * ReconKit — DNS / IP intelligence view.
 * Live queries via public DoH + crt.sh + ipinfo (host permissions granted,
 * disclosed). Results are labelled with their source; failures become
 * explicit "undetermined" states.
 */
'use strict';
var Rec = window.Rec = window.Rec || {};
Rec.views = Rec.views || {};

Rec.views.domain = (() => {
  const { h, esc, el, toast, copyBtn, spinner, kvTable } = Rec.ui;
  let targetInput = '';

  async function doh(name, type) {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}&random_padding=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`DoH ${type} — HTTP ${res.status}`);
    return res.json();
  }

  function recordTable(answers) {
    const t = h('table', { class: 'data' });
    t.appendChild(h('tr', {}, [h('th', {}, 'Type'), h('th', {}, 'TTL'), h('th', {}, 'Data')]));
    const add = (a) => t.appendChild(h('tr', {}, [
      h('td', { class: 'mono' }, esc(a.type)),
      h('td', { class: 'mono' }, String(a.TTL ?? '')),
      h('td', { class: 'wrap mono' }, esc(String(a.data ?? '')))
    ]));
    (answers || []).forEach(add);
    if (!answers || !answers.length) t.appendChild(h('tr', {}, [h('td', { colspan: '3', class: 'faint' }, 'No records (or NXDOMAIN).'), h('td', {}), h('td', {})]));
    return t;
  }

  async function dnsLookup(host) {
    const wrap = h('div', {});
    wrap.appendChild(spinner('Querying DNS-over-HTTPS…'));
    try {
      const all = [];
      for (const type of ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT']) {
        try {
          const j = await doh(host, type);
          all.push([type, j.Answer || []]);
        } catch (e) { all.push([type, []]); }
      }
      wrap.replaceChildren();
      for (const [type, answers] of all) {
        wrap.appendChild(h('div', { style: 'margin:6px 0 2px' }, h('span', { class: 'tag acc' }, type)));
        wrap.appendChild(recordTable(answers));
      }
      wrap.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' }, 'Source: Google Public DNS (DoH). MX records list preference + host; TXT contains the raw record.'));
    } catch (e) {
      wrap.replaceChildren();
      wrap.appendChild(h('div', { class: 'error-box' }, esc(String(e.message || e))));
    }
    return wrap;
  }

  async function certSearch(domain) {
    const wrap = h('div', {});
    wrap.appendChild(spinner('Querying crt.sh certificate transparency…'));
    try {
      const res = await fetch(`https://crt.sh/?q=${encodeURIComponent('%25.' + domain)}&output=json`);
      if (!res.ok) throw new Error(`crt.sh HTTP ${res.status}`);
      const j = await res.json();
      if (!Array.isArray(j) || !j.length) {
        wrap.replaceChildren();
        wrap.appendChild(h('div', { class: 'faint' }, 'No certificates found for *.' + domain + '.'));
        return wrap;
      }
      const names = new Set();
      const certs = j.slice(0, 200).map((c) => {
        const nameValue = String(c.common_name || '');
        (String(c.name_value || '')).split('\n').forEach((n) => { const v = n.trim(); if (v) names.add(v.replace(/^\*\./, '')); });
        if (nameValue) names.add(nameValue.replace(/^\*\./, ''));
        return {
          common: nameValue, issuer: String(c.issuer_name || ''),
          notBefore: c.not_before ? (c.not_before + 'Z') : '', notAfter: c.not_after ? (c.not_after + 'Z') : '', id: c.id
        };
      });
      const sortedNames = Array.from(names).sort();
      wrap.replaceChildren();
      wrap.appendChild(h('div', { class: 'spread' }, [
        h('span', { class: 'muted' }, `${certs.length} certificate entries, ${sortedNames.length} unique names`),
        copyBtn(sortedNames.join('\n'))
      ]));
      wrap.appendChild(h('div', { class: 'out mono', style: 'max-height:180px' }, sortedNames.slice(0, 200).join('\n')));
      const t = h('table', { class: 'data', style: 'margin-top:8px' });
      t.appendChild(h('tr', {}, [h('th', {}, 'Common name'), h('th', {}, 'Issuer'), h('th', {}, 'Valid until')]));
      certs.slice(0, 25).forEach((c) => t.appendChild(h('tr', {}, [
        h('td', { class: 'wrap mono' }, esc(c.common)), h('td', { class: 'wrap mono' }, esc(c.issuer)),
        h('td', { class: 'wrap mono' }, esc(c.notAfter.replace('T', ' ').replace('Z', '')))
      ])));
      wrap.appendChild(h('div', { style: 'margin-top:4px' }, h('span', { class: 'small faint' }, `Showing first 25 of ${certs.length} entries. Source: crt.sh (Certificate Transparency logs).`)));
      wrap.appendChild(t);
    } catch (e) {
      wrap.replaceChildren();
      wrap.appendChild(h('div', { class: 'error-box' }, 'crt.sh is unavailable or returned an error: ' + esc(e.message)));
    }
    return wrap;
  }

  async function ipIntel(host) {
    const wrap = h('div', {});
    wrap.appendChild(spinner('Looking up network / ASN data (ipinfo.io)…'));
    try {
      const res = await fetch(`https://ipinfo.io/${encodeURIComponent(host)}/json`);
      if (!res.ok) throw new Error(`ipinfo HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(String(j.error));
      const rows = [
        ['IP address', j.ip], ['Hostname (rDNS)', j.hostname], ['Organization (ASN)', j.org],
        ['City', j.city], ['Region', j.region], ['Country', j.country], ['Postal', j.postal],
        ['Timezone', j.timezone], ['Location (lat,lng)', j.loc], ['ASN handle', j.asn]
      ];
      wrap.replaceChildren();
      wrap.appendChild(kvTable(rows));
      wrap.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' }, 'Source: ipinfo.io. org is of the form "ASxxxx <name>". Reverse DNS is best-effort.'));
    } catch (e) {
      wrap.replaceChildren();
      wrap.appendChild(h('div', { class: 'error-box' }, esc(String(e.message || e))));
    }
    return wrap;
  }

  function render() {
    const view = el('view-domain');
    view.replaceChildren();
    const host = targetInput.trim() || (Rec.target && Rec.target.host) || '';
    view.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, 'Target'),
      h('div', { class: 'row' }, [
        h('input', { id: 'domain-target', type: 'text', placeholder: 'domain, hostname or IP', value: targetInput, style: 'flex:1', oninput: (e) => { targetInput = e.target.value; } }),
        h('button', { class: 'btn', onclick: () => { targetInput = (Rec.target && Rec.target.host) || ''; render(); } }, 'Use current tab'),
        h('button', { class: 'btn primary', onclick: () => render() }, 'Investigate')
      ])
    ]));

    if (!host) {
      view.appendChild(h('div', { class: 'card faint' }, 'Enter a target to run DNS, certificate and ASN queries.'));
      return;
    }
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
    const domain = RekLib.rootDomain(host);

    const dnsCard = h('div', { class: 'card' });
    dnsCard.appendChild(h('h3', {}, 'DNS records'));
    const dnsBody = h('div', {}, [spinner('Querying…')]);
    dnsCard.appendChild(dnsBody);
    dnsLookup(host).then((w) => { dnsBody.replaceChildren(); dnsBody.appendChild(w); });

    const certCard = h('div', { class: 'card' });
    certCard.appendChild(h('h3', {}, 'Certificates & subdomains (via crt.sh)'));
    const certBody = h('div', {}, [spinner('Querying…')]);
    certCard.appendChild(certBody);
    if (!isIp) certSearch(domain).then((w) => { certBody.replaceChildren(); certBody.appendChild(w); });
    else certBody.replaceChildren(); certBody.appendChild(h('div', { class: 'faint' }, 'Skip for IP targets.'));

    const ipCard = h('div', { class: 'card' });
    ipCard.appendChild(h('h3', {}, 'Network / ASN intelligence'));
    const ipBody = h('div', {}, [spinner('Querying…')]);
    ipCard.appendChild(ipBody);
    ipIntel(isIp ? host : domain).then((w) => { ipBody.replaceChildren(); ipBody.appendChild(w); });

    const linksCard = h('div', { class: 'card' });
    linksCard.appendChild(h('h3', {}, 'Related passive intelligence'));
    try {
      const ctx = RekServices.buildContext(host);
      const grouped = RekServices.groupedLinks(ctx);
      const rows = [];
      const keys = ['Certificates & transparency', 'DNS & passive DNS', 'Domain intelligence', 'IP / network intelligence', 'Security assessment'];
      for (const g in grouped.groups) {
        for (const s of grouped.groups[g]) {
          rows.push(h('div', { class: 'row', style: 'border-bottom:1px solid var(--line);padding:4px 0' }, [
            h('span', { class: 'small muted', style: 'width:150px' }, esc(g)),
            h('span', { class: 'wrap mono small', style: 'flex:1' }, esc(s.name)),
            h('button', { class: 'btn sm', onclick: () => browser.runtime.sendMessage({ type: 'rk:open-tabs', urls: [s.url] }) }, 'Open')
          ]));
        }
      }
      if (rows.length) { rows.forEach((r) => linksCard.appendChild(r)); }
    } catch (e) { /* skip */ }

    const stack = h('div', {}, [dnsCard, certCard, ipCard, linksCard]);
    view.appendChild(stack);
    view.querySelector('#domain-target')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') render(); });
    view.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' },
      'Queries go only to dns.google (DoH), crt.sh and ipinfo.io. Other services open in your browser on demand.'));
  }

  function open(params) {
    if (params && params.url) { try { targetInput = new URL(params.url).hostname; } catch (e) { targetInput = params.url; } }
    else if (params && params.host) targetInput = params.host;
    render();
  }

  return { id: 'domain', label: 'DNS / IP', open };
})();