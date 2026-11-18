'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('battle.html');
const app = read('battle-app.js');
const css = read('battle.css');
const worker = read('battle-worker.js');

const ids = [...new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]))];
assert.ok(ids.length > 15);
const missing = ids.filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
assert.deepEqual(missing, [], `Missing battle HTML ids: ${missing.join(', ')}`);

const order = ['battle-rng.js', 'battle-heroes.js', 'battle-items.js', 'battle-engine.js', 'battle-core.js', 'battle-example.js', 'battle-app.js'];
for (let index = 1; index < order.length; index += 1) {
  assert.ok(html.indexOf(order[index - 1]) > 0 && html.indexOf(order[index - 1]) < html.indexOf(order[index]), `${order[index - 1]} must load before ${order[index]}`);
}
assert.match(worker, /importScripts\('battle-rng\.js', 'battle-heroes\.js', 'battle-items\.js', 'battle-engine\.js', 'battle-core\.js'\)/);
assert.ok(app.includes("new Worker('battle-worker.js')"));
assert.ok(app.includes('runOnMainThread(run)'), 'Worker를 쓸 수 없는 file:// 환경의 대체 경로가 필요하다');

assert.equal(/<(script|link|img)[^>]+(?:src|href)="https?:/i.test(html), false, 'battle HTML must not load remote assets');
assert.equal(/url\(["']?https?:/i.test(css), false, 'battle CSS must not load remote assets');
assert.match(html, /href="battle\.html" aria-current="page"/);
assert.match(html, /id="battleProgress"[^>]+aria-live="polite"/);
assert.match(html, /id="battleError"[^>]+role="alert"/);
for (const page of ['index.html', 'optimizer.html', 'simulator.html', 'econ.html', 'econ-legacy.html']) {
  assert.match(read(page), /<a href="battle\.html">Battle Sim<\/a>/, `${page} needs the Battle Sim link`);
}

// 공개 배포되므로 예시와 로그에는 플레이어 닉네임 대신 영웅 이름만 쓴다.
const example = require('../battle-example.js');
for (const side of example.sides) assert.equal(side.name, side.hero, 'example side names must stay anonymized');
const logNames = new Set([...read('tests/fixtures/battle-round22.log.txt').matchAll(/^[^\t\r\n]*\t\[([^\]]+)\]\t/gm)].map((match) => match[1]));
assert.deepEqual([...logNames].sort(), ['Harkon', 'Nymphedora'], 'log fixture side names must stay anonymized');

console.log('battle-structure.test.js passed');
