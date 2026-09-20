/**
 * ReconKit — URL percent-encoding utilities.
 * Uses encodeURIComponent/decodeURIComponent with extra options for
 * application/x-www-form-urlencoded style (space as '+') and lenient decoding.
 */
(function (g) {
  'use strict';

  function percentEncode(str, opts) {
    opts = opts || {};
    let s = encodeURIComponent(String(str));
    if (opts.spaceAsPlus) s = s.replace(/%20/g, '+');
    return s;
  }

  function percentDecode(str, opts) {
    opts = opts || {};
    let s = String(str);
    if (opts.spaceAsPlus) s = s.replace(/\+/g, ' ');
    try {
      return decodeURIComponent(s);
    } catch (e) {
      // Malformed sequences: decode %XX as raw bytes and let an UTF-8 decoder
      // replace invalid sequences, keeping every other character intact.
      const bytes = [];
      let i = 0;
      while (i < s.length) {
        if (s[i] === '%' && /^%[0-9A-Fa-f]{2}$/.test(s.substr(i, 3))) {
          bytes.push(parseInt(s.substr(i + 1, 2), 16));
          i += 3;
        } else {
          const ch = s[i];
          const cp = ch.codePointAt(0);
          if (cp < 0x80) bytes.push(cp);
          else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
          else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          i++;
        }
      }
      const out = Uint8Array.from(bytes);
      if (typeof TextDecoder !== 'undefined') {
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(out);
        } catch (e) {
          // Invalid UTF-8 — fall back to Latin-1 (byte-per-char), matching the
          // common urllib.unquote/%-decode convention.
          let latin1 = '';
          for (const b of out) latin1 += String.fromCharCode(b);
          return latin1;
        }
      }
      return g.RekLib.decodeUTF8(out);
    }
  }

  function formEncode(obj) {
    return Object.keys(obj)
      .map((k) => `${percentEncode(k, { spaceAsPlus: true })}=${percentEncode(String(obj[k]), { spaceAsPlus: true })}`)
      .join('&');
  }

  function formDecode(qs) {
    const out = {};
    String(qs).split('&').forEach((pair) => {
      if (!pair) return;
      const eq = pair.indexOf('=');
      const k = percentDecode(eq === -1 ? pair : pair.slice(0, eq), { spaceAsPlus: true });
      const v = percentDecode(eq === -1 ? '' : pair.slice(eq + 1), { spaceAsPlus: true });
      if (out[k] === undefined) out[k] = v;
      else if (Array.isArray(out[k])) out[k].push(v);
      else out[k] = [out[k], v];
    });
    return out;
  }

  g.RekLib.module('urlcode', function () {
    return { percentEncode, percentDecode, formEncode, formDecode };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);