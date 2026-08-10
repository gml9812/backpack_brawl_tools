'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../optimizer-core.js');
const solver = require('../optimizer-solver.js');

const root = path.resolve(__dirname, '..');
require(path.join(root, 'optimizer-catalog.js'));
require(path.join(root, 'optimizer-data.js'));
const data = global.BB_OPTIMIZER_DATA;

const instances = [
  ...Array.from({ length: 6 }, () => ({ itemId: 'leather-belt' })),
  ...Array.from({ length: 4 }, () => ({ itemId: 'berserker-potion' }))
];
const prepared = solver.prepare(instances, data.items, data.board);
const upperBound = solver.scoreUpperBound(prepared.prepared, prepared.itemById);
assert.deepEqual(upperBound, {
  validConnections: 12,
  activeGroups: 6,
  contributingTargets: 4
});

const result = solver.solve({
  instances,
  items: data.items,
  board: data.board,
  options: {
    timeLimitMs: 5000,
    seed: instances.map((entry) => entry.itemId).join('|'),
    restarts: 5,
    transpositionCap: 80000
  }
});

assert.equal(result.status, 'optimal');
assert.equal(result.proof, 'score-upper-bound');
assert.deepEqual(result.score, upperBound);
assert.equal(result.evaluation.connections.length, 12);
assert.equal(result.layout.length, 10);

let occupied = 0n;
for (const placement of result.layout) {
  assert.equal(core.masksOverlap(occupied, placement.occupancyMask), false, placement.instanceId);
  occupied |= placement.occupancyMask;
}

const aliasIds = ['dragonleaf-sapling', 'dragonleaf-sapling', 'dragonflower', 'dragonflower'];
const aliasInstances = aliasIds.map((itemId, index) => ({ itemId, instanceId: `${itemId}#${index + 1}` }));
const aliasPrepared = solver.prepare(aliasInstances, data.items, data.board);
assert.deepEqual(solver.scoreUpperBound(aliasPrepared.prepared, aliasPrepared.itemById), { validConnections: 8, activeGroups: 2, contributingTargets: 4 });
const aliasResult = solver.solve({ instances: aliasInstances, items: data.items, board: data.board, options: { timeLimitMs: 1000, seed: 'counts-as-regression', restarts: 3 } });
assert.equal(aliasResult.status, 'optimal');
assert.deepEqual(aliasResult.score, { validConnections: 8, activeGroups: 2, contributingTargets: 4 });

console.log('optimizer-regression.test.js passed');
