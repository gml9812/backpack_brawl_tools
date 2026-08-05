'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const core = require('../optimizer-core.js');
const solver = require('../optimizer-solver.js');
require(path.join(root, 'optimizer-catalog.js'));
require(path.join(root, 'optimizer-data.js'));
const data = global.BB_OPTIMIZER_DATA;

const html = fs.readFileSync(path.join(root, 'optimizer.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'optimizer.css'), 'utf8');
assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
assert.match(css, /@media \(max-width: 560px\)/);
assert.match(css, /\.optimizer-board \{ width: 100%;/);
assert.match(css, /aspect-ratio: var\(--board-columns\) \/ var\(--board-rows\)/);
assert.match(html, /aria-label="9열 6행 최적 배치 보드"/);
assert.match(css, /\.optimizer-layout \{ grid-template-columns: 1fr;/);
assert.match(css, /min-height: 44px/);

const ids = ['apple', 'banana', 'brown-rat', 'iron-bar', 'pet-collar', 'wooden-sword', 'simple-quiver'];
const result = solver.solve({
  instances: ids.map((itemId) => ({ itemId })),
  items: data.items,
  board: data.board,
  options: { timeLimitMs: 700, restarts: 3, seed: 'integration' }
});
assert.ok(['optimal', 'best-found'].includes(result.status));
assert.equal(result.layout.length, ids.length);
assert.equal(new Set(result.layout.map((placement) => placement.instanceId)).size, ids.length);
let occupied = 0n;
for (const placement of result.layout) {
  assert.equal(core.masksOverlap(occupied, placement.occupancyMask), false, `${placement.instanceId} overlaps`);
  occupied |= placement.occupancyMask;
  for (const [dx, dy] of placement.footprint) {
    assert.ok(placement.x + dx >= 0 && placement.x + dx < data.board.columns);
    assert.ok(placement.y + dy >= 0 && placement.y + dy < data.board.rows);
  }
}
assert.equal(result.evaluation.connections.length, result.score.validConnections);
console.log('optimizer-integration.test.js passed');
