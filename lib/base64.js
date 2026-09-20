/**
 * ReconKit — Base64 / Base64URL.
 * UTF-8 safe encode/decode. Environment-agnostic.
 */
(function (g) {
  'use strict';

  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function buildRev(table) {
    const rev = {};
    for (let i = 0; i < table.length; i++) rev[table[i]] = i;
    return rev;
  }
  const REV = buildRev(B64);
  const REVU = buildRev(B64U);

  function bytesToBase64(input, opts) {
    opts = opts || {};
    const urlsafe = !!opts.urlsafe;
    const pad = opts.padding !== false; // default true
    const table = urlsafe ? B64U : B64;
    const u8 = g.RekLib.toBytes(input);
    let out = '';
    for (let i = 0; i < u8.length; i += 3) {
      const b0 = u8[i];
      const b1 = i + 1 < u8.length ? u8[i + 1] : 0;
      const b2 = i + 2 < u8.length ? u8[i + 2] : 0;
      const n = (b0 << 16) | (b1 << 8) | b2;
      out += table[(n >> 18) & 63] + table[(n >> 12) & 63];
      out += i + 1 < u8.length ? table[(n >> 6) & 63] : (pad ? '=' : '');
      out += i + 2 < u8.length ? table[n & 63] : (pad ? '=' : '');
    }
    return out;
  }

  function base64ToBytes(str, opts) {
    opts = opts || {};
    const urlsafe = !!opts.urlsafe;
    const rev = urlsafe ? REVU : REV;
    let s = String(str).trim().replace(/\s+/g, '');
    if (urlsafe) {
      if (opts.tolerant !== false) {
        // Accept standard base64 in "url safe" mode as well.
        s = s.replace(/\+/g, '-').replace(/\//g, '_');
      }
    }
    // Strip padding, tolerate missing padding.
    s = s.replace(/=+$/, '');
    // Tolerate non-alphabet chars by dropping them (be strict when asked).
    if (opts.strict) {
      const valid = urlsafe ? /^[A-Za-z0-9_\-]*$/ : /^[A-Za-z0-9+/]*$/;
      if (!valid.test(s)) throw new Error('ReconKit: invalid base64 characters');
    } else {
      const re = urlsafe ? /[^A-Za-z0-9_\-]/g : /[^A-Za-z0-9+/]/g;
      s = s.replace(re, '');
    }
    if (s.length % 4 === 1) throw new Error('ReconKit: invalid base64 length');
    const len = Math.floor(s.length / 4) * 3 + (s.length % 4 ? (s.length % 4) - 1 : 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (let i = 0; i < s.length; i += 4) {
      const c0 = rev[s[i]]; const c1 = rev[s[i + 1]];
      const c2 = i + 2 < s.length ? rev[s[i + 2]] : 0;
      const c3 = i + 3 < s.length ? rev[s[i + 3]] : 0;
      const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
      out[o++] = (n >> 16) & 0xFF;
      if (i + 2 < s.length) out[o++] = (n >> 8) & 0xFF;
      if (i + 3 < s.length) out[o++] = n & 0xFF;
    }
    return out;
  }

  function base64FromStr(str, opts) { return bytesToBase64(g.RekLib.encodeUTF8(str), opts); }
  function base64ToStr(str, opts) { return g.RekLib.decodeUTF8(base64ToBytes(str, opts)); }
  // url-safe helpers
  const urlSafe = (str, opts) => bytesToBase64(g.RekLib.encodeUTF8(str), Object.assign({ urlsafe: true }, opts));
  const urlSafeDecode = (str, opts) => g.RekLib.decodeUTF8(base64ToBytes(str, Object.assign({ urlsafe: true }, opts)));
  const bytesToUrlSafe = (u8, opts) => bytesToBase64(u8, Object.assign({ urlsafe: true, padding: false }, opts));

  g.RekLib.module('base64', function () {
    return {
      encode: bytesToBase64,
      decode: base64ToBytes,
      fromString: base64FromStr,
      toString: base64ToStr,
      urlSafe,
      urlSafeDecode,
      bytesToUrlSafe
    };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);