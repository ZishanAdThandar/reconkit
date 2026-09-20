/**
 * ReconKit — XOR utilities (CTF-friendly).
 * Fixed-key XOR over bytes with hex or ASCII output, plus single-byte key
 * brute force with English frequency scoring.
 */
(function (g) {
  'use strict';

  const FREQ = ' etaoinshrdlcumwfgypbvkjxqz';
  function scoreEnglish(bytes) {
    let score = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0x09 || b === 0x0a || b === 0x0d) { score += 1; continue; }
      if (b < 0x20 || b > 0x7e) return -1e9; // non-printable kills candidate
      const ch = String.fromCharCode(b).toLowerCase();
      const idx = FREQ.indexOf(ch);
      if (idx >= 0) score += (FREQ.length - idx);
      else if (ch === ' ') score += FREQ.length * 2;
      else score += 1;
    }
    return score;
  }

  function xorBytes(input, keyBytes) {
    const data = g.RekLib.toBytes(input);
    const key = g.RekLib.toBytes(keyBytes);
    if (key.length === 0) throw new Error('ReconKit: XOR key must not be empty');
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
    return out;
  }

  function isPrintableAscii(bytes) {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (!(b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e))) return false;
    }
    return true;
  }

  function guessSingleByteXor(input) {
    const data = g.RekLib.toBytes(input);
    const candidates = [];
    for (let k = 0; k < 256; k++) {
      const out = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) out[i] = data[i] ^ k;
      const score = scoreEnglish(out);
      if (score === -1e9) continue;
      candidates.push({ key: k, keyChar: String.fromCharCode(k), score, text: g.RekLib.decodeUTF8(out), hex: g.RekLib.bytesToHex(out) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 10);
  }

  g.RekLib.module('xor', function () {
    return { xorBytes, guessSingleByteXor, isPrintableAscii };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);