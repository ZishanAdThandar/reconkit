/**
 * ReconKit — Case conversion utilities.
 * Handles the common naming conventions: snake, kebab, camel, pascal,
 * constant, dot, title, sentence, swap, and so on.
 */
(function (g) {
  'use strict';

  // Split a string into words on non-alphanumeric boundaries and letter/digit
  // case transitions ("camelCase" -> camel, Case).
  function splitWords(str) {
    const s = String(str);
    const words = [];
    const re = /[A-Za-z0-9]+/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const raw = m[0];
      // Break camelCase boundaries: aB -> a, B
      const pieces = raw.replace(/([a-z0-9])([A-Z])/g, '$1\x00$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1\x00$2')
        .split('\x00');
      for (const p of pieces) if (p) words.push(p);
    }
    return words;
  }

  const capitalize = (w) => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
  const lowerWord = (w) => w.toLowerCase();
  const upperWord = (w) => w.toUpperCase();

  function convert(str, format) {
    const words = splitWords(str);
    const join = (sep, fn) => words.map(fn).join(sep);
    switch (format) {
      case 'upper': return String(str).toUpperCase();
      case 'lower': return String(str).toLowerCase();
      case 'swap': return String(str).split('').map((c) => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
      case 'title': return join(' ', capitalize);
      case 'sentence': {
        if (!words.length) return '';
        return capitalize(words[0]) + ' ' + words.slice(1).map(lowerWord).join(' ') + String(str).replace(/^[\s\S]*\b/, '').replace(/[\s\S]*$/, '');
      }
      case 'camel': return words.map((w, i) => i === 0 ? lowerWord(w) : capitalize(w)).join('');
      case 'pascal': return words.map(capitalize).join('');
      case 'snake': return join('_', lowerWord);
      case 'kebab': return join('-', lowerWord);
      case 'constant': return join('_', upperWord);
      case 'dot': return join('.', lowerWord);
      case 'slash': return join('/', lowerWord);
      case 'train': return join('-', capitalize); // Train-Case
      case 'cobol': return join('-', upperWord);  // COBOL-CASE
      default: return String(str);
    }
  }

  function summarize(str) {
    const s = String(str);
    const nosp = s.replace(/\s/g, '');
    const words = s.trim().split(/\s+/).filter(Boolean);
    return {
      chars: s.length,
      charsNoSpace: nosp.length,
      bytes: g.RekLib.encodeUTF8(s).length,
      words: words.length,
      lines: s ? s.split(/\r\n|\r|\n/).length : 0,
      uniqueWords: new Set(words.map((w) => w.toLowerCase())).size,
      letters: (s.match(/[A-Za-z]/g) || []).length,
      digits: (s.match(/[0-9]/g) || []).length,
      punctuation: (s.match(/[^\w\s]/g) || []).length,
      whitespace: (s.match(/\s/g) || []).length
    };
  }

  function reverse(str, mode) {
    const s = String(str);
    switch (mode) {
      case 'chars': return s.split('').reverse().join('');
      case 'words': return s.trim().split(/\s+/).reverse().join(' ');
      case 'lines': return s.split(/\r\n|\r|\n/).reverse().join('\n');
      default: return s.split('').reverse().join('');
    }
  }

  g.RekLib.module('caseconv', function () {
    return { convert, splitWords, summarize, reverse };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);