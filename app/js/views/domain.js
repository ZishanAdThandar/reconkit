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

  // crt.sh is frequently overloaded (502/503/504). Retry, then fall back to the
  // Cert Spotter CT API, which is CORS-open and needs no key.
  async function fetchJsonRetry(url, tries) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) { lastErr = e; }
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
    throw lastErr || new Error('request failed');
  }

  async function crtshSearch(domain) {
    // '%' must be encoded exactly once: crt.sh decodes '?q=%25.example.com' to '%.example.com'.
    const url = `https://crt.sh/?q=${encodeURIComponent('%.' + domain)}&output=json`;
    const j = await fetchJsonRetry(url, 3);
    if (!Array.isArray(j)) throw new Error('unexpected crt.sh response');
    return {
      source: 'crt.sh (Certificate Transparency logs)',
      certs: j.slice(0, 200).map((c) => ({
        common: String(c.common_name || ''),
        issuer: String(c.issuer_name || ''),
        notAfter: c.not_after ? (c.not_after + 'Z') : '',
        names: String(c.name_value || '').split('\n').map((n) => n.trim()).filter(Boolean)
      }))
    };
  }

  async function certspotterSearch(domain) {
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
    const j = await fetchJsonRetry(url, 2);
    if (!Array.isArray(j)) throw new Error('unexpected Cert Spotter response');
    return {
      source: 'Cert Spotter (Certificate Transparency)',
      certs: j.slice(0, 200).map((c) => ({
        common: (c.dns_names && c.dns_names[0]) || '',
        issuer: '',
        notAfter: c.not_after ? (c.not_after + 'Z') : '',
        names: Array.isArray(c.dns_names) ? c.dns_names : []
      }))
    };
  }

  function crtshOpenUrl(domain) { return `https://crt.sh/?q=${encodeURIComponent('%.' + domain)}`; }

  function renderCerts(wrap, domain, data, usedFallback) {
    if (!data.certs.length) {
      wrap.replaceChildren();
      wrap.appendChild(h('div', { class: 'faint' }, 'No certificates found for *.' + domain + '.'));
      return wrap;
    }
    const names = new Set();
    data.certs.forEach((c) => {
      (c.names || []).forEach((n) => { if (n) names.add(n.replace(/^\*\./, '')); });
      if (c.common) names.add(c.common.replace(/^\*\./, ''));
    });
    const sortedNames = Array.from(names).sort();
    wrap.replaceChildren();
    wrap.appendChild(h('div', { class: 'spread' }, [
      h('span', { class: 'muted' }, `${data.certs.length} certificate entries, ${sortedNames.length} unique names`),
      copyBtn(sortedNames.join('\n'))
    ]));
    wrap.appendChild(h('div', { class: 'out mono', style: 'max-height:180px' }, sortedNames.slice(0, 200).join('\n') || '(none)'));
    const t = h('table', { class: 'data', style: 'margin-top:8px' });
    t.appendChild(h('tr', {}, [h('th', {}, 'Common name'), h('th', {}, 'Issuer'), h('th', {}, 'Valid until')]));
    data.certs.slice(0, 25).forEach((c) => t.appendChild(h('tr', {}, [
      h('td', { class: 'wrap mono' }, esc(c.common || '(none)')),
      h('td', { class: 'wrap mono' }, esc(c.issuer || '—')),
      h('td', { class: 'wrap mono' }, esc((c.notAfter || '').replace('T', ' ').replace('Z', '')))
    ])));
    wrap.appendChild(h('div', { style: 'margin-top:4px' }, h('span', { class: 'small faint' },
      `Showing first ${Math.min(25, data.certs.length)} of ${data.certs.length} entries. Source: ${data.source}.`
      + (usedFallback ? ' crt.sh was unavailable; these results came from Cert Spotter.' : ''))));
    wrap.appendChild(t);
    return wrap;
  }

  async function certSearch(domain) {
    const wrap = h('div', {});
    wrap.appendChild(spinner('Querying crt.sh certificate transparency…'));
    let data, usedFallback = false;
    try {
      data = await crtshSearch(domain);
    } catch (e1) {
      try {
        data = await certspotterSearch(domain);
        usedFallback = true;
      } catch (e2) {
        wrap.replaceChildren();
        wrap.appendChild(h('div', { class: 'error-box' }, [
          'Certificate transparency lookup failed: ' + esc(String(e1.message || e1)) + '. crt.sh is frequently overloaded — try again shortly.'
        ]));
        wrap.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [
          h('button', { class: 'btn sm', onclick: () => {
            wrap.replaceChildren();
            wrap.appendChild(spinner('Retrying…'));
            certSearch(domain).then((w) => { wrap.replaceChildren(); wrap.appendChild(w); });
          } }, 'Retry'),
          h('button', { class: 'btn sm', onclick: () => browser.runtime.sendMessage({ type: 'rk:open-tabs', urls: [crtshOpenUrl(domain)] }) }, 'Open crt.sh')
        ]));
        return wrap;
      }
    }
    return renderCerts(wrap, domain, data, usedFallback);
  }

  async function resolveIp(name) {
    for (const [type, code] of [['A', 1], ['AAAA', 28]]) {
      try {
        const j = await doh(name, type);
        const ans = (j.Answer || []).find((a) => a.type === code && a.data);
        if (ans) return ans.data;
      } catch (e) { /* try the next record type */ }
    }
    return '';
  }

  // ipinfo only accepts an IP address ("Wrong ip" 404 otherwise); IPv6 colons
  // are valid path characters, so don't percent-encode them.
  function ipinfoUrl(ip) {
    return `https://ipinfo.io/${encodeURIComponent(ip).replace(/%3A/gi, ':')}/json`;
  }

  async function ipIntel(host, isIp, ipPromise) {
    const wrap = h('div', {});
    wrap.appendChild(spinner(isIp ? 'Looking up network / ASN data (ipinfo.io)…' : 'Resolving host, then network / ASN data (ipinfo.io)…'));
    try {
      let ip = isIp ? host : (ipPromise ? await ipPromise : await resolveIp(host));
      if (!ip) {
        wrap.replaceChildren();
        wrap.appendChild(h('div', { class: 'faint' },
          'Could not resolve ' + esc(host) + ' to an IP (no A/AAAA record via DoH), so ipinfo.io cannot be queried.'));
        return wrap;
      }
      const res = await fetch(ipinfoUrl(ip));
      if (!res.ok) throw new Error(`ipinfo HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(String((j.error && j.error.message) || j.error));
      const rows = [
        ['IP address', j.ip || ip], ['Hostname (rDNS)', j.hostname], ['Organization (ASN)', j.org],
        ['City', j.city], ['Region', j.region], ['Country', j.country], ['Postal', j.postal],
        ['Timezone', j.timezone], ['Location (lat,lng)', j.loc], ['ASN handle', j.asn]
      ];
      wrap.replaceChildren();
      wrap.appendChild(kvTable(rows));
      wrap.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' },
        `Source: ipinfo.io. ${isIp ? '' : 'Resolved ' + esc(host) + ' → ' + esc(ip) + ' via Google DNS-over-HTTPS. '}org is of the form "ASxxxx <name>". Reverse DNS is best-effort.`));
    } catch (e) {
      wrap.replaceChildren();
      wrap.appendChild(h('div', { class: 'error-box' }, esc(String(e.message || e))));
    }
    return wrap;
  }

  function targetHost() {
    const t = Rec.target || {};
    if (t.host) return t.host;
    if (t.url) { try { return new URL(t.url).hostname.toLowerCase(); } catch (e) {} }
    return '';
  }

  function render() {
    const view = el('view-domain');
    view.replaceChildren();
    const host = targetInput.trim() || targetHost();
    view.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, 'Target'),
      h('div', { class: 'row' }, [
        h('input', { id: 'domain-target', type: 'text', placeholder: 'domain, hostname or IP', value: targetInput, style: 'flex:1', oninput: (e) => { targetInput = e.target.value; } }),
        h('button', { class: 'btn', onclick: () => { targetInput = targetHost(); render(); } }, 'Use current tab'),
        h('button', { class: 'btn primary', onclick: () => render() }, 'Investigate')
      ])
    ]));

    if (!host) {
      view.appendChild(h('div', { class: 'card faint' }, 'Enter a target to run DNS, certificate and ASN queries.'));
      return;
    }
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
    const domain = RekLib.rootDomain(host);
    // Resolve once; reused by ipinfo and the related-intelligence links.
    const ipPromise = isIp ? Promise.resolve(host) : resolveIp(host);

    const dnsCard = h('div', { class: 'card' });
    dnsCard.appendChild(h('h3', {}, 'DNS records'));
    const dnsBody = h('div', {}, [spinner('Querying…')]);
    dnsCard.appendChild(dnsBody);
    dnsLookup(host).then((w) => { dnsBody.replaceChildren(); dnsBody.appendChild(w); });

    const certCard = h('div', { class: 'card' });
    certCard.appendChild(h('h3', {}, 'Certificates & subdomains (crt.sh / Cert Spotter)'));
    const certBody = h('div', {}, [spinner('Querying…')]);
    certCard.appendChild(certBody);
    if (!isIp) {
      certSearch(domain).then((w) => { certBody.replaceChildren(); certBody.appendChild(w); });
    } else {
      certBody.replaceChildren();
      certBody.appendChild(h('div', { class: 'faint' }, 'Skip for IP targets.'));
    }

    const ipCard = h('div', { class: 'card' });
    ipCard.appendChild(h('h3', {}, 'Network / ASN intelligence'));
    const ipBody = h('div', {}, [spinner('Querying…')]);
    ipCard.appendChild(ipBody);
    ipIntel(host, isIp, ipPromise).then((w) => { ipBody.replaceChildren(); ipBody.appendChild(w); });

    const linksCard = h('div', { class: 'card' });
    linksCard.appendChild(h('h3', {}, 'Related passive intelligence'));
    ipPromise.then((ip) => {
      try {
        // Include the resolved IP so IP-based services (ipinfo, Shodan host, …) apply.
        const ctx = RekServices.buildContext(host, { ip: ip || undefined });
        const grouped = RekServices.groupedLinks(ctx);
        const rows = [];
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
    });

    const stack = h('div', {}, [dnsCard, certCard, ipCard, linksCard]);
    view.appendChild(stack);
    view.querySelector('#domain-target')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') render(); });
    view.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' },
      'Queries go only to dns.google (DoH), crt.sh (falling back to api.certspotter.com) and ipinfo.io. Other services open in your browser on demand.'));
  }

  async function open(params) {
    if (params && params.url) { try { targetInput = new URL(params.url).hostname; } catch (e) { targetInput = params.url; } }
    else if (params && params.host) targetInput = params.host;
    // Pull a fresh target so the current URL is detected every time the view opens.
    try { await Rec.target.refresh(); } catch (e) { /* background sleeping */ }
    render();
  }

  return { id: 'domain', label: 'DNS / IP', open };
})();