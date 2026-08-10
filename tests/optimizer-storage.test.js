const assert = require('node:assert/strict');
const path = require('node:path');
const savedLayouts = require(path.join(__dirname, '..', 'optimizer-storage.js'));

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

const storage = fakeStorage();
const record = {
  id: 'layout-1', name: '  My   layout  ', createdAt: '2026-08-07T00:00:00.000Z', dataVersion: '6.0.1',
  board: { columns: 5, rows: 6 }, quality: 'standard', items: [{ id: 'rock', count: 1 }],
  layout: [{ instanceId: 'rock#1', itemId: 'rock', x: 2, y: 3, rotation: 90 }],
  score: { validConnections: 2, activeGroups: 1, contributingTargets: 1 }
};

savedLayouts.save(storage, record);
let stored = savedLayouts.read(storage);
assert.equal(stored.length, 1);
assert.equal(stored[0].name, 'My layout');
assert.deepEqual(stored[0].board, { columns: 5, rows: 6 });
assert.deepEqual(stored[0].layout[0], record.layout[0]);

savedLayouts.save(storage, { ...record, name: 'Updated' });
stored = savedLayouts.read(storage);
assert.equal(stored.length, 1);
assert.equal(stored[0].name, 'Updated');

savedLayouts.remove(storage, 'layout-1');
assert.deepEqual(savedLayouts.read(storage), []);

storage.setItem(savedLayouts.KEY, '{broken');
assert.deepEqual(savedLayouts.read(storage), []);
console.log('optimizer-storage.test.js passed');
