import { htmlToText } from './official-item-library-parser.mjs';

const clean = (html) => htmlToText(html).replace(/\s+/g, ' ').trim();

/** Returns the `.level-bonus` section of an official item page, or '' when the item has none. */
export function extractLevelSection(html) {
  const start = html.search(/<section class="level-bonus[\s"]/);
  if (start < 0) return '';
  const end = html.indexOf('</section>', start);
  if (end < 0) throw new Error('Unterminated level-bonus section');
  return html.slice(start, end + '</section>'.length);
}

/** Parses a `.level-bonus` section into its range, summary and per-level text. */
export function parseLevelSection(section) {
  if (!section) return null;
  const range = section.match(/<h2[^>]*>Level bonus<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '';
  const summary = section.match(/<div class="effect-text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const alsoAdds = section.match(/Levels also add:<\/span>([\s\S]*?)<\/p>/)?.[1] ?? '';
  const list = section.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? '';
  const levels = [];
  for (const entry of list.matchAll(/<li[^>]*>\s*<span[^>]*>Lv (\d+)<\/span>([\s\S]*?)<\/li>/g)) {
    levels.push({ level: Number(entry[1]), text: clean(entry[2]) });
  }
  return { range: clean(range), summary: clean(summary), alsoAdds: clean(alsoAdds), levels };
}

/** Throws unless the parsed snapshot still looks like the official level tables. */
export function validateLevelRecords(records, rarityById) {
  const entries = Object.entries(records);
  const expectedCount = Object.keys(rarityById).length;
  if (entries.length !== expectedCount) throw new Error(`Expected ${expectedCount} level records, got ${entries.length}`);
  for (const [id, record] of entries) {
    const rarity = rarityById[id];
    if (record === null) {
      if (rarity !== 'Special') throw new Error(`${id}: ${rarity} item has no level table`);
      continue;
    }
    const maxLevel = rarity === 'Relic' ? 10 : 15;
    const numbers = record.levels.map((entry) => entry.level);
    if (numbers.length !== maxLevel || numbers.some((level, index) => level !== index + 1)) {
      throw new Error(`${id}: expected levels 1-${maxLevel}, got [${numbers.join(', ')}]`);
    }
    if (record.levels.some((entry) => !entry.text)) throw new Error(`${id}: empty level text`);
  }
  const text = (id, level) => records[id]?.levels[level - 1]?.text ?? '';
  const sentinels = [
    ['predator-scales', 15, /^180 Armor$/],
    ['mallet', 2, /^Gain \+1 max Damage$/],
    ['world-s-end', 5, /30% chance to gain 1 Lifesteal and 1 Empower/],
  ];
  for (const [id, level, pattern] of sentinels) {
    if (!pattern.test(text(id, level))) throw new Error(`${id} Lv ${level} sentinel failed: "${text(id, level)}"`);
  }
  return { itemCount: entries.length, withLevelBonus: entries.filter(([, record]) => record !== null).length };
}
