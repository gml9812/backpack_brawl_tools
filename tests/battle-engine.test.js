'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Combat, simulate } = require('../battle-engine.js');
const { heroStats, roundBaseHealth } = require('../battle-heroes.js');
const { ITEMS } = require('../battle-items.js');
const core = require('../battle-core.js');
const build = require('../battle-example.js');

// 라운드별 시작 체력: 영웅 레벨 19 이상 + 플레이어 레벨 체력 보상 10회(+50%) 기준 실측값
const measured = { 1: 120, 2: 150, 3: 180, 4: 210, 17: 855, 18: 915, 19: 975, 20: 1035, 21: 1095, 22: 1095, 25: 1095 };
for (const [round, health] of Object.entries(measured)) {
  assert.equal(heroStats({ hero: 'Harkon', heroLevel: 20, round: Number(round), healthBonus: 0.5 }).maxHealth, health, `라운드 ${round}`);
}
assert.equal(roundBaseHealth(1), 50);

// 전투 시작 상태가 실제 로그의 0.0초 줄과 일치한다.
{
  const combat = new Combat(build, { seed: 1 });
  combat.startOfCombat();
  const [first, second] = combat.sides;
  assert.equal(first.maxHealth, 1095);
  assert.equal(second.maxHealth, 1095);
  assert.equal(first.armor, 20 + 20 + 25 + 35 + 30);
  assert.equal(second.armor, 13 * 5 + 150 + 144 + 55 + 30 + 30);
  assert.equal(first.s.empower, 2 + 2);
  assert.equal(first.s.luck, 2 * 4 + 3 * 2);
  assert.equal(first.maxStamina, 10);
  assert.equal(first.s.blind, 2);
  assert.ok(second.s.haste === 20 || second.s.haste === 21);
  assert.equal(first.items.find((item) => item.name === 'Wrath Potion').maxUses, 5);
}

// 첫 발동 시각이 실제 로그와 일치한다 (Fanny Pack 중첩·가속 공식 검증).
{
  const expected = [
    ['Harkon', "World's End", 1.9], ['Harkon', 'Royal Seax', 2.1], ['Harkon', 'Hooked Dagger', 2.4],
    ['Harkon', 'Skullsmasher', 2.6], ['Harkon', 'Fur Boots', 2.6],
    ['Nymphedora', 'Dragonfang', 2.0], ['Nymphedora', 'Vampire Bat', 2.3],
  ];
  for (const seed of [1, 2, 3, 4, 5]) {
    const { log } = simulate(build, { seed, log: true });
    const first = new Map();
    let time = 0;
    for (const line of log) {
      const [head, side, text] = line.split('\t');
      if (/^[0-9.]+s$/.test(head)) time = parseFloat(head);
      if (time === 0 || /\(Extra Attack\)/.test(text)) continue;
      for (const [who, item] of expected) {
        const key = `${who}|${item}`;
        if (side === `[${who}]` && text.startsWith(item) && !first.has(key)) first.set(key, time);
      }
    }
    for (const [who, item, at] of expected) {
      const got = first.get(`${who}|${item}`);
      assert.ok(got !== undefined && Math.abs(got - at) <= 0.1 + 1e-9, `시드 ${seed}: ${item} 첫 발동 ${got}초 (로그 ${at}초)`);
    }
  }
}

// 체력 규칙: 최대 체력 획득·훔치기·체력 강탈·피해 감소·저주
{
  const combat = new Combat(build, { seed: 1 });
  const [first, second] = combat.sides;
  first.health = 1000; first.armor = 50;
  second.health = second.maxHealth;
  first.stealMaxHealth(5, 'test');
  assert.deepEqual([first.maxHealth, first.health], [1100, 1005]);
  assert.deepEqual([second.maxHealth, second.health], [1090, 1090]);
  second.health = 500;
  first.stealMaxHealth(5, 'test');
  assert.deepEqual([second.maxHealth, second.health], [1085, 500]);
  second.stealHealth(10, 'test');
  assert.deepEqual([first.health, first.armor, second.health], [1000, 50, 510]);
  second.armor = 0; second.addDamageReduction(0.3);
  assert.equal(second.receive(45, { reduce: true }).dealt, 32);
  first.health = 0; first.s.curse = 8;
  assert.equal(first.heal(63, 'test'), 58);
}

