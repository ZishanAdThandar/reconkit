/**
 * ReconKit — Tool registry. All processing is local.
 * Each tool: { id, cat, name, desc, opts[], run(ctx) -> {outputs:[{label,text,kind}], note?} }
 * opts: { key, label, type: select|num|bool|text, def, options?:[{v,l}] }
 */
'use strict';
var Rec = window.Rec = window.Rec || {};
Rec.tools = (() => {
  const list = [];
  const byId = {};

  const $ = (id, cat, name, desc, opts, run) => {
    const t = { id, cat, name, desc, opts: opts || [], run };
    byId[id] = t;
    list.push(t);
    return t;
  };

  const catOrder = ['Digest & hashes', 'Ciphers', 'Encoders', 'Recognition', 'Transform', 'Generators'];
  const CATEGORIES = catOrder.map((c) => ({ id: c, name: c }));

  const yesno = (v, l) => ({ v, l });

  function guessLine(candidates) {
    if (!candidates || !candidates.length) return 'No printable single-byte candidates.';
    return candidates.map((c) => `key 0x${c.key.toString(16).padStart(2, '0')} '${c.keyChar.replace(/['\\]/g, '')}' → ${c.text.slice(0, 120)}`).join('\n');
  }

  /* ------------------------------------------------------------------ *
   * Digest & hashes
   * ------------------------------------------------------------------ */
  $('hashing', 'Digest & hashes', 'Hashing',
    'SHA-1, SHA-256, SHA-384, SHA-512 (WebCrypto), MD5 and CRC-32 — fully local.',
    [
      { key: 'upper', label: 'Uppercase hex', type: 'bool', def: false },
      { key: 'asb64', label: 'Also output Base64', type: 'bool', def: false }
    ],
    async (ctx) => {
      const bytes = RekLib.encodeUTF8(ctx.text);
      const out = [];
      const hexOf = (u8) => RekLib.bytesToHex(u8, { upper: ctx.opts.upper });
      const row = async (name, f) => {
        const hex = hexOf(await f());
        out.push({ label: name, text: hex, kind: 'mono' });
        if (ctx.opts.asb64) out.push({ label: name + ' (base64)', text: RekLib.base64.encode(bytes, { padding: true }), kind: 'mono' });
      };
      await row('MD5', () => RekLib.md5.bytes(bytes));
      const sub = globalThis.crypto && crypto.subtle;
      if (sub) {
        for (const alg of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
          await row(alg, () => sub.digest(alg, bytes).then((b) => new Uint8Array(b)));
        }
      } else {
        out.push({ label: 'SHA family', text: 'WebCrypto unavailable in this environment.', kind: 'text' });
      }
      out.push({ label: 'CRC-32', text: RekLib.crc32.hex(bytes) + '  (decimal: ' + RekLib.crc32.compute(bytes) + ')', kind: 'mono' });
      return { outputs: out, note: 'Digests depend only on the input text.' };
    });

  $('hashid', 'Digest & hashes', 'Hash identifier',
    'Recognizes common digest formats by length and prefix (MD5, SHA-1/256/384/512, bcrypt, Argon2, CRC-32…).',
    [],
    (ctx) => {
      const r = RekLib.identify.hash(ctx.text);
      return {
        outputs: [
          { label: 'Verdict', text: r.match || 'No known pattern', kind: 'text' },
          { label: 'Detail', text: r.note || '', kind: 'text' }
        ]
      };
    });

  $('crc32', 'Digest & hashes', 'CRC-32',
    'Cyclic redundancy check over the input bytes (IEEE 802.3).',
    [{ key: 'seed', label: 'Seed (decimal, optional)', type: 'num', def: '' }],
    (ctx) => {
      const seed = ctx.opts.seed === '' ? undefined : (parseInt(ctx.opts.seed, 10) >>> 0);
      const c = RekLib.crc32.compute(RekLib.encodeUTF8(ctx.text), seed);
      return { outputs: [
        { label: 'CRC-32 (hex)', text: c.toString(16).padStart(8, '0'), kind: 'mono' },
        { label: 'CRC-32 (decimal)', text: String(c), kind: 'mono' }
      ] };
    });

  /* ------------------------------------------------------------------ *
   * Ciphers
   * ------------------------------------------------------------------ */
  $('rot-all', 'Ciphers', 'ROT — all shifts',
    'Rotates A–Z/a–z (and optionally digits 0–9 with ROT5). Every shift 1–25 plus ROT47 at once.',
    [{ key: 'digits', label: 'Rotate digits (ROT-n over 0-9)', type: 'bool', def: true }],
    (ctx) => {
      const all = RekLib.rot.rotAll(ctx.text, { digits: ctx.opts.digits });
      return { outputs: all.map((r) => ({
        label: r.shift === 47 ? 'ROT47' : `ROT${r.shift}${r.is13 ? '  ● classic ROT13' : ''}`,
        text: r.text, kind: 'mono'
      })), note: 'ROT13 is the classic "no key" rotation; others are useful for CTF flag variations.' };
    });

  $('caesar', 'Ciphers', 'Caesar cipher',
    'Shift every letter by a fixed offset (case preserved).',
    [
      { key: 'shift', label: 'Shift', type: 'num', def: 13 },
      { key: 'digits', label: 'Include digits', type: 'bool', def: false }
    ],
    (ctx) => {
      const shift = (parseInt(ctx.opts.shift, 10) || 0) % 26;
      const text = RekLib.caesar.caesar(ctx.text, shift, { digits: !!ctx.opts.digits });
      return { outputs: [{ label: `Result (shift ${shift})`, text, kind: 'mono' }] };
    });

  $('atbash', 'Ciphers', 'Atbash',
    'Substitute each letter with its alphabet mirror (A↔Z).',
    [],
    (ctx) => ({ outputs: [{ label: 'Atbash', text: RekLib.classic.atbash(ctx.text), kind: 'mono' }] }));

  $('vigenere', 'Ciphers', 'Vigenère',
    'Polyalphabetic cipher with a keyword (letters only; wraps automatically).',
    [
      { key: 'key', label: 'Keyword', type: 'text', def: 'key' },
      { key: 'mode', label: 'Operation', type: 'select', def: 'enc', options: [yesno('enc', 'Encrypt'), yesno('dec', 'Decrypt')] }
    ],
    (ctx) => {
      const text = RekLib.classic.vigenere(ctx.text, ctx.opts.key, ctx.opts.mode === 'dec');
      return { outputs: [{ label: ctx.opts.mode === 'enc' ? 'Encrypted' : 'Decrypted', text, kind: 'mono' }] };
    });

  $('xor', 'Ciphers', 'XOR',
    'Byte-wise XOR with a key (string or hex). Includes single-byte key brute force.',
    [
      { key: 'input', label: 'Input format', type: 'select', def: 'auto', options: [
        yesno('auto', 'Auto-detect'), yesno('text', 'Text'), yesno('hex', 'Hex')] },
      { key: 'key', label: 'Key', type: 'text', def: '' },
      { key: 'keyHex', label: 'Key is hex', type: 'bool', def: false },
      { key: 'output', label: 'Output', type: 'select', def: 'auto', options: [yesno('auto', 'Auto (text if printable)'), yesno('hex', 'Hex only'), yesno('both', 'Both')] }
    ],
    (ctx) => {
      const out = [];
      const trimmed = ctx.text.trim();
      const hexish = /^[0-9a-fA-F]+$/.test(trimmed) && (trimmed.length & 1) === 0 && !/^\d+$/.test(trimmed);
      let input;
      if (ctx.opts.input === 'hex') input = RekLib.hexToBytes(ctx.text);
      else if (ctx.opts.input === 'text') input = RekLib.encodeUTF8(ctx.text);
      else input = hexish ? RekLib.hexToBytes(ctx.text) : RekLib.encodeUTF8(ctx.text);
      if (ctx.opts.key) {
        const key = ctx.opts.keyHex ? RekLib.hexToBytes(ctx.opts.key) : RekLib.encodeUTF8(ctx.opts.key);
        const res = RekLib.xor.xorBytes(input, key);
        const hex = RekLib.bytesToHex(res);
        const printable = RekLib.xor.isPrintableAscii(res);
        const auto = printable ? RekLib.decodeUTF8(res) : hex;
        const mode = ctx.opts.output;
        if (mode === 'both' || mode === 'auto' && printable) out.push({ label: 'XOR result (text)', text: printable ? RekLib.decodeUTF8(res) : '(binary)', kind: 'mono' });
        if (mode === 'hex' || mode === 'auto' && !printable || mode === 'both') out.push({ label: 'XOR result (hex)', text: hex, kind: 'mono' });
        out.push({ label: 'Single-byte key guess', text: (guessLine(RekLib.xor.guessSingleByteXor(input))), kind: 'mono' });
      } else {
        out.push({ label: 'Single-byte key guess', text: guessLine(RekLib.xor.guessSingleByteXor(input)), kind: 'mono' });
        out.push({ label: 'Recommendation', text: 'Provide a key to XOR with, or use the automated single-byte candidate above.', kind: 'text' });
      }
      return { outputs: out };
    });

  $('morse', 'Ciphers', 'Morse code',
    'Encode text to Morse (words separated by “ / ”) or decode Morse back.',
    [
      { key: 'mode', label: 'Operation', type: 'select', def: 'enc', options: [yesno('enc', 'Encode → Morse'), yesno('dec', 'Decode ← Morse')] }
    ],
    (ctx) => ({
      outputs: [{
        label: ctx.opts.mode === 'enc' ? 'Morse' : 'Plain text',
        text: ctx.opts.mode === 'enc' ? RekLib.classic.toMorse(ctx.text) : RekLib.classic.fromMorse(ctx.text),
        kind: 'mono'
      }]
    }));

  /* ------------------------------------------------------------------ *
   * Encoders
   * ------------------------------------------------------------------ */
  $('base64', 'Encoders', 'Base64 / Base64URL',
    'UTF-8 aware. Choose standard or URL-safe alphabet, padding optional.',
    [
      { key: 'mode', label: 'Operation', type: 'select', def: 'enc', options: [yesno('enc', 'Encode'), yesno('dec', 'Decode')] },
      { key: 'urlsafe', label: 'URL-safe alphabet (-_)', type: 'bool', def: false },
      { key: 'padding', label: 'Include padding (=)', type: 'bool', def: true }
    ],
    (ctx) => {
      if (ctx.opts.mode === 'enc') {
        return { outputs: [{ label: 'Base64', text: RekLib.base64.fromString(ctx.text, { urlsafe: !!ctx.opts.urlsafe, padding: ctx.opts.padding }), kind: 'mono' }] };
      }
      try {
        const bytes = RekLib.base64.decode(ctx.text, { urlsafe: !!ctx.opts.urlsafe });
        return { outputs: [
          { label: 'Decoded text', text: RekLib.decodeUTF8(bytes), kind: 'mono' },
          { label: 'Decoded hex', text: RekLib.bytesToHex(bytes), kind: 'mono' }
        ] };
      } catch (e) {
        return { error: String(e.message || e) };
      }
    });

  $('hex', 'Encoders', 'Hex',
    'Encode bytes to hex or decode hex (tolerates 0x, spaces, colons).',
    [
      { key: 'mode', label: 'Operation', type: 'select', def: 'enc', options: [yesno('enc', 'Encode → hex'), yesno('dec', 'Decode ← hex')] },
      { key: 'sep', label: 'Separator (e.g. space, colon)', type: 'text', def: '' },
      { key: 'upper', label: 'Uppercase', type: 'bool', def: false }
    ],
    (ctx) => {
      if (ctx.opts.mode === 'enc') {
        return { outputs: [{ label: 'Hex', text: RekLib.bytesToHex(RekLib.encodeUTF8(ctx.text), { sep: ctx.opts.sep, upper: !!ctx.opts.upper }), kind: 'mono' }] };
      }
      try {
        const bytes = RekLib.hexToBytes(ctx.text);
        return { outputs: [
          { label: 'Decoded text', text: RekLib.decodeUTF8(bytes), kind: 'mono' },
          { label: 'Decoded hex (normalized)', text: RekLib.bytesToHex(bytes), kind: 'mono' }
        ] };
      } catch (e) {
        return { error: String(e.message || e) };
      }
    });

  $('url', 'Encoders', 'URL encoding',
    'Percent-encode (component or form data) and decode, with “+” space handling.',
    [
      { key: 'mode', label: 'Operation', type: 'select', def: 'enc', options: [
        yesno('enc', 'Encode (URI component)'), yesno('form', 'Encode (form data)'), yesno('dec', 'Decode'), yesno('decform', 'Decode (treat + as space)')] }
    ],
    (ctx) => {
      const m = ctx.opts.mode;
      let out;
      if (m === 'enc') out = RekLib.urlcode.percentEncode(ctx.text);
      else if (m === 'form') out = RekLib.urlcode.percentEncode(ctx.text, { spaceAsPlus: true });
      else out = RekLib.urlcode.percentDecode(ctx.text, { spaceAsPlus: m === 'decform' });
      return { outputs: [{ label: m.startsWith('enc') ? m === 'form' ? 'Form-encoded' : 'Percent-encoded' : 'Decoded', text: out, kind: 'mono' }] };
    });

  $('html', 'Encoders', 'HTML entities',
    'Encode the core five entities (+ optional all non-ASCII as numeric) or decode named & numeric entities.',
    [
      { key: 'mode', label: 'Operation', type: 'select', def: 'enc', options: [
        yesno('enc', 'Encode (core + quotes)'), yesno('encall', 'Encode (all non-ASCII, numeric)'), yesno('dec', 'Decode')] }
    ],
    (ctx) => {
      if (ctx.opts.mode === 'dec') {
        return { outputs: [{ label: 'Decoded', text: RekLib.htmlcode.decode(ctx.text), kind: 'mono' }] };
      }
      return { outputs: [{ label: 'Encoded', text: RekLib.htmlcode.escape(ctx.text, { all: ctx.opts.mode === 'encall' }), kind: 'mono' }] };
    });

  $('unicode', 'Encoders', 'Unicode escape',
    'Escape/unescape \\u sequences (surrogate or code-point style), list code points, and normalize (NFC/NFD/NFKC/NFKD).',
    [
      { key: 'mode', label: 'Operation', type: 'select', def: 'esc', options: [
        yesno('esc', 'Escape (surrogate \\uXXXX)'), yesno('esccp', 'Escape (code-point \\u{…})'),
        yesno('unesc', 'Unescape'), yesno('points', 'List code points'), yesno('nfc', 'Normalize NFC'), yesno('nfd', 'Normalize NFD'),
        yesno('nfkc', 'Normalize NFKC'), yesno('nfkd', 'Normalize NFKD')] }
    ],
    (ctx) => {
      const m = ctx.opts.mode;
      if (m === 'esc' || m === 'esccp') {
        return { outputs: [{ label: 'Escaped', text: RekLib.unicode.toEscape(ctx.text, { mode: m === 'esccp' ? 'cp' : 'surrogate' }), kind: 'mono' }] };
      }
      if (m === 'unesc') {
        return { outputs: [{ label: 'Unescaped', text: RekLib.unicode.fromEscape(ctx.text), kind: 'mono' }] };
      }
      if (m === 'points') {
        const pts = RekLib.unicode.codePoints(ctx.text);
        const text = pts.map((p) => `${p.hex}  U+${p.hex.slice(2)}  ${p.char}  (dec ${p.dec})`).join('\n');
        return { outputs: [{ label: `${pts.length} code points`, text, kind: 'mono' }] };
      }
      return { outputs: [{ label: m.toUpperCase() + ' result', text: RekLib.unicode.normalize(ctx.text, m), kind: 'mono' }] };
    });

  $('binary', 'Encoders', 'ASCII ⇄ binary',
    'Convert text to 8-bit binary groups, or decode binary back to ASCII.',
    [
      { key: 'mode', label: 'Operation', type: 'select', def: 'enc', options: [yesno('enc', 'Text → binary'), yesno('dec', 'Binary → text')] },
      { key: 'sep', label: 'Group separator', type: 'text', def: ' ' }
    ],
    (ctx) => {
      if (ctx.opts.mode === 'enc') {
        return { outputs: [{ label: 'Binary', text: RekLib.binary.textToBinary(ctx.text, { sep: ctx.opts.sep }), kind: 'mono' }] };
      }
      try {
        return { outputs: [{ label: 'Text', text: RekLib.binary.binaryToText(ctx.text), kind: 'mono' }] };
      } catch (e) {
        return { error: String(e.message || e) };
      }
    });

  $('encoding-conv', 'Encoders', 'Encoding converter',
    'Convert between common encodings in one step: text, binary, octal, decimal, hex, Base32, Base36, Base58, Base62, Base64 and Base64URL.',
    [
      { key: 'from', label: 'From', type: 'select', def: 'text', options: RekLib.encodings.PRESETS.map((p) => ({ v: p.v, l: p.l })) },
      { key: 'to', label: 'To', type: 'select', def: 'hex', options: RekLib.encodings.PRESETS.map((p) => ({ v: p.v, l: p.l })) }
    ],
    (ctx) => {
      try {
        const text = RekLib.encodings.convert(ctx.text, ctx.opts.from, ctx.opts.to);
        const name = (v) => (RekLib.encodings.PRESETS.find((p) => p.v === v) || {}).l || v;
        return { outputs: [{ label: `${name(ctx.opts.from)} → ${name(ctx.opts.to)}`, text, kind: 'mono' }],
          note: 'Binary/octal/decimal/hex/Base36/Base62 treat input as a big integer; Base32/Base58/Base64 operate on bytes (UTF-8).' };
      } catch (e) {
        return { error: String(e.message || e) };
      }
    });

  $('jwt', 'Encoders', 'JWT decoder & verifier',
    'Decodes header/payload (base64url, local) with readable timestamps; HMAC signature verification with a secret (HS256/384/512).',
    [
      { key: 'secret', label: 'Secret (optional, for HS-verify)', type: 'text', def: '' }
    ],
    async (ctx) => {
      const parsed = RekLib.jwt.parse(ctx.text.trim());
      if (!parsed.ok) return { error: parsed.error };
      const out = [];
      out.push({ label: 'Compact summary', text: `alg: ${parsed.alg || 'n/a'}  ·  typ: ${parsed.typ || 'n/a'}  ·  state: ${parsed.state}`, kind: 'text' });
      out.push({ label: 'Header', text: JSON.stringify(parsed.header, null, 2), kind: 'mono' });
      out.push({ label: 'Payload', text: JSON.stringify(parsed.payload, null, 2), kind: 'mono' });
      if (parsed.alg == null) out.push({ label: 'Note', text: 'No alg claim — unverifiable.', kind: 'text' });
      else if (parsed.verifiable === 'asymmetric') out.push({ label: 'Signature', text: 'RS*/ES*/PS* require a public key; decode only.', kind: 'text' });
      else if (ctx.opts.secret) {
        const v = await RekLib.jwt.verifyHmac(ctx.text.trim(), ctx.opts.secret);
        out.push({ label: 'Signature',
          text: v.ok ? (v.valid ? `VALID for ${v.alg}` : `INVALID for ${v.alg}`) : `Not verifiable: ${v.error}`, kind: 'text' });
      } else {
        out.push({ label: 'Signature', text: `Provided ✓ (${parsed.signatureB64 || ''})`, kind: 'text' });
        out.push({ label: 'Verify', text: 'Enter a secret to verify HMAC signatures locally.', kind: 'text' });
      }
      return { outputs: out };
    });

  /* ------------------------------------------------------------------ *
   * Recognition
   * ------------------------------------------------------------------ */
  $('identifier', 'Recognition', 'Encoding identifier',
    'Passive heuristic — tells you whether the input looks like Base64, hex, binary, URL-encoding, a JWT, decimal, or plain text.',
    [],
    (ctx) => {
      const r = RekLib.identify.encoding(ctx.text);
      const text = r.hits.map((x) => `${x.name}  (confidence ${Math.round(x.confidence * 100)}%)${x.note ? ' — ' + x.note : ''}`).join('\n');
      return { outputs: [{ label: 'Candidates', text, kind: 'mono' }], note: 'Heuristics only — verify with the dedicated tools.' };
    });

  $('baseconv', 'Recognition', 'Base conversion',
    'Convert between bases 2–62 (e.g. bin/oct/dec/hex/base36).',
    [
      { key: 'from', label: 'From base', type: 'num', def: 10 },
      { key: 'to', label: 'To base', type: 'num', def: 16 }
    ],
    (ctx) => {
      const from = parseInt(ctx.opts.from, 10), to = parseInt(ctx.opts.to, 10);
      try {
        return { outputs: [{ label: `base ${from} → base ${to}`, text: RekLib.classic.baseConvert(ctx.text, from, to), kind: 'mono' }] };
      } catch (e) {
        return { error: String(e.message || e) };
      }
    });

  $('rsa', 'Recognition', 'RSA calculator',
    'Encrypt/decrypt small RSA values with n, e, c, and optionally d or p/q. Inputs in hex. Local BigInt — perfect for CTF tricks.',
    [
      { key: 'n', label: 'n (hex)', type: 'text', def: '' },
      { key: 'e', label: 'e (hex, default 10001)', type: 'text', def: '' },
      { key: 'c', label: 'c (hex, for decrypt)', type: 'text', def: '' },
      { key: 'm', label: 'm (hex, for encrypt)', type: 'text', def: '' },
      { key: 'd', label: 'd (hex, optional)', type: 'text', def: '' },
      { key: 'p', label: 'p (hex, optional)', type: 'text', def: '' },
      { key: 'q', label: 'q (hex, optional)', type: 'text', def: '' }
    ],
    (ctx) => {
      const o = ctx.opts;
      const r = RekLib.rsa.run({ n: o.n, e: o.e, c: o.c, m: o.m, d: o.d, p: o.p, q: o.q });
      if (!r.ok) return { error: r.error };
      const out = [
        { label: 'Result (hex)', text: r.hex, kind: 'mono' },
        { label: 'Result (decimal)', text: r.value.toString(), kind: 'mono' }
      ];
      if (r.plaintext) out.push({ label: 'Plaintext (printable)', text: r.plaintext, kind: 'mono' });
      if (r.note) out.push({ label: 'Note', text: r.note, kind: 'text' });
      return { outputs: out };
    });

  /* ------------------------------------------------------------------ *
   * Transform
   * ------------------------------------------------------------------ */
  $('case', 'Transform', 'Case conversion',
    'Lower, UPPER, Title, Sentence, camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, dot.case, train-case and more.',
    [{
      key: 'format', label: 'Format', type: 'select', def: 'snake', options: [
        ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['swap', 'sWAP cASE'], ['title', 'Title Case'],
        ['sentence', 'Sentence case'], ['camel', 'camelCase'], ['pascal', 'PascalCase'],
        ['snake', 'snake_case'], ['kebab', 'kebab-case'], ['constant', 'CONSTANT_CASE'],
        ['dot', 'dot.case'], ['slash', 'slash/case'], ['train', 'Train-Case'], ['cobol', 'COBOL-CASE']
      ].map(([v, l]) => ({ v, l }))
    }],
    (ctx) => ({ outputs: [{ label: ctx.opts.format, text: RekLib.caseconv.convert(ctx.text, ctx.opts.format), kind: 'mono' }] }));

  $('reverse', 'Transform', 'Reverse',
    'Reverse characters, words, or lines.',
    [{
      key: 'mode', label: 'Mode', type: 'select', def: 'chars', options: [
        ['chars', 'Characters'], ['words', 'Words'], ['lines', 'Lines']
      ].map(([v, l]) => ({ v, l }))
    }],
    (ctx) => ({ outputs: [{ label: 'Reversed', text: RekLib.caseconv.reverse(ctx.text, ctx.opts.mode), kind: 'mono' }] }));

  $('textinfo', 'Transform', 'Text statistics',
    'Character, word, line, byte counts and vocabulary — useful for password lists and wordlists.',
    [],
    (ctx) => {
      const s = RekLib.caseconv.summarize(ctx.text);
      return { outputs: [{ label: 'Profile', text: [
        `Chars: ${s.chars}`,
        `Chars (no whitespace): ${s.charsNoSpace}`,
        `Bytes (UTF-8): ${s.bytes}`,
        `Words: ${s.words}`,
        `Unique words: ${s.uniqueWords}`,
        `Lines: ${s.lines}`,
        `Letters: ${s.letters}  ·  Digits: ${s.digits}  ·  Punctuation: ${s.punctuation}  ·  Whitespace: ${s.whitespace}`
      ].join('\n'), kind: 'mono' }] };
    });

  $('whitespace', 'Transform', 'Remove / normalize whitespace',
    'Strip all whitespace, collapse runs to single spaces, trim each line, or just trim the ends.',
    [{
      key: 'mode', label: 'Mode', type: 'select', def: 'all', options: [
        ['all', 'Remove ALL whitespace'], ['collapse', 'Collapse runs → single space'],
        ['lines', 'Trim each line'], ['trim', 'Trim start / end']
      ].map(([v, l]) => ({ v, l }))
    }],
    (ctx) => {
      const t = ctx.text;
      let out;
      if (ctx.opts.mode === 'all') out = t.replace(/\s+/g, '');
      else if (ctx.opts.mode === 'collapse') out = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
      else if (ctx.opts.mode === 'lines') out = t.split('\n').map((l) => l.trim()).join('\n');
      else out = t.trim();
      return { outputs: [{ label: 'Result', text: out, kind: 'mono' }] };
    });

  /* ------------------------------------------------------------------ *
   * Generators
   * ------------------------------------------------------------------ */
  $('random', 'Generators', 'Random generator',
    'Cryptographically strong local randomness: UUID v4, hex blobs, passwords.',
    [
      { key: 'kind', label: 'Kind', type: 'select', def: 'uuid', options: [
        ['uuid', 'UUID v4'], ['hex', 'Hex bytes'], ['pass', 'Password']].map(([v, l]) => ({ v, l })) },
      { key: 'length', label: 'Length / bytes', type: 'num', def: 16 },
      { key: 'readable', label: 'Readable password (no ambiguous chars)', type: 'bool', def: false }
    ],
    (ctx) => {
      const kind = ctx.opts.kind;
      const len = Math.max(1, parseInt(ctx.opts.length, 10) || 16);
      let text, kindLabel;
      if (kind === 'uuid') { text = RekLib.random.uuid(); kindLabel = 'UUID v4'; }
      else if (kind === 'hex') { text = RekLib.random.hex(len); kindLabel = `${len * 2} hex chars`; }
      else { text = RekLib.random.password(len, { readable: !!ctx.opts.readable }); kindLabel = 'Password'; }
      return { outputs: [{ label: kindLabel, text, kind: 'mono' }], note: 'Uses WebCrypto getRandomValues when available.' };
    });

  return { list, byId, categories: CATEGORIES };
})();