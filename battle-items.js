(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BB_BATTLE_ITEMS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 아이템 정의. 수치와 효과 문구는 2026-11-17 기준 공식 사이트(backpackbrawl.com/items) 값이다.
  // 현재는 라운드 22 Harkon vs Nymphedora 로그에 등장한 37종만 구현되어 있다.
  //
  // 훅 설명
  //   setup(it)                 전투 전 고정 효과 (최대 스태미나, 물약 사용 횟수 등)
  //   start(it)                 Start of Dawn
  //   tod(it, name)             시간대가 바뀔 때 (Day / Dusk / Night)
  //   tick(it)                  쿨다운마다 (무기가 아닌 아이템)
  //   onAttack / beforeDamage / onHit / onCrit   무기 자신의 공격 단계
  //   onAllyHitEarly / onAllyHit(it, weapon, h)   같은 편 다른 무기가 명중했을 때
  //   onAllyActivated(it, other) 같은 편 다른 아이템이 발동했을 때
  //   onPotionUsed(it, potion)  같은 편 물약이 소모됐을 때
  //   onStunInflicted(it)       아군이 기절을 걸었을 때
  //   threshold(it)             조건부 효과 ("체력 n% 미만" 등). 발동했으면 true 반환
  //
  // star: 별 대상의 종류. 'count' 는 개수만 쓰는 효과(예: 별에 놓인 Dragonleaf 환산 개수).

  const EPS = 1e-9;
  const weapon = (kind, dmg, cd, acc, stamina, extra = {}) => ({ kind, dmg, cd, acc, stamina, ...extra });
  const isMeleeOrRanged = (w) => w.kind === 'melee' || w.kind === 'ranged';

  const ITEMS = {
    // ───────────── 무기 ─────────────
    "World's End": weapon('melee', [18, 28], 3, 0.75, 2.9, {
      lvlDmg: 'B',
      beforeDamage(it, h) {
        const S = it.side;
        if (S.stamina + EPS < 1) return;
        S.stamina -= 1;
        h.mult = 1.5;
        it.combat.checkThresholds();
        S.log(`${it.name} used 1 :Stamina: to make a Charged Strike (150% :Damage:)`);
      },
      onHit(it, h) {
        const S = it.side;
        S.gain('empower', 2, it);
        S.gain('regeneration', 3, it);
        if (S.enemy.armor <= 0) S.inflict('bleed', 6, it);
        if (!h.extra && it.combat.rng.chance(0.5)) it.combat.attack(it, { extra: true });
        if (it.weaponProc([0.3, 0.6, 0.9])) { S.gain('lifesteal', 1, it); S.gain('empower', 1, it); }
      },
      threshold(it) {
        const S = it.side;
        if (it.state.low || S.health >= S.maxHealth * 0.5) return false;
        it.state.low = true;
        S.gain('lifesteal', 12, it);
        S.cleanse(24, it);
        return true;
      },
    }),
    'Royal Seax': weapon('melee', [6, 11], 2.5, 0.75, 0, {
      onHit(it) {
        const S = it.side;
        S.gain('regeneration', 1, it);
        S.gain('lifesteal', 1, it);
        if (it.weaponProc([0.25, 0.5, 0.75])) S.stealMaxHealth(5, it);
      },
      onStunInflicted(it) { it.combat.attack(it, { extra: true }); },
    }),
    Mallet: weapon('melee', [6, 10], 2.7, 0.75, 1.5, {
      lvlDmg: 'M',
      onHit(it) {
        const S = it.side;
        const B = S.enemy;
        B.s.thorns = Math.max(0, B.s.thorns - 2);
        if (it.combat.rng.chance(0.2)) S.stun(0.5, it);
        if (it.weaponProc([0.15, 0.3, 0.45])) B.s.thorns = Math.max(0, B.s.thorns - 1);
      },
    }),
    Skullsmasher: weapon('melee', [16, 21], 3.1, 0.75, 1.9, {
      crit: 0.1,
      onHit(it) {
        const S = it.side;
        if (it.combat.rng.chance(0.2)) S.stun(1, it);
        if (it.weaponProc([0.2, 0.4, 0.6])) S.inflict('bleed', 1, it);
      },
    }),
    'Hooked Dagger': weapon('melee', [5, 8], 2.9, 0.75, 0, {
      onHit(it) {
        const S = it.side;
        S.inflict('bleed', 2, it);
        if (it.weaponProc([0.2, 0.4, 0.6])) S.inflict('bleed', 1, it);
      },
      onStunInflicted(it) { it.combat.attack(it, { extra: true }); },
    }),
    Dragonfang: weapon('melee', [13, 19], 2.4, 0.75, 1.3, {
      crit: 0.2, lvlDmg: 'B', chillImmune: true, star: 'count', dragonleaf: 2,
      start(it) { it.critChanceBonus += 0.2; it.critDmgBonus += 0.5; },
      tod(it) { it.critChanceBonus += 0.2; it.critDmgBonus += 0.5; },
      onHit(it) {
        const S = it.side;
        S.cleanse(2, it);
        S.gain('haste', it.stars, it);
        S.inflict('bleed', 4, it);
        if (it.weaponProc([0.3, 0.6, 0.9])) S.inflict('bleed', 3, it);
      },
    }),
    'Rod of Memories': weapon('ranged', [17, 22], 3.1, 0.6, 1.7, {
      onAttack(it) { if (it.side.s.mana >= 2 && it.side.spendMana(2, it)) it.side.cleanse(5, it); },
      onHit(it) {
        it.side.randomBuffs(2, it);
        if (it.weaponProc([0.2, 0.4, 0.6])) it.side.cleanse(2, it);
      },
    }),
    'Evergreen Arc': weapon('ranged', [39, 53], 3.3, 0.7, 1.9, {
      crit: 0.15, lvlDmg: 'B', star: 'count', dragonleaf: 2,
      onHit(it) {
        const S = it.side;
        S.gain('luck', 3, it);
        it.dmgBonus += 3;
        if (it.stars > 0) S.inflict('bleed', it.stars, it);
        if (it.weaponProc([0.3, 0.6, 0.9])) S.inflict('bleed', 2, it);
      },
      onCrit(it) {
        const S = it.side;
        S.gain('haste', 1, it);
        S.heal(2 * S.enemy.s.bleed, it);
      },
    }),
    'Vampire Bat': weapon('pet', [11, 14], 2.8, 0.75, 0, {
      onHit(it) {
        const S = it.side;
        S.stealHealth(10, it);
        S.cleanse(4, it, ['bleed']);
        S.gain('lifesteal', 2, it);
        if (it.weaponProc([0.25, 0.5, 0.75])) S.cleanse(2, it, ['bleed']);
      },
    }),
    Stinkbug: weapon('pet', [1, 3], 4, 0.75, 0, {
      lvlDmg: 'M',
      onHit(it) {
        const S = it.side;
        if (it.combat.rng.chance(0.5)) S.inflict('poison', 1, it);
        if (it.weaponProc([0.1, 0.2, 0.3])) S.inflict('poison', 1, it);
      },
    }),

    // ───────────── 방어구 ─────────────
    'Fur Boots': {
      kind: 'armor', cd: 3.7, chillImmune: true, star: 'weaponPet',
      setup(it) { for (const w of it.starItems) w.chillImmune = true; },
      start(it) { it.side.addArmor(35, it); it.side.gain('empower', 2, it); },
      tick(it) {
        const S = it.side;
        S.cleanse(4, it, ['chill']);
        S.gain('empower', 1, it);
        S.gainStamina(1, it);
        if (it.lvlProc()) { S.gainStamina(1, it); S.gain('empower', 1, it); }
      },
    },
    "Giant's Belt": {
      kind: 'armor', star: 'potion',
      setup(it) { for (const p of it.starItems) p.maxUses += 1; },
      start(it) { it.side.gain('luck', 2, it); it.side.gain('regeneration', 2, it); },
      onPotionUsed(it, potion) { if (it.isStar(potion)) it.side.gain('empower', 1, it); },
      tod(it) { if (it.lvlProc()) { it.side.gain('luck', 2, it); it.side.gain('regeneration', 2, it); } },
    },
    'Magic Belt': {
      kind: 'armor', star: 'potion',
      setup(it) { for (const p of it.starItems) p.maxUses += 1; },
      start(it) { it.side.gain('luck', 3, it); it.side.gain('mana', 6, it); },
      onPotionUsed(it, potion) {
        const S = it.side;
        if (!it.isStar(potion) || !S.spendMana(2, it)) return;
        for (const k of ['empower', 'haste', 'lifesteal', 'regeneration', 'luck', 'thorns']) S.gain(k, 1, it);
      },
      tod(it) { if (it.lvlProc()) { it.side.gain('mana', 4, it); it.side.randomBuffs(4, it); } },
    },
    'Gloves of Power': {
      kind: 'armor', star: 'weapon',
      start(it) {
        it.side.addArmor(25, it);
        for (const w of it.starItems) w.dmgBonus += 3;
      },
      onAllyHit(it, w) {
        if (!it.isStar(w) || !isMeleeOrRanged(w)) return;
        if (!it.combat.rng.chance(0.4)) return;
        w.dmgBonus += 1;
        if (it.lvlProc()) w.dmgBonus += 1; // "이 아이템이 발동할 때" 레벨 보너스
      },
    },
    'Ethereal Cloak': {
      kind: 'armor',
      tod(it) { it.side.invulnerable(it.lvlProc() ? 1.5 : 1, it); },
    },
    'Predator Scales': {
      kind: 'armor', cd: 6.2, star: 'count',
      start(it) {
        const S = it.side;
        S.addArmor(150, it);
        S.addResist(10, it);
        S.addDamageReduction(0.3);
        S.addArmor(9 * it.units(), it);
      },
      tick(it) {
        if (it.stars <= 0) return;
        it.side.addArmor(14 * it.stars, it);
        it.side.gain('haste', it.stars, it);
      },
    },
    'Man-o-lorian Helmet': {
      kind: 'armor', star: 'weaponPet',
      start(it) {
        const S = it.side;
        S.addArmor(55, it);
        S.addArmor(5 * it.units(), it);
        S.stunMult *= 0.5;
        S.critReduction = 1 - (1 - S.critReduction) * 0.7;
        for (const w of it.starItems) w.disableMult *= 0.5;
      },
    },
    'Leafbound Striders': {
      kind: 'armor', cd: 3.6, star: 'weapon', dragonleaf: 2,
      start(it) { it.side.addArmor(30, it); it.side.gain('haste', 5, it); },
      tick(it) {
        const once = () => { it.side.gainStamina(1, it); for (const w of it.starItems) w.critDmgBonus += 0.1; };
        once();
        if (it.lvlProc()) once();
      },
    },
    'Cleansing Crown': {
      kind: 'armor', cd: 3.9,
      tick(it) {
        const S = it.side;
        S.cleanse(8, it);
        if (!it.state.big && S.s.mana >= 5 && S.spendMana(5, it)) { it.state.big = true; S.cleanse(75, it); }
        S.heal(5, it);
        if (it.lvlProc()) { S.addResist(8, it); S.heal(20, it); }
      },
    },

    // ───────────── 장신구 · 식물 ─────────────
    'Golden Skull': {
      kind: 'accessory', cd: 3.5,
      tick(it) {
        const S = it.side;
        const B = S.enemy;
        S.gain('luck', 1, it);
        B.stamina = Math.max(0, B.stamina - 0.5);
        S.log(`${it.name} drained 0.5 :Stamina: to [${B.name}]`);
        S.inflict('curse', 1, it);
        if (it.lvlProc()) { S.inflict('curse', 1, it); S.gain('luck', 1, it); }
      },
    },
    'Heavenly Skull': {
      kind: 'accessory', cd: 3.5,
      start(it) { it.side.gain('regeneration', 5, it); },
      tick(it) {
        const S = it.side;
        S.gain('regeneration', 1, it);
        S.gainStamina(1.5, it);
        S.cleanse(1, it, ['poison']);
        S.cleanse(1, it, ['curse']);
        if (it.lvlProc()) { S.cleanse(2, it); S.gain('regeneration', 2, it); }
      },
    },
    'Amethyst Pendant': {
      kind: 'accessory', star: 'weapon',
      start(it) { it.side.gain('lifesteal', 2, it); },
      onAllyHit(it, w) {
        if (!it.isStar(w) || !isMeleeOrRanged(w)) return;
        it.side.gain('mana', 1, it);
        if (it.lvlProc()) it.side.gain('mana', 1, it);
      },
    },
    'Speed Essence': {
      kind: 'accessory', cd: 3, star: 'any',
      onAllyActivated(it, other) {
        if (it.isStar(other) && it.combat.rng.chance(0.2)) it.side.gain('haste', 1, it);
      },
      tick(it) {
        const S = it.side;
        if (S.s.mana >= 2 && S.spendMana(2, it)) S.inflict('burn', 2, it);
        if (it.lvlProc()) S.gain('haste', 1, it);
      },
    },
    'Frost Emblem': {
      kind: 'accessory', cd: 3,
      tick(it) {
        it.side.inflict('chill', 1, it);
        if (it.lvlProc()) it.side.inflict('chill', 1, it);
      },
    },
    'Cursed Clover': {
      kind: 'accessory', cd: 4.1,
      tick(it) {
        const once = () => { it.side.inflict('poison', 1, it); it.side.inflict('curse', 1, it); };
        once();
        if (it.lvlProc()) once();
      },
    },
    'Poison Arrows': {
      kind: 'accessory', star: 'ranged',
      onAllyHit(it, w, h) {
        if (!it.isStar(w) || w.kind !== 'ranged') return;
        const S = it.side;
        S.inflict('poison', 3, it);
        if (it.lvlProc()) S.inflict('poison', 5, it);
        if (h.crit) S.disableEnemyItem(1.25, it);
      },
    },
    'Werewolf Paw': {
      kind: 'accessory', star: 'weaponPet',
      start(it) { for (const w of it.starItems) w.critChanceBonus += 0.15; },
      onAllyHit(it, w, h) {
        if (!h.crit || !it.isStar(w)) return;
        it.side.inflict('curse', 1, it);
        if (it.lvlProc()) it.side.inflict('curse', 1, it); // "이 아이템이 발동할 때" 레벨 보너스
      },
    },
    Dragonleaf: {
      kind: 'plant', star: 'count', dragonleaf: 1,
      start(it) { if (it.stars > 0) it.side.gain('haste', 3 * it.stars, it); },
      tod(it) { if (it.stars > 0 && it.lvlProc()) it.side.gain('haste', 2 * it.stars, it); },
    },
    Dragonflower: {
      kind: 'plant', cd: 4.6, chillImmune: true, dragonleaf: 1,
      tick(it) {
        it.side.cleanse(3, it);
        if (it.lvlProc()) it.side.cleanse(3, it);
      },
    },

    // ───────────── 물약 ─────────────
    'Wrath Potion': {
      kind: 'potion', uses: 2, cd: 0.4,
      threshold(it) {
        const S = it.side;
        if (S.stamina >= S.maxStamina * 0.35) return false;
        return it.combat.usePotion(it, () => {
          S.gain('empower', 1, it);
          S.tempRegen(1, 4, it);
          if (it.lvlProc()) S.tempRegen(0.5, 8, it);
        });
      },
    },
    'Wilderness Potion': {
      kind: 'potion', uses: 1, cd: 0.4, dragonleaf: 1,
      threshold(it) {
        const S = it.side;
        if (S.health >= S.maxHealth * 0.75) return false;
        return it.combat.usePotion(it, () => {
          S.heal(18, it);
          S.tempHaste(8, 8, it);
          if (it.lvlProc()) {
            for (let i = 1; i <= 4; i++) it.combat.addTimer(it.combat.t + i, () => S.gain('haste', 1, it));
          }
        });
      },
    },

    // ───────────── 가방 ─────────────
    'Armor Pack': {
      kind: 'bag',
      start(it) { it.side.addArmor(6, it); it.side.addArmor(it.units(), it); },
    },
    'Fanny Pack': {
      // 안에 든 아이템의 발동 속도 +10% 는 각 아이템의 bags 입력으로 처리된다.
      kind: 'bag',
      tod(it) { if (it.lvlProc()) it.side.gain('haste', 1, it); },
    },
    'Stamina Sack': {
      kind: 'bag',
      setup(it) { it.side.maxStamina += 1; },
      tod(it) {
        if (!it.lvlProc()) return;
        it.side.staminaRegen += 0.1;
        it.side.log(`${it.name} gained 0.1 :StaminaRecovery:`);
      },
    },
    'Berserker Sack': {
      kind: 'bag',
      threshold(it) {
        const S = it.side;
        if (it.state.used || it.inside <= 0 || S.health >= S.maxHealth * 0.2) return false;
        it.state.used = true;
        S.invulnerable(it.combat.params.berserkerInvulnPerItem * it.inside, it);
        return true;
      },
      tod(it) { if (it.inside > 0 && it.lvlProc()) it.side.gainMaxHealth(4 * it.inside, it); },
    },
    'Medium Bag': {
      kind: 'bag',
      tod(it) { if (it.lvlProc()) it.side.heal(4, it); },
    },
    "Ranger's Satchel": {
      kind: 'bag',
      start(it) {
        const n = it.cfg.dragonleafInside ?? 0;
        if (n > 0) it.side.inflict('blind', n, it);
      },
      onAllyHitEarly(it, w) {
        if (w.inBag(it.name) > 0 && it.combat.rng.chance(0.6)) it.side.gain('haste', 1, it);
      },
      tod(it) { if (it.inside > 0 && it.lvlProc()) it.side.gain('haste', it.inside, it); },
    },
  };

  for (const name of Object.keys(ITEMS)) ITEMS[name].name = name;

  return { ITEMS };
});
