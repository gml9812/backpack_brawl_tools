(function (root) {
  'use strict';
  const core = root.BB_ECON_CORE;
  if (!core || core.__officialDirectGold) return;
  const originalBuild = core.buildEconomyItems;

  function officialShopGold(effect) {
    let total = 0;
    let found = false;
    for (const match of effect.matchAll(/On shop entered:[\s\S]{0,240}?(?:Gain|Get)\s+(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?\s+Gold/gi)) {
      const minimum = Number(match[1]);
      const maximum = Number(match[2] ?? match[1]);
      const chance = match[0].match(/(\d+(?:\.\d+)?)%\s+chance/i);
      total += ((minimum + maximum) / 2) * (chance ? Number(chance[1]) / 100 : 1);
      found = true;
    }
    return found ? Math.round(total * 100) / 100 : null;
  }

  core.buildEconomyItems = function buildEconomyItemsWithOfficialGold(catalog, combat, assumptions) {
    return originalBuild(catalog, combat, assumptions).map((item) => {
      const officialGold = officialShopGold(item.effect);
      if (!Number.isFinite(officialGold)) return item;
      const generatedBase = item.pools.reduce((sum, pool) => sum + (pool.baseGold || 0), 0);
      const baseGold = Math.round((officialGold + generatedBase) * 100) / 100;
      return {
        ...item,
        directGold: officialGold,
        expectedGold: baseGold,
        baseGold,
        displayGold: `${baseGold}${item.pools.length ? '+a' : ''}`,
        paybackRounds: baseGold > 0 ? Math.round((item.price / baseGold) * 10) / 10 : null,
        formula: [`공식 직접 Gold 평균 ${officialGold}`, ...item.pools.map((pool) => `${Math.round(pool.probability * 1000) / 10}% × ${pool.quantity}개 × 최저 등급 평균 판매가 ${pool.lowestAverageSale ?? '?'}`)].join(' + ')
      };
    });
  };
  core.__officialDirectGold = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
