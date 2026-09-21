/**
 * ReconKit — library test suite.
 * Loads the env-agnostic lib modules (they attach to globalThis.RekLib) and
 * runs the same checks Node can validate. Run: `npm test`.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const LIBS = [
  'lib/lib-core.js', 'lib/base64.js', 'lib/encodings.js', 'lib/md5.js', 'lib/crc32.js',
  'lib/urlcode.js', 'lib/htmlcode.js', 'lib/rot.js', 'lib/caesar.js',
  'lib/xor.js', 'lib/jwt.js', 'lib/caseconv.js', 'lib/unicode.js',
  'lib/classic.js', 'lib/rsa.js', 'lib/random.js',
  'lib/strings.js',
  'lib/identify.js', 'lib/detect.js', 'services/services.js'
];

for (const f of LIBS) {
  await import(pathToFileURL(path.join(root, f)).href);
}

const L = globalThis.RekLib;

test('core: hex round trip', () => {
  const b = Uint8Array.from([0, 1, 255, 16, 128]);
  assert.equal(L.bytesToHex(b), '0001ff1080');
  assert.equal(L.bytesToHex(b, { upper: true, sep: ' ' }), '00 01 FF 10 80');
  assert.deepEqual(L.hexToBytes(' 0xff 00 0A '), Uint8Array.from([255, 0, 10]));
  assert.deepEqual(L.hexToBytes('ff:00:0a'), Uint8Array.from([255, 0, 10]));
  assert.throws(() => L.hexToBytes('abc'));
  assert.throws(() => L.hexToBytes('zz'));
});

test('core: rootDomain', () => {
  assert.equal(L.rootDomain('example.com'), 'example.com');
  assert.equal(L.rootDomain('a.b.example.com'), 'example.com');
  assert.equal(L.rootDomain('shop.example.co.uk'), 'example.co.uk');
  assert.equal(L.rootDomain('x.blogspot.com'), 'blogspot.com'); // unknown multi-suffix falls back to eTLD+1
  assert.equal(L.rootDomain('1.2.3.4'), '1.2.3.4');
});

test('core: formatBytes & describeTime', () => {
  assert.equal(L.formatBytes(0), '0 B');
  assert.equal(L.formatBytes(2048), '2.0 KiB');
  assert.match(L.describeTime(Math.floor(Date.now() / 1000) - 120), /ago/);
});

test('base64: standard vectors', () => {
  assert.equal(L.base64.fromString('hello'), 'aGVsbG8=');
  assert.equal(L.base64.toString('aGVsbG8='), 'hello');
  assert.equal(L.base64.fromString(''), '');
  assert.equal(L.base64.fromString('Man'), 'TWFu');
  assert.equal(L.base64.toString('TWFu'), 'Man');
  // UTF-8
  assert.equal(L.base64.fromString('é'), 'w6k=');
  assert.equal(L.base64.toString('w6k='), 'é');
});

test('base64: urlsafe variants', () => {
  const raw = L.base64.encode(Uint8Array.of(251, 255, 254)); // -1,-1,-1 bytes
  assert.equal(raw, '+//+');
  assert.equal(L.base64.bytesToUrlSafe(Uint8Array.of(251, 255, 254)), '-__-');
  // round trip of valid UTF-8 through url-safe strings
  const s = 'héllo wörld! ✓';
  assert.equal(L.base64.urlSafeDecode(L.base64.urlSafe(s)), s);
  // tolerant decode of standard base64 given url-safe flag
  const std = L.base64.fromString('héllo');
  assert.equal(L.base64.urlSafeDecode(std), 'héllo');
});

test('base64: tolerates whitespace and missing padding', () => {
  const s = L.base64.fromString('hello world');
  assert.equal(L.base64.toString(s.replace(/=+$/, '')), 'hello world');
  assert.equal(L.base64.toString('aGVs bG8g d29y bGQ='), 'hello world');
});

test('encodings: base32 RFC 4648 vectors', () => {
  const e = L.encodings.base32;
  assert.equal(e.encode(new Uint8Array(0)), '');
  assert.equal(e.encode(Uint8Array.of(0x66)), 'MY======'); // 'f'
  assert.equal(e.encode(Uint8Array.of(0x66, 0x6f)), 'MZXQ===='); // 'fo'
  assert.equal(e.encode(Uint8Array.of(0x66, 0x6f, 0x6f)), 'MZXW6==='); // 'foo'
  assert.equal(e.encode(L.encodeUTF8('foobar')), 'MZXW6YTBOI======');
  assert.deepEqual(e.decode('MZXW6==='), Uint8Array.of(0x66, 0x6f, 0x6f));
  assert.equal(L.decodeUTF8(e.decode('JBSWY3DP')), 'Hello'); // well-known
  // tolerant: lowercase + missing padding
  assert.equal(L.decodeUTF8(e.decode('jbswy3dp')), 'Hello');
  assert.throws(() => e.decode('MZXW6===8'));
});

test('encodings: base58 vectors + round trips', () => {
  const e = L.encodings.base58;
  assert.equal(e.encode(new Uint8Array(0)), '');
  assert.equal(e.encode(Uint8Array.of(0)), '1');
  assert.deepEqual(e.decode('1'), Uint8Array.of(0));
  // 'a' = 0x61 = 97 = 1*58 + 39 -> '2g'; '5' = 0x35 = 53 -> 'v'
  assert.equal(e.encode(L.encodeUTF8('a')), '2g');
  assert.equal(L.decodeUTF8(e.decode('2g')), 'a');
  assert.equal(e.encode(L.encodeUTF8('5')), 'v');
  assert.equal(L.decodeUTF8(e.decode('v')), '5');
  for (const b of [[1, 2, 3], [0, 0, 1], [255, 255], [0]]) {
    const u8 = Uint8Array.from(b);
    assert.deepEqual(e.decode(e.encode(u8)), u8);
  }
  assert.throws(() => e.decode('0OIl')); // leading/trailing chars outside alphabet
});

test('encodings: conversion matrix (radix + byte encodings)', () => {
  const c = (s, f, t) => L.encodings.convert(s, f, t);
  // pure radix conversions
  assert.equal(c('255', 'dec', 'hex'), 'ff');
  assert.equal(c('ff', 'hex', 'dec'), '255');
  assert.equal(c('255', 'dec', 'bin'), '11111111');
  assert.equal(c('11111111', 'bin', 'oct'), '377');
  assert.equal(c('377', 'oct', 'dec'), '255');
  assert.equal(c('42', 'dec', 'b36'), '16');
  // byte encodings
  assert.equal(c('Hello', 'text', 'hex'), '48656c6c6f');
  assert.equal(c('48656c6c6f', 'hex', 'text'), 'Hello');
  assert.equal(c('Hello', 'text', 'b64'), 'SGVsbG8=');
  assert.equal(c('SGVsbG8=', 'b64', 'text'), 'Hello');
  assert.equal(c('SGVsbG8', 'b64u', 'text'), 'Hello'); // tolerant of std alphabet
  assert.equal(c('Hello', 'text', 'b32'), 'JBSWY3DP');
  assert.equal(c('JBSWY3DP', 'b32', 'text'), 'Hello');
  assert.equal(c('48656c6c6f', 'hex', 'b64'), 'SGVsbG8=');
  // mixed radix -> byte -> radix round trip
  const b62 = c('hello world', 'text', 'b62');
  assert.equal(c(b62, 'b62', 'text'), 'hello world');
  const b58 = c('hello world', 'text', 'b58');
  assert.equal(c(b58, 'b58', 'text'), 'hello world');
  // identity + errors
  assert.equal(c('  padded  ', 'text', 'text'), '  padded  ');
  assert.throws(() => c('xyz', 'hex', 'dec'));
  assert.throws(() => c('MZXW6===8', 'b32', 'text'));
  assert.throws(() => c('ff', 'nosuch', 'hex'));
});

test('md5: RFC 1321 vectors', () => {
  const v = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a']
  ];
  for (const [input, hex] of v) assert.equal(L.md5.hex(input), hex);
});

test('crc32: known vector', () => {
  assert.equal(L.crc32.compute('123456789'), 0xcbf43926);
  assert.equal(L.crc32.compute(''), 0);
});

test('urlcode: encode forms', () => {
  assert.equal(L.urlcode.percentEncode('a b/c'), 'a%20b%2Fc');
  assert.equal(L.urlcode.percentEncode('a b', { spaceAsPlus: true }), 'a+b');
  assert.equal(L.urlcode.percentDecode('a%20b%2Fc'), 'a b/c');
  assert.equal(L.urlcode.percentDecode('a+b', { spaceAsPlus: true }), 'a b');
  assert.equal(L.urlcode.percentDecode('%E9', { spaceAsPlus: true }), 'é');
});

test('htmlcode: encode / decode', () => {
  assert.equal(L.htmlcode.escape('<b>"x" & \'y\''), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;');
  assert.equal(L.htmlcode.escape('é', { all: true }), '&#233;');
  assert.equal(L.htmlcode.decode('&lt;b&gt; &amp; &#233;'), '<b> & é');
  assert.equal(L.htmlcode.decode('&amp;amp;'), '&amp;');
  assert.equal(L.htmlcode.decode('&#x1F600;'), '\u{1F600}');
});

test('rot: ROT13 + digits + ROT47', () => {
  assert.equal(L.rot.rot('Hello, World!', 13), 'Uryyb, Jbeyq!');
  assert.equal(L.rot.rot('ABCxyz123', 5, { digits: true }), 'FGHcde678');
  assert.equal(L.rot.rot('ABCxyz123', 5, { digits: false }), 'FGHcde123');
  assert.equal(L.rot.rot47('Hello'), 'w6==@');
  const all = L.rot.rotAll('secret', { digits: true });
  assert.equal(all.length, 26); // 25 shifts + ROT47
  const r13 = all.find((r) => r.shift === 13);
  assert.equal(r13.text, 'frperg');
});

test('caesar: basic', () => {
  assert.equal(L.caesar.caesar('abc XYZ', 3), 'def ABC');
  assert.equal(L.caesar.caesar('abc', -3), 'xyz');
  assert.equal(L.caesar.caesar('abc123', 5, { digits: true }), 'fgh678');
});

test('xor: fixed key + single-byte guess', () => {
  const secret = 'attack at dawn';
  const k = L.encodeUTF8('k');
  const enc = L.xor.xorBytes(L.encodeUTF8(secret), k);
  // every byte of plaintext XOR 0x6b
  const guess = L.xor.guessSingleByteXor(enc);
  assert.equal(guess[0].keyChar, 'k');
  assert.equal(guess[0].text, secret);
  // multi-byte key
  const enc2 = L.xor.xorBytes(L.encodeUTF8('Hello!'), L.encodeUTF8('ab'));
  assert.equal(L.decodeUTF8(L.xor.xorBytes(enc2, L.encodeUTF8('ab'))), 'Hello!');
});

test('classic: atbash / vigenere / morse / base', () => {
  assert.equal(L.classic.atbash('abc XYZ'), 'zyx CBA');
  assert.equal(L.classic.vigenere('ATTACKATDAWN', 'LEMON', false), 'LXFOPVEFRNHR');
  assert.equal(L.classic.vigenere('LXFOPVEFRNHR', 'LEMON', true), 'ATTACKATDAWN');
  assert.equal(L.classic.toMorse('hi'), '.... ..');
  assert.equal(L.classic.fromMorse('.... ..'), 'hi');
  assert.equal(L.classic.baseConvert('FF', 16, 10), '255');
  assert.equal(L.classic.baseConvert('1010', 2, 10), '10');
  assert.equal(L.classic.baseConvert('255', 10, 2), '11111111');
  assert.equal(L.classic.baseConvert('42', 10, 36), '16');
});

test('jwt: parse + claims + HMAC verify', async () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const p = L.jwt.parse(token);
  assert.equal(p.ok, true);
  assert.equal(p.alg, 'HS256');
  assert.equal(p.payload.name, 'John Doe');
  assert.equal(p.claims.iat.iso.includes('2018'), true);
  const v = await L.jwt.verifyHmac(token, 'your-256-bit-secret');
  assert.equal(v.ok, true);
  assert.equal(v.valid, true);
  const bad = await L.jwt.verifyHmac(token, 'wrong-secret');
  assert.equal(bad.valid, false);
  // malformed
  assert.equal(L.jwt.parse('not.a.jwt').ok, false);
});

test('caseconv: formats', () => {
  assert.equal(L.caseconv.convert('hello world', 'camel'), 'helloWorld');
  assert.equal(L.caseconv.convert('hello world', 'pascal'), 'HelloWorld');
  assert.equal(L.caseconv.convert('helloWorld', 'snake'), 'hello_world');
  assert.equal(L.caseconv.convert('Hello World', 'kebab'), 'hello-world');
  assert.equal(L.caseconv.convert('hello world', 'constant'), 'HELLO_WORLD');
  assert.equal(L.caseconv.convert('hello world', 'title'), 'Hello World');
  assert.equal(L.caseconv.convert('hello WORLD', 'sentence'), 'Hello world');
  assert.equal(L.caseconv.convert('Hello', 'swap'), 'hELLO');
  const s = L.caseconv.summarize('one two two');
  assert.equal(s.words, 3); assert.equal(s.uniqueWords, 2);
});

test('unicode: escape cycles + normalization', () => {
  const round = L.unicode.fromEscape(L.unicode.toEscape('é😀'));
  assert.equal(round, 'é\u{1F600}');
  assert.equal(L.unicode.fromEscape('\\ud83d\\ude00'), '\u{1F600}');
  assert.equal(L.unicode.fromEscape('\\u{1F600}'), '\u{1F600}');
  const pts = L.unicode.codePoints('Aé');
  assert.equal(pts[1].hex, 'U+00E9');
  const nfd = L.unicode.normalize('é', 'NFD');
  assert.equal(Array.from(nfd).length, 2);
  assert.equal(L.unicode.normalize(nfd, 'NFC'), 'é');
});

test('rsa: known example decrypt with p,q and with d', () => {
  // n = 3233 = 0xca1, e = 17 = 0x11, d = 2753 = 0xac1, c = 2790 = 0xae6, p = 61 = 0x3d, q = 53 = 0x35
  const r1 = L.rsa.run({ n: 'ca1', e: '11', c: 'ae6', p: '3d', q: '35' });
  assert.equal(r1.ok, true, r1.error);
  assert.equal(r1.hex, '41'); // 65 decimal
  const r2 = L.rsa.run({ n: 'ca1', e: '11', d: 'ac1', c: 'ae6' });
  assert.equal(r2.ok, true, r2.error);
  assert.equal(r2.value, 65n);
});

test('rsa: encrypt/decrypt roundtrip via CRT factors', () => {
  const r = L.rsa.run({ n: 'ca1', e: '11', m: '41' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.hex, 'ae6'); // 0xae6 = 2790
  const d = L.rsa.run({ n: 'ca1', e: '11', d: 'ac1', c: 'ae6' });
  assert.equal(d.ok, true, d.error);
  assert.equal(d.hex, '41');
});

test('strings: extraction', () => {
  const bytes = Uint8Array.from([1, 2, ...L.encodeUTF8('Hello world'), 0, 9, ...L.encodeUTF8('short')]);
  const s = L.strings.extract(bytes, { minLength: 4 });
  assert.equal(s.length, 2);
  assert.equal(s[0].text, 'Hello world');
  assert.equal(s[0].offset, 2);
});

test('identify: hash & encoding', () => {
  const h = L.identify.hash('d41d8cd98f00b204e9800998ecf8427e');
  assert.equal(h.match, 'MD5');
  const b = L.identify.encoding(L.base64.fromString('hello'));
  assert.ok(b.hits.some((x) => x.name.includes('Base64')));
  const jwt = L.identify.encoding('eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYiJ9.c2ln');
  assert.ok(jwt.hits[0].name.includes('JWT'));
});

test('detect: tech markers (generator + script sources)', () => {
  const gen = L.detect.fromMetaGenerators('Hugo 0.120.0');
  assert.ok(gen.some((t) => t.name === 'Hugo'));
  const scripts = L.detect.fromScriptSources(['https://cdn.example.net/jquery-3.7.1.min.js', '/assets/app.js']);
  assert.ok(scripts.some((t) => t.name === 'jQuery'));
  assert.ok(L.detect.fromHost('cdnjs.cloudflare.com').some((t) => t.name.includes('Cloudflare')));
});

test('random: shapes', () => {
  assert.match(L.random.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(L.random.hex(4).length, 8);
  const pw = L.random.password(20);
  assert.equal(pw.length, 20);
});

test('services: link building for domain & IP targets', () => {
  const dom = globalThis.RekServices.buildContext('https://example.com:8443/x?q=1');
  assert.equal(dom.host, 'example.com');
  assert.equal(dom.rootDomain, 'example.com');
  assert.equal(dom.protocol, 'https');
  assert.equal(dom.port, '8443');
  const links = globalThis.RekServices.linksFor(dom);
  assert.ok(links.some((l) => l.id === 'crtsh'));
  assert.ok(links.some((l) => l.id === 'wayback'));
  assert.ok(!links.some((l) => l.id === 'shodan-ip'));

  const ipCtx = globalThis.RekServices.buildContext('8.8.8.8');
  assert.equal(ipCtx.isIp, true);
  const iplinks = globalThis.RekServices.linksFor(ipCtx);
  assert.ok(iplinks.some((l) => l.id === 'shodan-ip'));
  assert.ok(!iplinks.some((l) => l.id === 'crtsh'));

  const files = globalThis.RekServices.SERVICES.filter((s) => s.requires === 'file');
  assert.equal(files.length, 0, 'file-tool services removed with the Files view');
  const hostGrouped = globalThis.RekServices.groupedLinks(dom);
  assert.ok(!hostGrouped.order.includes('External file analysis'));
});

test('services: search chain across groups', () => {
  const ctx = globalThis.RekServices.buildContext('analytics.example.co.uk');
  const grouped = globalThis.RekServices.groupedLinks(ctx);
  assert.ok(grouped.order.includes('Search engines'));
});

test('app: no top-level const/let/class collisions across page scripts', () => {
  // Classic (non-module) <script> tags share the global lexical scope: a
  // top-level `const X` in two files throws "Identifier 'X' has already been
  // declared" and aborts every later script at parse time. This is the exact
  // bug that blanked the popup (multiple `const Rec` files). Guard it here.
  const html = fs.readFileSync(path.join(root, 'app/app.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 29, 'expected the full script set');
  const declRe = /^(const|let|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
  const seen = new Map(); // name -> [file, kind]
  const bad = [];
  for (const rel of scripts) {
    const abs = path.resolve(root, 'app', rel);
    assert.ok(fs.existsSync(abs), `script exists: ${rel}`);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    for (const line of lines) {
      if (line[0] !== 'c' && line[0] !== 'l') continue; // column-0 only
      const m = line.match(declRe);
      if (!m) continue;
      if (seen.has(m[2])) bad.push(`${m[2]} declared in ${seen.get(m[2])} and ${rel}`);
      else seen.set(m[2], rel);
    }
  }
  assert.deepEqual(bad, []);
});