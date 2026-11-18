(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./battle-rng.js'), require('./battle-heroes.js'), require('./battle-items.js'));
  else root.BB_BATTLE_ENGINE = factory(root.BB_BATTLE_RNG, root.BB_BATTLE_HEROES, root.BB_BATTLE_ITEMS);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rngApi, heroesApi, itemsApi) {
  'use strict';

  const { makeRng } = rngApi;
  const { heroStats } = heroesApi;
  const { ITEMS } = itemsApi;

  // Backpack Brawl 전투 엔진.
  // 배치(좌표)는 다루지 않는다. 각 아이템은 "활성화된 별"과 "자신이 들어 있는 가방"만 입력으로 받는다.
  // 로그로 검증한 규칙과 추정한 규칙의 구분은 README 를 참고.


  const EPS = 1e-9;

  const LABEL = {
    empower: 'Empower', haste: 'Haste', lifesteal: 'Lifesteal', luck: 'Luck',
    regeneration: 'Regeneration', thorns: 'Thorns', dodge: 'Dodge', mana: 'Mana',
    poison: 'Poison', bleed: 'Bleed', burn: 'Burn', chill: 'Chill', blind: 'Blind',
    curse: 'Curse', insanity: 'Insanity',
  };
  const BUFFS = ['empower', 'haste', 'lifesteal', 'luck', 'regeneration', 'thorns'];
  const DEBUFFS = ['poison', 'bleed', 'burn', 'chill', 'blind', 'curse', 'insanity'];
  const DOT_INTERVAL = { poison: 2, bleed: 3, burn: 1, insanity: 3 };
  const TIMES_OF_DAY = [[10, 'Day'], [20, 'Dusk'], [30, 'Night']];

  // 레벨 보너스 단위표: 확률형은 5% × U[레벨], 수치형은 단위값 × U[레벨].
  const LEVEL_UNITS = [0, 0, 1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 20];

  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
  const srcName = (src) => (typeof src === 'string' ? src : src.name);
  const armorText = (a) => (a > 0 ? `(-${a} :Armor:)` : '');

  // ───────────────────────── 아이템 인스턴스 ─────────────────────────
  class Item {
    constructor(side, def, cfg, id) {
      this.side = side;
      this.combat = side.combat;
      this.def = def;
      this.cfg = cfg;
      this.name = def.name;
      this.id = id;
      this.level = Math.max(1, Math.min(15, cfg.level ?? 1));
      this.kind = def.kind;
      this.isWeapon = def.kind === 'melee' || def.kind === 'ranged' || def.kind === 'pet';
      this.isPet = def.kind === 'pet';
      this.isPotion = def.kind === 'potion';
      this.cd = def.cd ?? 0;
      this.progress = 0;
      this.stars = 0; // 활성화된 별 수
      this.starItems = []; // 별에 놓인 아이템(식별이 필요한 효과용)
      this.bags = normalizeBags(cfg.bags);
      this.fanny = this.bags['Fanny Pack'] ?? 0;
      this.inside = cfg.inside ?? 0; // 가방일 때: 안에 든 아이템 수
      this.dmgBonus = 0;
      this.accBonus = 0;
      this.critChanceBonus = 0;
      this.critDmgBonus = 0;
      this.disabledUntil = 0;
      this.disableMult = 1;
      this.chillImmune = !!def.chillImmune;
      this.maxUses = def.uses ?? 0;
      this.uses = 0;
      this.readyAt = 0;
      this.state = {};
    }

    units() { return LEVEL_UNITS[this.level]; }
    /** 비무기 레벨 보너스 발동 확률 (5% → 100%) */
    lvlProc() { return this.combat.rng.chance(0.05 * this.units()); }
    /** 무기 레벨 5/10/15 해금 효과의 발동 확률 */
    weaponProc(p) {
      const c = this.level >= 15 ? p[2] : this.level >= 10 ? p[1] : this.level >= 5 ? p[0] : 0;
      return this.combat.rng.chance(c);
    }
    isStar(other) { return this.starItems.includes(other); }
    inBag(name) { return this.bags[name] ?? 0; }

    lvlDmg() {
      const L = this.level;
      const p = this.def.lvlDmg ?? 'A';
      if (p === 'A') { const n = (L >= 2) + (L >= 7) + (L >= 12); return [n, n]; }
      if (p === 'B') { const n = (L >= 2) + (L >= 7) + 2 * (L >= 12); return [n, n]; }
      // 'M': 레벨 2 최대 +1, 레벨 7 최소 +1, 레벨 12 둘 다 +1
      return [(L >= 7) + (L >= 12), (L >= 2) + (L >= 12)];
    }
    dmgRange() { const b = this.lvlDmg(); return [this.def.dmg[0] + b[0], this.def.dmg[1] + b[1]]; }
    accuracy() { return this.def.acc + 0.05 * ((this.level >= 6) + (this.level >= 11)) + this.accBonus; }
    critChance() {
      const L = this.level;
      return (this.def.crit ?? 0) + 0.05 * ((L >= 3) + (L >= 8) + (L >= 13)) + this.critChanceBonus;
    }
    critDamageMult() {
      const L = this.level;
      return 1 + 0.05 * ((L >= 4) + (L >= 9) + (L >= 14)) + this.critDmgBonus;
    }

    /** 쿨다운 진행 속도. 가속 1%·냉기 -1%·Fanny Pack 팩당 +10% (합연산), 원래 쿨다운의 10% 미만으로는 못 줄어듦. */
    rate() {
      const s = this.side;
      const t = this.combat.t;
      if (this.disabledUntil > t + EPS) return 0;
      if (!this.isPet && s.stunnedUntil > t + EPS) return 0;
      const chill = this.chillImmune ? 0 : s.s.chill;
      const r = 1 + 0.01 * (s.s.haste - chill) + 0.1 * this.fanny;
      return Math.min(10, Math.max(0.1, r));
    }
  }

  function normalizeBags(b) {
    const out = {};
    if (!b) return out;
    if (Array.isArray(b)) { for (const n of b) out[n] = (out[n] ?? 0) + 1; return out; }
    return { ...b };
  }

  // ───────────────────────── 진영 ─────────────────────────
  class Side {
    constructor(combat, index, cfg, round) {
      this.combat = combat;
      this.index = index;
      this.cfg = cfg;
      this.name = cfg.name ?? cfg.hero ?? `Side${index + 1}`;
      const hs = heroStats({ hero: cfg.hero, heroLevel: cfg.heroLevel, round, healthBonus: cfg.healthBonus });
      this.hero = hs;
      this.maxHealth = cfg.maxHealth ?? hs.maxHealth;
      this.health = this.maxHealth;
      this.armor = 0;
      this.maxStamina = cfg.maxStamina ?? hs.maxStamina;
      this.staminaRegen = cfg.staminaRegen ?? hs.staminaRegen;
      this.critDamage = cfg.critDamage ?? hs.critDamage;
      this.s = {};
      for (const k of [...BUFFS, ...DEBUFFS, 'dodge', 'mana']) this.s[k] = 0;
      this.next = { poison: null, bleed: null, burn: null, insanity: null };
      this.resistPool = [];
      this.damageReduction = 0;
      this.critReduction = 0;
      this.stunMult = 1;
      this.stunnedUntil = 0;
      this.invulnerableUntil = 0;
      this.items = [];
      this.warnings = [];
      const seen = {};
      for (const ic of cfg.items ?? []) {
        const def = ITEMS[ic.item];
        if (!def) throw new Error(`알 수 없는 아이템: ${ic.item}`);
        const n = ic.count ?? 1;
        for (let i = 0; i < n; i++) {
          seen[ic.item] = (seen[ic.item] ?? 0) + 1;
          const id = ic.id ? (n > 1 ? `${ic.id}#${i + 1}` : ic.id) : `${ic.item}#${seen[ic.item]}`;
          this.items.push(new Item(this, def, ic, id));
        }
      }
    }

    get enemy() { return this.combat.sides[1 - this.index]; }
    log(text, raw = false) { this.combat.log(this, text, raw); }
    byId(ref) {
      const hit = this.items.find((o) => o.id === ref) ?? this.items.find((o) => o.id === `${ref}#1`);
      if (hit) return hit;
      const byName = this.items.filter((o) => o.name === ref);
      if (byName.length) return byName[0];
      throw new Error(`[${this.name}] 별 대상 "${ref}" 을(를) 찾을 수 없음`);
    }

    // ── 버프 / 자원 ──
    gain(stat, n, src) {
      if (n <= 0) return;
      this.s[stat] += n;
      this.log(`${srcName(src)} gained ${fmt(n)} :${LABEL[stat]}:`);
    }
    addArmor(n, src, verb = 'added') {
      if (n <= 0) return;
      this.armor += n;
      this.log(`${srcName(src)} ${verb} ${fmt(n)} :Armor:`);
    }
    gainStamina(n, src) {
      this.stamina = Math.min(this.maxStamina, this.stamina + n);
      this.log(`${srcName(src)} gained ${fmt(n)} :Stamina:`);
    }
    spendMana(n, src) {
      if (this.s.mana < n) return false;
      this.s.mana -= n;
      this.log(`${srcName(src)} removed ${fmt(n)} :Mana:`);
      return true;
    }
    addResist(n, src) {
      this.resistPool.push({ src: srcName(src), n });
      this.log(`${srcName(src)} gained ${fmt(n)} :Resist:`);
    }
    addDamageReduction(r) { this.damageReduction = 1 - (1 - this.damageReduction) * (1 - r); }
    randomBuffs(n, src) {
      const got = {};
      for (let i = 0; i < n; i++) { const k = this.combat.rng.pick(BUFFS); got[k] = (got[k] ?? 0) + 1; }
      for (const k of BUFFS) if (got[k]) this.gain(k, got[k], src);
    }
    tempRegen(amount, duration, src) {
      this.staminaRegen += amount;
      this.log(`${srcName(src)} gained ${fmt(amount)} :StaminaRecovery:`);
      this.combat.addTimer(this.combat.t + duration, () => {
        this.staminaRegen -= amount;
        this.log(`${srcName(src)} removed ${fmt(amount)} :StaminaRecovery:`);
      });
    }
    tempHaste(n, duration, src) {
      this.gain('haste', n, src);
      this.combat.addTimer(this.combat.t + duration, () => {
        this.s.haste = Math.max(0, this.s.haste - n);
        this.log(`${srcName(src)} removed ${fmt(n)} :Haste:`);
      });
    }

    // ── 디버프 ──
    /** 상대에게 디버프를 건다. 상대의 Resist 가 먼저 소모된다 (Insanity 제외). */
    inflict(stat, n, src) {
      const B = this.enemy;
      let left = n;
      if (stat !== 'insanity') {
        while (left > 0 && B.resistPool.length) {
          const r = B.resistPool[0];
          const k = Math.min(left, r.n);
          r.n -= k; left -= k;
          B.log(`${r.src} resisted ${k} :${LABEL[stat]}: from ${srcName(src)} to [${this.name}]`);
          if (r.n <= 0) B.resistPool.shift();
        }
      }
      if (left <= 0) return;
      if (B.s[stat] <= 0 && stat in DOT_INTERVAL) B.next[stat] = this.combat.t + DOT_INTERVAL[stat];
      B.s[stat] += left;
      this.log(`${srcName(src)} inflicted ${left} :${LABEL[stat]}: to [${B.name}]`);
    }
    /** 자신의 디버프를 n 스택 제거. 종류를 지정하지 않으면 걸려 있는 종류 중에서 무작위로 한 스택씩. */
    cleanse(n, src, types = DEBUFFS) {
      const removed = {};
      for (let i = 0; i < n; i++) {
        const present = types.filter((k) => this.s[k] > 0);
        if (!present.length) break;
        const k = present.length === 1 ? present[0] : this.combat.rng.pick(present);
        this.s[k]--;
        removed[k] = (removed[k] ?? 0) + 1;
      }
      let total = 0;
      for (const k of Object.keys(removed)) {
        total += removed[k];
        if (this.s[k] <= 0 && k in this.next) this.next[k] = null;
        this.log(`${srcName(src)} removed ${removed[k]} :${LABEL[k]}:`);
      }
      return total;
    }
    stun(duration, src) {
      const B = this.enemy;
      const d = duration * B.stunMult;
      const t = this.combat.t;
      B.stunnedUntil = Math.max(B.stunnedUntil, t + d);
      this.combat.addTimer(t + d, null);
      this.log(`${srcName(src)} stunned ${B.name} (${d.toFixed(2)}s) to [${B.name}]`);
      for (const o of this.items) o.def.onStunInflicted?.(o);
    }
    disableEnemyItem(duration, src) {
      const B = this.enemy;
      const cands = B.items.filter((o) => o.cd > 0 && !o.isPotion);
      if (!cands.length) return;
      const target = this.combat.rng.pick(cands);
      const d = duration * target.disableMult;
      const t = this.combat.t;
      target.disabledUntil = Math.max(target.disabledUntil, t + d);
      this.combat.addTimer(t + d, null);
      this.log(`${srcName(src)} disabled ${target.name} (${d.toFixed(1)}s) to [${B.name}]`);
    }
    invulnerable(duration, src) {
      const t = this.combat.t;
      this.invulnerableUntil = Math.max(this.invulnerableUntil, t + duration);
      this.combat.addTimer(t + duration, null);
      this.log(`${srcName(src)} gave invulnerable (${duration.toFixed(1)}s)`);
    }

    // ── 체력 ──
    /** 회복. 저주 1스택당 -1%(내림). 로그의 healed 는 실제 회복량, overhealed 는 버려진 양. */
    heal(n, src) {
      if (n <= 0) return 0;
      const c = Math.min(100, this.s.curse);
      const red = c > 0 ? Math.floor((n * c) / 100) : 0;
      const amt = n - red;
      const healed = Math.min(Math.max(0, this.maxHealth - this.health), amt);
      const over = amt - healed;
      this.health += healed;
      if (healed > 0) {
        this.log(`${srcName(src)} healed ${healed} :Health:`);
        if (c > 0) this.log(`:Curse: reduced :Health: gain by ${red} (${c}%)`, true);
        if (over > 0) this.log(`${srcName(src)} overhealed ${over} :Health:`, true);
      } else if (over > 0) {
        this.log(`${srcName(src)} overhealed ${over} :Health:`);
      }
      return healed;
    }
    /** 최대 체력 획득은 현재 체력도 같은 양만큼 올린다 (로그 검증). */
    gainMaxHealth(n, src) {
      const c = Math.min(100, this.s.curse);
      const red = c > 0 ? Math.floor((n * c) / 100) : 0;
      this.maxHealth += n - red;
      this.health += n - red;
      this.log(`${srcName(src)} gained ${n} :MaxHealth:`);
      if (c > 0) this.log(`:Curse: reduced :MaxHealth: gain by ${red} (${c}%)`, true);
    }
    /** 상대 최대 체력을 훔친다. 빼앗긴 쪽은 현재 체력이 새 최대치를 넘는 만큼만 깎인다 (로그 검증). */
    stealMaxHealth(n, src) {
      const B = this.enemy;
      B.maxHealth -= n;
      B.health = Math.min(B.health, B.maxHealth);
      const c = Math.min(100, this.s.curse);
      const gain = n - (c > 0 ? Math.floor((n * c) / 100) : 0);
      this.maxHealth += gain;
      this.health += gain;
      this.log(`${srcName(src)} stole ${n} :MaxHealth:`);
    }
    /** 방어도를 무시하고 상대 체력을 직접 빼앗아 회복한다 (Vampire Bat, 로그 검증). */
    stealHealth(n, src) {
      const B = this.enemy;
      if (B.invulnerableUntil > this.combat.t + EPS) return;
      B.health -= n;
      const room = Math.max(0, this.maxHealth - this.health);
      const healed = Math.min(room, n);
      this.health += healed;
      if (n - healed > 0) this.log(`${srcName(src)} overhealed ${n - healed} :Health:`);
      this.log(`${srcName(src)} stole ${n} :Health:`);
    }
    /** 피해를 받는다. 피해 감소는 내림(floor)으로 깎이고, 방어도 1당 피해 1을 흡수한다. */
    receive(amount, { reduce = false, ignoreArmor = false } = {}) {
      if (this.invulnerableUntil > this.combat.t + EPS) return { dealt: 0, armor: 0, health: 0, blocked: true };
      let x = amount;
      if (this.s.insanity > 0) x = Math.round(x * (1 + 0.01 * this.s.insanity));
      if (reduce && this.damageReduction > 0) {
        const red = Math.floor(x * this.damageReduction + EPS);
        if (red > 0) {
          this.log(`Damage reduced by ${fmt(this.damageReduction * 100)}% (${red} :Damage:)`);
          x -= red;
        }
      }
      let a = 0;
      if (!ignoreArmor && this.armor > 0) { a = Math.min(this.armor, x); this.armor -= a; }
      this.health -= x - a;
      return { dealt: x, armor: a, health: x - a, blocked: false };
    }
  }

  // ───────────────────────── 전투 ─────────────────────────
  class Combat {
    /**
     * @param build  { round, sides: [sideCfg, sideCfg], params? }
     * @param opts   { seed, log }
     */
    constructor(build, { seed = 1, log = false } = {}) {
      this.build = build;
      this.rng = makeRng(seed);
      this.logging = log;
      this.lines = [];
      this.groupOpen = false;
      this.t = 0;
      this.timers = [];
      this.seq = 0;
      this.over = false;
      this.inThreshold = false;
      this.params = {
        maxTime: 120,
        staminaMode: 'skip', // 스태미나 부족 시: 'skip' = 공격 없이 쿨다운만 재시작(2024 가이드), 'wait' = 찰 때까지 대기
        berserkerInvulnPerItem: 0.3, // 공식 아이템 페이지 변경 이력 v1.0.3: 안에 든 아이템당 0.3초
        // 피로 피해 수식은 공개 자료가 없어 임시 모델(30초부터 1초마다, 지수 증가)이다.
        fatigue: { start: 30, interval: 1, base: 5, growth: 1.12 },
        ...(build.params ?? {}),
      };
      this.sides = build.sides.map((c, i) => new Side(this, i, c, build.round ?? 22));
      for (const s of this.sides) this.setupSide(s);
    }

    // ── 로그 ──
    beginGroup() { this.groupOpen = true; }
    log(side, text, raw = false) {
      if (!this.logging) return;
      let head;
      if (raw) head = '';
      else if (this.groupOpen) { head = `${this.t.toFixed(1)}s`; this.groupOpen = false; }
      else head = '  -';
      this.lines.push(`${head}\t[${side.name}]\t${text}`);
    }
    addTimer(t, fn) { this.timers.push({ t, fn, seq: this.seq++ }); }

    // ── 준비 ──
    setupSide(side) {
      // 별 해석: 배열이면 id 로 지정된 아이템, 숫자면 개수만.
      for (const it of side.items) {
        const cfg = it.cfg.stars;
        const filter = it.def.star;
        if (cfg == null) continue;
        if (Array.isArray(cfg)) {
          it.starItems = cfg.map((ref) => side.byId(ref));
          it.stars = cfg.length;
        } else {
          it.stars = cfg;
          if (filter && filter !== 'count' && cfg > 0) {
            // 개수만 주어졌는데 대상 식별이 필요한 효과: 목록 순서대로 조건에 맞는 아이템을 고른다.
            it.starItems = side.items.filter((o) => o !== it && matchesStar(filter, o)).slice(0, cfg);
            side.warnings.push(`${it.id}: 별 대상이 개수(${cfg})로만 주어져 목록 순서대로 ${it.starItems.map((o) => o.id).join(', ') || '없음'} 을(를) 골랐습니다.`);
          }
        }
      }
      for (const it of side.items) {
        it.maxUses = it.def.uses ?? 0;
      }
      for (const it of side.items) it.def.setup?.(it);
      for (const it of side.items) it.uses = it.maxUses;
      side.stamina = side.maxStamina;
    }

    startOfCombat() {
      for (const side of this.sides) {
        this.beginGroupIfFirst(side);
        const hs = side.hero;
        const start = side.cfg.startBuffs ?? hs.startStat;
        const times = side.cfg.startBuffs ? 1 : hs.startStatTimes;
        if (start) for (let i = 0; i < times; i++) for (const k of Object.keys(start)) side.gain(k, start[k], side.name);
        for (const it of side.items) {
          if (!it.def.start) continue;
          it.def.start(it);
          this.notifyActivated(it);
        }
        const armor = side.cfg.armor ?? hs.armor;
        if (armor > 0) side.addArmor(armor, side.name, 'gained');
      }
    }
    beginGroupIfFirst(side) { if (side.index === 0) this.beginGroup(); }

    notifyActivated(item) {
      for (const o of item.side.items) if (o !== item) o.def.onAllyActivated?.(o, item);
    }

    /** 조건부 효과(물약, "체력 n% 미만" 등)를 확인한다. 상태가 바뀔 때마다 호출된다. */
    checkThresholds() {
      if (this.inThreshold) return;
      this.inThreshold = true;
      for (let pass = 0; pass < 4; pass++) {
        let fired = false;
        for (const side of this.sides) {
          if (side.health <= 0) continue;
          for (const it of side.items) if (it.def.threshold?.(it)) fired = true;
        }
        if (!fired) break;
      }
      this.inThreshold = false;
    }

    /** 물약 공통 처리. 조건이 맞으면 한 번 사용하고 0.4초 뒤에 다시 확인한다. */
    usePotion(it, effect) {
      if (it.uses <= 0 || this.t < it.readyAt - EPS) return false;
      it.uses--;
      it.readyAt = this.t + (it.def.cd ?? 0.4);
      this.addTimer(it.readyAt, null);
      for (const o of it.side.items) if (o !== it) o.def.onPotionUsed?.(o, it);
      it.side.log(`${it.name} was used ${it.uses}/${it.maxUses}`);
      effect(it);
      this.notifyActivated(it);
      return true;
    }

    // ── 공격 ──
    attack(it, { extra = false } = {}) {
      const A = it.side;
      const B = A.enemy;
      const def = it.def;
      const label = extra ? `${it.name} (Extra Attack)` : it.name;
      const cost = extra ? 0 : def.stamina ?? 0;
      if (cost > 0) {
        if (A.stamina + EPS < cost) {
          A.log(`${it.name} is out of :Stamina:`);
          return false;
        }
        A.stamina -= cost;
        this.checkThresholds();
      }
      def.onAttack?.(it);

      const acc = it.accuracy() + 0.03 * A.s.luck - 0.03 * A.s.blind;
      let hit = this.rng.chance(acc);
      if (hit && B.s.dodge > 0) { B.s.dodge--; hit = false; }
      if (!hit) {
        A.log(`${label} missed`);
        this.notifyActivated(it);
        return true;
      }
      const crit = this.rng.chance(it.critChance() + 0.01 * A.s.luck - 0.01 * A.s.curse);
      const [lo, hi] = it.dmgRange();
      const h = { crit, extra, mult: 1, dealt: 0 };
      let base = this.rng.int(lo, hi) + it.dmgBonus + (it.isPet ? 0 : A.s.empower);
      def.beforeDamage?.(it, h);
      base = Math.round(base * h.mult);

      let total = base;
      if (crit) {
        // 치명타 추가 피해 = 기본 피해 × 50% × 영웅 치명타 피해 × 무기 치명타 피해 × (1 + 상대 출혈%) + 자신의 가시
        let bonus = Math.floor(base * 0.5 * A.critDamage * it.critDamageMult() * (1 + 0.01 * B.s.bleed) + EPS) + A.s.thorns;
        if (B.critReduction > 0) {
          const red = Math.floor(bonus * B.critReduction + EPS);
          if (red > 0) B.log(`Critical damage reduced by ${fmt(B.critReduction * 100)}% (${red} :CritDamage:)`);
          bonus -= red;
        }
        total += bonus;
      }
      const res = B.receive(total, { reduce: true });
      h.dealt = res.dealt;
      if (res.blocked) A.log(`${label} blocked (invulnerable) to [${B.name}]`);
      else if (crit) A.log(`${label} ${res.dealt} :CritDamage: ${armorText(res.armor)}(Critical)`);
      else A.log(`${label} ${res.dealt} :Damage:${armorText(res.armor)} to [${B.name}]`);

      if (!it.isPet && A.s.lifesteal > 0 && res.dealt > 0) A.heal(Math.min(A.s.lifesteal, res.dealt), ':Lifesteal:');
      if (def.kind === 'melee' && B.s.thorns > 0) {
        const r = A.receive(B.s.thorns * (crit ? 2 : 1), { reduce: true });
        if (!r.blocked) B.log(`:Thorns: ${r.dealt} :Damage:${armorText(r.armor)} to [${A.name}]`);
      }

      for (const o of A.items) if (o !== it) o.def.onAllyHitEarly?.(o, it, h);
      def.onHit?.(it, h);
      if (crit) def.onCrit?.(it, h);
      for (const o of A.items) if (o !== it) o.def.onAllyHit?.(o, it, h);
      this.notifyActivated(it);
      return true;
    }

    // ── 주기 효과 ──
    dotTick(side, kind) {
      const n = side.s[kind];
      if (n <= 0) { side.next[kind] = null; return; }
      this.beginGroup();
      if (kind === 'insanity') {
        side.maxHealth -= n;
        side.health = Math.min(side.health, side.maxHealth);
        side.log(`:Insanity: removed ${n} :MaxHealth:`);
      } else {
        const r = side.receive(n, { ignoreArmor: kind === 'bleed' });
        if (!r.blocked) side.log(`:${LABEL[kind]}: ${r.dealt} :Damage:${armorText(r.armor)}`);
        if (kind === 'burn') side.s.burn--;
      }
      side.next[kind] = side.s[kind] > 0 ? side.next[kind] + DOT_INTERVAL[kind] : null;
    }
    regenTick() {
      for (const side of this.sides) {
        if (side.s.regeneration <= 0) continue;
        this.beginGroup();
        side.heal(side.s.regeneration, ':Regeneration:');
      }
      this.addTimer(this.t + 2, () => this.regenTick());
    }
    timeOfDay(name) {
      for (const side of this.sides) {
        this.beginGroup();
        for (const it of side.items) it.def.tod?.(it, name);
        if (side.index === 0) side.log(`${name} begins`);
      }
    }
    fatigueTick(n) {
      const f = this.params.fatigue;
      const dmg = Math.ceil(f.base * Math.pow(f.growth, n));
      for (const side of this.sides) {
        this.beginGroup();
        side.health -= dmg; // 방어도·피해 감소 무시 (패치 0.19)
        side.log(`:Fatigue: ${dmg} :Damage:`);
      }
      this.addTimer(this.t + f.interval, () => this.fatigueTick(n + 1));
    }

    // ── 메인 루프 ──
    run() {
      this.startOfCombat();
      this.addTimer(2, () => this.regenTick());
      for (const [t, name] of TIMES_OF_DAY) this.addTimer(t, () => this.timeOfDay(name));
      this.addTimer(this.params.fatigue.start, () => this.fatigueTick(0));
      this.checkThresholds();
      this.checkDeath();

      while (!this.over) {
        let dt = Infinity;
        for (const s of this.sides) {
          for (const it of s.items) {
            if (!it.cd || it.isPotion) continue;
            const r = it.rate();
            if (r <= 0) continue;
            let d = (it.cd - it.progress) / r;
            if (this.blockedByStamina(it)) {
              // 'wait' 모드: 쿨다운은 끝났지만 스태미나가 찰 때까지 기다린다.
              if (s.staminaRegen <= 0) continue;
              d = Math.max(d, (it.def.stamina - s.stamina) / s.staminaRegen);
            }
            if (d < dt) dt = d;
          }
          for (const k in s.next) if (s.next[k] != null && s.next[k] - this.t < dt) dt = s.next[k] - this.t;
        }
        for (const tm of this.timers) if (tm.t - this.t < dt) dt = tm.t - this.t;
        if (dt < 0) dt = 0;
        if (!Number.isFinite(dt) || this.t + dt > this.params.maxTime) { this.over = true; this.winner = -1; break; }
        this.advance(dt);
        this.fireDue();
      }
      return this.result();
    }

    advance(dt) {
      if (dt <= 0) return;
      for (const s of this.sides) {
        for (const it of s.items) {
          if (!it.cd || it.isPotion) continue;
          it.progress = Math.min(it.cd, it.progress + it.rate() * dt);
        }
        s.stamina = Math.min(s.maxStamina, s.stamina + s.staminaRegen * dt);
      }
      this.t += dt;
    }

    fireDue() {
      // 1) 타이머 (시간대 전환, 지속 효과 만료, 재생 등)
      const due = this.timers.filter((tm) => tm.t <= this.t + EPS).sort((a, b) => a.t - b.t || a.seq - b.seq);
      if (due.length) this.timers = this.timers.filter((tm) => tm.t > this.t + EPS);
      for (const tm of due) {
        if (tm.fn) { this.beginGroup(); tm.fn(); }
        if (this.afterAction()) return;
      }
      // 2) 지속 피해
      for (const s of this.sides) {
        for (const k of Object.keys(s.next)) {
          if (s.next[k] != null && s.next[k] <= this.t + EPS) {
            this.dotTick(s, k);
            if (this.afterAction()) return;
          }
        }
      }
      // 3) 아이템 발동
      for (const s of this.sides) {
        for (const it of s.items) {
          if (!it.cd || it.isPotion) continue;
          if (it.progress < it.cd - 1e-7 || it.rate() <= 0) continue;
          if (this.blockedByStamina(it)) continue;
          it.progress = 0;
          this.beginGroup();
          if (it.isWeapon) {
            this.attack(it);
          } else {
            it.def.tick?.(it);
            this.notifyActivated(it);
          }
          if (this.afterAction()) return;
        }
      }
    }

    blockedByStamina(it) {
      return this.params.staminaMode === 'wait' && it.isWeapon && (it.def.stamina ?? 0) > it.side.stamina + EPS;
    }

    afterAction() {
      this.checkThresholds();
      return this.checkDeath();
    }
    checkDeath() {
      const [a, b] = this.sides;
      if (a.health > 0 && b.health > 0) return false;
      this.over = true;
      this.winner = a.health <= 0 && b.health <= 0 ? -1 : a.health <= 0 ? 1 : 0;
      return true;
    }

    result() {
      return {
        winner: this.winner, // 0 / 1 = 이긴 진영 번호, -1 = 무승부(동시 사망 또는 시간 초과)
        time: this.t,
        sides: this.sides.map((s) => ({
          name: s.name, health: s.health, maxHealth: s.maxHealth, armor: s.armor, warnings: s.warnings,
        })),
        log: this.lines,
      };
    }
  }

  function matchesStar(filter, o) {
    switch (filter) {
      case 'weapon': return o.kind === 'melee' || o.kind === 'ranged';
      case 'weaponPet': return o.isWeapon;
      case 'ranged': return o.kind === 'ranged';
      case 'potion': return o.isPotion;
      default: return true;
    }
  }

  function simulate(build, opts) {
    return new Combat(build, opts).run();
  }

  return { EPS, BUFFS, DEBUFFS, LEVEL_UNITS, Combat, simulate };
});
