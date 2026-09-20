/**
 * ReconKit — ROT cipher family.
 * ROTn over A-Z a-z (case preserved), optionally digits 0-9, plus ROT47
 * (ASCII 33..126). Includes "all ROT" generation used by the UI.
 */
(function (g) {
  'use strict';

  function rotRotateChar(ch, shift, digits) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCharCode(65 + ((c - 65 + shift) % 26 + 26) % 26);
    if (c >= 97 && c <= 122) return String.fromCharCode(97 + ((c - 97 + shift) % 26 + 26) % 26);
    if (digits && c >= 48 && c <= 57) return String.fromCharCode(48 + ((c - 48 + shift) % 10 + 10) % 10);
    return ch;
  }

  function rot(str, shift, opts) {
    opts = opts || {};
    const digits = opts.digits !== false; // digits rotate by default
    return String(str).split('').map((c) => rotRotateChar(c, shift >>> 0, digits)).join('');
  }

  function rot47(str) {
    return String(str).split('').map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 33 && code <= 126) {
        return String.fromCharCode(33 + ((code - 33 + 47) % 94));
      }
      return c;
    }).join('');
  }

  function rotAll(str, opts) {
    opts = opts || {};
    const out = [];
    for (let s = 1; s <= 25; s++) out.push({ shift: s, is13: s === 13, text: rot(str, s, opts) });
    out.push({ shift: 47, is13: false, text: rot47(str) });
    return out;
  }

  g.RekLib.module('rot', function () {
    return { rot, rot47, rotAll, rotRotateChar };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);