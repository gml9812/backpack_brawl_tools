'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'simulator.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'simulator-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'simulator.css'), 'utf8');
const optimizer = fs.readFileSync(path.join(root, 'optimizer.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const ids = [...app.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(ids)].filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
assert.deepEqual(missing, [], `Missing simulator HTML ids: ${missing.join(', ')}`);
assert.match(index, /href="simulator\.html"/);
assert.match(optimizer, /href="simulator\.html"/);
assert.match(html, /href="simulator\.html" aria-current="page"/);
assert.ok(html.indexOf('optimizer-storage.js') < html.indexOf('simulator-app.js'));
assert.ok(html.indexOf('optimizer-combat.js') < html.indexOf('simulator-app.js'));
assert.match(optimizer, /class="combat-simulator"[^>]+hidden/);
assert.match(optimizer, /class="saved-layouts"[^>]+hidden/);
assert.ok(app.includes('storageApi.read(globalThis.localStorage)'));
assert.ok(app.includes('storageApi.save(globalThis.localStorage, updated)'));
assert.ok(app.includes("button.addEventListener('pointerdown'"));
assert.ok(app.includes('core.buildPlacementAt('));
assert.ok(app.includes('combatSimulator.simulate({'));
assert.ok(css.includes('.simulator-layout'));
console.log('simulator-structure.test.js passed');
