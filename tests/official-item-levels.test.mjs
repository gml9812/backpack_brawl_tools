import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLevelSection, parseLevelSection, validateLevelRecords } from '../scripts/official-item-levels-parser.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = async (...parts) => JSON.parse(await fs.readFile(path.join(root, ...parts), 'utf8'));
const library = (await readJson('raw', 'official-item-library.json')).items;
const snapshot = await readJson('raw', 'official-item-levels.json');
const { Combat, LEVEL_UNITS } = require('../battle-engine.js');
const { ITEMS } = require('../battle-items.js');

// 파서
const page = `<main><section class="level-bonus mt-5" data-x><h2 class="a">Level bonus<span class="b">Lv 2–15</span></h2>
<div class="effect-text mt-2"><p><strong>On hit:</strong></p></div>
<details><summary>All 15 levels</summary><ol class="c"><li class="d"><span class="e">Lv 1</span><span>Base item</span></li>
<li class="d"><span class="e">Lv 2</span><span>Gain <strong>+1</strong> <span data-tip="Damage"><img alt="Damage"></span></span></li></ol></details></section></main>`;
const parsed = parseLevelSection(extractLevelSection(page));
assert.equal(parsed.range, 'Lv 2–15');
assert.deepEqual(parsed.levels, [{ level: 1, text: 'Base item' }, { level: 2, text: 'Gain +1 Damage' }]);
assert.equal(extractLevelSection('<main>no levels</main>'), '');
assert.equal(parseLevelSection(''), null);

// 수집본
const boardItems = library.filter((item) => item.category !== 'boons' && item.category !== 'boons-past');
const validation = validateLevelRecords(snapshot.items, Object.fromEntries(boardItems.map((item) => [item.id, item.rarity])));
assert.equal(validation.itemCount, 995);
assert.equal(validation.withLevelBonus, 971);
assert.throws(() => validateLevelRecords({ a: null }, { a: 'Common' }), /no level table/);

// 전투 시뮬레이터 37종의 레벨 규칙이 공식 표와 일치한다.
const levelsOf = (name) => {
  const item = library.find((candidate) => candidate.name === name);
  assert.ok(item, `${name} is missing from the official library`);
  return snapshot.items[item.id].levels;
};
const instance = (name, level) => new Combat({
  round: 22,
  sides: [{ name: 'A', hero: 'Harkon', items: [{ item: name, level }] }, { name: 'B', hero: 'Harkon', items: [] }],
}, { seed: 1 }).sides[0].items[0];
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: engine ${actual}, official ${expected}`);
const flatArmor = { 'Predator Scales': 9, 'Man-o-lorian Helmet': 5, 'Armor Pack': 1 };

for (const [name, def] of Object.entries(ITEMS)) {
  const levels = levelsOf(name);
  assert.equal(levels.length, 15, name);
  if (['melee', 'ranged', 'pet'].includes(def.kind)) {
    const total = { min: 0, max: 0, critChance: 0, critDamage: 0, accuracy: 0 };
    for (const { level, text } of levels) {
      const stat = text.match(/^Gain \+(\d+)(%?) (max |min )?(Damage|Crit Chance|Crit Damage|Accuracy)$/);
      if (stat) {
        const value = Number(stat[1]);
        if (stat[4] !== 'Damage') total[{ 'Crit Chance': 'critChance', 'Crit Damage': 'critDamage', Accuracy: 'accuracy' }[stat[4]]] += value / 100;
        else {
          if (stat[3] !== 'max ') total.min += value;
          if (stat[3] !== 'min ') total.max += value;
        }
      }
      const item = instance(name, level);
      assert.deepEqual(item.dmgRange(), [def.dmg[0] + total.min, def.dmg[1] + total.max], `${name} Lv ${level} damage`);
      near(item.critChance(), (def.crit ?? 0) + total.critChance, `${name} Lv ${level} crit chance`);
      near(item.critDamageMult(), 1 + total.critDamage, `${name} Lv ${level} crit damage`);
      near(item.accuracy(), def.acc + total.accuracy, `${name} Lv ${level} accuracy`);
    }
    const unlocks = def.onHit.toString().match(/weaponProc\(\[([^\]]+)\]\)/)[1].split(',').map(Number);
    [5, 10, 15].forEach((level, index) => {
      near(unlocks[index], Number(levels[level - 1].text.match(/(\d+)% chance/)[1]) / 100, `${name} Lv ${level} unlock`);
    });
  } else {
    for (const { level, text } of levels.slice(1)) {
      if (name in flatArmor) assert.match(text, new RegExp(`\\b${flatArmor[name] * LEVEL_UNITS[level]} Armor$`), `${name} Lv ${level}`);
      else assert.equal(Number(text.match(/(\d+)% chance/)?.[1]), 5 * LEVEL_UNITS[level], `${name} Lv ${level}`);
    }
  }
}

console.log('official-item-levels.test.mjs passed');
