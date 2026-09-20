/**
 * ReconKit — Common encodings converter.
 * Base32 (RFC 4648), Base58 (Bitcoin alphabet) and a single entry point that
 * converts between text / binary / octal / decimal / hex / Base32 / Base36 /
 * Base58 / Base62 / Base64 / Base64URL. All processing is local.
 *
 * Semantics: text, binary, octal, decimal, hex, Base36 and Base62 are treated
 * as radix representations of a big integer; Base32, Base58, Base64 and
 * Base64URL are byte encodings. Every source can be converted to every target.
 */
(function (g) {
  'use strict';

  const L = () => g.RekLib;

  /* ------------------------------------------------------------------ *
   * Base32 (RFC 4648)
   * ------------------------------------------------------------------ */
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const B32_REV = new Map([...B32].map((c, i) => [c, i]));

  function base32Encode(u8) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (let i = 0; i < u8.length; i++) {
      value = (value << 8) | u8[i];
      bits += 8;
      while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    while (out.length % 8 !== 0) out += '=';
    return out;
  }

  function base32Decode(str) {
    const s = String(str).trim().replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
    const out = [];
    let bits = 0;
    let value = 0;
    for (const ch of s) {
      const v = B32_REV.get(ch);
      if (v === undefined) throw new Error(`ReconKit: invalid Base32 character '${ch}'`);
      value = (value << 5) | v;
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return Uint8Array.from(out);
  }

  /* ------------------------------------------------------------------ *
   * Base58 (Bitcoin alphabet)
   * ------------------------------------------------------------------ */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const B58_REV = new Map([...B58].map((c, i) => [c, i]));

  function base58Encode(u8) {
    let zeros = 0;
    while (zeros < u8.length && u8[zeros] === 0) zeros++;
    let num = 0n;
    for (let i = zeros; i < u8.length; i++) num = (num << 8n) | BigInt(u8[i]);
    let out = '';
    while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
    return '1'.repeat(zeros) + out;
  }

  function base58Decode(str) {
    const s = String(str).trim();
    let zeros = 0;
    while (zeros < s.length && s[zeros] === '1') zeros++;
    let num = 0n;
    for (let i = zeros; i < s.length; i++) {
      const v = B58_REV.get(s[i]);
      if (v === undefined) throw new Error(`ReconKit: invalid Base58 character '${s[i]}'`);
      num = num * 58n + BigInt(v);
    }
    const bytes = [];
    while (num > 0n) { bytes.unshift(Number(num & 255n)); num >>= 8n; }
    return Uint8Array.from(new Array(zeros).fill(0).concat(bytes));
  }

  /* ------------------------------------------------------------------ *
   * Radix helpers (big integer based)
   * ------------------------------------------------------------------ */
  const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function bigintFromRadix(str, base) {
    const s = String(str).trim().replace(/[\s_,:;-]/g, '');
    if (!s) return 0n;
    let num = 0n;
    const b = BigInt(base);
    // Digits: 0-9 -> 0-9; letters case-insensitive 10-35 for radix <= 36
    // (input normally lowercase, but tolerate uppercase); for radix > 36 the
    // alphabet continues to 61, so uppercase reads as 36-61 — matching the
    // output alphabet so base-62 round-trips cleanly.
    for (const ch of s) {
      const v = ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 48
        : ch >= 'a' && ch <= 'z' ? ch.charCodeAt(0) - 87
        : ch >= 'A' && ch <= 'Z'
          ? (base > 36 ? ch.charCodeAt(0) - 55 + 26 : ch.charCodeAt(0) - 55)
          : -1;
      if (v < 0 || v >= base) throw new Error(`ReconKit: digit '${ch}' not valid for radix ${base}`);
      num = num * b + BigInt(v);
    }
    return num;
  }

  function radixString(num, base) {
    if (num === 0n) return '0';
    let out = '';
    const b = BigInt(base);
    while (num > 0n) { out = DIGITS[Number(num % b)] + out; num /= b; }
    return out;
  }

  function bytesToBigInt(u8) {
    let n = 0n;
    for (const b of u8) n = (n << 8n) | BigInt(b);
    return n;
  }

  function bigIntToBytes(num) {
    if (num === 0n) return new Uint8Array(0);
    const bytes = [];
    while (num > 0n) { bytes.unshift(Number(num & 255n)); num >>= 8n; }
    return Uint8Array.from(bytes);
  }

  /* ------------------------------------------------------------------ *
   * Converter
   * ------------------------------------------------------------------ */
  const PRESETS = [
    { v: 'text', l: 'Text (UTF-8)' },
    { v: 'bin', l: 'Binary' },
    { v: 'oct', l: 'Octal' },
    { v: 'dec', l: 'Decimal' },
    { v: 'hex', l: 'Hex' },
    { v: 'b32', l: 'Base32' },
    { v: 'b36', l: 'Base36' },
    { v: 'b58', l: 'Base58' },
    { v: 'b62', l: 'Base62' },
    { v: 'b64', l: 'Base64' },
    { v: 'b64u', l: 'Base64URL' }
  ];
  const RADIX = { bin: 2, oct: 8, dec: 10, hex: 16, b36: 36, b62: 62 };

  function parseBytes(input, from) {
    const s = String(input);
    switch (from) {
      case 'text': return L().encodeUTF8(s);
      case 'hex': return L().hexToBytes(s);
      case 'b32': return base32Decode(s);
      case 'b58': return base58Decode(s);
      case 'b64': return L().base64.decode(s, { urlsafe: false });
      case 'b64u': return L().base64.decode(s, { urlsafe: true });
      default: return bigIntToBytes(bigintFromRadix(s, RADIX[from]));
    }
  }

  function renderBytes(bytes, to) {
    switch (to) {
      case 'text': return L().decodeUTF8(bytes);
      case 'hex': return L().bytesToHex(bytes);
      case 'b32': return base32Encode(bytes);
      case 'b58': return base58Encode(bytes);
      case 'b64': return L().base64.encode(bytes, { padding: true });
      case 'b64u': return L().base64.encode(bytes, { urlsafe: true, padding: false });
      default: return radixString(bytesToBigInt(bytes), RADIX[to]);
    }
  }

  function convert(input, from, to) {
    if (!PRESETS.some((p) => p.v === from)) throw new Error(`ReconKit: unknown source encoding '${from}'`);
    if (!PRESETS.some((p) => p.v === to)) throw new Error(`ReconKit: unknown target encoding '${to}'`);
    if (from === to) return String(input);
    return renderBytes(parseBytes(input, from), to);
  }

  g.RekLib.module('encodings', () => ({ PRESETS, convert, base32: { encode: base32Encode, decode: base32Decode }, base58: { encode: base58Encode, decode: base58Decode } }));
})(typeof globalThis !== 'undefined' ? globalThis : this);