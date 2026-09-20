/**
 * ReconKit — Caesar cipher.
 * Classic Caesar shift over the alphabet (case preserved), with optional
 * digit rotation. Delegates character math to the ROT module.
 */
(function (g) {
  'use strict';

  function caesar(str, shift, opts) {
    opts = opts || {};
    const digits = opts.digits === true; // digit rotation opt-in here
    const normShift = ((shift % 26) + 26) % 26;
    return g.RekLib.rot.rot(str, normShift, { digits });
  }

  g.RekLib.module('caesar', function () {
    return { caesar };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);