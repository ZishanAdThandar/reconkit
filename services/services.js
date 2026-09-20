/**
 * ReconKit — External OSINT service catalog.
 * Pure data + URL builders. Works in background, sidebar and Node (tests).
 * Every entry documents what it queries and whether it accepts host / domain /
 * URL / IP targets. All URLs open externally in a new tab.
 */
(function (g) {
  'use strict';

  const NO = (ctx, why) => ({ ok: false, why });

  const SERVICES = [
    // ---------------- Search engines ----------------
    { id: 'google', group: 'Search engines', name: 'Google Search', quote: true,
      target: ['host', 'domain', 'ip', 'url'],
      build: (c) => `https://www.google.com/search?q=${q(c.searchValue, true)}` },
    { id: 'duckduckgo', group: 'Search engines', name: 'DuckDuckGo (privacy-friendly)', quote: true,
      target: ['host', 'domain', 'ip', 'url'],
      build: (c) => `https://duckduckgo.com/?q=${q(c.searchValue, true)}` },
    { id: 'bing', group: 'Search engines', name: 'Bing', quote: true,
      target: ['host', 'domain', 'ip', 'url'],
      build: (c) => `https://www.bing.com/search?q=${q(c.searchValue, true)}` },
    { id: 'brave', group: 'Search engines', name: 'Brave Search', quote: true,
      target: ['host', 'domain', 'ip', 'url'],
      build: (c) => `https://search.brave.com/search?q=${q(c.searchValue, true)}` },

    // ---------------- Code search ----------------
    { id: 'github', group: 'Code search', name: 'GitHub code search', quote: true,
      target: ['host', 'domain', 'ip', 'url'],
      build: (c) => `https://github.com/search?q=${q(c.searchValue, true)}&type=code` },
    { id: 'grepapp', group: 'Code search', name: 'grep.app', quote: false,
      target: ['host', 'domain', 'ip', 'url'],
      build: (c) => `https://grep.app/search?q=${q(c.searchValue, false)}` },
    { id: 'sourcegraph', group: 'Code search', name: 'Sourcegraph', quote: false,
      target: ['host', 'domain', 'ip', 'url'],
      build: (c) => `https://sourcegraph.com/search?q=${q(c.searchValue, false)}` },

    // ---------------- Certificates & transparency ----------------
    { id: 'crtsh', group: 'Certificates & transparency', name: 'crt.sh — certificate search',
      target: ['domain'],
      build: (c) => `https://crt.sh/?q=%25.${t(c.rootDomain)}` },
    { id: 'crtsh-exact', group: 'Certificates & transparency', name: 'crt.sh — exact domain',
      target: ['host'],
      build: (c) => `https://crt.sh/?q=${t(c.host)}` },
    { id: 'censys-cert', group: 'Certificates & transparency', name: 'Censys certificates',
      target: ['domain'],
      build: (c) => `https://search.censys.io/search?resource=certificates&q=${q(t(c.rootDomain), true)}` },

    // ---------------- Archives ----------------
    { id: 'wayback', group: 'Archives', name: 'Wayback Machine — history', quote: false,
      target: ['url', 'host'],
      build: (c) => `https://web.archive.org/web/*/${t(c.url || ('http://' + c.host))}` },
    { id: 'wayback-cdx', group: 'Archives', name: 'Wayback Machine — CDX API',
      target: ['host'],
      build: (c) => `https://web.archive.org/cdx/search/cdx?url=${t(c.rootDomain)}*&output=json&fl=timestamp,original,statuscode&collapse=urlkey&limit=500` },
    { id: 'urlscan', group: 'Archives', name: 'urlscan.io — historical scans', quote: false,
      target: ['host'],
      build: (c) => `https://urlscan.io/domain/${t(c.host)}` },
    { id: 'urlscan-url', group: 'Archives', name: 'urlscan.io — URL search',
      target: ['url'],
      build: (c) => `https://urlscan.io/search/?q=${q('page.url:"' + c.url + '"', false)}` },
    { id: 'commoncrawl', group: 'Archives', name: 'Common Crawl CDX index', quote: false,
      target: ['host'],
      build: (c) => `https://index.commoncrawl.org/collinfo.json` },
    { id: 'cdxio', group: 'Archives', name: 'cdx.io — CDX search UI', quote: false,
      target: ['host'],
      build: (c) => `https://search.cdx.io/?url=${t(c.rootDomain)}` },

    // ---------------- DNS & passive DNS ----------------
    { id: 'dns-google', group: 'DNS & passive DNS', name: 'DNS Google DoH (ANY)', quote: false,
      target: ['host'],
      build: (c) => `https://dns.google/resolve?name=${t(c.host)}&type=ANY` },
    { id: 'dns-cf', group: 'DNS & passive DNS', name: 'Cloudflare DoH (ANY)', quote: false,
      target: ['host'],
      build: (c) => `https://1.1.1.1/dns?name=${t(c.host)}&type=ANY` },
    { id: 'dnsdumpster', group: 'DNS & passive DNS', name: 'DNSDumpster', quote: false,
      target: ['host'],
      build: (c) => `https://dnsdumpster.com/` },
    { id: 'hackertarget', group: 'DNS & passive DNS', name: 'HackerTarget host search', quote: false,
      target: ['host'],
      build: (c) => `https://hackertarget.com/host-search/?q=${t(c.host)}` },
    { id: 'robtex', group: 'DNS & passive DNS', name: 'Robtex DNS lookup', quote: false,
      target: ['host'],
      build: (c) => `https://www.robtex.com/dns-lookup/${t(c.host)}/` },
    { id: 'otx', group: 'DNS & passive DNS', name: 'AlienVault OTX — passive DNS',
      target: ['host'],
      build: (c) => `https://otx.alienvault.com/indicator/domain/${t(c.host)}/passive_dns` },
    { id: 'viewdns', group: 'DNS & passive DNS', name: 'ViewDNS.info — reverse IP',
      target: ['host'],
      build: (c) => `https://viewdns.info/reverseip/?host=${t(c.host)}` },

    // ---------------- Domain intelligence ----------------
    { id: 'whosecuritytrails', group: 'Domain intelligence', name: 'SecurityTrails', quote: false,
      target: ['host'],
      build: (c) => `https://securitytrails.com/domain/${t(c.rootDomain)}/dns` },
    { id: 'builtwith', group: 'Domain intelligence', name: 'BuiltWith', quote: false,
      target: ['host'],
      build: (c) => `https://builtwith.com/${t(c.rootDomain)}` },
    { id: 'wappalyzer', group: 'Domain intelligence', name: 'Wappalyzer lookup', quote: false,
      target: ['host'],
      build: (c) => `https://www.wappalyzer.com/lookup/${t(c.rootDomain)}` },
    { id: 'netcraft', group: 'Domain intelligence', name: 'Netcraft site report', quote: false,
      target: ['host'],
      build: (c) => `https://sitereport.netcraft.com/?url=${t(c.rootDomain)}` },
    { id: 'shodan-host', group: 'Domain intelligence', name: 'Shodan — hostname search',
      target: ['host'],
      build: (c) => `https://www.shodan.io/search?query=${q('hostname:' + t(c.host), false)}` },
    { id: 'shodan-domain', group: 'Domain intelligence', name: 'Shodan — domain', quote: false,
      target: ['domain'],
      build: (c) => `https://www.shodan.io/domain/${t(c.rootDomain)}` },
    { id: 'censys-hosts', group: 'Domain intelligence', name: 'Censys host search',
      target: ['host'],
      build: (c) => `https://search.censys.io/search?resource=hosts&q=${q(t(c.host), false)}` },
    { id: 'rdap-domain', group: 'Domain intelligence', name: 'RDAP — registered domain', quote: false,
      target: ['domain'],
      build: (c) => `https://rdap.org/domain/${t(c.rootDomain)}` },
    { id: 'whois', group: 'Domain intelligence', name: 'WHOIS (whois.com)', quote: false,
      target: ['domain'],
      build: (c) => `https://www.whois.com/whois/${t(c.rootDomain)}` },

    // ---------------- IP / network intelligence ----------------
    { id: 'shodan-ip', group: 'IP / network intelligence', name: 'Shodan — host', quote: false,
      target: ['ip'],
      build: (c) => `https://www.shodan.io/host/${t(c.ip)}` },
    { id: 'censys-ip', group: 'IP / network intelligence', name: 'Censys — host', quote: false,
      target: ['ip'],
      build: (c) => `https://search.censys.io/hosts/${t(c.ip)}` },
    { id: 'ipinfo', group: 'IP / network intelligence', name: 'IPinfo.io', quote: false,
      target: ['ip', 'host'],
      build: (c) => `https://ipinfo.io/${t(c.ip || c.host)}` },
    { id: 'virustotal-ip', group: 'IP / network intelligence', name: 'VirusTotal — IP address', quote: false,
      target: ['ip'],
      build: (c) => `https://www.virustotal.com/gui/ip-address/${t(c.ip)}` },
    { id: 'abuseipdb', group: 'IP / network intelligence', name: 'AbuseIPDB', quote: false,
      target: ['ip'],
      build: (c) => `https://www.abuseipdb.com/check/${t(c.ip)}` },
    { id: 'greynoise', group: 'IP / network intelligence', name: 'GreyNoise — IP', quote: false,
      target: ['ip'],
      build: (c) => `https://viz.greynoise.io/ip/${t(c.ip)}` },
    { id: 'bgpview', group: 'IP / network intelligence', name: 'BGPView — IP', quote: false,
      target: ['ip'],
      build: (c) => `https://bgpview.io/ip/${t(c.ip)}` },
    { id: 'rdap-ip', group: 'IP / network intelligence', name: 'RDAP — IP (network info)', quote: false,
      target: ['ip'],
      build: (c) => `https://rdap.org/ip/${t(c.ip)}` },
    { id: 'virustotal-domain', group: 'IP / network intelligence', name: 'VirusTotal — domain', quote: false,
      target: ['domain'],
      build: (c) => `https://www.virustotal.com/gui/domain/${t(c.rootDomain)}` },
    { id: 'greynoise-org', group: 'IP / network intelligence', name: 'GreyNoise — organizations', quote: false,
      target: ['ip'],
      build: (c) => `https://viz.greynoise.io/` },

    // ---------------- Security assessment ----------------
    { id: 'securityheaders', group: 'Security assessment', name: 'SecurityHeaders.com', quote: false,
      target: ['host'],
      build: (c) => `https://securityheaders.com/?q=${t(c.host)}&followRedirects=on` },
    { id: 'observatory', group: 'Security assessment', name: 'Mozilla Observatory', quote: false,
      target: ['host'],
      build: (c) => `https://observatory.mozilla.org/analyze/${t(c.host)}` },
    { id: 'ssllabs', group: 'Security assessment', name: 'SSL Labs', quote: false,
      target: ['host'],
      build: (c) => `https://www.ssllabs.com/ssltest/analyze.html?d=${t(c.host)}` },

    // ---------------- File / stego external services (files page) ----------------
    { id: 'stegonline', group: 'External file analysis', name: 'StegOnline', requires: 'file', note: 'Uploads the file to their server',
      build: () => `https://stegonline.georgeom.net/upload` },
    { id: 'aperisolve', group: 'External file analysis', name: "Aperi'Solve", requires: 'file', note: 'Uploads the file to their server',
      build: () => `https://www.aperisolve.com/` },
    { id: 'cyberchef', group: 'External file analysis', name: 'CyberChef', requires: 'file', note: 'Processing happens in your browser',
      build: () => `https://gchq.github.io/CyberChef/` },
    { id: 'forensically', group: 'External file analysis', name: 'Forensically (29a.ch)', requires: 'file', note: 'Processing happens in your browser',
      build: () => `https://29a.ch/photo-forensics/` },
    { id: 'exifdata', group: 'External file analysis', name: 'exif.tools — EXIF viewer', requires: 'file', note: 'Uploads the file to their server',
      build: () => `https://exif.tools/` },
    { id: 'jimpl', group: 'External file analysis', name: 'Jimpl — photo metadata', requires: 'file', note: 'Uploads the file to their server',
      build: () => `https://www.jimpl.com/` }
  ];

  // ---- helpers ----
  function t(s) { return s == null ? '' : String(s); }
  function q(s, safe) {
    s = t(s);
    if (typeof encodeURIComponent === 'function') return encodeURIComponent(s);
    return s.replace(/[^A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]/g, (ch) => '%' + ch.charCodeAt(0).toString(16));
  }

  /**
   * Build the target context used to expand service templates.
   * Input can be a URL, hostname or IP; optional explicit ip.
   */
  function buildContext(urlOrHost, opts) {
    opts = opts || {};
    const raw = t(urlOrHost);
    let url = null, host = null, protocol = null, port = null, pathname = null, search = null;
    try {
      if (/^https?:\/\//i.test(raw) || raw.startsWith('file://')) {
        const u = new URL(raw);
        url = u.href;
        host = u.hostname;
        protocol = u.protocol.replace(':', '');
        port = u.port || (u.protocol === 'https:' ? '443' : u.protocol === 'http:' ? '80' : '');
        pathname = u.pathname !== '/' ? u.pathname : null;
        search = u.search ? u.search : null;
      }
    } catch (e) { /* not a URL */ }
    if (!host) {
      // hostname or IP
      host = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase();
    }
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
    const rootDomain = isIp ? host : (g.RekLib ? g.RekLib.rootDomain(host) : host);
    const ip = opts.ip || (isIp ? host : null);
    return { raw, url, host, rootDomain, protocol, port, pathname, search, isIp, ip };
  }

  /** Which services apply to a context; returns entries with built URLs. */
  function linksFor(ctx) {
    const out = [];
    const searchValue = ctx.isIp ? ctx.ip : (ctx.url || ctx.host);
    const itemCtx = Object.assign({}, ctx, { searchValue });
    for (const s of SERVICES) {
      if (s.requires) continue; // file tools only
      const matches = s.target.some((tk) => {
        if (tk === 'host' && ctx.host) return true;
        if (tk === 'domain' && ctx.rootDomain && !ctx.isIp) return true;
        if (tk === 'url' && ctx.url) return true;
        if (tk === 'ip' && ctx.ip) return true;
        return false;
      });
      if (!matches) continue;
      let url;
      try { url = s.build(itemCtx); } catch (e) { url = null; }
      if (!url) continue;
      out.push({ id: s.id, group: s.group, name: s.name, url, note: s.note || null });
    }
    return out;
  }

  /** Grouped for rendering. */
  function groupedLinks(ctx) {
    const links = linksFor(ctx);
    const groups = {};
    const order = [];
    for (const l of links) {
      if (!groups[l.group]) { groups[l.group] = []; order.push(l.group); }
      groups[l.group].push(l);
    }
    return { groups, order, links, ctx };
  }

  function fileTools() {
    return SERVICES.filter((s) => s.requires === 'file').map((s) => ({
      id: s.id, name: s.name, url: s.build({}), note: s.note, requires: 'file'
    }));
  }

  g.RekServices = { SERVICES, buildContext, linksFor, groupedLinks, fileTools };
})(typeof globalThis !== 'undefined' ? globalThis : this);