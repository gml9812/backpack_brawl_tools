import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText, validateOfficialItems } from '../scripts/official-item-library-parser.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const snapshot = JSON.parse(await fs.readFile(path.join(root, 'raw', 'official-item-library.json'), 'utf8'));
const validation = validateOfficialItems(snapshot.items);
assert.equal(validation.itemCount, 1065);
assert.equal(validation.boardItemCount, 995);
assert.equal(new Set(snapshot.items.map((item) => item.id)).size, snapshot.items.length);

const goldenSkull = snapshot.items.find((item) => item.id === 'golden-skull');
assert.equal(goldenSkull.price, '13');
assert.deepEqual(goldenSkull.types, ['Skull', 'Accessory']);
assert.match(goldenSkull.effect, /On shop entered:[\s\S]*Gain 0-3 Gold/);
assert.deepEqual(goldenSkull.footprint, [[0, 0]]);

const woodenSword = snapshot.items.find((item) => item.id === 'wooden-sword');
assert.ok(woodenSword.baseStats.some((stat) => stat.label === 'Damage' && /^3.4$/.test(stat.value)));
assert.equal(htmlToText('<p>Gain <span class="game-icon-wrap" data-tip="Gold"><img alt="Gold"></span></p>'), 'Gain Gold');
console.log('official-item-library-parser.test.mjs passed');
