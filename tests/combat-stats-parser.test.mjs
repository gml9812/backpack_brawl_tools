import assert from 'node:assert/strict';
import { htmlToText, parseCombatStats } from '../scripts/combat-stats-parser.mjs';

const html = `
<span class="game-icon-label item-detail-price" title="Gold"><img alt="Gold"><span>3</span></span>
<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
  <div><span class="block text-xs uppercase tracking-wide text-gray-500">Damage</span><strong>3?4</strong></div>
  <div><span class="block text-xs uppercase tracking-wide text-gray-500">Cooldown</span><strong>2s</strong></div>
</div>
<div class="game-effect"><p><strong>On attack:</strong></p><ul><li><strong>40%</strong> chance to gain <img alt="Mana">.</li></ul></div>
<section><h2 class="text-2xl">Levels</h2><table><tbody>
<tr><td>1</td><td>5</td><td>5</td><td><span>Starting level</span></td></tr>
<tr><td>2</td><td>10</td><td>20</td><td><span><img alt="Damage"> Modify Item Stat: +1 Damage Max</span></td></tr>
</tbody></table></section>
`;

const parsed = parseCombatStats(html);
assert.equal(parsed.price, '3');
assert.deepEqual(parsed.baseStats, [
  { label: 'Damage', value: '3?4' },
  { label: 'Cooldown', value: '2s' }
]);
assert.deepEqual(parsed.effects, ['On attack: 40% chance to gain Mana']);
assert.deepEqual(parsed.levels, [
  { level: 1, cards: '5', coins: '5', upgrade: 'Starting level' },
  { level: 2, cards: '10', coins: '20', upgrade: 'Damage Modify Item Stat: +1 Damage Max' }
]);
assert.equal(htmlToText('<p>Gain <img title="Armor">.</p>'), 'Gain Armor');

const descriptive = parseCombatStats('<div class="game-effect"><p>Start of combat:</p><ul><li>Gain 15 <img alt="Health"></li></ul></div>');
assert.deepEqual(descriptive.baseStats, []);
assert.deepEqual(descriptive.effects, ['Start of combat: Gain 15 Health']);

console.log('combat-stats-parser.test.mjs passed');