// Berserker Sack 무적: 공식 변경 이력 v1.0.3 기준 안에 든 아이템당 0.3초
{
  const combat = new Combat(build, { seed: 1 });
  const [first] = combat.sides;
  first.health = Math.floor(first.maxHealth * 0.2) - 1;
  combat.checkThresholds();
  assert.ok(Math.abs(first.invulnerableUntil - 0.3 * 3) < 1e-9, `무적 ${first.invulnerableUntil}초`);
}

// 예시 빌드의 결과가 실제 전투와 비슷하다.
{
  let wins = 0;
  const times = [];
  for (let seed = 1; seed <= 300; seed += 1) {
    const result = simulate(build, { seed });
    if (result.winner === 0) wins += 1;
    times.push(result.time);
  }
  times.sort((a, b) => a - b);
  assert.ok(wins >= 285, `Harkon 승 ${wins}/300`);
  assert.ok(times[150] > 8 && times[150] < 13, `전투 시간 중앙값 ${times[150].toFixed(1)}초`);
}

// 프로토타입과 같은 결과: 시드 1~300의 전체 결과·로그 해시. 화면 상태를 거쳐도 같아야 한다.
{
  const golden = '25d7471c71ef191308583d18c7bf80b011617fa7204bc0ac732c4ed52327d2d1';
  const digest = (input) => {
    const hash = crypto.createHash('sha256');
    for (let seed = 1; seed <= 300; seed += 1) hash.update(JSON.stringify(simulate(input, { seed, log: true })));
    return hash.digest('hex');
  };
  assert.equal(digest(build), golden);
  assert.equal(digest(core.toBuild(core.fromBuild(build))), golden);
}

// 화면 상태 변환
{
  assert.equal(Object.keys(ITEMS).length, 37);
  assert.equal(core.catalog().reduce((sum, group) => sum + group.items.length, 0), 37);
  const state = core.fromBuild({
    round: 5,
    sides: [
      { name: 'A', hero: 'Harkon', items: [
        { id: 'blade', item: 'Mallet', level: 99, count: 2, bags: ['Fanny Pack', 'Fanny Pack'] },
        { item: 'Amethyst Pendant', stars: ['blade', 'Mallet'] },
        { item: 'Fanny Pack', stars: 3, bags: { 'Fanny Pack': 2 } },
      ] },
      { name: 'B', hero: 'Sage', items: [{ item: 'Dragonleaf', stars: 2 }] },
    ],
  });
  const [mallet, pendant] = state.sides[0].rows;
  assert.equal(mallet.level, 15);
  assert.equal(mallet.fanny, 2);
  assert.deepEqual(pendant.stars, ['blade#1', 'blade#1']);
  assert.deepEqual(core.targetOptions(state.sides[0].rows, pendant).map((option) => option.ref), ['blade#1', 'blade#2']);
  mallet.count = 1;
  const out = core.toBuild(state);
  assert.deepEqual(out.sides[0].items[1].stars, ['blade', 'blade']);
  assert.equal('bags' in out.sides[0].items[2], false, '쿨다운이 없는 가방에는 Fanny Pack 입력이 없다');
  assert.equal('stars' in out.sides[0].items[2], false, '별 효과가 없는 아이템의 별 입력은 버린다');
  state.sides[0].rows.shift();
  assert.equal('stars' in core.toBuild(state).sides[0].items[0], false, '삭제된 별 대상은 빌드에서 빠진다');
  assert.throws(() => core.fromBuild({ sides: [{ items: [{ item: 'Nope' }] }, { items: [] }] }), /지원하지 않는 아이템/);
  assert.throws(() => core.fromBuild({ sides: [] }), /양측/);
}

