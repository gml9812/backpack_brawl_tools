const assert = require('node:assert/strict');
const path = require('node:path');

const simulator = require(path.join(__dirname, '..', 'optimizer-combat.js'));

assert.deepEqual(simulator.damageRange('10–18'), { minimum: 10, maximum: 18 });
assert.equal(simulator.numeric('2.80s'), 2.8);
assert.equal(simulator.percent('75%'), 0.75);

const weapon = {
  id: 'test-blade',
  name: 'Test Blade',
  combat: {
    baseStats: [
      { label: 'Damage', value: '10–10' },
      { label: 'Cooldown', value: '2s' },
      { label: 'Accuracy', value: '100%' },
      { label: 'Critical chance', value: '0%' },
      { label: 'Critical damage', value: '0%' }
    ],
    effects: ['On hit: Gain 2 Mana and 3 Armor. Inflict 1 Bleed and 2 Slow', 'Every 5 seconds: Deal 4 Damage']
  }
};

const result = simulator.simulate({
  layout: [{ instanceId: 'test-blade#1', itemId: 'test-blade' }],
  items: [weapon],
  duration: 10,
  dummy: { armor: 5, reduction: 10, dodge: 0 }
});

assert.equal(result.rawDamage, 58);
assert.equal(result.damage, 47.7);
assert.equal(result.dps, 4.77);
assert.equal(result.expectedHits, 5);
assert.equal(result.buffs.Mana, 10);
assert.equal(result.buffs.Armor, 15);
assert.equal(result.debuffs.Bleed, 5);
assert.equal(result.debuffs.Slow, 10);
assert.equal(result.recognizedEffects, 3);
assert.equal(result.unsupportedEffects, 0);

const starItem = {
  id: 'star-item', name: 'Star Item',
  combat: { baseStats: [], effects: ['Start of Dawn: Gain 3 Armor per Star item'] }
};
const starResult = simulator.simulate({
  layout: [{ instanceId: 'star-item#1', itemId: 'star-item' }],
  items: [starItem],
  evaluation: { connections: [
    { sourceInstanceId: 'star-item#1', targetInstanceId: 'a' },
    { sourceInstanceId: 'star-item#1', targetInstanceId: 'b', weight: 2 }
  ] }
});
assert.equal(starResult.buffs.Armor, 9, 'counts-as weight multiplies per-Star effects');

console.log('optimizer-combat.test.js passed');
