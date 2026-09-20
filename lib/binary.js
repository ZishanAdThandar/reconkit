/**
 * ReconKit — Binary / ASCII conversions.
 * Text <-> 8-bit binary strings; also bytes <-> binary for hex-like input.
 */
(function (g) {
  'use strict';

  function textToBinary(str, opts) {
    opts = opts || {};
    const bytes = g.RekLib.encodeUTF8(String(str));
    const out = [];
    for (const b of bytes) out.push(b.toString(2).padStart(8, '0'));
    return out.join(opts.sep != null ? opts.sep : ' ');
  }

  function binaryToBytes(str) {
    const compact = String(str).replace(/[\s_]/g, '');
    if (compact.length % 8 !== 0) throw new Error(`ReconKit: binary string length must be a multiple of 8 (got ${compact.length} bits)`);
    if (!/^[01]+$/.test(compact)) throw new Error('ReconKit: binary string may only contain 0/1 (and whitespace)');
    const out = new Uint8Array(compact.length / 8);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(compact.substr(i * 8, 8), 2);
    return out;
  }

  function binaryToText(str) {
    return g.RekLib.decodeUTF8(binaryToBytes(str));
  }

  g.RekLib.module('binary', function () {
    return { textToBinary, binaryToBytes, binaryToText };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);