/**
 * ReconKit — JWT decoder & HS256/384/512 verifier.
 * Pure decode is local; verification uses WebCrypto HMAC when available
 * (browser or Node >= 16). Public-key verification (RS/ES/PS families)
 * requires a public key and is reported as unsupported (decode still works).
 */
(function (g) {
  'use strict';

  const HS_ALGS = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

  function b64urlPart(str) {
    return g.RekLib.base64.decode(str, { urlsafe: true, strict: true });
  }

  function parseClaims(payload) {
    const claims = {};
    const TIME_CLAIMS = ['exp', 'nbf', 'iat', 'auth_time', 'updated_at', 'session_exp'];
    const now = Math.floor(Date.now() / 1000);
    for (const k of Object.keys(payload)) {
      const v = payload[k];
      if (TIME_CLAIMS.includes(k) && typeof v === 'number') {
        claims[k] = {
          value: v,
          iso: new Date(v * 1000).toISOString().replace('T', ' ').replace('Z', ' UTC'),
          relative: g.RekLib.describeTime(v, now)
        };
      } else {
        claims[k] = { value: v };
      }
    }
    let state = 'valid-unknown';
    if (payload.exp != null && typeof payload.exp === 'number') {
      state = now <= payload.exp ? 'valid' : 'expired';
    } else if (payload.nbf != null && typeof payload.nbf === 'number' && now < payload.nbf) {
      state = 'not-yet-valid';
    }
    return { claims, state };
  }

  function parseJwt(token) {
    token = String(token).trim();
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { ok: false, error: `Expected 3 dot-separated segments, got ${parts.length}.` };
    }
    let header, payload, signature;
    try {
      header = JSON.parse(g.RekLib.decodeUTF8(b64urlPart(parts[0])));
    } catch (e) {
      return { ok: false, error: 'Header segment is not valid base64url JSON.' };
    }
    try {
      payload = JSON.parse(g.RekLib.decodeUTF8(b64urlPart(parts[1])));
    } catch (e) {
      return { ok: false, error: 'Payload segment is not valid base64url JSON.' };
    }
    try {
      signature = g.RekLib.base64.bytesToUrlSafe(b64urlPart(parts[2]));
    } catch (e) {
      signature = null;
    }
    const parsed = parseClaims(payload);
    const alg = header.alg || null;
    const typ = header.typ || null;
    return {
      ok: true,
      header, payload, signature,
      headerB64: parts[0], payloadB64: parts[1], signatureB64: parts[2],
      alg, typ,
      claims: parsed.claims,
      state: parsed.state,
      verifiable: alg ? HS_ALGS[alg] ? 'hmac' : alg.startsWith('RS') || alg.startsWith('ES') || alg.startsWith('PS') ? 'asymmetric' : 'unknown' : 'none'
    };
  }

  async function verifyHmac(token, secret) {
    const parsed = parseJwt(token);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (!parsed.alg || !HS_ALGS[parsed.alg]) {
      return { ok: false, error: parsed.alg ? `Algorithm ${parsed.alg} cannot be verified with a shared secret.` : 'No algorithm declared.' };
    }
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return { ok: false, error: 'WebCrypto (crypto.subtle) is not available in this environment.' };
    }
    try {
      const data = g.RekLib.encodeUTF8(`${parsed.headerB64}.${parsed.payloadB64}`);
      const key = await crypto.subtle.importKey(
        'raw', g.RekLib.encodeUTF8(secret),
        { name: 'HMAC', hash: HS_ALGS[parsed.alg] }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, data);
      const computed = g.RekLib.base64.bytesToUrlSafe(new Uint8Array(sig));
      return { ok: true, valid: computed === parsed.signatureB64, alg: parsed.alg };
    } catch (e) {
      return { ok: false, error: `Verification failed: ${e.message}` };
    }
  }

  g.RekLib.module('jwt', function () {
    return { parse: parseJwt, verifyHmac };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);