'use strict';

const assert = require('node:assert/strict');
const solver = require('../optimizer-solver.js');

const source = {
  id: 'source', name: 'Source', hero: 'shared', rarity: 'Common', types: ['Accessory'], image: 'x',
  footprint: [[0, 0]], rotations: [0, 90, 180, 270], selectable: true,
  starGroups: [{ id: 'g', label: 'Target', offsets: [[1, 0]], target: { anyTypes: ['Target'] } }]
};
const target = {
  id: 'target', name: 'Target', hero: 'shared', rarity: 'Common', types: ['Target'], image: 'x',
  footprint: [[0, 0]], rotations: [0, 90, 180, 270], selectable: true, starGroups: []
};

const fixture = { instances: [{ itemId: 'source' }, { itemId: 'target' }], items: [source, target], board: { columns: 2, rows: 2 } };
const brute = solver.bruteForce(fixture);
const optimized = solver.solve({ ...fixture, options: { timeLimitMs: 0, seed: 'test' } });
assert.equal(brute.status, 'optimal');
assert.equal(optimized.status, 'optimal');
assert.deepEqual(optimized.score, brute.score);
assert.equal(optimized.score.validConnections, 1);

const tooLarge = solver.solve({
  instances: [{ itemId: 'big' }, { itemId: 'big' }],
  items: [{ ...target, id: 'big', footprint: [[0, 0], [1, 0], [0, 1]] }],
  board: { columns: 2, rows: 2 }, options: { timeLimitMs: 0 }
});
assert.equal(tooLarge.status, 'area-exceeded');

const square = { ...target, id: 'square', footprint: [[0, 0], [1, 0], [0, 1], [1, 1]] };
const impossible = solver.solve({
  instances: [{ itemId: 'square' }, { itemId: 'square' }], items: [square],
  board: { columns: 3, rows: 3 }, options: { timeLimitMs: 0, skipGreedy: true }
});
assert.equal(impossible.status, 'no-feasible-arrangement');

const duplicates = solver.solve({
  instances: [{ itemId: 'target' }, { itemId: 'target' }, { itemId: 'target' }], items: [target],
  board: { columns: 2, rows: 2 }, options: { timeLimitMs: 0 }
});
assert.equal(duplicates.status, 'optimal');
assert.equal(duplicates.layout.length, 3);
assert.equal(new Set(duplicates.layout.map((placement) => placement.instanceId)).size, 3);

const manyItems = Array.from({ length: 7 }, (_, index) => ({ itemId: `i${index}` }));
const manyDefinitions = manyItems.map((entry) => ({ ...target, id: entry.itemId }));
const timed = solver.solve({
  instances: manyItems, items: manyDefinitions, board: { columns: 6, rows: 9 },
  options: { timeLimitMs: 2, seed: 'timeout', restarts: 1 }
});
assert.equal(timed.status, 'best-found');
assert.equal(timed.layout.length, 7);

let cancelled = false;
const cancelledResult = solver.solve({
  ...fixture,
  options: { timeLimitMs: 0, isCancelled: () => { if (cancelled) return true; cancelled = true; return false; } }
});
assert.ok(['cancelled', 'optimal'].includes(cancelledResult.status));
console.log('optimizer-solver.test.js passed');
