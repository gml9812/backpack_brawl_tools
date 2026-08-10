(function (root) {
  'use strict';
  const EXCLUDED_IDS = new Set(['book-of-ephemeral-earth']);
  const ECON_TRIGGER = /On (?:\d+ )?shops? entered/i;
  const ECON_OUTPUT = /\b(?:Gold|Get|find|catch|Fishing|Mining|Dig|Wish|Collect|Brings|Turn into Plant)\b/i;
  const RARITY_ORDER = { Common: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Unique: 6, Relic: 7, Special: 8 };
  const DIRECT_GOLD = {
    'bronze-bar': () => 2, 'gold-bar': () => 5, 'golden-clover': () => 1.5, 'golden-egg': () => 1,
    'golden-skull': ({ winRate }) => winRate * 3 + (1 - winRate) * 5, 'gothic-shield': () => 5,
    'lucky-ratomelon': () => null, mimic: () => 2, ratymandias: ({ starCount }) => starCount,
    'tidal-clam': () => 1, 'treasure-chest': () => 2, 'stormbound-tranquility': () => 2,
    'gold-attuned-shovel': () => null, 'gold-ore': () => 0.5, 'glittercall-magpie': () => 1,
    'nightsong-raven': () => 2, 'durable-matter-converter': () => null, 'dull-oyster-shucker': () => 5,
    'golden-omelette': () => 2, 'bookie-s-coin-purse': ({ winRate }) => winRate * 4 + (1 - winRate) * 3
  };
  const DIRECT_GOLD_IDS = new Set(Object.keys(DIRECT_GOLD));
  function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
  function salePrice(price) { return Math.ceil(number(price) / 2); }
  function average(values) { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; }
  function round(value, digits = 2) { if (!Number.isFinite(value)) return null; const scale = 10 ** digits; return Math.round(value * scale) / scale; }
  function normalizeAssumptions(input = {}) { return { starCount: Math.max(0, number(input.starCount, 1)), emptySlots: Math.max(0, number(input.emptySlots, 1)), winRate: Math.min(1, Math.max(0, number(input.winRate, 50) / (number(input.winRate, 50) > 1 ? 100 : 1))) }; }
  function isEconomyItem(item, stats) { if (!item || !stats || EXCLUDED_IDS.has(item.id)) return false; const effect = (stats.effects || []).join(' '); return ECON_TRIGGER.test(effect) && ECON_OUTPUT.test(effect); }

  function createLookup(catalog, combat) {
    const enriched = (catalog.items || []).map((item) => { const price = number(combat.items?.[item.id]?.price, null); return { ...item, price, salePrice: Number.isFinite(price) ? salePrice(price) : null }; });
    const byName = new Map(enriched.map((item) => [item.name.toLowerCase(), item]));
    return {
      enriched, byName,
      candidatesFromNames: (names) => names.map((name) => byName.get(name.toLowerCase()) || { id: '', name, rarity: 'Unknown', types: [], image: '', price: null, salePrice: null, missing: true }),
      dynamic: (label, predicate, source = 'Wiki template filter applied to local catalog') => ({ label, source, candidates: enriched.filter(predicate) })
    };
  }
  function poolFromKey(key, lookup) { const pool = root.BB_ECON_POOLS?.pools?.[key]; return pool ? { key, label: pool.label, source: pool.source, candidates: lookup.candidatesFromNames(pool.names) } : null; }
  function partKey(rarity) { return RARITY_ORDER[rarity] >= 4 ? 'partLegendary' : RARITY_ORDER[rarity] >= 2 ? 'partRare' : 'partCommon'; }
  function allowedHero(candidate, generator) { return candidate.hero === 'shared' || candidate.hero === generator.hero; }
  function excludes(candidate, rarities) { return !rarities.includes(candidate.rarity); }

  function resolveDescriptor(raw, generator, lookup) {
    const descriptor = raw.replace(/\b(?:inside|if you won.*|quantity.*|uses remaining.*)$/i, '').trim(); const lower = descriptor.toLowerCase();
    const exactNames = descriptor.split(/\s*(?:,|\bor\b)\s*/i).map((value) => value.replace(/^(?:an?|the|random)\s+/i, '').trim()).filter((name) => lookup.byName.has(name.toLowerCase()));
    if (exactNames.length) return { key: 'exact', label: '효과에 명시된 후보', source: 'Item effect text', candidates: lookup.candidatesFromNames(exactNames) };
    const fixedRules = [
      [/common plant/, 'plantCommon'], [/\bplant\b/, 'plant'], [/insects?/, 'insect'], [/essence/, 'essence'], [/bramble/, 'bramble'],
      [/jelly bean/, 'jelly'], [/treat/, 'treat'], [/\bcrab\b/, 'crab'], [/\blobster\b/, 'lobster'], [/\bgem/, 'gem'], [/gold or gems/, 'gold']
    ];
    if (/crab or lobster/.test(lower)) { const a = poolFromKey('crab', lookup); const b = poolFromKey('lobster', lookup); return { key: 'crabLobster', label: 'Crab 또는 Lobster', source: a.source, candidates: [...a.candidates, ...b.candidates] }; }
    if (/\bparts?\b/.test(lower)) return poolFromKey(partKey(generator.rarity), lookup);
    if (/\bore\b/.test(lower)) return poolFromKey(/to find a gem/i.test(raw) ? 'oreBeforeGem' : 'ore', lookup);
    const fixed = fixedRules.find(([pattern]) => pattern.test(lower)); if (fixed) return poolFromKey(fixed[1], lookup);
    if (/treasure/.test(lower)) return lookup.dynamic('Treasure · cost ≤ 10', (item) => item.price <= 10 && item.types.includes('Accessory') && excludes(item, ['Unique', 'Special', 'Relic']));
    if (/\brat\b/.test(lower)) { const blocked = RARITY_ORDER[generator.rarity] >= 4 ? ['Mythic', 'Unique', 'Special', 'Relic'] : ['Legendary', 'Mythic', 'Unique', 'Special', 'Relic']; return lookup.dynamic(`Rat · ${generator.rarity} table`, (item) => item.types.includes('Rat') && excludes(item, blocked)); }
    const typeRules = [
      [/simple ingredient|\bingredient/, 'Ingredient', ['Unique', 'Special', 'Relic']], [/magical potion|\bpotion/, 'Potion', ['Common', 'Unique', 'Special', 'Relic']],
      [/loyal companion|\bcompanion|\bpet\b/, 'Pet', ['Unique', 'Special', 'Relic']], [/exotic curiosity|\baccessory/, 'Accessory', ['Unique', 'Special', 'Relic']],
      [/worthy weapon|melee weapon|ranged weapon|\bweapon/, 'Weapon', ['Unique', 'Special', 'Relic']], [/\barmor/, 'Armor', ['Unique', 'Special']],
      [/\btool/, 'Tool', ['Unique', 'Special', 'Relic']], [/\bfood/, 'Food', ['Unique', 'Special', 'Relic']],
      [/\bmineral|special rock|\brock\b/, 'Mineral', ['Unique', 'Special', 'Relic']], [/\bbomb/, 'Bomb', ['Unique', 'Special', 'Relic']], [/\bbargain/, 'Bargain', ['Unique', 'Special', 'Relic']]
    ];
    const rule = typeRules.find(([pattern]) => pattern.test(lower));
    return rule ? lookup.dynamic(rule[1], (item) => item.types.includes(rule[1]) && excludes(item, rule[2]) && allowedHero(item, generator)) : null;
  }
  function probabilityBefore(text, index, assumptions) {
    const context = text.slice(Math.max(0, index - 110), index); const percentages = [...context.matchAll(/(\d+(?:\.\d+)?)%/g)]; const decimals = [...context.matchAll(/\b(0\.\d+) chance/gi)];
    let probability = percentages.length ? number(percentages.at(-1)[1]) / 100 : decimals.length ? number(decimals.at(-1)[1]) : 1;
    if (/per Star/i.test(context)) probability *= assumptions.starCount; if (/per empty (?:bag )?slot/i.test(context)) probability *= assumptions.emptySlots; return Math.min(1, probability);
  }
  function summarizePool(pool, probability, quantity) {
    if (!pool?.candidates?.length) return null; const ranked = pool.candidates.filter((item) => RARITY_ORDER[item.rarity]); const minimumRank = ranked.length ? Math.min(...ranked.map((item) => RARITY_ORDER[item.rarity])) : null;
    const lowest = minimumRank ? ranked.filter((item) => RARITY_ORDER[item.rarity] === minimumRank) : []; const lowestAverageSale = average(lowest.map((item) => item.salePrice));
    return { ...pool, probability, quantity, lowestRarity: lowest[0]?.rarity || null, lowestCandidates: lowest, lowestAverageSale: round(lowestAverageSale), baseGold: Number.isFinite(lowestAverageSale) ? round(lowestAverageSale * probability * quantity) : null };
  }
  function generatedPools(effect, generator, lookup, assumptions) {
    const results = []; const patterns = [/\b(?:Get|Catch|Collect|Brings you|Find)\s+(?:an?\s+|you\s+)?(\d+)?(?:-(\d+))?\s*([^.;|]+)/gi, /\bWish for\s+(?:an?\s+)?([^.;|]+)/gi];
    for (const pattern of patterns) for (const match of effect.matchAll(pattern)) {
      const isWish = /^Wish/i.test(match[0]); const minimum = isWish ? 1 : number(match[1], 1); const maximum = isWish ? 1 : number(match[2], minimum); const descriptor = isWish ? match[1] : match[3];
      if (/free reroll/i.test(descriptor)) continue; const pool = resolveDescriptor(descriptor, generator, lookup); if (!pool) continue;
      const summary = summarizePool(pool, probabilityBefore(effect, match.index, assumptions), (minimum + maximum) / 2); if (summary) results.push(summary);
    }
    for (const match of effect.matchAll(/Go (Fishing|Mining) \((Shallow|Deep|Abyssal|Surface|Underground|Core)\)/gi)) {
      const pool = poolFromKey(`${match[1].toLowerCase()}${match[2]}`, lookup); const summary = summarizePool(pool, probabilityBefore(effect, match.index, assumptions), 1); if (summary) results.push(summary);
    }
    return results;
  }
  function buildEconomyItems(catalog, combat, inputAssumptions = {}) {
    const assumptions = normalizeAssumptions(inputAssumptions); const lookup = createLookup(catalog, combat);
    return (catalog.items || []).flatMap((item) => {
      const stats = combat.items?.[item.id]; if (!isEconomyItem(item, stats)) return []; const effect = (stats.effects || []).join(' ');
      const directGold = DIRECT_GOLD[item.id]?.(assumptions) ?? null; const pools = generatedPools(effect, item, lookup, assumptions); const poolBase = pools.reduce((sum, pool) => sum + (pool.baseGold || 0), 0);
      const hasBase = Number.isFinite(directGold) || pools.some((pool) => Number.isFinite(pool.baseGold)); const baseGold = hasBase ? round((directGold || 0) + poolBase) : null; const price = number(stats.price, null);
      return [{ id: item.id, name: item.name, hero: item.hero || 'shared', rarity: item.rarity, image: item.image, types: item.types || [], price, salePrice: salePrice(price), effect,
        expectedGold: baseGold, baseGold, displayGold: Number.isFinite(baseGold) ? `${baseGold}${pools.length ? '+a' : ''}` : '?', directGold: round(directGold), pools,
        paybackRounds: baseGold > 0 ? round(price / baseGold, 1) : null, category: DIRECT_GOLD_IDS.has(item.id) ? (pools.length ? 'hybrid' : 'gold') : 'item', quality: pools.length ? 'lower-bound' : Number.isFinite(directGold) ? 'exact' : 'unknown',
        formula: [Number.isFinite(directGold) ? `직접 Gold ${round(directGold)}` : '', ...pools.map((pool) => `${round(pool.probability * 100, 1)}% × ${pool.quantity}개 × 최저 등급 평균 판매가 ${pool.lowestAverageSale ?? '?'}`)].filter(Boolean).join(' + ') || '공개된 생성 풀을 찾지 못함', sourceUrl: stats.sourceUrl || item.source?.url || '' }];
    });
  }
  root.BB_ECON_CORE = { buildEconomyItems, isEconomyItem, salePrice, normalizeAssumptions, DIRECT_GOLD_IDS, RARITY_ORDER };
})(typeof globalThis !== 'undefined' ? globalThis : window);
