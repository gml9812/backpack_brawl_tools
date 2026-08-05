'use strict';

require('../data.js');
require('../calculator.js');

const target = globalThis.BB_DATA.items.find((item) => item.name === 'Lucky Clover');
const input = {
  target,
  items: globalThis.BB_DATA.items.map((item) => ({ ...item })),
  hero: 'any',
  round: 1,
  rerolls: 100,
  openSlots: 5,
  upgradeChance: 30,
  downgradeChance: 0,
  bagPity: 0,
  seenCount: 0,
  repeatMultiplier: .75,
  targetBoost: 0,
  saleOnly: false,
  saleChance: 15,
  paidRerolls: 0,
  freeRerolls: 0
};

const start = Date.now();
const result = globalThis.BBCalculator.calculate(input, globalThis.BB_DATA);
const elapsedMs = Date.now() - start;
if (result.runs !== 100000) throw new Error(`Expected 100000 runs, received ${result.runs}`);
if (elapsedMs > 15000) throw new Error(`Simulation took ${elapsedMs}ms`);
console.log(`performance test passed (${elapsedMs}ms)`);
