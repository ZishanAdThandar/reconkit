/**
 * ReconKit — CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320).
 * Environment-agnostic. Returns an unsigned 32-bit integer.
 */
(function (g) {
  'use strict';
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(input, seed) {
    const core = (g.RekLib && g.RekLib.toBytes) ? g.RekLib.toBytes(input) : new Uint8Array(input);
    let c = (seed == null ? 0xFFFFFFFF : (seed ^ 0xFFFFFFFF)) >>> 0;
    for (let i = 0; i < core.length; i++) {
      c = (c >>> 8) ^ TABLE[(c ^ core[i]) & 0xFF];
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function crc32Hex(input) {
    const v = crc32(input);
    return v.toString(16).padStart(8, '0');
  }

  (function bootstrap() {
    if (!g.RekLib) return;
    g.RekLib.module('crc32', () => ({ compute: crc32, hex: crc32Hex }));
  })();
})(typeof globalThis !== 'undefined' ? globalThis : this);