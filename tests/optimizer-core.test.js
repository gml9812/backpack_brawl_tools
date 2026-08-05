'use strict';

const assert = require('node:assert/strict');
const core = require('../optimizer-core.js');

const one = { footprint: [[0, 0]], rotations: [0, 90, 180, 270], starGroups: [] };
assert.equal(core.uniqueRotations(one).length, 1);

const domino = { footprint: [[0, 0], [0, 1]], rotations: [0, 90, 180, 270], starGroups: [] };
assert.equal(core.uniqueRotations(domino).length, 2);
assert.deepEqual(core.rotateDefinition(domino, 90).footprint, [[0, 0], [1, 0]]);

const lShape = { footprint: [[0, 0], [0, 1], [1, 1]], rotations: [0, 90, 180, 270], starGroups: [] };
assert.equal(core.uniqueRotations(lShape).length, 4);

const withStar = {
  footprint: [[0, 0], [0, 1]], rotations: [0, 90, 180, 270],
  starGroups: [{ id: 'g', label: 'g', offsets: [[-1, 0]], target: { any: true } }]
};
const rotated = core.rotateDefinition(withStar, 90);
assert.deepEqual(rotated.footprint, [[0, 0], [1, 0]]);
assert.deepEqual(rotated.starGroups[0].offsets, [[1, -1]]);
assert.deepEqual(core.rotateDefinition(withStar, 360).footprint, withStar.footprint);

const board = { columns: 3, rows: 3 };
assert.equal(core.cellIndex(2, 2, board), 8);
assert.equal(core.cellMask(2, 2, board), 256n);
assert.equal(core.pointsToMask([[0, 0], [1, 0]], board, 1, 1), (1n << 4n) | (1n << 5n));
assert.equal(core.pointsToMask([[0, 0], [1, 0]], board, 2, 1), null);
assert.equal(core.masksOverlap(3n, 2n), true);
assert.equal(core.masksOverlap(1n, 2n), false);

function placed(instanceId, itemId, occupancyMask, starMask, group) {
  return {
    instanceId, itemId, x: 0, y: 0, rotation: 0, footprint: [[0, 0]], width: 1, height: 1,
    occupancyMask, starGroups: group ? [group] : [], starMasksByGroup: group ? [starMask] : []
  };
}

const group = { id: 'food', label: 'Food', offsets: [[1, 0]], target: { anyTypes: ['Food'] } };
const items = {
  source: { id: 'source', types: ['Accessory'] }, food: { id: 'food', types: ['Food'] }, weapon: { id: 'weapon', types: ['Weapon'] }
};
let evaluation = core.evaluateLayout([
  placed('source#1', 'source', 1n, 2n, group), placed('food#1', 'food', 2n, 0n)
], items);
assert.equal(evaluation.score.validConnections, 1);
evaluation = core.evaluateLayout([
  placed('source#1', 'source', 1n, 2n, group), placed('weapon#1', 'weapon', 2n, 0n)
], items);
assert.equal(evaluation.score.validConnections, 0);

const wideGroup = { id: 'food', label: 'Food', offsets: [[1, 0], [2, 0]], target: { anyTypes: ['Food'] } };
evaluation = core.evaluateLayout([
  placed('source#1', 'source', 1n, 6n, wideGroup),
  { ...placed('food#1', 'food', 6n, 0n), footprint: [[0, 0], [1, 0]] }
], items);
assert.equal(evaluation.score.validConnections, 1, 'same target on multiple group Stars counts once');

assert.equal(core.targetMatches(items.source, items.food, { anyTypes: ['Food'], allTypes: ['Food'], excludedTypes: ['Pet'] }), true);
assert.equal(core.targetMatches(items.source, items.food, { excludedItemIds: ['food'], any: true }), false);

const solutionA = { score: { validConnections: 2, activeGroups: 1, contributingTargets: 1 }, layout: [placed('a', 'source', 1n, 0n)] };
const solutionB = { score: { validConnections: 1, activeGroups: 9, contributingTargets: 9 }, layout: [placed('b', 'source', 1n, 0n)] };
assert.equal(core.compareSolutions(solutionA, solutionB), 1);
console.log('optimizer-core.test.js passed');
