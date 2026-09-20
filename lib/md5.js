/**
 * ReconKit — MD5 (RFC 1321).
 * Pure JavaScript implementation, public-domain style, environment-agnostic.
 * Radiates correctness against the standard NIST vectors via tests.
 */
(function (g) {
  'use strict';

  // K[i] = floor(2^32 * abs(sin(i + 1)))
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) >>> 0;
  }
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  function md5Bytes(input) {
    const core = (g.RekLib && g.RekLib.toBytes) ? g.RekLib.toBytes(input) : new Uint8Array(input);
    const u8 = core;
    const n = u8.length;
    const bitLen = n * 8;
    const bitLenLo = bitLen >>> 0;
    const bitLenHi = Math.floor(bitLen / 4294967296) >>> 0;

    const paddedLen = ((n + 8) >> 6 << 6) + 64;
    const p = new Uint8Array(paddedLen);
    p.set(u8);
    p[n] = 0x80;
    const dv = new DataView(p.buffer);
    dv.setUint32(paddedLen - 8, bitLenLo, true);
    dv.setUint32(paddedLen - 4, bitLenHi, true);

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    const rol = (x, c) => ((x << c) | (x >>> (32 - c))) >>> 0;

    for (let off = 0; off < paddedLen; off += 64) {
      for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, gIdx;
        if (i < 16) { F = (B & C) | (~B & D); gIdx = i; }
        else if (i < 32) { F = (D & B) | (~D & C); gIdx = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; gIdx = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); gIdx = (7 * i) % 16; }
        const tempD = D;
        D = C;
        C = B;
        B = (B + rol((A + F + K[i] + M[gIdx]) >>> 0, S[i])) >>> 0;
        A = tempD;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0;
      c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }

    const out = new Uint8Array(16);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, a0, true); odv.setUint32(4, b0, true);
    odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
    return out;
  }

  const coreGetter = () => g.RekLib;
  (function bootstrap() {
    const core = coreGetter();
    if (!core) return; // loaded before core; use lazy require in md5()
    core.module('md5', function () {
      return {
        bytes: md5Bytes,
        hex: function (input) {
          const core2 = coreGetter();
          return core2.bytesToHex(md5Bytes(input));
        }
      };
    });
  })();
})(typeof globalThis !== 'undefined' ? globalThis : this);