/**
 * ReconKit — Secure random generators (local, no network).
 */
(function (g) {
  'use strict';

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.?/';

  function randomBytes(n) {
    const u8 = new Uint8Array(n);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(u8);
    else { for (let i = 0; i < n; i++) u8[i] = Math.floor(Math.random() * 256); }
    return u8;
  }

  function hex(n) { return g.RekLib.bytesToHex(randomBytes(n)); }
  function uuid() {
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = g.RekLib.bytesToHex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function password(length, opts) {
    opts = opts || {};
    const len = Math.max(4, length || 20);
    const chars = opts.alphabet || ALPHABET;
    const poly = (chars.length % 256 === 0) ? chars.length : null;
    let out = '';
    if (opts.readable) {
      // avoid ambiguous characters
      const safe = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
      for (let i = 0; i < len; i++) out += safe[Math.floor(Math.random() * safe.length)];
      return out;
    }
    const bytes = randomBytes(len);
    for (let i = 0; i < len; i++) {
      // simple modulo bias-free approach for typical alphabet sizes (< 256)
      const idx = (poly !== null) ? bytes[i] : watermark(bytes[i], chars.length);
      out += chars[idx];
    }
    return out;
  }

  function watermark(b, mod) {
    // discard values beyond the largest multiple of mod
    const threshold = 256 - (256 % mod);
    let v = b;
    const arr = [b];
    let i = 0;
    while (v >= threshold && i < 16) { v = randomBytes(1)[0]; arr.push(v); i++; }
    return v % mod;
  }

  g.RekLib.module('random', function () {
    return { bytes: randomBytes, hex, uuid, password };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);