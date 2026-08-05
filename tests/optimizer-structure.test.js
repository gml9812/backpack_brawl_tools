'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'optimizer.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'optimizer.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'optimizer-app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [...app.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(ids)].filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
assert.deepEqual(missing, [], `Missing optimizer HTML ids: ${missing.join(', ')}`);
assert.ok(html.indexOf('optimizer-catalog.js') < html.indexOf('optimizer-data.js'));
assert.ok(html.indexOf('optimizer-data.js') < html.indexOf('optimizer-core.js'));
assert.ok(html.indexOf('optimizer-core.js') < html.indexOf('optimizer-solver.js'));
assert.ok(html.indexOf('optimizer-solver.js') < html.indexOf('optimizer-app.js'));
assert.equal(/<(script|link|img)[^>]+(?:src|href)="https?:/i.test(html), false, 'optimizer HTML must not load remote assets');
assert.equal(/url\(["']?https?:/i.test(css), false, 'optimizer CSS must not load remote assets');
assert.match(html, /href="index\.html"/);
assert.match(index, /href="optimizer\.html"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /role="alert"/);
assert.match(app, /appendFootprint\(button, placement\)/);
assert.match(css, /\.placed-item-cell\.is-edge-top/);
assert.match(css, /\.placed-item\.is-source \{ --footprint-border:/);
console.log('optimizer-structure.test.js passed');
