/**
 * ReconKit — Classic cipher add-ons: Atbash, Vigenère, Morse, base conversion.
 * Compact, offline, CTF & analyst friendly.
 */
(function (g) {
  'use strict';

  const A = 'abcdefghijklmnopqrstuvwxyz';
  const A_U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function atbash(str) {
    return String(str).split('').map((ch) => {
      if (/[a-z]/.test(ch)) return A[25 - A.indexOf(ch)];
      if (/[A-Z]/.test(ch)) return A_U[25 - A_U.indexOf(ch)];
      return ch;
    }).join('');
  }

  function vigenere(str, key, decrypt) {
    str = String(str);
    key = String(key).replace(/[^A-Za-z]/g, '');
    if (!key) throw new Error('Vigenère key must contain letters.');
    let ki = 0;
    return str.split('').map((ch) => {
      const base = /[a-z]/.test(ch) ? A : /[A-Z]/.test(ch) ? A_U : null;
      if (!base) return ch;
      const shift = (decrypt ? -1 : 1) * A.indexOf(key[ki % key.length].toLowerCase());
      ki++;
      return base[(26 + base.indexOf(ch) + shift) % 26];
    }).join('');
  }

  const MORSE = Object.freeze({
    'a': '.-', 'b': '-...', 'c': '-.-.', 'd': '-..', 'e': '.', 'f': '..-.',
    'g': '--.', 'h': '....', 'i': '..', 'j': '.---', 'k': '-.-', 'l': '.-..',
    'm': '--', 'n': '-.', 'o': '---', 'p': '.--.', 'q': '--.-', 'r': '.-.',
    's': '...', 't': '-', 'u': '..-', 'v': '...-', 'w': '.--', 'x': '-..-',
    'y': '-.--', 'z': '--..', '0': '-----', '1': '.----', '2': '..---',
    '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...',
    '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..',
    "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
    '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.',
    '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
  });
  const MORSE_REV = Object.freeze(Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k])));

  function toMorse(str) {
    return String(str).toLowerCase()
      .split(/\s+/).map((word) =>
        word.split('').map((ch) => MORSE[ch] || null)
          .filter(Boolean).join(' ')
      ).filter(Boolean).join(' / ');
  }

  function fromMorse(str) {
    return String(str).trim()
      .split(/\s*\/\s*/).map((word) =>
        word.trim().split(/\s+/).map((code) => MORSE_REV[code] || '?').join('')
      ).join(' ');
  }

  // -------- base conversion --------
  const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Case-insensitive digit lookup: '0'-'9' -> 0-9, 'A'-'Z'/'a'-'z' -> 10-35.
  const DIGIT_VALUE = new Map();
  for (let i = 0; i < 10; i++) DIGIT_VALUE.set(String(i), i);
  for (let i = 0; i < 26; i++) {
    DIGIT_VALUE.set(String.fromCharCode(97 + i), 10 + i);
    DIGIT_VALUE.set(String.fromCharCode(65 + i), 10 + i);
  }
  function baseConvert(value, from, to) {
    const s = String(value).trim();
    if (from === to) return s;
    if (from < 2 || from > 62 || to < 2 || to > 62) throw new Error('Bases must be between 2 and 62.');
    let big = 0n;
    for (const ch of s) {
      const d = DIGIT_VALUE.has(ch) ? DIGIT_VALUE.get(ch) : -1;
      if (d < 0 || d >= from) throw new Error(`Digit '${ch}' not valid in base ${from}.`);
      big = big * BigInt(from) + BigInt(d);
    }
    if (big === 0n) return '0';
    const radix = BigInt(to);
    let out = '';
    while (big > 0n) { out = DIGITS[Number(big % radix)] + out; big = big / radix; }
    return out;
  }

  g.RekLib.module('classic', function () {
    return { atbash, vigenere, toMorse, fromMorse, baseConvert };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);