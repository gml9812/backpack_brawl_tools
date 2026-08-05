'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8') + fs.readFileSync(path.join(root, 'app-v2.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

const htmlIds = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
const appIds = new Set(Array.from(app.matchAll(/\$\('([^']+)'\)/g), (match) => match[1]));
const missingIds = Array.from(appIds).filter((id) => !htmlIds.has(id));
assert.deepEqual(missingIds, [], `Missing HTML ids: ${missingIds.join(', ')}`);

assert.ok(html.indexOf('data.js') < html.indexOf('catalog.js'));
assert.ok(html.indexOf('catalog.js') < html.indexOf('calculator.js'));
assert.ok(html.indexOf('calculator.js') < html.indexOf('app.js'));
assert.equal(/<(script|link|img)[^>]+(?:src|href)="https?:/i.test(html), false, 'HTML must not load remote assets');
assert.equal(/url\(["']?https?:/i.test(css), false, 'CSS must not load remote assets');

const dataContext = { globalThis: null };
dataContext.globalThis = dataContext;
vm.createContext(dataContext);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), dataContext);
const data = dataContext.BB_DATA;
assert.equal(data.version, '6.0.1');
assert.equal(data.roundOdds.length, 20);
assert.equal(data.items.length, 274);
assert.equal(new Set(data.items.map((item) => item.id)).size, data.items.length);
for (const item of data.items) {
  assert.ok(data.rarities.includes(item.rarity), `${item.name} has invalid rarity`);
  assert.ok(fs.existsSync(path.join(root, item.image)), `Missing image: ${item.image}`);
}

console.log('structure tests passed');
