import crypto from 'node:crypto';

const NAMED_ENTITIES = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', times: '×'
};

export function decodeHtml(value = '') {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, token) => {
    if (token[0] === '#') {
      const hexadecimal = token[1].toLowerCase() === 'x';
      return String.fromCodePoint(Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10));
    }
    return NAMED_ENTITIES[token.toLowerCase()] ?? `&${token};`;
  });
}

function iconText(value = '') {
  return value.replace(/<span class="game-icon-wrap"[^>]*data-tip="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, ' $1 ')
    .replace(/<img[^>]+(?:alt|title)="([^"]*)"[^>]*>/gi, ' $1 ');
}

export function htmlToText(value = '') {
  return decodeHtml(iconText(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(?:p|li|ul|ol|div|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function attribute(tag, name) {
  return decodeHtml(tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] || '');
}

function normalizeTypes(values) {
  const types = new Set();
  for (const raw of values) {
    const value = decodeHtml(raw).trim();
    if (!value) continue;
    if (/^(Melee|Ranged) Weapon$/i.test(value)) {
      types.add(value.split(' ')[0]);
      types.add('Weapon');
    } else {
      types.add(value);
    }
  }
  return [...types];
}

function parseShape(template) {
  const cells = [...template.matchAll(/<div class="cell (?<kind>item|star|gap)" style="grid-area:\s*(?<row>\d+)\s*\/\s*(?<column>\d+)[^;]*;"/g)]
    .map((match) => ({ kind: match.groups.kind, x: Number(match.groups.column), y: Number(match.groups.row) }));
  const occupied = cells.filter((cell) => cell.kind === 'item');
  const stars = cells.filter((cell) => cell.kind === 'star');
  if (!occupied.length) return { footprint: [], starOffsets: [] };
  const minX = Math.min(...occupied.map((cell) => cell.x));
  const minY = Math.min(...occupied.map((cell) => cell.y));
  return {
    footprint: occupied.map((cell) => [cell.x - minX, cell.y - minY]),
    starOffsets: stars.map((cell) => [cell.x - minX, cell.y - minY])
  };
}

function parseHeader(template) {
  const name = htmlToText(template.match(/<strong class="text-base[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || '');
  const rarityBlock = template.match(/<p class="text-xs font-bold text-bb-[^"]+">([\s\S]*?)<\/p>/i)?.[1] || '';
  const rarity = htmlToText(rarityBlock.replace(/<span[\s\S]*$/i, ''));
  const typeBlock = rarityBlock.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
  const types = normalizeTypes(htmlToText(typeBlock).split('·').map((value) => value.trim()));
  const priceMatch = template.match(/text-bb-amber">\s*([^<]+)<span class="game-icon-wrap"[^>]*data-tip="Gold"/i);
  return { name, rarity, types, price: htmlToText(priceMatch?.[1] || '') };
}

function parseStats(template) {
  const stats = [];
  for (const match of template.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const label = htmlToText(match[1]);
    const value = htmlToText(match[2]);
    if (label && value) stats.push({ label, value });
  }
  return stats;
}

function parseEffect(template) {
  const block = template.match(/<div class="effect-text[^>]*>([\s\S]*?)<\/div>(?:<p|<\/template>|$)/i)?.[1] || '';
  return htmlToText(block);
}

function parseRecipe(template) {
  const match = template.match(/<p class="[^"]*border-t[^>]*>([\s\S]*?)<\/p>/i);
  if (!match || !/\bCraft:/i.test(htmlToText(match[1]))) return '';
  return htmlToText(match[1]).replace(/^Craft:\s*/i, '');
}

function parseCountsAs(effect) {
  const match = effect.match(/\bcounts as(?:\s+(?:a|an))?\s+(?:(\d+)\s+)?([^\n.;]+)/i);
  return match ? { count: Number(match[1] || 1), name: match[2].trim() } : null;
}

function categoryToHero(category) {
  if (category === 'shared-shop' || category === 'shared-craftable' || category === 'relics' || category.startsWith('boons')) return 'shared';
  return category === 'hob-gang' ? 'hob' : category;
}

export function parseOfficialItemLibrary(html, options = {}) {
  const templates = new Map();
  for (const match of html.matchAll(/<template id="(?<id>card-[^"]+)"[^>]*>(?<body>[\s\S]*?)<\/template>/g)) {
    templates.set(match.groups.id, match.groups.body);
  }

  const items = [];
  const anchorPattern = /<a href="\/items\/(?<slug>[^"]+)"(?<tag>[^>]*)data-card="(?<card>card-[^"]+)"(?<rest>[^>]*)>(?<body>[\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(anchorPattern)) {
    const template = templates.get(match.groups.card);
    if (!template) continue;
    const categoryMatch = match.groups.card.match(/^card-(.+)-\d+$/);
    if (!categoryMatch) continue;
    const category = categoryMatch[1];
    const anchorTag = `<a ${match.groups.tag} data-card="${match.groups.card}" ${match.groups.rest}>`;
    const header = parseHeader(template);
    const shape = parseShape(template);
    const effect = parseEffect(template);
    const slug = match.groups.slug.replace(/\/$/, '');
    const imagePath = match.groups.body.match(/<img src="([^"]+)"[^>]*class="mt-3/i)?.[1] || '';
    items.push({
      id: slug,
      name: header.name || slug,
      category,
      hero: categoryToHero(category),
      rarity: header.rarity || attribute(anchorTag, 'data-rarity'),
      types: header.types,
      price: header.price,
      baseStats: parseStats(template),
      effect,
      recipe: parseRecipe(template),
      countsAs: parseCountsAs(effect),
      footprint: shape.footprint,
      starOffsets: shape.starOffsets,
      imageUrl: imagePath ? new URL(imagePath, options.baseUrl || 'https://www.backpackbrawl.com').href : '',
      sourceUrl: new URL(`/items/${slug}/`, options.baseUrl || 'https://www.backpackbrawl.com').href,
      search: attribute(anchorTag, 'data-search')
    });
  }
  return items;
}

export function validateOfficialItems(items) {
  const errors = [];
  const ids = new Set(items.map((item) => item.id));
  const boardItems = items.filter((item) => item.category !== 'boons' && item.category !== 'boons-past');
  if (items.length < 1000) errors.push(`Expected at least 1000 official cards, got ${items.length}.`);
  if (ids.size !== items.length) errors.push(`Expected unique item ids, got ${ids.size}/${items.length}.`);
  if (boardItems.length < 900) errors.push(`Expected at least 900 board cards, got ${boardItems.length}.`);
  const missingCore = items.filter((item) => !item.name || !item.rarity || !item.types.length || !item.footprint.length);
  if (missingCore.length) errors.push(`${missingCore.length} cards are missing name, rarity, type, or footprint.`);
  const goldenSkull = items.find((item) => item.id === 'golden-skull');
  if (!goldenSkull || !/On shop entered:[\s\S]*Gain 0-3 Gold/i.test(goldenSkull.effect)) {
    errors.push('Golden Skull official sentinel does not contain "On shop entered: Gain 0-3 Gold".');
  }
  if (errors.length) throw new Error(`Official Item Library validation failed:\n- ${errors.join('\n- ')}`);
  return { itemCount: items.length, boardItemCount: boardItems.length };
}

export function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
