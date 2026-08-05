'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
require(path.resolve(__dirname, '..', 'optimizer-catalog.js'));
require(path.resolve(__dirname, '..', 'optimizer-data.js'));
const solver = require('../optimizer-solver.js');
const data = global.BB_OPTIMIZER_DATA;

const ids = ['apple', 'banana', 'mana-strudel', 'brown-rat', 'pet-collar', 'iron-bar', 'wooden-sword', 'simple-quiver'];
const input = {
  instances: ids.map((itemId) => ({ itemId })), items: data.items, board: data.board,
  options: { timeLimitMs: 1200, seed: 'performance-fixture', restarts: 3, transpositionCap: 25000 }
};
const started = Date.now();
const first = solver.solve(input);
const elapsed = Date.now() - started;
assert.ok(first.layout.length === ids.length, 'representative input must return a feasible layout');
assert.ok(['optimal', 'best-found'].includes(first.status));
assert.ok(elapsed < 5000, `performance fixture took ${elapsed}ms`);
assert.ok(first.transpositionEntries <= 25000);

const deterministicFixture = { ...input, options: { ...input.options, timeLimitMs: 1, restarts: 1 } };
const a = solver.solve(deterministicFixture);
const b = solver.solve(deterministicFixture);
assert.deepEqual(a.layout.map((placement) => placement.canonicalKey), b.layout.map((placement) => placement.canonicalKey));
console.log('optimizer-performance.test.js passed');
