(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BB_BATTLE_RNG = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 시드 고정 난수 (mulberry32). 같은 시드면 같은 전투가 재현된다.
  function makeRng(seed = 1) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      chance: (p) => (p >= 1 ? true : p <= 0 ? false : next() < p),
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
    };
  }

  return { makeRng };
});
