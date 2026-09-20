/**
 * ReconKit — RSA calculator (BigInt).
 * Encrypt / decrypt small RSA messages given modulus, exponents and factors.
 * Classic CTF / exercise helper. Inputs and outputs are hex.
 */
(function (g) {
  'use strict';

  const h2b = (s) => (s === '' ? 0n : BigInt('0x' + s.replace(/^0x/i, '')));
  const b2h = (n) => (n === 0n ? '0' : n.toString(16));

  function modPow(base, exp, mod) {
    if (mod === 1n) return 0n;
    let result = 1n;
    base = base % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) result = (result * base) % mod;
      e = e >> 1n;
      base = (base * base) % mod;
    }
    return result;
  }

  function egcd(a, b) {
    if (b === 0n) return [a, 1n, 0n];
    const [g, x, y] = egcd(b, a % b);
    return [g, y, x - (a / b) * y];
  }

  function modInverse(a, m) {
    const [g, x] = egcd(((a % m) + m) % m, m);
    if (g !== 1n) return null;
    return ((x % m) + m) % m;
  }

  function eulerPhi(p, q) { return (p - 1n) * (q - 1n); }

  function factorSmall(n, limit) {
    if (n < 2n) return null;
    if (n % 2n === 0n) return 2n;
    const cap = limit || 5_000_000n;
    for (let i = 3n; i * i <= n && i <= cap; i += 2n) {
      if (n % i === 0n) return i;
    }
    return null;
  }

  /**
   * run({ n, e, c, d?, p?, q?, m? }) — decrypts c (with d or p/q), or encrypts m.
   * Returns { ok, decryptedHex, plaintext(printable) , ascii?, error }.
   */
  function run(o) {
    try {
      const n = h2b(o.n || '');
      if (n < 2n) return { ok: false, error: 'Modulus n is required (hex).' };
      const e = o.e ? h2b(o.e) : 65537n;
      let d = o.d ? h2b(o.d) : null;

      const mode = o.m !== undefined && o.m !== '' ? 'encrypt' : 'decrypt';
      if (mode === 'decrypt') {
        const c = h2b(o.c || '');
        if (c <= 0n) return { ok: false, error: 'Ciphertext c is required (hex).' };
        if (c >= n) return { ok: false, error: 'Ciphertext larger than modulus n.' };
        if (!d && o.p && o.q) {
          const p = h2b(o.p), q = h2b(o.q);
          if (p * q !== n) return { ok: false, error: 'p × q does not equal n.' };
          const phi = eulerPhi(p, q);
          d = modInverse(e, phi);
          if (d === null) return { ok: false, error: 'e is not coprime to φ(n).' };
        }
        if (!d) {
          const f1 = factorSmall(n);
          if (f1 && n / f1 !== 1n) {
            const phi = eulerPhi(f1, n / f1);
            d = modInverse(e, phi);
            if (d !== null) {
              return finish({ ok: true, note: `n factored offline: p=${f1}` }, () => modPow(c, d, n));
            }
          }
          if (e !== 1n) {
            // small exponent brute force
            const limit = 1n << (e * 4n > 512n ? 128n : 0n); // guard
            return { ok: false, error: 'No private exponent d and n could not be factored under the local limit. Provide e,d or e,p,q.' };
          }
        }
        return finish({ ok: true }, () => modPow(c, d, n));
      }
      // encrypt
      const m = h2b(o.m);
      if (m >= n) return { ok: false, error: 'Plaintext larger than modulus n.' };
      return finish({ ok: true }, () => modPow(m, e, n));
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  function finish(base, compute) {
    const value = compute();
    const hex = b2h(value);
    let plaintext = null;
    try {
      const bytes = g.RekLib.hexToBytes((hex.length % 2 ? '0' : '') + hex);
      plaintext = g.RekLib.decodeUTF8(bytes);
      if (!plaintext || !g.RekLib.xor.isPrintableAscii(bytes)) plaintext = null;
    } catch (e) { plaintext = null; }
    return Object.assign(base, { value, hex, plaintext });
  }

  g.RekLib.module('rsa', function () {
    return { run, decrypt: (o) => run(Object.assign({}, o, { mode: 'decrypt' })), modPow, modInverse, factorSmall };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);