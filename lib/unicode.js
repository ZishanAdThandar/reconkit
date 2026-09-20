/**
 * ReconKit — Unicode utilities.
 * \u escape / unescape (surrogate pair or code-point brace style),
 * code point listing, and Unicode normalization.
 */
(function (g) {
  'use strict';

  function escapeChar(ch, mode) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp > 0x7e || cp === 0x5c) {
      if (mode === 'cp' && cp > 0xffff) return `\\u{${cp.toString(16)}}`;
      if (cp > 0xffff) {
        // Convert to surrogate pair
        const high = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
        const low = ((cp - 0x10000) % 0x400) + 0xdc00;
        return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
      }
      return `\\u${cp.toString(16).padStart(4, '0')}`;
    }
    return ch;
  }

  function toEscape(str, opts) {
    opts = opts || {};
    const mode = opts.mode === 'cp' ? 'cp' : 'surrogate';
    let out = '';
    for (const ch of String(str)) out += escapeChar(ch, mode);
    return out;
  }

  function fromEscape(str) {
    return String(str).replace(/\\u\{([0-9A-Fa-f]+)\}|\\u([0-9A-Fa-f]{4})|\\x([0-9A-Fa-f]{2})/g, (_m, brace, u, x) => {
      const cp = brace ? parseInt(brace, 16) : u ? parseInt(u, 16) : parseInt(x, 16);
      if (!Number.isFinite(cp)) return _m;
      try { return String.fromCodePoint(cp); } catch (e) { return _m; }
    });
  }

  function codePoints(str) {
    return Array.from(String(str)).map((ch) => {
      const cp = ch.codePointAt(0);
      return {
        char: ch,
        codePoint: cp,
        hex: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
        dec: cp,
        category: (() => {
          if (cp <= 0x7e) return 'ASCII';
          if ((cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) return 'surrogate/invalid';
          return 'BMP/astral';
        })()
      };
    });
  }

  function normalize(str, form) {
    const f = String(form || 'NFC').toUpperCase();
    if (!['NFC', 'NFD', 'NFKC', 'NFKD'].includes(f)) throw new Error(`ReconKit: unsupported normalization form ${f}`);
    return String(str).normalize(f);
  }

  g.RekLib.module('unicode', function () {
    return { toEscape, fromEscape, codePoints, normalize };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);