// 반복 실행 집계
{
  const batch = core.createBatch(build, { runs: 250, seed: 1 });
  assert.equal(batch.step(100), false);
  assert.equal(batch.done, 100);
  assert.equal(batch.step(1000), true);
  const result = batch.finish();
  assert.equal(result.wins[0] + result.wins[1] + result.draws, 250);
  assert.ok(result.time.p10 <= result.time.median && result.time.median <= result.time.p90);
  assert.ok(result.sample.log.length > 100);
  assert.deepEqual(result.warnings, []);
  const direct = [];
  for (let seed = 1; seed <= 250; seed += 1) direct.push(simulate(build, { seed }).winner);
  assert.equal(result.wins[0], direct.filter((winner) => winner === 0).length);

  const unverified = core.toBuild(core.fromBuild({ sides: [
    { name: 'A', hero: 'Sage', heroLevel: 16, items: [{ item: 'Mallet' }] },
    { name: 'B', hero: 'Harkon', items: [{ item: 'Mallet' }] },
  ] }));
  const warned = core.createBatch(unverified, { runs: 1 }).finish();
  assert.equal(warned.warnings.length, 1);
  assert.match(warned.warnings[0], /Sage/);
}

assert.equal(core.formatLogLine('1.9s\t[Harkon]\tMallet 7 :Damage:(-3 :Armor:)').trim(), '1.9s  [Harkon]        Mallet 7 Damage(-3 Armor)');

// 익명화한 실제 전투 로그를 재생해 체력 규칙을 검산한다 (시뮬레이터와 독립).
{
  const log = fs.readFileSync(path.join(__dirname, 'fixtures', 'battle-round22.log.txt'), 'utf8');
  assert.equal(/[^\x00-\x7F]/.test(log), false, '로그 fixture에 익명화되지 않은 닉네임이 남아 있다');
  const state = new Map([['Harkon', { health: 1095, max: 1095 }], ['Nymphedora', { health: 1095, max: 1095 }]]);
  const violations = [];
  let previous = '';
  for (const line of log.split(/\r?\n/)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const name = parts[1].replace(/^\[|\]$/g, '');
    const text = parts[2];
    const me = state.get(name);
    const foe = state.get(name === 'Harkon' ? 'Nymphedora' : 'Harkon');
    let match;
    if ((match = text.match(/^:(Poison|Bleed|Burn):\s+(\d+) :Damage:(?:\(-(\d+) :Armor:\))?/))) {
      me.health -= Number(match[2]) - Number(match[3] ?? 0);
    } else if ((match = text.match(/(\d+) :(?:Crit)?Damage:\s*(?:\(-(\d+) :Armor:\))?/)) && !/reduced|Charged/.test(text)) {
      foe.health -= Number(match[1]) - Number(match[2] ?? 0);
    } else if ((match = text.match(/ healed (\d+) :Health:/))) {
      me.health += Number(match[1]);
      if (me.health > me.max) violations.push(text);
    } else if (/overhealed \d+ :Health:/.test(text)) {
      if (me.health !== me.max) violations.push(text);
    } else if ((match = text.match(/stole (\d+) :Health:/))) {
      if (!/overhealed/.test(previous)) me.health += Number(match[1]);
      foe.health -= Number(match[1]);
    } else if ((match = text.match(/stole (\d+) :MaxHealth:/))) {
      me.max += Number(match[1]); me.health += Number(match[1]);
      foe.max -= Number(match[1]); foe.health = Math.min(foe.health, foe.max);
    } else if ((match = text.match(/gained (\d+) :MaxHealth:/))) {
      me.max += Number(match[1]); me.health += Number(match[1]);
    }
    previous = text;
  }
  assert.deepEqual(violations, []);
  assert.deepEqual(state.get('Harkon'), { health: 1172, max: 1172 });
  assert.deepEqual(state.get('Nymphedora'), { health: -104, max: 1030 });
}

console.log('battle-engine.test.js passed');
