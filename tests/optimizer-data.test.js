'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
require(path.join(root, 'optimizer-core.js'));
require(path.join(root, 'optimizer-catalog.js'));
require(path.join(root, 'optimizer-data.js'));
const data = global.BB_OPTIMIZER_DATA;
const core = global.BBOptimizerCore;

assert.equal(data.schemaVersion, 1);
assert.equal(data.version, '6.0.1');
assert.match(data.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
assert.deepEqual(data.board, { columns: 9, rows: 6 });
assert.equal(data.items.length, 940, 'The current board-item catalog must be complete');
assert.equal(data.catalog.selectable, 889);
assert.equal(data.catalog.reviewRequired, 51);
assert.equal(new Set(data.items.map((item) => item.id)).size, data.items.length);
assert.equal(new Set(data.items.map((item) => item.name)).size, data.items.length);

for (const item of data.items) {
  for (const field of ['id', 'name', 'hero', 'rarity', 'types', 'image', 'footprint', 'rotations', 'starGroups', 'dataStatus', 'source']) {
    assert.notEqual(item[field], undefined, `${item.id} missing ${field}`);
  }
  assert.ok(fs.existsSync(path.join(root, item.image)), `Missing local image: ${item.image}`);
  if (item.footprint.length) {
    assert.equal(new Set(item.footprint.map(String)).size, item.footprint.length, `${item.id} footprint duplicates`);
    assert.equal(Math.min(...item.footprint.map((point) => point[0])), 0, `${item.id} footprint x not normalized`);
    assert.equal(Math.min(...item.footprint.map((point) => point[1])), 0, `${item.id} footprint y not normalized`);
  } else {
    assert.equal(item.selectable, false, `${item.id} cannot be selectable without a footprint`);
    assert.ok(item.unsupportedReason, `${item.id} missing unsupported reason`);
  }
  item.types.forEach((type) => assert.ok(data.types.includes(type), `${item.id} invalid type ${type}`));
  assert.equal(new Set(item.starGroups.map((group) => group.id)).size, item.starGroups.length, `${item.id} duplicate group id`);
  item.starGroups.forEach((group) => {
    assert.equal(new Set(group.offsets.map(String)).size, group.offsets.length, `${item.id}/${group.id} duplicate Star`);
    assert.ok(group.target && typeof group.target === 'object', `${item.id}/${group.id} missing target condition`);
  });
  if (item.footprint.length) core.uniqueRotations(item).forEach((rotation) => assert.equal(rotation.footprint.length, item.footprint.length));
  if (item.selectable) assert.ok(['verified', 'generated'].includes(item.dataStatus), `${item.id} invalid selectable status`);
}

const bag = data.items.find((item) => item.id === 'armor-pack');
assert.equal(bag.selectable, false);
assert.match(bag.unsupportedReason, /Bag/);
assert.match(bag.unsupportedReason, /9×6/);
console.log('optimizer-data.test.js passed');
