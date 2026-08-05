(function (root) {
  'use strict';

  const EPSILON = 1e-12;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

  function buildPool(input, data) {
    return input.items.filter((item) => {
      const heroMatches = item.hero === 'shared' || (input.hero !== 'any' && item.hero === input.hero);
      return heroMatches && item.status === 'available' && data.rarities.includes(item.rarity);
    });
  }

  function groupByRarity(items, rarities) {
    const groups = Object.fromEntries(rarities.map((rarity) => [rarity, []]));
    for (const item of items) groups[item.rarity].push(item);
    return groups;
  }

  function weightedPick(group, random) {
    if (!group || group.length === 0) return null;
    let total = 0;
    const weights = group.map((item) => {
      const weight = Math.max(EPSILON, Number(item.weight || 1));
      total += weight;
      return weight;
    });
    let roll = random() * total;
    for (let index = 0; index < group.length; index += 1) {
      roll -= weights[index];
      if (roll <= 0) return group[index];
    }
    return group[group.length - 1];
  }

  function rollRarity(odds, random) {
    let roll = random() * 100;
    for (let index = 0; index < odds.length; index += 1) {
      roll -= odds[index];
      if (roll < 0) return index;
    }
    return odds.length - 1;
  }

  function adjustedRarity(baseIndex, slotIndex, input, count, random) {
    const upgrade = clamp(input.upgradeChance - slotIndex * 100, 0, 100) / 100;
    const downgrade = clamp(input.downgradeChance - slotIndex * 100, 0, 100) / 100;
    if (baseIndex < count - 1 && random() < upgrade) return baseIndex + 1;
    if (baseIndex > 0 && random() < downgrade) return baseIndex - 1;
    return baseIndex;
  }

  function pityBag(bags, rarityIndex, rarities, random) {
    const sameRarity = bags.filter((item) => item.rarity === rarities[rarityIndex]);
    if (sameRarity.length) return weightedPick(sameRarity, random);
    for (let index = rarityIndex; index >= 0; index -= 1) {
      const candidates = bags.filter((item) => item.rarity === rarities[index]);
      if (candidates.length) return weightedPick(candidates, random);
    }
    return weightedPick(bags, random);
  }

  function calculate(rawInput, data, random) {
    const input = {
      ...rawInput,
      hero: rawInput.hero || 'any',
      round: Math.round(clamp(rawInput.round, 1, data.roundOdds.length)),
      openSlots: Math.round(clamp(rawInput.openSlots, 0, data.mechanics.shopSlots)),
      bagPity: Math.round(clamp(rawInput.bagPity || 0, 0, 10)),
      upgradeChance: clamp(rawInput.upgradeChance || 0, 0, 500),
      downgradeChance: clamp(rawInput.downgradeChance || 0, 0, 500),
      saleChance: clamp(rawInput.saleChance ?? data.mechanics.baseSaleChance, 0, 100)
    };
    const pool = buildPool(input, data);
    const groups = groupByRarity(pool, data.rarities);
    if (input.openSlots <= 0 || pool.length === 0) {
      return {
        method: 'unavailable', runs: 0, items: [],
        diagnostics: [input.openSlots <= 0 ? '모든 상점 슬롯이 잠겨 있습니다.' : '현재 Available 아이템 풀이 비어 있습니다.']
      };
    }

    const odds = data.roundOdds[input.round - 1];
    const saleFactor = input.saleOnly ? input.saleChance / 100 : 1;
    const pityCanTrigger = input.bagPity + input.openSlots >= data.mechanics.bagPityAt;
    const useSimulation = input.upgradeChance > 0 || input.downgradeChance > 0 || pityCanTrigger;

    if (!useSimulation) {
      const results = [];
      for (let rarityIndex = 0; rarityIndex < data.rarities.length; rarityIndex += 1) {
        const group = groups[data.rarities[rarityIndex]];
        const totalWeight = group.reduce((sum, item) => sum + Math.max(EPSILON, Number(item.weight || 1)), 0);
        const rarityProbability = (odds[rarityIndex] || 0) / 100;
        for (const item of group) {
          const slotProbability = totalWeight > 0
            ? rarityProbability * Math.max(EPSILON, Number(item.weight || 1)) / totalWeight * saleFactor
            : 0;
          results.push({ id: item.id, slotProbability, shopProbability: 1 - Math.pow(1 - slotProbability, input.openSlots) });
        }
      }
      return { method: 'exact', runs: 0, items: results, diagnostics: [] };
    }

    const rng = random || Math.random;
    const runs = data.mechanics.simulationRuns;
    const slotCounts = Object.create(null);
    const shopCounts = Object.create(null);
    const bags = pool.filter((item) => item.bag);
    for (let run = 0; run < runs; run += 1) {
      let pity = input.bagPity;
      const seenThisShop = new Set();
      for (let slot = 0; slot < input.openSlots; slot += 1) {
        const baseRarity = rollRarity(odds, rng);
        const rarityIndex = adjustedRarity(baseRarity, slot, input, data.rarities.length, rng);
        let item = weightedPick(groups[data.rarities[rarityIndex]], rng);
        if (!item) continue;
        if (item.bag) {
          pity = 0;
        } else {
          pity += 1;
          if (pity >= data.mechanics.bagPityAt) {
            item = pityBag(bags, rarityIndex, data.rarities, rng) || item;
            pity = 0;
          }
        }
        if (input.saleOnly && rng() >= saleFactor) continue;
        slotCounts[item.id] = (slotCounts[item.id] || 0) + 1;
        seenThisShop.add(item.id);
      }
      for (const id of seenThisShop) shopCounts[id] = (shopCounts[id] || 0) + 1;
    }
    const totalSlots = runs * input.openSlots;
    return {
      method: 'estimated-simulation', runs, diagnostics: [],
      items: pool.map((item) => ({
        id: item.id,
        slotProbability: (slotCounts[item.id] || 0) / totalSlots,
        shopProbability: (shopCounts[item.id] || 0) / runs
      }))
    };
  }

  root.BBCatalogCalculator = { calculate };
})(globalThis);
