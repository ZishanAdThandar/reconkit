/**
 * ReconKit — Encoding identifier (heuristic) and hash identifier.
 * Offline "what is this?" helpers used by the Tools workspace.
 */
(function (g) {
  'use strict';

  function looksBase64(s, urlsafe) {
    const re = urlsafe ? /^[A-Za-z0-9_\-]+={0,2}$/ : /^[A-Za-z0-9+/]+={0,2}$/;
    if (!re.test(s) || s.length < 8 || s.length % 4 === 1) return false;
    const dec = g.RekLib.base64.decode(s, { urlsafe });
    if (dec.length < 3) return false;
    return g.RekLib.decodeUTF8(dec).replace(/[^\x20-\x7e\n\r\t]/g, '').length / dec.length > 0.8;
  }

  function looksHex(s) {
    const t = s.replace(/^0[xX]/, '').replace(/[\s:_,-]/g, '');
    if (!/^[0-9a-fA-F]+$/.test(t)) return false;
    if (t.length < 8 || t.length % 2 !== 0) return false;
    // hex strings contain fewer letters than base64 strings
    const letters = (t.match(/[a-fA-F]/g) || []).length;
    return letters / t.length < 0.5;
  }

  function looksUrlEncoded(s) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) return false;
    const dec = g.RekLib.urlcode.percentDecode(s);
    return dec.replace(/[^\x20-\x7e\n\r\t]/g, '').length / Math.max(dec.length, 1) > 0.8;
  }

  function looksJwt(s) {
    return typeof s === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s.trim());
  }

  function looksBinary(s) {
    const t = s.replace(/[\s_]/g, '');
    return t.length >= 8 && /^[01]+$/.test(t) && t.length % 8 === 0;
  }

  function identify(input) {
    const s = String(input).trim();
    const hits = [];
    const push = (name, confidence, note) => hits.push({ name, confidence, note });
    try {
      if (looksJwt(s)) push('JWT (JSON Web Token)', 0.95, 'three base64url segments');
      if (looksHex(s)) push('Hexadecimal', 0.8, 'even-length hex string');
      if (looksBase64(s, true)) push('Base64 (URL-safe alphabet)', 0.9, 'length % 4 != 1');
      if (looksBase64(s, false)) push('Base64 (standard alphabet)', 0.9, 'length % 4 != 1');
      if (looksBinary(s)) push('Binary', 0.9, '8-bit groups of 0/1');
      if (looksUrlEncoded(s)) push('URL percent-encoded', 0.85, 'contains %XX sequences');
      if (/^\d+$/.test(s)) push('Decimal integer', 0.9, 'digits only');
      if (looksRot13ish(s)) push('Rotation cipher (ROT-n candidate)', 0.35, 'alphabetica text with shifted frequencies');
      if (!hits.length) {
        const printable = s.replace(/[^\x20-\x7e]/g, '');
        push('Plain text', 0.7, 'no encoding indicators found');
      }
    } catch (e) { /* ignore */ }
    hits.sort((a, b) => b.confidence - a.confidence);
    return { input: s, hits };
  }

  function looksRot13ish(s) {
    if (!/[A-Za-z]{8,}/.test(s)) return false;
    const letters = s.replace(/[^A-Za-z]/g, '');
    if (!letters.length) return false;
    const freq = {};
    for (const c of letters.toLowerCase()) freq[c] = (freq[c] || 0) + 1;
    const entropy = 0 - Object.values(freq)
      .map((n) => { const p = n / letters.length; return p * Math.log2(p); })
      .reduce((a, b) => a + b, 0);
    return entropy > 3.5 && entropy < 4.4; // rotated text keeps entropy near plaintext
  }

  // ------------------------------------------------------------------
  // Hash identifier
  // ------------------------------------------------------------------
  const LEN = (hexLen, bitLen) => ({ hexLen, bits: bitLen });

  function identifyHash(s) {
    const text = String(s).trim();
    const lower = text.toLowerCase();
    const byPrefix = [
      [/^\$2[aby]\$\d{2}\$/, '$2*$ (bcrypt)', 'bcrypt', 'bcrypt hash'],
      [/^\$argon2(i|d|id)\$/, 'Argon2', 'argon2', 'Argon2 hash'],
      [/^\$pbkdf2-/, 'PBKDF2', 'pbkdf2', 'PBKDF2 hash']
    ];
    if (text.length === 32 && /^[0-9a-f]{32}$/.test(lower)) return { match: 'MD5', hex: true, bits: 128, note: '32 hex chars — could also be NTLM, LM, or 4-byte CRC32 rendered as hex' };
    if (text.length === 40 && /^[0-9a-f]{40}$/.test(lower)) return { match: 'SHA-1', hex: true, bits: 160, note: '40 hex chars — could also be MySQL 4.1 / HAVAL-like' };
    if (text.length === 56 && /^[0-9a-f]{56}$/.test(lower)) return { match: 'SHA-224 / SHA3-224', hex: true, bits: 224, note: '56 hex chars' };
    if (text.length === 64 && /^[0-9a-f]{64}$/.test(lower)) return { match: 'SHA-256 / SHA3-256', hex: true, bits: 256, note: '64 hex chars — could also be RIPEMD-160 with prefix or Whirlpool variants' };
    if (text.length === 96 && /^[0-9a-f]{96}$/.test(lower)) return { match: 'SHA-384 / SHA3-384', hex: true, bits: 384, note: '96 hex chars' };
    if (text.length === 128 && /^[0-9a-f]{128}$/.test(lower)) return { match: 'SHA-512 / SHA3-512 / Blake2b-512', hex: true, bits: 512, note: '128 hex chars' };
    if (text.length === 8 && /^[0-9a-f]{8}$/.test(lower)) return { match: 'CRC-32', hex: true, bits: 32, note: '8 hex chars (also common: adler32) — not cryptographically secure' };
    for (const [re, name, _, note] of byPrefix) {
      if (re.test(text)) return { match: name, hex: false, bits: null, note };
    }
    if (/^[A-Za-z0-9+/]{38,}={0,2}$/.test(text) && text.length % 4 === 0) {
      return { match: 'Base64 blob (e.g. bcrypt variant, gpg, or salted digest)', hex: false, bits: null, note: 'base64-encoded material — length ' + text.length };
    }
    if (text.length === 16 && /^[0-9a-f]{16}$/.test(lower)) return { match: 'MD5 (truncated) / LM hash', hex: true, bits: 64, note: '16 hex chars — ambiguous' };
    if (text.length === 26 && /^[a-z2-7]{26}$/.test(text)) return { match: 'Base32 (RFC 4648)', hex: false, bits: null, note: '26 base32 chars — e.g. TOTP secrets' };
    return { match: null, hex: false, bits: null, note: 'No known pattern matched. Check for salted hashes (format: salt:hash) or non-standard encodings.' };
  }

  g.RekLib.module('identify', function () {
    return { encoding: identify, hash: identifyHash };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);