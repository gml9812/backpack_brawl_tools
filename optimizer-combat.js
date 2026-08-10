(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BB_COMBAT_SIMULATOR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

  function numeric(value) {
    const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function percent(value) { return clamp(numeric(value) / 100, 0, 1); }

  function damageRange(value) {
    const values = String(value ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!values.length) return null;
    return { minimum: values[0], maximum: values[1] ?? values[0] };
  }

  function statsFor(item) {
    return Object.fromEntries((item.combat?.baseStats || []).map((stat) => [stat.label.toLowerCase(), stat.value]));
  }

  function addMetric(target, label, amount) {
    if (!label || !Number.isFinite(amount) || amount === 0) return;
    target[label] = round((target[label] || 0) + amount);
  }

  function triggerCount(clause, context) {
    const periodic = clause.match(/Every\s+(\d+(?:\.\d+)?)\s+seconds?/i);
    let count = periodic ? Math.floor(context.duration / Number(periodic[1])) : 0;
    if (/^On hit\b/i.test(clause)) count = context.expectedHits;
    else if (/^On critical hit\b/i.test(clause)) count = context.expectedCrits;
    else if (/^Start of (?:combat|Dawn|battle)\b/i.test(clause)) count = 1;
    else if (!periodic) return 0;
    const chance = clause.match(/(\d+(?:\.\d+)?)% chance/i);
    return count * (chance ? Number(chance[1]) / 100 : 1);
  }

  function starMultiplier(clause, activeStarTargets) {
    return /\bper Star\b/i.test(clause) ? activeStarTargets : 1;
  }

  function parseTriggeredEffects(effect, context, result) {
    const clauses = String(effect).split(/\.\s+(?=[A-Z+])/).map((part) => part.trim()).filter(Boolean);
    let inheritedTrigger = '';
    clauses.forEach((clause) => {
      const trigger = clause.match(/^(On hit|On critical hit|Start of (?:combat|Dawn|battle)|Every\s+\d+(?:\.\d+)?\s+seconds?)\b/i);
      if (trigger) inheritedTrigger = trigger[0];
      const triggeredClause = trigger || !inheritedTrigger ? clause : inheritedTrigger + ': ' + clause;
      if (/Details unavailable/i.test(clause)) {
        result.unsupportedEffects += 1;
        return;
      }
      const triggers = triggerCount(triggeredClause, context);
      if (!triggers) {
        result.unsupportedEffects += 1;
        return;
      }
      const multiplier = starMultiplier(clause, context.activeStarTargets);
      let recognized = false;
      const directDamage = clause.match(/\bDeal\s+(\d+(?:\.\d+)?)\s+Damage\b/i);
      if (directDamage) {
        result.directDamage += Number(directDamage[1]) * triggers * multiplier;
        recognized = true;
      }
      for (const match of clause.matchAll(/\bGain\s+\+?(\d+(?:\.\d+)?)\s+([A-Z][A-Za-z ]*?)(?=\s+(?:and|per|for|on|when|every|if|to)\b|[.,]|$)/g)) {
        addMetric(result.buffs, match[2].trim(), Number(match[1]) * triggers * multiplier);
        recognized = true;
      }
      for (const match of clause.matchAll(/\bInflict\s+(\d+(?:\.\d+)?)\s+([A-Z][A-Za-z ]*?)(?=\s+(?:and|per|for|on|when|every|if|to)\b|[.,]|$)/g)) {
        addMetric(result.debuffs, match[2].trim(), Number(match[1]) * triggers * multiplier);
        recognized = true;
      }
      for (const match of clause.matchAll(/\band\s+(\d+(?:\.\d+)?)\s+([A-Z][A-Za-z ]*?)(?=\s+(?:and|per|for|on|when|every|if|to)\b|[.,]|$)/g)) {
        const prefix = clause.slice(0, match.index);
        const gainIndex = prefix.lastIndexOf('Gain');
        const inflictIndex = prefix.lastIndexOf('Inflict');
        const target = gainIndex > inflictIndex ? result.buffs : result.debuffs;
        if (Math.max(gainIndex, inflictIndex) >= 0) {
          addMetric(target, match[2].trim(), Number(match[1]) * triggers * multiplier);
          recognized = true;
        }
      }
      if (!recognized) result.unsupportedEffects += 1;
      else result.recognizedEffects += 1;
    });
  }

  function simulate({ layout = [], items = [], evaluation = {}, duration = 10, dummy = {} } = {}) {
    const seconds = clamp(duration, 1, 300);
    const itemById = Object.fromEntries(items.map((item) => [item.id, item]));
    const activeStars = new Map();
    (evaluation.connections || []).forEach((connection) => {
      const targets = activeStars.get(connection.sourceInstanceId) || new Map();
      targets.set(connection.targetInstanceId, Math.max(targets.get(connection.targetInstanceId) || 0, connection.weight || 1));
      activeStars.set(connection.sourceInstanceId, targets);
    });
    const result = {
      duration: seconds, rawDamage: 0, directDamage: 0, damage: 0, dps: 0,
      expectedHits: 0, expectedCrits: 0, buffs: {}, debuffs: {}, contributions: [],
      supportedItems: 0, unsupportedItems: 0, recognizedEffects: 0, unsupportedEffects: 0
    };

    layout.forEach((placement) => {
      const item = itemById[placement.itemId];
      if (!item?.combat) {
        result.unsupportedItems += 1;
        return;
      }
      result.supportedItems += 1;
      const stats = statsFor(item);
      const range = damageRange(stats.damage);
      const cooldown = numeric(stats.cooldown);
      const accuracy = stats.accuracy ? percent(stats.accuracy) : 1;
      const dodge = percent(dummy.dodge || 0);
      const critChance = percent(stats['critical chance'] || 0);
      const critBonus = 1 + percent(stats['critical damage'] || 0);
      const activations = cooldown > 0 ? Math.floor(seconds / cooldown) : 0;
      const expectedHits = activations * accuracy * (1 - dodge);
      const expectedCrits = expectedHits * critChance;
      const baseDamage = range
        ? ((range.minimum + range.maximum) / 2) * expectedHits * (1 + critChance * critBonus)
        : 0;
      const itemResult = { directDamage: 0, buffs: {}, debuffs: {}, recognizedEffects: 0, unsupportedEffects: 0 };
      const context = {
        duration: seconds,
        expectedHits,
        expectedCrits,
        activeStarTargets: [...(activeStars.get(placement.instanceId)?.values() || [])]
          .reduce((sum, weight) => sum + weight, 0)
      };
      (item.combat.effects || []).forEach((effect) => parseTriggeredEffects(effect, context, itemResult));
      result.rawDamage += baseDamage + itemResult.directDamage;
      result.expectedHits += expectedHits;
      result.expectedCrits += expectedCrits;
      result.recognizedEffects += itemResult.recognizedEffects;
      result.unsupportedEffects += itemResult.unsupportedEffects;
      Object.entries(itemResult.buffs).forEach(([label, amount]) => addMetric(result.buffs, label, amount));
      Object.entries(itemResult.debuffs).forEach(([label, amount]) => addMetric(result.debuffs, label, amount));
      if (baseDamage + itemResult.directDamage > 0) {
        result.contributions.push({ instanceId: placement.instanceId, itemId: item.id, name: item.name, damage: round(baseDamage + itemResult.directDamage) });
      }
    });

    const armor = Math.max(0, numeric(dummy.armor || 0));
    const reduction = percent(dummy.reduction || 0);
    result.rawDamage = round(result.rawDamage);
    result.damage = round(Math.max(0, result.rawDamage - armor) * (1 - reduction));
    result.dps = round(result.damage / seconds);
    result.expectedHits = round(result.expectedHits);
    result.expectedCrits = round(result.expectedCrits);
    result.contributions.sort((a, b) => b.damage - a.damage || a.instanceId.localeCompare(b.instanceId));
    return result;
  }

  return { damageRange, numeric, percent, simulate };
});
