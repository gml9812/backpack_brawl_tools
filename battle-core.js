(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./battle-engine.js'), require('./battle-items.js'));
  else root.BB_BATTLE_CORE = factory(root.BB_BATTLE_ENGINE, root.BB_BATTLE_ITEMS);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (engine, itemsApi) {
  'use strict';

  const { ITEMS } = itemsApi;

  const HEROES = ['Buzz', 'Celeste', 'Chana', 'Dorf', 'Enoch', 'Fern', 'Harkon', 'Hob Gang', 'Kragg', 'Morrow', 'Mycella', 'Nymphedora', 'Pepper', 'Ronan', 'Sage', 'Skara', 'Tink', 'Zahir'];
  const VERIFIED_START_HEROES = new Set(['Harkon', 'Nymphedora']);
  const KINDS = [
    ['melee', '근접 무기'], ['ranged', '원거리 무기'], ['pet', '펫'], ['armor', '방어구'],
    ['accessory', '장신구'], ['plant', '식물'], ['potion', '물약'], ['bag', '가방'],
  ];
  const FATIGUE_START = 30;
  const MAX_RUNS = 20000;

  const clampInt = (value, min, max, fallback) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };

  function starMode(def) {
    if (!def.star) return 'none';
    return def.star === 'count' ? 'count' : 'targets';
  }

  function describeItem(name) {
    const def = ITEMS[name];
    const isWeapon = def.kind === 'melee' || def.kind === 'ranged' || def.kind === 'pet';
    return {
      name,
      kind: def.kind,
      starMode: starMode(def),
      usesFanny: Boolean(def.cd) && def.kind !== 'potion',
      usesSatchel: isWeapon,
      usesInside: name === 'Berserker Sack' || name === "Ranger's Satchel",
      usesDragonleafInside: name === "Ranger's Satchel",
    };
  }

  /** 종류별로 묶은 지원 아이템 목록. */
  function catalog() {
    return KINDS.map(([kind, label]) => ({
      kind,
      label,
      items: Object.keys(ITEMS).filter((name) => ITEMS[name].kind === kind).sort(),
    }));
  }

  function matchesStarFilter(filter, kind) {
    if (filter === 'weapon') return kind === 'melee' || kind === 'ranged';
    if (filter === 'weaponPet') return kind === 'melee' || kind === 'ranged' || kind === 'pet';
    if (filter === 'ranged') return kind === 'ranged';
    if (filter === 'potion') return kind === 'potion';
    return true;
  }

  function createRow(item, key) {
    const stars = starMode(ITEMS[item]) === 'targets' ? [] : 0;
    return { key, item, level: 1, count: 1, stars, fanny: 0, satchel: 0, inside: 0, dragonleafInside: 0 };
  }

  /** 이 행의 별 대상으로 고를 수 있는 아이템 인스턴스. */
  function targetOptions(rows, row) {
    const filter = ITEMS[row.item].star;
    const options = [];
    for (const other of rows) {
      if (other === row || !matchesStarFilter(filter, ITEMS[other.item].kind)) continue;
      for (let index = 1; index <= other.count; index += 1) {
        options.push({
          ref: other.count > 1 ? `${other.key}#${index}` : other.key,
          label: other.count > 1 ? `${other.item} #${index}` : other.item,
        });
      }
    }
    return options;
  }

  /** 대상 참조를 현재 행 구성에 맞춘다. 사라진 대상이면 null. */
  function resolveRef(rows, ref) {
    const [base, suffix] = String(ref).split('#');
    const row = rows.find((candidate) => candidate.key === base)
      || rows.find((candidate) => candidate.item === ref);
    if (!row) return null;
    const index = row.key === base ? Number(suffix || 1) : 1;
    if (index > row.count) return null;
    return row.count > 1 ? `${row.key}#${index}` : row.key;
  }

  /** 엔진 입력 형식의 빌드를 화면 상태로 변환한다. */
  function fromBuild(build) {
    let sequence = 0;
    const sides = (build.sides || []).slice(0, 2).map((side) => {
      const { items = [], ...rest } = side;
      const rows = items.map((config) => {
        if (!ITEMS[config.item]) throw new Error(`지원하지 않는 아이템: ${config.item}`);
        sequence += 1;
        const bags = Array.isArray(config.bags)
          ? config.bags.reduce((all, name) => ({ ...all, [name]: (all[name] || 0) + 1 }), {})
          : config.bags || {};
        const row = createRow(config.item, config.id || `row${sequence}`);
        return Object.assign(row, {
          level: clampInt(config.level, 1, 15, 1),
          count: clampInt(config.count, 1, 99, 1),
          fanny: clampInt(bags['Fanny Pack'], 0, 12, 0),
          satchel: clampInt(bags["Ranger's Satchel"], 0, 12, 0),
          inside: clampInt(config.inside, 0, 40, 0),
          dragonleafInside: clampInt(config.dragonleafInside, 0, 40, 0),
          sourceStars: config.stars,
        });
      });
      for (const row of rows) {
        const source = row.sourceStars;
        delete row.sourceStars;
        if (starMode(ITEMS[row.item]) === 'count') row.stars = clampInt(source, 0, 40, 0);
        else if (starMode(ITEMS[row.item]) === 'targets' && Array.isArray(source)) {
          row.stars = source.map((ref) => resolveRef(rows, ref)).filter(Boolean);
        }
      }
      return { ...rest, rows };
    });
    if (sides.length !== 2) throw new Error('빌드에는 양측 진영이 모두 필요합니다.');
    return { round: clampInt(build.round, 1, 99, 22), sides };
  }

  /** 화면 상태를 엔진 입력 형식의 빌드로 변환한다. */
  function toBuild(state) {
    return {
      round: clampInt(state.round, 1, 99, 22),
      sides: state.sides.map((side) => {
        const { rows, ...rest } = side;
        return {
          ...rest,
          name: String(side.name || '').trim() || side.hero,
          items: rows.map((row) => {
            const mode = starMode(ITEMS[row.item]);
            const info = describeItem(row.item);
            const config = { id: row.key, item: row.item, level: clampInt(row.level, 1, 15, 1) };
            const count = clampInt(row.count, 1, 99, 1);
            if (count > 1) config.count = count;
            if (mode === 'count' && row.stars > 0) config.stars = clampInt(row.stars, 0, 40, 0);
            if (mode === 'targets') {
              const refs = row.stars.map((ref) => resolveRef(rows, ref)).filter(Boolean);
              if (refs.length) config.stars = refs;
            }
            const bags = {};
            if (info.usesFanny && row.fanny > 0) bags['Fanny Pack'] = clampInt(row.fanny, 0, 12, 0);
            if (info.usesSatchel && row.satchel > 0) bags["Ranger's Satchel"] = clampInt(row.satchel, 0, 12, 0);
            if (Object.keys(bags).length) config.bags = bags;
            if (info.usesInside && row.inside > 0) config.inside = clampInt(row.inside, 0, 40, 0);
            if (info.usesDragonleafInside && row.dragonleafInside > 0) config.dragonleafInside = clampInt(row.dragonleafInside, 0, 40, 0);
            return config;
          }),
        };
      }),
    };
  }

  function buildWarnings(build, sample) {
    const warnings = sample.sides.flatMap((side) => side.warnings);
    for (const side of build.sides) {
      if ((side.heroLevel ?? 20) >= 10 && !side.startBuffs && !VERIFIED_START_HEROES.has(side.hero)) {
        warnings.push(`${side.name}: ${side.hero}의 영웅 레벨 10·16 전투 시작 스탯은 확인되지 않아 적용하지 않았습니다.`);
      }
    }
    return warnings;
  }

  /** 시드를 하나씩 늘리며 전투를 반복한다. Worker와 메인 스레드가 같은 코드를 쓴다. */
  function createBatch(build, options = {}) {
    const runs = clampInt(options.runs, 1, MAX_RUNS, 1000);
    const seed = clampInt(options.seed, 0, 2147483647, 1);
    const sample = engine.simulate(build, { seed, log: true });
    const wins = [0, 0];
    const winnerHealth = [0, 0];
    const times = [];
    let draws = 0;
    let overFatigue = 0;

    return {
      runs,
      get done() { return times.length; },
      step(count) {
        const end = Math.min(runs, times.length + count);
        while (times.length < end) {
          const result = engine.simulate(build, { seed: seed + times.length });
          times.push(result.time);
          if (result.time > FATIGUE_START) overFatigue += 1;
          if (result.winner === -1) draws += 1;
          else {
            wins[result.winner] += 1;
            winnerHealth[result.winner] += result.sides[result.winner].health;
          }
        }
        return times.length >= runs;
      },
      finish() {
        const sorted = [...times].sort((a, b) => a - b);
        const at = (ratio) => sorted[Math.floor(ratio * (sorted.length - 1))];
        return {
          runs,
          seed,
          names: build.sides.map((side) => side.name),
          wins,
          draws,
          winRates: wins.map((value) => value / runs),
          drawRate: draws / runs,
          time: {
            median: sorted[sorted.length >> 1],
            p10: at(0.1),
            p90: at(0.9),
            mean: times.reduce((sum, value) => sum + value, 0) / runs,
          },
          averageWinnerHealth: winnerHealth.map((value, index) => (wins[index] ? value / wins[index] : null)),
          overFatigueRate: overFatigue / runs,
          warnings: buildWarnings(build, sample),
          sample: { seed, winner: sample.winner, time: sample.time, log: sample.log },
        };
      },
    };
  }

  /** 로그 한 줄을 화면에 표시할 문자열로 바꾼다. */
  function formatLogLine(line) {
    const [time, side, text] = line.split('\t');
    return `${(time || '').padStart(6)}  ${(side || '').padEnd(14)}  ${(text || '').replace(/:([A-Za-z]+):/g, '$1')}`;
  }

  return {
    HEROES, FATIGUE_START, MAX_RUNS, catalog, describeItem, createRow, targetOptions,
    fromBuild, toBuild, createBatch, formatLogLine,
  };
});
