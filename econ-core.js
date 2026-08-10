(function (root) {
  'use strict';

  const EXCLUDED_IDS = new Set(['book-of-ephemeral-earth']);
  const ECON_TRIGGER = /On (?:\d+ )?shops? entered/i;
  const ECON_OUTPUT = /\b(?:Gold|Get|find|catch|Fishing|Mining|Dig|Wish|Collect|Brings|Turn into Plant)\b/i;

  const DIRECT_GOLD = {
    'bronze-bar': () => 2,
    'gold-bar': () => 5,
    'golden-clover': () => 1.5,
    'golden-egg': () => 1,
    'golden-skull': ({ winRate }) => winRate * 3 + (1 - winRate) * 5,
    'gothic-shield': () => 5,
    'lucky-ratomelon': () => null,
    mimic: () => 2,
    ratymandias: ({ starCount }) => starCount,
    'tidal-clam': () => 1,
    'treasure-chest': () => 2,
    'stormbound-tranquility': () => 2,
    'gold-attuned-shovel': () => null,
    'gold-ore': () => 0.5,
    'glittercall-magpie': () => 1,
    'nightsong-raven': () => 2,
    'durable-matter-converter': () => null,
    'dull-oyster-shucker': () => 5,
    'golden-omelette': () => 2,
    'bookie-s-coin-purse': ({ winRate }) => winRate * 4 + (1 - winRate) * 3
  };

  const DIRECT_GOLD_IDS = new Set(Object.keys(DIRECT_GOLD));
  const POOL_TYPES = {
    part: ['Part'], tool: ['Tool'], plant: ['Plant'], insect: ['Bee', 'Butterfly', 'Fly'],
    bee: ['Bee'], rat: ['Rat'], potion: ['Potion'], food: ['Food'], ingredient: ['Ingredient'],
    essence: ['Accessory'], pet: ['Pet'], weapon: ['Weapon'], 'melee weapon': ['Melee'],
    'ranged weapon': ['Ranged'], armor: ['Armor'], mineral: ['Mineral'], ore: ['Mineral'],
    gem: ['Mineral'], bargain: ['Bargain'], bomb: ['Bomb'], 'jelly bean': ['Jelly Bean'],
    fish: ['Fish'], shallow: ['Shallow'], deep: ['Deep'], abyssal: ['Abyssal'],
    bramble: ['Bramble'], crab: ['Crab'], lobster: ['Lobster']
  };

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function salePrice(price) {
    return Math.ceil(number(price) / 2);
  }

  function average(values) {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  }

  function round(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function normalizeAssumptions(input = {}) {
    return {
      starCount: Math.max(0, number(input.starCount, 1)),
      emptySlots: Math.max(0, number(input.emptySlots, 1)),
      winRate: Math.min(1, Math.max(0, number(input.winRate, 50) / (number(input.winRate, 50) > 1 ? 100 : 1)))
    };
  }

  function isEconomyItem(item, stats) {
    if (!item || !stats || EXCLUDED_IDS.has(item.id)) return false;
    const effect = (stats.effects || []).join(' ');
    return ECON_TRIGGER.test(effect) && ECON_OUTPUT.test(effect);
  }

  function createLookup(catalog, combat) {
    const items = catalog.items || [];
    const byId = new Map(items.map((item) => [item.id, item]));
    const byName = [...items]
      .filter((item) => combat.items?.[item.id]?.price)
      .sort((a, b) => b.name.length - a.name.length);

    function itemSale(item) {
      return item ? salePrice(combat.items?.[item.id]?.price) : null;
    }

    function averageByTypes(types) {
      return average(items.filter((item) => types.some((type) => item.types?.includes(type))).map(itemSale));
    }

    function averageByName(pattern) {
      return average(items.filter((item) => pattern.test(item.name)).map(itemSale));
    }

    function descriptorValue(rawDescriptor) {
      const descriptor = rawDescriptor.replace(/\b(?:inside|if you won.*|quantity.*|uses remaining.*)$/i, '').trim();
      const alternatives = descriptor.split(/\s+or\s+/i);
      if (alternatives.length > 1) return average(alternatives.map(descriptorValue));
      const exact = byName.find((item) => new RegExp(`\\b${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(descriptor));
      if (exact) return itemSale(exact);
      const lower = descriptor.toLowerCase();
      if (/special rock|\brock\b/.test(lower)) return averageByName(/rock|boulder|gravel/i);
      if (/treat/.test(lower)) return averageByName(/sweet|candy|boo bar/i);
      if (/treasure/.test(lower)) return averageByName(/treasure|golden (?:egg|clover|skull)|gold bar/i);
      if (/companion/.test(lower)) return averageByTypes(['Pet']);
      if (/curiosity/.test(lower)) return averageByTypes(['Accessory']);
      if (/magical potion/.test(lower)) return averageByTypes(['Potion']);
      if (/fancy food/.test(lower)) return averageByTypes(['Food']);
      if (/gold or gems/.test(lower)) return averageByTypes(['Mineral']);
      if (/worthy weapon/.test(lower)) return averageByTypes(['Weapon']);
      const key = Object.keys(POOL_TYPES).sort((a, b) => b.length - a.length).find((candidate) => lower.includes(candidate));
      return key ? averageByTypes(POOL_TYPES[key]) : null;
    }

    return { byId, byName, itemSale, averageByTypes, descriptorValue };
  }

  function probabilityBefore(text, index, assumptions) {
    const context = text.slice(Math.max(0, index - 100), index);
    const percentages = [...context.matchAll(/(\d+(?:\.\d+)?)%/g)];
    let probability = percentages.length ? number(percentages.at(-1)[1]) / 100 : 1;
    if (/per Star/i.test(context)) probability *= assumptions.starCount;
    if (/per empty (?:bag )?slot/i.test(context)) probability *= assumptions.emptySlots;
    if (/\b0\.5 chance/i.test(context)) probability = 0.5;
    return Math.min(1, probability);
  }

  function generatedItemValue(effect, lookup, assumptions) {
    const contributions = [];
    const patterns = [
      /\b(?:Get|Catch|Collect|Brings you|Find)\s+(?:an?\s+|you\s+)?(\d+)?(?:-(\d+))?\s*([^.;|]+)/gi,
      /\bWish for\s+(?:an?\s+)?([^.;|]+)/gi
    ];

    for (const pattern of patterns) {
      for (const match of effect.matchAll(pattern)) {
        const isWish = /^Wish/i.test(match[0]);
        const minimum = isWish ? 1 : number(match[1], 1);
        const maximum = isWish ? 1 : number(match[2], minimum);
        const quantity = (minimum + maximum) / 2;
        const descriptor = isWish ? match[1] : match[3];
        if (/free reroll/i.test(descriptor)) continue;
        const unitValue = lookup.descriptorValue(descriptor);
        if (!Number.isFinite(unitValue)) continue;
        const probability = probabilityBefore(effect, match.index, assumptions);
        contributions.push({ value: quantity * unitValue * probability, label: `${round(probability * 100, 1)}% × ${round(quantity, 1)}개 × 판매가 ${round(unitValue)}` });
      }
    }

    for (const match of effect.matchAll(/Go (Fishing|Mining) \((Shallow|Deep|Abyssal|Surface|Underground|Core)\)/gi)) {
      const activity = match[1].toLowerCase();
      const depth = match[2].toLowerCase();
      const types = activity === 'fishing' ? POOL_TYPES[depth] : ['Mineral'];
      const unitValue = lookup.averageByTypes(types || ['Fish']);
      if (!Number.isFinite(unitValue)) continue;
      const probability = probabilityBefore(effect, match.index, assumptions);
      contributions.push({ value: unitValue * probability, label: `${round(probability * 100, 1)}% × ${match[2]} 평균 판매가 ${round(unitValue)}` });
    }

    return contributions;
  }

  function categoryFor(id, contributions, directGold) {
    if (DIRECT_GOLD_IDS.has(id) && contributions.length) return 'hybrid';
    if (DIRECT_GOLD_IDS.has(id)) return 'gold';
    return 'item';
  }

  function buildEconomyItems(catalog, combat, inputAssumptions = {}) {
    const assumptions = normalizeAssumptions(inputAssumptions);
    const lookup = createLookup(catalog, combat);
    return (catalog.items || []).flatMap((item) => {
      const stats = combat.items?.[item.id];
      if (!isEconomyItem(item, stats)) return [];
      const effect = (stats.effects || []).join(' ');
      const directGold = DIRECT_GOLD[item.id]?.(assumptions) ?? null;
      const contributions = generatedItemValue(effect, lookup, assumptions);
      const itemGold = contributions.reduce((sum, entry) => sum + entry.value, 0);
      const hasKnownValue = Number.isFinite(directGold) || contributions.length > 0;
      const expectedGold = hasKnownValue ? round((directGold || 0) + itemGold) : null;
      const price = number(stats.price, null);
      const uncertain = /Details unavailable/i.test(effect) || !hasKnownValue;
      return [{
        id: item.id, name: item.name, hero: item.hero || 'shared', rarity: item.rarity,
        image: item.image, types: item.types || [], price, salePrice: salePrice(price), effect,
        expectedGold, directGold: round(directGold), itemGold: round(itemGold),
        paybackRounds: expectedGold > 0 ? round(price / expectedGold, 1) : null,
        category: categoryFor(item.id, contributions, directGold),
        quality: uncertain ? (hasKnownValue ? 'partial' : 'unknown') : (contributions.length ? 'estimated' : 'exact'),
        formula: [Number.isFinite(directGold) ? `직접 Gold ${round(directGold)}` : '', ...contributions.map((entry) => entry.label)].filter(Boolean).join(' + ') || '원문 수치가 없어 계산 불가',
        sourceUrl: stats.sourceUrl || item.source?.url || ''
      }];
    });
  }

  root.BB_ECON_CORE = { buildEconomyItems, isEconomyItem, salePrice, normalizeAssumptions, DIRECT_GOLD_IDS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
