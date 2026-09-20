/**
 * ReconKit — Printable string extraction ("strings").
 * Finds runs of printable ASCII (optionally UTF-16LE) in arbitrary bytes,
 * reporting byte offsets — useful for quick binary inspection.
 */
(function (g) {
  'use strict';

  function isPrintable(b) {
    return b >= 0x20 && b <= 0x7e;
  }

  function extractStrings(input, opts) {
    opts = opts || {};
    const minLength = opts.minLength || 4;
    const limit = opts.limit || 500;
    const bytes = g.RekLib.toBytes(input);
    const out = [];
    let start = null;
    const flush = (endIdx) => {
      if (start == null) return;
      const len = endIdx - start;
      if (len >= minLength) {
        let text = '';
        for (let i = start; i < endIdx; i++) text += String.fromCharCode(bytes[i]);
        out.push({ offset: start, length: len, text });
      }
      start = null;
    };
    for (let i = 0; i <= bytes.length; i++) {
      if (i < bytes.length && isPrintable(bytes[i])) {
        if (start == null) start = i;
      } else {
        flush(i);
        if (out.length >= limit) break;
      }
    }
    // cap offsets to <= limit
    return out.slice(0, limit);
  }

  g.RekLib.module('strings', function () {
    return { extract: extractStrings };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);