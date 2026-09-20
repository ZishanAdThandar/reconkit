/**
 * ReconKit — lib-core.js
 * Shared core utilities for the ReconKit library namespace.
 * Environment-agnostic (browser / Node). Attaches to globalThis.RekLib.
 */
(function (g) {
  'use strict';

  const NS = 'RekLib';
  const api = (g[NS] && typeof g[NS] === 'object') ? g[NS] : (g[NS] = {});
  api.version = '1.0.0';

  // ------------------------------------------------------------------
  // Byte helpers
  // ------------------------------------------------------------------

  /** Convert a value to Uint8Array if reasonable, else throw. */
  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (Array.isArray(input)) return Uint8Array.from(input);
    if (typeof input === 'string') return encodeUTF8(input);
    throw new Error('ReconKit: cannot interpret value as bytes');
  }

  const _enc = () => (typeof TextEncoder !== 'undefined' ? new TextEncoder() : null);
  const _dec = () => (typeof TextDecoder !== 'undefined' ? new TextDecoder() : null);

  function encodeUTF8(str) {
    const enc = _enc();
    return enc ? enc.encode(String(str)) : Uint8Array.from(unescapeStr(str));
  }
  function decodeUTF8(bytes) {
    const dec = _dec();
    if (dec) return dec.decode(toBytes(bytes));
    let out = '';
    for (const b of toBytes(bytes)) out += String.fromCharCode(b);
    return decodeURIComponent(escape(out));
  }
  // Fallback only (older engines without TextEncoder).
  function unescapeStr(str) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 128) out += String.fromCharCode(c);
      else if (c < 2048) {
        out += String.fromCharCode(192 | (c >> 6), 128 | (c & 63));
      } else {
        out += String.fromCharCode(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      }
    }
    return out;
  }

  function concatBytes(...arrays) {
    const parts = arrays.map(toBytes);
    const total = parts.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of parts) { out.set(a, off); off += a.length; }
    return out;
  }

  function bytesEqual(a, b) {
    a = toBytes(a); b = toBytes(b);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function bytesToHex(bytes, opts) {
    opts = opts || {};
    bytes = toBytes(bytes);
    const upper = !!opts.upper;
    const sep = opts.sep || '';
    const prefix = opts.prefix || '';
    let out = '';
    const hex = upper ? '0123456789ABCDEF' : '0123456789abcdef';
    for (let i = 0; i < bytes.length; i++) {
      if (i && sep) out += sep;
      const b = bytes[i];
      out += prefix + hex[(b >> 4) & 15] + hex[b & 15];
    }
    return out;
  }

  function hexToBytes(str) {
    if (typeof str !== 'string') throw new Error('ReconKit: hex input must be a string');
    let s = str.trim();
    // Tolerate common separators and prefixes.
    s = s.replace(/^0[xX]/, '');
    s = s.replace(/[\s,:;_-]/g, '');
    if (s.length % 2 !== 0) {
      // Tolerate a missing leading zero on a single odd digit? No — strict.
      throw new Error(`ReconKit: hex string has odd length (${s.length} digit${s.length === 1 ? '' : 's'})`);
    }
    if (!/^[0-9a-fA-F]*$/.test(s)) throw new Error('ReconKit: hex string contains non-hexadecimal characters');
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return out;
  }

  /** Human-readable byte size. */
  function formatBytes(n) {
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${n} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let v = n / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
  }

  /** Relative time description from a unix timestamp (seconds) or ms. */
  function describeTime(tsSeconds, nowSeconds) {
    if (!Number.isFinite(tsSeconds)) return null;
    nowSeconds = nowSeconds == null ? Math.floor(Date.now() / 1000) : nowSeconds;
    const diff = tsSeconds - nowSeconds;
    const abs = Math.abs(diff);
    const unit = (v, s) => `${Math.round(v)} ${s}${Math.round(v) === 1 ? '' : 's'}`;
    let rel;
    if (abs < 60) rel = unit(abs, 'second');
    else if (abs < 3600) rel = unit(abs / 60, 'minute');
    else if (abs < 86400) rel = unit(abs / 3600, 'hour');
    else if (abs < 2592000) rel = unit(abs / 86400, 'day');
    else if (abs < 31536000) rel = unit(abs / 2592000, 'month');
    else rel = unit(abs / 31536000, 'year');
    const iso = new Date(tsSeconds * 1000).toISOString().replace('T', ' ').replace('Z', ' UTC');
    if (diff > 0) return `in ${rel} (${iso})`;
    return `${rel} ago (${iso})`;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // lowercase hex for TextEncoder fallback path not needed; keep for tests
  /** Umbrella technique: derive eTLD+1 from a hostname using a compact
   *  public-suffix table (heuristic; good for common multi-label suffixes). */
  const MULTI_SUFFIX = [
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'nhs.uk', 'me.uk', 'net.uk', 'plc.uk', 'ltd.uk',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'asn.au',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ad.jp', 'ed.jp', 'gr.jp', 'lg.jp',
    'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
    'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in', 'edu.in', 'res.in', 'firm.in', 'gen.in', 'ind.in', 'nic.in',
    'com.mx', 'gob.mx', 'org.mx', 'edu.mx', 'net.mx',
    'co.kr', 'go.kr', 'or.kr', 'ne.kr', 're.kr', 'pe.kr',
    'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
    'com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw', 'idv.tw',
    'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'geek.nz', 'gen.nz', 'maori.nz', 'school.nz',
    'co.za', 'org.za', 'net.za', 'gov.za', 'ac.za', 'web.za',
    'com.sg', 'org.sg', 'net.sg', 'edu.sg', 'gov.sg',
    'com.hk', 'org.hk', 'net.hk', 'edu.hk', 'gov.hk', 'idv.hk',
    'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my',
    'co.th', 'or.th', 'ac.th', 'go.th', 'in.th', 'net.th',
    'com.vn', 'net.vn', 'org.vn', 'edu.vn', 'gov.vn',
    'com.tr', 'org.tr', 'net.tr', 'edu.tr', 'gov.tr', 'gen.tr', 'web.tr',
    'com.pk', 'net.pk', 'org.pk', 'edu.pk', 'gov.pk',
    'com.ng', 'org.ng', 'net.ng', 'edu.ng', 'gov.ng',
    'com.ar', 'net.ar', 'org.ar', 'gob.ar', 'edu.ar',
    'com.co', 'net.co', 'org.co', 'edu.co', 'gov.co',
    'com.pe', 'net.pe', 'org.pe', 'edu.pe', 'gob.pe',
    'com.ec', 'net.ec', 'org.ec', 'edu.ec', 'gov.ec',
    'com.uy', 'org.uy', 'net.uy', 'edu.uy', 'gub.uy',
    'co.id', 'or.id', 'web.id', 'ac.id', 'sch.id', 'go.id', 'my.id', 'net.id',
    'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph',
    'com.eg', 'org.eg', 'net.eg', 'edu.eg', 'gov.eg',
    'com.sa', 'org.sa', 'net.sa', 'gov.sa', 'edu.sa', 'med.sa', 'sch.sa',
    'com.ua', 'org.ua', 'net.ua', 'edu.ua', 'gov.ua', 'in.ua',
    'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'muni.il',
    'com.pl', 'org.pl', 'net.pl', 'edu.pl', 'gov.pl',
    'com.ro', 'org.ro', 'net.ro', 'edu.ro',
    'com.gr', 'org.gr', 'net.gr', 'edu.gr', 'gov.gr',
    'com.pt', 'org.pt', 'net.pt', 'edu.pt', 'gov.pt',
    'com.hr', 'org.hr', 'net.hr', 'edu.hr', 'gov.hr',
    'com.si', 'org.si', 'net.si', 'edu.si', 'gov.si',
    'com.rs', 'org.rs', 'net.rs', 'edu.rs', 'gov.rs',
    'com.sk', 'org.sk', 'net.sk', 'edu.sk', 'gov.sk',
    'com.hu', 'org.hu', 'net.hu', 'info.hu', 'edu.hu', 'gov.hu',
    'com.cz', 'org.cz', 'net.cz', 'edu.cz', 'gov.cz',
    'com.bg', 'org.bg', 'net.bg', 'edu.bg', 'gov.bg',
    'com.mk', 'org.mk', 'net.mk', 'gov.mk', 'edu.mk',
    'co.hu', 'info.hu',
    'co.ir', 'ac.ir', 'org.ir', 'net.ir', 'gov.ir',
    'com.lk', 'org.lk', 'net.lk', 'gov.lk', 'edu.lk',
    'com.bd', 'org.bd', 'net.bd', 'gov.bd', 'edu.bd',
    'com.np', 'org.np', 'net.np', 'gov.np', 'edu.np',
    'com.mm', 'org.mm', 'net.mm', 'gov.mm', 'edu.mm',
    'com.kh', 'org.kh', 'net.kh', 'gov.kh', 'edu.kh',
    'com.af', 'org.af', 'net.af', 'gov.af', 'edu.af',
    'com.ye', 'org.ye', 'net.ye', 'gov.ye',
    'co.ke', 'or.ke', 'ne.ke', 'ac.ke', 'go.ke', 'sc.ke',
    'co.tz', 'or.tz', 'ac.tz', 'go.tz',
    'co.ug', 'or.ug', 'ac.ug', 'go.ug',
    'co.ao', 'org.ao', 'gov.ao', 'edu.ao',
    'com.gh', 'org.gh', 'edu.gh', 'gov.gh',
    'com.et', 'org.et', 'net.et', 'gov.et', 'edu.et',
    'com.ve', 'org.ve', 'net.ve', 'gob.ve', 'edu.ve',
    'com.bo', 'org.bo', 'net.bo', 'gob.bo', 'edu.bo',
    'com.py', 'org.py', 'net.py', 'gov.py', 'edu.py',
    'com.cu', 'org.cu', 'net.cu', 'gob.cu', 'edu.cu',
    'com.do', 'org.do', 'net.do', 'gob.do', 'edu.do',
    'com.ni', 'org.ni', 'net.ni', 'gob.ni', 'edu.ni',
    'com.sv', 'org.sv', 'net.sv', 'gob.sv', 'edu.sv',
    'com.gt', 'org.gt', 'net.gt', 'gob.gt', 'edu.gt',
    'com.hn', 'org.hn', 'net.hn', 'gob.hn', 'edu.hn',
    'com.cr', 'org.cr', 'net.cr', 'gob.cr', 'edu.cr',
    'com.pa', 'org.pa', 'net.pa', 'gob.pa', 'edu.pa',
    'com.uy', 'org.uy', 'net.uy',
    'com.om', 'org.om', 'net.om', 'gov.om', 'edu.om',
    'com.qa', 'org.qa', 'net.qa', 'gov.qa', 'edu.qa',
    'com.kw', 'org.kw', 'net.kw', 'gov.kw', 'edu.kw',
    'com.lb', 'org.lb', 'net.lb', 'gov.lb', 'edu.lb',
    'com.jo', 'org.jo', 'net.jo', 'gov.jo', 'edu.jo',
    'com.sy', 'org.sy', 'net.sy', 'gov.sy', 'edu.sy',
    'com.iq', 'org.iq', 'net.iq', 'gov.iq', 'edu.iq',
    'com.bh', 'org.bh', 'net.bh', 'gov.bh', 'edu.bh',
    'com.lv', 'org.lv', 'net.lv', 'gov.lv', 'edu.lv',
    'com.ee', 'org.ee', 'net.ee', 'gov.ee', 'edu.ee',
    'com.lt', 'org.lt', 'net.lt', 'gov.lt', 'edu.lt',
    'com.by', 'org.by', 'net.by', 'gov.by', 'edu.by',
    'com.kz', 'org.kz', 'net.kz', 'gov.kz', 'edu.kz',
    'com.uz', 'org.uz', 'net.uz', 'gov.uz', 'edu.uz',
    'co.am', 'org.am', 'net.am', 'gov.am', 'edu.am',
    'com.az', 'org.az', 'net.az', 'gov.az', 'edu.az',
    'com.ge', 'org.ge', 'net.ge', 'gov.ge', 'edu.ge',
    'com.cy', 'org.cy', 'net.cy', 'gov.cy', 'edu.cy',
    'com.mt', 'org.mt', 'net.mt', 'gov.mt', 'edu.mt',
    'com.lu', 'org.lu', 'net.lu', 'edu.lu',
    'com.mc', 'asso.mc', 'org.mc',
    'co.cr', 'cr',
    'com.sm', 'org.sm', 'net.sm',
    'co.va', 'va',
    'com.gl',
    'com.gp', 'com.mq', 'com.re', 'com.gf', 'com.pf', 'com.nc', 'com.yt', 'com.tf',
    'co.vi', 'org.vi',
    'com.pr', 'org.pr', 'edu.pr', 'gob.pr',
    'com.bz', 'org.bz', 'net.bz', 'gov.bz', 'edu.bz',
    'com.bs', 'org.bs', 'net.bs', 'gov.bs', 'edu.bs',
    'com.bb', 'org.bb', 'net.bb', 'gov.bb', 'edu.bb',
    'com.jm', 'org.jm', 'net.jm', 'gov.jm', 'edu.jm',
    'com.tt', 'org.tt', 'net.tt', 'gov.tt', 'edu.tt',
    'com.gy', 'org.gy', 'net.gy', 'gov.gy', 'edu.gy',
    'com.sr', 'org.sr', 'net.sr', 'gov.sr',
    'com.pg', 'org.pg', 'net.pg', 'gov.pg',
    'com.fj', 'org.fj', 'net.fj', 'gov.fj',
    'com.vu', 'org.vu', 'net.vu', 'gov.vu',
    'com.ws', 'org.ws', 'net.ws', 'gov.ws', 'edu.ws',
    'com.tv',
    'com.sb', 'org.sb', 'net.sb', 'gov.sb',
    'com.ki', 'org.ki', 'net.ki', 'edu.ki', 'gov.ki',
    'com.mh', 'org.mh', 'net.mh', 'edu.mh', 'gov.mh',
    'com.nr', 'org.nr', 'net.nr', 'edu.nr', 'gov.nr',
    'com.fm', 'org.fm', 'net.fm',
    'com.pw',
    'com.ck', 'org.ck', 'net.ck', 'edu.ck', 'gov.ck',
    'co.ck',
    'com.wf', 'com.an',
    'com.ms', 'org.ms', 'net.ms', 'gov.ms', 'edu.ms',
    'com.ai', 'org.ai', 'net.ai', 'off.ai', 'com.ai', 'edu.ai', 'gov.ai',
    'com.ag', 'org.ag', 'net.ag',
    'com.gd', 'org.gd', 'net.gd',
    'com.vc', 'org.vc', 'net.vc', 'gov.vc', 'edu.vc',
    'com.ky', 'org.ky', 'net.ky', 'edu.ky', 'gov.ky'
  ];
  function rootDomain(hostname) {
    if (!hostname) return null;
    const h = String(hostname).toLowerCase();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return h; // IP / literal
    const labels = h.split('.');
    if (labels.length <= 2) return h;
    const tail2 = labels.slice(-2).join('.');
    if (MULTI_SUFFIX.includes(tail2)) return labels.slice(-3).join('.');
    return tail2;
  }

  api.toBytes = toBytes;
  api.encodeUTF8 = encodeUTF8;
  api.decodeUTF8 = decodeUTF8;
  api.concatBytes = concatBytes;
  api.bytesEqual = bytesEqual;
  api.bytesToHex = bytesToHex;
  api.hexToBytes = hexToBytes;
  api.formatBytes = formatBytes;
  api.describeTime = describeTime;
  api.escapeRegExp = escapeRegExp;
  api.rootDomain = rootDomain;

  // Namespace export helper used by satellite modules.
  api.module = function (name, factory) {
    if (api[name]) throw new Error(`ReconKit: module '${name}' already registered`);
    api[name] = factory(api);
    return api[name];
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);