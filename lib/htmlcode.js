/**
 * ReconKit — HTML entity encode/decode.
 * Entity decode: numeric entities (decimal and hex) fully; named entities from a
 * curated table of common HTML4/HTML5 names (falls back to a DOM-based decoder
 * when a DOM is available, e.g. inside the extension UI).
 */
(function (g) {
  'use strict';

  const NAMED = Object.freeze({
    amp: '&', apos: "'", lt: '<', gt: '>', quot: '"',
    nbsp: '\u00a0', iexcl: '\u00a1', cent: '\u00a2', pound: '\u00a3', curren: '\u00a4',
    yen: '\u00a5', brvbar: '\u00a6', sect: '\u00a7', uml: '\u00a8', copy: '\u00a9',
    ordf: '\u00aa', laquo: '\u00ab', not: '\u00ac', shy: '\u00ad', reg: '\u00ae',
    macr: '\u00af', deg: '\u00b0', plusmn: '\u00b1', sup2: '\u00b2', sup3: '\u00b3',
    acute: '\u00b4', micro: '\u00b5', para: '\u00b6', middot: '\u00b7', cedil: '\u00b8',
    sup1: '\u00b9', ordm: '\u00ba', raquo: '\u00bb', frac14: '\u00bc', frac12: '\u00bd',
    frac34: '\u00be', iquest: '\u00bf', times: '\u00d7', divide: '\u00f7',
    szlig: '\u00df', agrave: '\u00e0', aacute: '\u00e1', acirc: '\u00e2', atilde: '\u00e3',
    auml: '\u00e4', aring: '\u00e5', aelig: '\u00e6', ccedil: '\u00e7',
    egrave: '\u00e8', eacute: '\u00e9', ecirc: '\u00ea', euml: '\u00eb',
    igrave: '\u00ec', iacute: '\u00ed', icirc: '\u00ee', iuml: '\u00ef',
    eth: '\u00f0', ntilde: '\u00f1', ograve: '\u00f2', oacute: '\u00f3', ocirc: '\u00f4',
    otilde: '\u00f5', ouml: '\u00f6', oslash: '\u00f8', ugrave: '\u00f9', uacute: '\u00fa',
    ucirc: '\u00fb', uuml: '\u00fc', yacute: '\u00fd', thorn: '\u00fe', yuml: '\u00ff',
    OElig: '\u0152', oelig: '\u0153', Scaron: '\u0160', scaron: '\u0161',
    Yuml: '\u0178', fnof: '\u0192', circ: '\u02c6', tilde: '\u02dc',
    ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d',
    lrm: '\u200e', rlm: '\u200f', ndash: '\u2013', mdash: '\u2014',
    lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201a', ldquo: '\u201c',
    rdquo: '\u201d', bdquo: '\u201e', dagger: '\u2020', Dagger: '\u2021',
    bull: '\u2022', hellip: '\u2026', permil: '\u2030', prime: '\u2032', Prime: '\u2033',
    lsaquo: '\u2039', rsaquo: '\u203a', oline: '\u203e', frasl: '\u2044',
    euro: '\u20ac', trade: '\u2122', larr: '\u2190', uarr: '\u2191', rarr: '\u2192',
    darr: '\u2193', harr: '\u2194', crarr: '\u21b5', lArr: '\u21d0', uArr: '\u21d1',
    rArr: '\u21d2', dArr: '\u21d3', hArr: '\u21d4', forall: '\u2200', part: '\u2202',
    exist: '\u2203', empty: '\u2205', nabla: '\u2207', isin: '\u2208', notin: '\u2209',
    ni: '\u220b', prod: '\u220f', sum: '\u2211', minus: '\u2212', lowast: '\u2217',
    radic: '\u221a', prop: '\u221d', infin: '\u221e', ang: '\u2220', and: '\u2227',
    or: '\u2228', cap: '\u2229', cup: '\u222a', int: '\u222b', there4: '\u2234',
    sim: '\u223c', cong: '\u2245', asymp: '\u2248', ne: '\u2260', equiv: '\u2261',
    le: '\u2264', ge: '\u2265', sub: '\u2282', sup: '\u2283', nsub: '\u2284',
    sube: '\u2286', supe: '\u2287', oplus: '\u2295', otimes: '\u2297', perp: '\u22a5',
    sdot: '\u22c5', lceil: '\u2308', rceil: '\u2309', lfloor: '\u230a', rfloor: '\u230b',
    lang: '\u27e8', rang: '\u27e9', loz: '\u25ca', spades: '\u2660', clubs: '\u2663',
    hearts: '\u2665', diams: '\u2666', alefsym: '\u2135', image: '\u2111',
    real: '\u211c', weierp: '\u2118', thetasym: '\u03d1', upsih: '\u03d2',
    phi: '\u03c6', tau: '\u03c4', sigma: '\u03c3', rho: '\u03c1', pi: '\u03c0',
    omicron: '\u03bf', xi: '\u03be', nu: '\u03bd', mu: '\u03bc', lambda: '\u03bb',
    kappa: '\u03ba', iota: '\u03b9', theta: '\u03b8', eta: '\u03b7', zeta: '\u03b6',
    epsilon: '\u03b5', delta: '\u03b4', gamma: '\u03b3', beta: '\u03b2', alpha: '\u03b1',
    Omega: '\u03a9', Psi: '\u03a8', Chi: '\u03a7', Phi: '\u03a6', Upsilon: '\u03a5',
    Tau: '\u03a4', Sigma: '\u03a3', Rho: '\u03a1', Pi: '\u03a0', Omicron: '\u039f',
    Xi: '\u039e', Nu: '\u039d', Mu: '\u039c', Lambda: '\u039b', Kappa: '\u039a',
    Iota: '\u0399', Theta: '\u0398', Eta: '\u0397', Zeta: '\u0396', Epsilon: '\u0395',
    Delta: '\u0394', Gamma: '\u0393', Beta: '\u0392', Alpha: '\u0391'
  });

  function escapeHtml(str, opts) {
    opts = opts || {};
    const all = !!opts.all;
    let s = String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    if (all) {
      s = s.replace(/[^\x20-\x7E]/g, (ch) => `&#${ch.codePointAt(0)};`);
    }
    return s;
  }

  function decodeEntitySym(sym, isHex, isBrace) {
    let cp;
    if (isBrace) {
      const body = sym.slice(2, -1);
      if (!/^[0-9A-Fa-f]+$/.test(body)) return null;
      cp = parseInt(body, 16);
    } else if (isHex) {
      cp = parseInt(sym, 16);
    } else {
      cp = parseInt(sym, 10);
    }
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return null;
    if (cp >= 0xd800 && cp <= 0xdfff) return null;
    try { return String.fromCodePoint(cp); } catch (e) { return null; }
  }

  function decodeHtml(str) {
    let s = String(str);
    // DOM-based fallback gives full named-entity coverage when available.
    if (typeof document !== 'undefined' && document.createElement) {
      const ta = document.createElement('textarea');
      ta.innerHTML = s;
      return ta.value;
    }
    s = s.replace(/&#(x[0-9A-Fa-f]{1,6}|[0-9]{1,7});/g, (m, body) => {
      const hex = body[0] === 'x' || body[0] === 'X';
      const v = decodeEntitySym(hex ? body.slice(1) : body, hex);
      return v == null ? m : v;
    });
    s = s.replace(/&([A-Za-z][A-Za-z0-9]{1,31});/g, (m, name) => {
      return Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : m;
    });
    // Legacy &<name>; without semicolon forms are rare; do not handle by default.
    return s;
  }

  g.RekLib.module('htmlcode', function () {
    return { escape: escapeHtml, decode: decodeHtml };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);