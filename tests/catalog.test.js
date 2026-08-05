'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const context = { console, Math, globalThis: null, Set };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'catalog.js'), 'utf8'), context);

const engine = context.BBCatalogCalculator;
const rarities = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const data = {
  rarities,
  roundOdds: [[100, 0, 0, 0, 0]],
  mechanics: { shopSlots: 5, bagPityAt: 11, baseSaleChance: 15, simulationRuns: 10000 }
};
const item = (id, rarity, bag = false) => ({ id, name: id, rarity, hero: 'shared', bag, status: 'available', weight: 1 });
const base = (items, overrides = {}) => ({
  items, hero: 'any', round: 1, openSlots: 1, bagPity: 0,
  upgradeChance: 0, downgradeChance: 0, saleOnly: false, saleChance: 15,
  ...overrides
});

{
  const a = item('A', 'Common');
  const b = item('B', 'Common');
  const result = engine.calculate(base([a, b]), data);
  assert.equal(result.method, 'exact');
  assert.equal(result.items.find((entry) => entry.id === 'A').slotProbability, .5);
}

{
  const a = item('A', 'Common');
  const b = item('B', 'Common');
  const result = engine.calculate(base([a, b], { openSlots: 5 }), data);
  assert.ok(Math.abs(result.items.find((entry) => entry.id === 'A').shopProbability - (1 - Math.pow(.5, 5))) < 1e-12);
}

{
  const common = item('Common', 'Common');
  const rare = item('Rare', 'Rare');
  const result = engine.calculate(base([common, rare], { upgradeChance: 100 }), data, () => .5);
  assert.equal(result.method, 'estimated-simulation');
  assert.equal(result.items.find((entry) => entry.id === 'Rare').shopProbability, 1);
}

{
  const bag = item('Bag', 'Common', true);
  const other = item('Other', 'Common');
  const result = engine.calculate(base([bag, other], { bagPity: 10 }), data, () => .99);
  assert.equal(result.items.find((entry) => entry.id === 'Bag').shopProbability, 1);
}

console.log('catalog tests passed');
