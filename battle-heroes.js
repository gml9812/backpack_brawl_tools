(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BB_BATTLE_HEROES = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 영웅 기본 수치와 라운드별 체력.
  // 출처: backpackbrawlpro.com/rounds (라운드 기본 체력), backpackbrawl.wiki.gg (영웅 레벨 보너스),
  //       backpackbrawlpro.com/player-levels (플레이어 레벨 +5% 체력 보상 10회).
  // 실측 9개(R1~4, R17~25)가 (기본 + 30) × 1.5 와 정확히 일치함을 확인했다.

  const ROUND_BASE_HEALTH = [
    0, 50, 70, 90, 110, 140, 170, 200, 230, 260, 290, 320, 350, 380, 420, 460, 500, 540, 580, 620,
    660, 700,
  ];

  function roundBaseHealth(round) {
    const r = Math.max(1, Math.min(21, Math.floor(round))); // 21라운드 이후는 같은 값 유지
    return ROUND_BASE_HEALTH[r];
  }

  const count = (level, at) => at.filter((l) => level >= l).length;

  // 영웅 레벨 10, 16에서 받는 "전투 시작 시 영웅 스탯".
  // 이 로그에 나온 두 영웅만 확인됨. 다른 영웅은 빌드 파일의 startBuffs 로 직접 지정한다.
  const HERO_START_STAT = {
    Harkon: { empower: 1 },
    Nymphedora: { haste: 3 },
  };

  function heroStats({ hero, heroLevel = 20, round = 22, healthBonus = 0.5 }) {
    const hpBonus = 10 * count(heroLevel, [2, 11, 19]);
    return {
      maxHealth: Math.round((roundBaseHealth(round) + hpBonus) * (1 + healthBonus)),
      armor: 10 * count(heroLevel, [4, 12, 18]),
      maxStamina: 5 + 0.5 * count(heroLevel, [7, 14]),
      staminaRegen: 1 + 0.05 * count(heroLevel, [3, 8, 13]),
      critDamage: 1 + 0.1 * count(heroLevel, [6, 17]),
      startStat: HERO_START_STAT[hero] ?? null,
      startStatTimes: count(heroLevel, [10, 16]),
    };
  }

  return { roundBaseHealth, heroStats };
});
