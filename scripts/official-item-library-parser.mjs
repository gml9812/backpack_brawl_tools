import { decodeHtml, htmlToText, parseOfficialItemLibrary as parseBase, hashText } from './official-item-library-parser-base.mjs';
export { decodeHtml, htmlToText, hashText };

function dedupeLabel(label) {
  const words = label.trim().split(/\s+/);
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    if (words.slice(0, half).join(' ') === words.slice(half).join(' ')) return words.slice(half).join(' ');
  }
  if (words.length === 3 && words[0] === words[1]) return words.slice(1).join(' ');
  return label;
}

export function parseOfficialItemLibrary(html, options = {}) {
  return parseBase(html, options).map((item) => ({
    ...item,
    baseStats: item.baseStats.map((stat) => ({ ...stat, label: dedupeLabel(stat.label) }))
  }));
}

export function validateOfficialItems(items) {
  const errors = [];
  const ids = new Set(items.map((item) => item.id));
  const boardItems = items.filter((item) => item.category !== 'boons' && item.category !== 'boons-past');
  if (items.length < 1000) errors.push(`Expected at least 1000 official cards, got ${items.length}.`);
  if (ids.size !== items.length) errors.push(`Expected unique item ids, got ${ids.size}/${items.length}.`);
  if (boardItems.length < 900) errors.push(`Expected at least 900 board cards, got ${boardItems.length}.`);
  const missingIdentity = boardItems.filter((item) => !item.name || !item.rarity || !item.types.length);
  if (missingIdentity.length) errors.push(`${missingIdentity.length} board cards are missing name, rarity, or type.`);
  const missingBoardFootprint = boardItems.filter((item) => !item.footprint.length);
  if (missingBoardFootprint.length) errors.push(`${missingBoardFootprint.length} board cards are missing footprint data.`);
  const goldenSkull = items.find((item) => item.id === 'golden-skull');
  if (!goldenSkull || !/On shop entered:[\s\S]*Gain 0-3 Gold/i.test(goldenSkull.effect)) errors.push('Golden Skull official sentinel is invalid.');
  if (errors.length) throw new Error(`Official Item Library validation failed:\n- ${errors.join('\n- ')}`);
  return { itemCount: items.length, boardItemCount: boardItems.length };
}
