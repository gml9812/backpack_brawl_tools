'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const context = { console, Math, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'calculator.js'), 'utf8'), context);

const engine = context.BBCalculator;
const rarities = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const baseData = {
  rarities,
  roundOdds: [[100, 0, 0, 0, 0]],
  mechanics: { shopSlots: 5, bagPityAt: 11, baseSaleChance: 15, simulationRuns: 10000 }
};

function item(id, rarity, bag = false) {
  return { id, name: id, rarity, hero: 'shared', bag, status: 'available', weight: 1 };
}

function input(target, items, overrides = {}) {
  return {
    target, items, hero: 'any', round: 1, rerolls: 1, openSlots: 1,
    upgradeChance: 0, downgradeChance: 0, bagPity: 0, seenCount: 0,
    repeatMultiplier: .75, targetBoost: 0, saleOnly: false, saleChance: 15,
    paidRerolls: 0, freeRerolls: 0, ...overrides
  };
}

assert.deepEqual(Array.from(engine.rerollCosts(12, 0, 0)), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3]);
assert.deepEqual(Array.from(engine.rerollCosts(4, 4, 2)), [0, 0, 1, 2]);

{
  const target = item('A', 'Common');
  const result = engine.calculate(input(target, [target, item('B', 'Common')]), baseData);
  assert.equal(result.method, 'exact');
  assert.ok(Math.abs(result.slotProbability - .5) < 1e-12);
  assert.ok(Math.abs(result.cumulativeProbability - .5) < 1e-12);
}

{
  const target = item('A', 'Common');
  const result = engine.calculate(input(target, [target, item('B', 'Common')], { openSlots: 5, rerolls: 2 }), {
    ...baseData, mechanics: { ...baseData.mechanics, bagPityAt: 999 }
  });
  assert.ok(Math.abs(result.cumulativeProbability - (1 - Math.pow(.5, 10))) < 1e-12);
}

{
  const target = item('A', 'Common');
  const result = engine.calculate(input(target, [target, item('B', 'Common')], { saleOnly: true, saleChance: 20 }), baseData);
  assert.ok(Math.abs(result.slotProbability - .1) < 1e-12);
}

{
  const target = item('A', 'Common');
  const result = engine.calculate(input(target, [target, item('B', 'Common')], { seenCount: 1, repeatMultiplier: .5 }), baseData);
  assert.ok(Math.abs(result.slotProbability - (1 / 3)) < 1e-12);
  assert.equal(result.method, 'estimated-analytic');
}

{
  const target = item('Bag', 'Common', true);
  const result = engine.calculate(input(target, [target, item('Other', 'Common')], { bagPity: 10 }), baseData, () => .99);
  assert.equal(result.method, 'estimated-simulation');
  assert.equal(result.cumulativeProbability, 1);
}

{
  const target = item('Rare target', 'Rare');
  const result = engine.calculate(input(target, [item('Common item', 'Common'), target], { upgradeChance: 100 }), baseData, () => .5);
  assert.equal(result.cumulativeProbability, 1);
}

{
  const target = item('Hero item', 'Common');
  target.hero = 'ronan';
  const result = engine.calculate(input(target, [target], { hero: 'chana' }), baseData);
  assert.equal(result.method, 'unavailable');
  assert.equal(result.cumulativeProbability, 0);
}

console.log('calculator tests passed');
