/**
 * ReconKit — Shannon entropy and byte profile.
 * Helpful for spotting encryption/compression or plaintext in blobs.
 */
(function (g) {
  'use strict';

  function byteProfile(input) {
    const bytes = g.RekLib.toBytes(input);
    const counts = new Uint32Array(256);
    for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
    const total = bytes.length;
    let entropy = 0;
    for (let b = 0; b < 256; b++) {
      if (!counts[b]) continue;
      const p = counts[b] / total;
      entropy -= p * Math.log2(p);
    }
    let top = [];
    for (let b = 0; b < 256; b++) {
      if (counts[b]) top.push({ byte: b, hex: b.toString(16).padStart(2, '0'), char: b >= 32 && b <= 126 ? String.fromCharCode(b) : '', count: counts[b] });
    }
    top.sort((a, b) => b.count - a.count);
    return {
      bytes: total,
      entropy,
      maxEntropy: 8,
      uniqueBytes: top.length,
      top: top.slice(0, 12),
      interpretation: total === 0 ? 'empty' : entropy > 7 ? 'high' : entropy > 4.5 ? 'medium' : 'low'
    };
  }

  g.RekLib.module('entropy', function () {
    return { profile: byteProfile };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);