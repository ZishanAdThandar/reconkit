/**
 * ReconKit — File magic-byte signature detection.
 * Identifies common container / executable / media / archive types from the
 * first bytes of a file. This is a passive, offline heuristic.
 */
(function (g) {
  'use strict';

  // Each entry: { name, ext, sig: function(bytes) -> bool, note? }
  const SIGNATURES = [
    { name: 'PNG image', ext: '.png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
    { name: 'JPEG image', ext: '.jpg/.jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { name: 'GIF image', ext: '.gif', test: (b) => b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61 },
    { name: 'WebP image', ext: '.webp', test: (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
    { name: 'BMP image', ext: '.bmp', test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
    { name: 'TIFF image', ext: '.tif/.tiff', test: (b) => b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)) },
    { name: 'ICO icon', ext: '.ico', test: (b) => b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00 },
    { name: 'PDF document', ext: '.pdf', test: (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d },
    { name: 'ZIP archive', ext: '.zip', test: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) && (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08) },
    { name: 'RAR archive', ext: '.rar', test: (b) => b.length >= 7 && b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 && b[4] === 0x1a && b[5] === 0x07 && (b[6] === 0x00 || b[6] === 0x01) },
    { name: '7-Zip archive', ext: '.7z', test: (b) => b.length >= 6 && b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c },
    { name: 'GZIP archive', ext: '.gz', test: (b) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b },
    { name: 'TAR archive', ext: '.tar', test: (b) => b.length >= 262 && b[257] === 0x75 && b[258] === 0x73 && b[259] === 0x74 && b[260] === 0x61 && b[261] === 0x72 },
    { name: 'ELF executable', ext: '', test: (b) => b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46 },
    { name: 'PE executable (DOS header)', ext: '.exe/.dll', test: (b) => b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a },
    { name: 'Mach-O binary', ext: '', test: (b) => b.length >= 4 && ((b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa && (b[3] === 0xce || b[3] === 0xcf)) || (b[0] === 0xce && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe) || (b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe)) },
    { name: 'WebAssembly binary', ext: '.wasm', test: (b) => b.length >= 4 && b[0] === 0x00 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d },
    { name: 'Java class', ext: '.class', test: (b) => b.length >= 4 && b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe },
    { name: 'SQLite database', ext: '.sqlite/.db', test: (b) => b.length >= 16 && b[0] === 0x53 && b[1] === 0x51 && b[2] === 0x4c && b[3] === 0x69 && b[4] === 0x74 && b[5] === 0x65 && b[6] === 0x20 && b[7] === 0x66 && b[8] === 0x6f && b[9] === 0x72 && b[10] === 0x6d && b[11] === 0x61 && b[12] === 0x74 && b[13] === 0x20 && b[14] === 0x33 },
    { name: 'DBase / legacy DB', ext: '.dbf', test: (b) => b.length >= 1 && (b[0] === 0x02 || b[0] === 0x03 || b[0] === 0x30) && b[1] >= 0x60 && b[1] <= 0xff },
    { name: 'MP3 audio (ID3)', ext: '.mp3', test: (b) => (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b.length >= 2 && b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xf2 || b[1] === 0xe3)) },
    { name: 'OGG container', ext: '.ogg/.opus', test: (b) => b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53 },
    { name: 'FLAC audio', ext: '.flac', test: (b) => b.length >= 4 && b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43 },
    { name: 'WAV audio', ext: '.wav', test: (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45 },
    { name: 'MP4 / QuickTime video', ext: '.mp4/.mov', test: (b) => b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
    { name: 'Matroska / WebM video', ext: '.mkv/.webm', test: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
    { name: 'MIDI', ext: '.mid', test: (b) => b.length >= 4 && b[0] === 0x4d && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64 },
    { name: 'SVG (XML text)', ext: '.svg', test: (b) => b.length >= 5 && isTextAt(b, '<?xml') },
    { name: 'XML document', ext: '.xml', test: (b) => b.length >= 5 && isTextAt(b, '<?xml') },
    { name: 'OpenPGP message', ext: '.gpg/.pgp', test: (b) => b.length >= 2 && (b[0] === 0x85 || b[0] === 0x8e || b[0] === 0x99) && (b[1] === 0x02 || b[1] === 0x03) },
    { name: 'UTF-8 BOM text', ext: '.txt', test: (b) => b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf }
  ];

  function isTextAt(b, str) {
    if (b.length < str.length) return false;
    for (let i = 0; i < str.length; i++) if (b[i] !== str.charCodeAt(i)) return false;
    return true;
  }

  function looksLikePlainText(bytes) {
    if (bytes.length < 5) return false;
    let score = 0;
    let control = 0;
    for (let i = 0; i < Math.min(bytes.length, 8192); i++) {
      const b = bytes[i];
      if (b === 0x09 || b === 0x0a || b === 0x0d) { score++; continue; }
      if (b >= 0x20 && b <= 0x7e) score++;
      else if (b >= 0x80) strike;
      else control++;
    }
    if (control > 0) return false;
    return score / Math.min(bytes.length, 8192) >= 0.95;
  }

  function detectFileType(input) {
    const bytes = g.RekLib.toBytes(input);
    for (const sig of SIGNATURES) {
      if (sig.test(bytes)) {
        return { name: sig.name, ext: sig.ext, detected: true, match: sig.name };
      }
    }
    if (looksLikePlainText(bytes)) {
      return { name: 'Plain text (likely)', ext: '.txt', detected: true, match: 'Plain text', heuristic: true };
    }
    return { name: 'Unknown binary data', ext: '', detected: false, match: null };
  }

  g.RekLib.module('magic', function () {
    return { detect: detectFileType, signatures: SIGNATURES };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);