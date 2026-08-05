(function (root) {
  'use strict';

  const EPSILON = 1e-12;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function rerollCosts(count, paidAlready, freeRerolls) {
    const costs = [];
    let paid = Math.max(0, Math.floor(paidAlready));
    let free = Math.max(0, Math.floor(freeRerolls));
    for (let index = 0; index < count; index += 1) {
      if (free > 0) {
        costs.push(0);
        free -= 1;
      } else {
        costs.push(paid < 5 ? 1 : paid < 10 ? 2 : 3);
        paid += 1;
      }
    }
    return costs;
  }

  function buildPool(input) {
    const hero = input.hero || 'any';
    return input.items.filter((item) => {
      const heroMatches = item.hero === 'shared' || (hero !== 'any' && item.hero === hero);
      return heroMatches && item.status === 'available';
    });
  }

  function groupByRarity(items, rarities) {
    const groups = Object.fromEntries(rarities.map((rarity) => [rarity, []]));
    for (const item of items) {
      if (groups[item.rarity]) groups[item.rarity].push(item);
    }
    return groups;
  }

  function targetWeight(item, input) {
    const seenFactor = Math.pow(clamp(input.repeatMultiplier, 0.01, 1), Math.max(0, input.seenCount));
    return Math.max(EPSILON, Number(item.weight || 1) * seenFactor);
  }

  function selectionChanceForTarget(poolByRarity, target, input) {
    const group = poolByRarity[target.rarity] || [];
    let totalWeight = 0;
    let desiredWeight = 0;
    for (const item of group) {
      const weight = item.id === target.id ? targetWeight(item, input) : Math.max(EPSILON, Number(item.weight || 1));
      totalWeight += weight;
      if (item.id === target.id) desiredWeight = weight;
    }
    if (totalWeight <= 0 || desiredWeight <= 0) return 0;
    const baseChance = desiredWeight / totalWeight;
    const boost = clamp(input.targetBoost, 0, 100) / 100;
    return baseChance + (1 - baseChance) * boost;
  }

  function exactCalculation(input, data, pool, poolByRarity) {
    const target = input.target;
    const odds = data.roundOdds[input.round - 1];
    const rarityIndex = data.rarities.indexOf(target.rarity);
    const rarityChance = rarityIndex >= 0 ? odds[rarityIndex] / 100 : 0;
    const withinRarity = selectionChanceForTarget(poolByRarity, target, input);
    const saleFactor = input.saleOnly ? clamp(input.saleChance, 0, 100) / 100 : 1;
    const slotProbability = rarityChance * withinRarity * saleFactor;
    const shopProbability = 1 - Math.pow(1 - slotProbability, input.openSlots);
    const cumulativeProbability = 1 - Math.pow(1 - shopProbability, input.rerolls);
    const expectedRerolls = shopProbability > 0 ? 1 / shopProbability : Infinity;
    const costs = rerollCosts(input.rerolls, input.paidRerolls, input.freeRerolls);
    let expectedGold = 0;
    let reachChance = 1;
    for (const cost of costs) {
      expectedGold += cost * reachChance;
      reachChance *= 1 - shopProbability;
    }
    return {
      method: input.seenCount > 0 || input.targetBoost > 0 ? 'estimated-analytic' : 'exact',
      runs: 0,
      slotProbability,
      shopProbability,
      cumulativeProbability,
      expectedRerolls,
      totalGold: costs.reduce((sum, cost) => sum + cost, 0),
      expectedGold,
      confidenceInterval: null,
      hits: null
    };
  }

  function weightedPick(group, target, input, random) {
    if (!group || group.length === 0) return null;
    let total = 0;
    const weights = group.map((item) => {
      const weight = item.id === target.id ? targetWeight(item, input) : Math.max(EPSILON, Number(item.weight || 1));
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

  function adjustedRarityIndex(baseIndex, slotIndex, input, rarityCount, random) {
    const upgradeChance = clamp(input.upgradeChance - slotIndex * 100, 0, 100) / 100;
    const downgradeChance = clamp(input.downgradeChance - slotIndex * 100, 0, 100) / 100;
    if (baseIndex < rarityCount - 1 && random() < upgradeChance) return baseIndex + 1;
    if (baseIndex > 0 && random() < downgradeChance) return baseIndex - 1;
    return baseIndex;
  }

  function nearestBag(bags, rarityIndex, rarities, target, input, random) {
    if (bags.length === 0) return null;
    const sameRarity = bags.filter((item) => item.rarity === rarities[rarityIndex]);
    if (sameRarity.length) return weightedPick(sameRarity, target, input, random);
    for (let index = rarityIndex; index >= 0; index -= 1) {
      const candidates = bags.filter((item) => item.rarity === rarities[index]);
      if (candidates.length) return weightedPick(candidates, target, input, random);
    }
    for (let index = rarityIndex + 1; index < rarities.length; index += 1) {
      const candidates = bags.filter((item) => item.rarity === rarities[index]);
      if (candidates.length) return weightedPick(candidates, target, input, random);
    }
    return bags[Math.floor(random() * bags.length)];
  }

  function wilsonInterval(successes, trials, z) {
    if (!trials) return { low: 0, high: 0 };
    const probability = successes / trials;
    const z2 = z * z;
    const denominator = 1 + z2 / trials;
    const center = (probability + z2 / (2 * trials)) / denominator;
    const spread = z * Math.sqrt((probability * (1 - probability) + z2 / (4 * trials)) / trials) / denominator;
    return { low: Math.max(0, center - spread), high: Math.min(1, center + spread) };
  }

  function simulationCalculation(input, data, pool, poolByRarity, random) {
    const runs = data.mechanics.simulationRuns;
    const target = input.target;
    const odds = data.roundOdds[input.round - 1];
    const bags = pool.filter((item) => item.bag);
    const costs = rerollCosts(input.rerolls, input.paidRerolls, input.freeRerolls);
    let successfulRuns = 0;
    let successfulShops = 0;
    let generatedShops = 0;
    let targetSlots = 0;
    let generatedSlots = 0;
    let spentTotal = 0;

    for (let run = 0; run < runs; run += 1) {
      let pity = clamp(input.bagPity, 0, 10);
      let runHit = false;
      let spent = 0;
      for (let reroll = 0; reroll < input.rerolls; reroll += 1) {
        if (runHit) break;
        spent += costs[reroll];
        let shopHit = false;
        for (let slot = 0; slot < input.openSlots; slot += 1) {
          const baseRarity = rollRarity(odds, random);
          const rarityIndex = adjustedRarityIndex(baseRarity, slot, input, data.rarities.length, random);
          const rarity = data.rarities[rarityIndex];
          let item = weightedPick(poolByRarity[rarity], target, input, random);
          generatedSlots += 1;
          if (!item) continue;

          if (item.id !== target.id && target.rarity === rarity && random() < clamp(input.targetBoost, 0, 100) / 100) {
            item = target;
          }

          if (item.bag) {
            pity = 0;
          } else {
            pity += 1;
            if (pity >= data.mechanics.bagPityAt) {
              const pityBag = nearestBag(bags, rarityIndex, data.rarities, target, input, random);
              if (pityBag) item = pityBag;
              pity = 0;
            }
          }

          const itemHit = item.id === target.id;
          const saleHit = !input.saleOnly || random() < clamp(input.saleChance, 0, 100) / 100;
          if (itemHit && saleHit) {
            targetSlots += 1;
            shopHit = true;
          }
        }
        generatedShops += 1;
        if (shopHit) {
          successfulShops += 1;
          runHit = true;
        }
      }
      if (runHit) successfulRuns += 1;
      spentTotal += spent;
    }

    const slotProbability = generatedSlots ? targetSlots / generatedSlots : 0;
    const shopProbability = generatedShops ? successfulShops / generatedShops : 0;
    const cumulativeProbability = successfulRuns / runs;
    return {
      method: 'estimated-simulation',
      runs,
      slotProbability,
      shopProbability,
      cumulativeProbability,
      expectedRerolls: shopProbability > 0 ? 1 / shopProbability : Infinity,
      totalGold: costs.reduce((sum, cost) => sum + cost, 0),
      expectedGold: spentTotal / runs,
      confidenceInterval: wilsonInterval(successfulRuns, runs, 1.96),
      hits: successfulRuns
    };
  }

  function validate(input, data, pool) {
    const diagnostics = [];
    if (!input.target) diagnostics.push('목표 아이템이 선택되지 않았습니다.');
    if (input.openSlots <= 0) diagnostics.push('모든 상점 슬롯이 잠겨 있습니다.');
    if (input.target && !pool.some((item) => item.id === input.target.id)) {
      diagnostics.push(input.target.hero !== 'shared' && input.hero !== input.target.hero
        ? `${input.target.name}은(는) ${input.target.hero} 전용 아이템입니다.`
        : '목표 아이템이 현재 Available 풀에서 제외되어 있습니다.');
    }
    if (input.target) {
      const rarityIndex = data.rarities.indexOf(input.target.rarity);
      const odds = data.roundOdds[input.round - 1] || [];
      if ((odds[rarityIndex] || 0) === 0 && input.upgradeChance === 0 && input.downgradeChance === 0) {
        diagnostics.push(`Round ${input.round}의 ${input.target.rarity} 기본 확률은 0%입니다.`);
      }
    }
    return diagnostics;
  }

  function calculate(rawInput, data, random) {
    const input = {
      ...rawInput,
      round: Math.round(clamp(rawInput.round, 1, data.roundOdds.length)),
      rerolls: Math.round(clamp(rawInput.rerolls, 1, 100)),
      openSlots: Math.round(clamp(rawInput.openSlots, 0, data.mechanics.shopSlots)),
      seenCount: Math.max(0, Math.floor(rawInput.seenCount || 0)),
      repeatMultiplier: clamp(rawInput.repeatMultiplier ?? 0.75, 0.01, 1),
      targetBoost: clamp(rawInput.targetBoost || 0, 0, 100),
      bagPity: Math.round(clamp(rawInput.bagPity || 0, 0, 10)),
      upgradeChance: clamp(rawInput.upgradeChance || 0, 0, 500),
      downgradeChance: clamp(rawInput.downgradeChance || 0, 0, 500),
      saleChance: clamp(rawInput.saleChance ?? data.mechanics.baseSaleChance, 0, 100),
      paidRerolls: Math.max(0, Math.floor(rawInput.paidRerolls || 0)),
      freeRerolls: Math.max(0, Math.floor(rawInput.freeRerolls || 0))
    };
    const pool = buildPool(input);
    const poolByRarity = groupByRarity(pool, data.rarities);
    const diagnostics = validate(input, data, pool);
    if (diagnostics.length) {
      return {
        method: 'unavailable', diagnostics, slotProbability: 0, shopProbability: 0,
        cumulativeProbability: 0, expectedRerolls: Infinity,
        totalGold: rerollCosts(input.rerolls, input.paidRerolls, input.freeRerolls).reduce((sum, cost) => sum + cost, 0),
        expectedGold: 0, confidenceInterval: null, runs: 0
      };
    }

    const generatedCount = input.openSlots * input.rerolls;
    const pityCanTrigger = input.bagPity + generatedCount >= data.mechanics.bagPityAt;
    const useSimulation = input.upgradeChance > 0 || input.downgradeChance > 0 || pityCanTrigger;
    const result = useSimulation
      ? simulationCalculation(input, data, pool, poolByRarity, random || Math.random)
      : exactCalculation(input, data, pool, poolByRarity);
    result.diagnostics = [];
    result.poolCounts = Object.fromEntries(data.rarities.map((rarity) => [rarity, (poolByRarity[rarity] || []).length]));
    return result;
  }

  root.BBCalculator = { calculate, rerollCosts, wilsonInterval };
})(globalThis);
