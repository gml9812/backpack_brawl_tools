import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const assetDirectory = path.join(projectRoot, 'assets', 'items');
const outputPath = path.join(projectRoot, 'optimizer-catalog.js');
const reportPath = path.join(projectRoot, 'optimizer-catalog-report.json');
const officialBase = 'https://www.backpackbrawl.com';
const proBase = 'https://backpackbrawlpro.com';
const verifiedOn = new Date().toISOString().slice(0, 10);
const concurrency = Math.max(2, Math.min(24, Number(process.env.BB_CATALOG_CONCURRENCY || 16)));

function decodeHtml(value = '') {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, token) => {
    if (token[0] === '#') {
      const hexadecimal = token[1].toLowerCase() === 'x';
      return String.fromCodePoint(Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10));
    }
    return named[token.toLowerCase()] ?? `&${token};`;
  });
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<img[^>]+alt="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchResponse(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'BackpackBrawlStarOptimizerDataBuilder/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

async function fetchText(url) {
  return (await fetchResponse(url)).text();
}

async function mapConcurrent(values, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

function parseOfficialItems(html) {
  const items = [];
  const pattern = /<a href="\/items\/(?<slug>[^"]+)"[^>]+data-card="card-(?<category>.+?)-\d+" data-search="(?<search>[^"]*)" data-rarity="(?<rarity>[^"]+)">(?<body>[\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const category = match.groups.category;
    if (category === 'boons' || category === 'boons-past') continue;
    const body = match.groups.body;
    const image = body.match(/<img src="(?<src>[^"]+)"[^>]*class="mt-3/)?.groups?.src;
    const name = body.match(/<span class="mt-1\.5[^>]*>(?<name>[^<]+)<\/span>/)?.groups?.name;
    items.push({
      slug: match.groups.slug.replace(/\/$/, ''),
      name: decodeHtml(name || match.groups.slug),
      rarity: match.groups.rarity,
      category,
      search: decodeHtml(match.groups.search),
      sourceImage: image ? `${officialBase}${image}` : null,
      official: true
    });
  }
  return items;
}

function parseGalleryCards(html, category) {
  const items = [];
  const pattern = /<a href="\/items\/(?<slug>[^"]+)" class="item-gallery-card[^>]*data-rarity="(?<rarity>[^"]+)"[\s\S]*?<img src="(?<image>\/game-assets\/[^"]+)" alt="(?<name>[^"]+)" class="item-gallery-art"[\s\S]*?<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    items.push({
      slug: match.groups.slug.replace(/\/$/, ''),
      name: decodeHtml(match.groups.name),
      rarity: match.groups.rarity,
      category,
      search: '',
      sourceImage: `${proBase}${match.groups.image}`,
      official: false
    });
  }
  return items;
}

function normalizeTypes(rawTypes) {
  const types = new Set();
  for (const raw of rawTypes) {
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

function parseItemPage(seed, html) {
  const cells = [...html.matchAll(/item-footprint__cell item-footprint__cell--(?<kind>occupied|star)" style="grid-column:(?<x>\d+);grid-row:(?<y>\d+)/g)]
    .map((match) => ({ kind: match.groups.kind, x: Number(match.groups.x), y: Number(match.groups.y) }));
  const occupied = cells.filter((cell) => cell.kind === 'occupied');
  const stars = cells.filter((cell) => cell.kind === 'star');
  const minX = occupied.length ? Math.min(...occupied.map((cell) => cell.x)) : 0;
  const minY = occupied.length ? Math.min(...occupied.map((cell) => cell.y)) : 0;
  const footprint = occupied.map((cell) => [cell.x - minX, cell.y - minY]);
  const starOffsets = stars.map((cell) => [cell.x - minX, cell.y - minY]);
  const rawTypes = [...html.matchAll(/item-detail-tag--type[^>]*>(?<type>[^<]+)<\/a>/g)].map((match) => match.groups.type);
  const types = normalizeTypes(rawTypes);
  const rarity = html.match(/item-detail-tag--rarity[^>]*data-rarity="(?<rarity>[^"]+)"/)?.groups?.rarity || seed.rarity;
  const hero = html.match(/<a href="\/heroes\/(?<hero>[^"]+)" class="item-detail-tag item-detail-tag--hero/)?.groups?.hero || 'shared';
  const sourceImage = html.match(/<img src="(?<src>[^"]+)" alt="[^"]*" class="item-footprint__art"/)?.groups?.src;
  const jsonLd = html.match(/<script type="application\/ld\+json">(?<json>[\s\S]*?)<\/script>/)?.groups?.json;
  let description = '';
  try { description = jsonLd ? JSON.parse(jsonLd).description || '' : ''; } catch { description = ''; }
  const effects = [...html.matchAll(/<div class="game-effect">(?<effect>[\s\S]*?)<\/div>/g)].map((match) => stripTags(match.groups.effect));
  return {
    seed, footprint, starOffsets, types, rarity, hero,
    description: decodeHtml(description), effects,
    sourceImage: sourceImage ? `${proBase}${sourceImage}` : seed.sourceImage
  };
}

const actionWords = /\b(?:gain|gains|are|is|hit|hits|attack|attacks|activate|activates|trigger|triggers|have|has|deal|deals|inflict|inflicts|heal|heals|use|uses|lose|loses|start|gets|get|ignore|ignores|remove|removes|take|takes|become|becomes|cost|costs|cooldown|cooldowns|cannot|can|will)\b/i;

function inferGroups(record, knownTypes, knownNames) {
  if (!record.starOffsets.length) return [];
  const text = [record.description, ...record.effects].join(' ');
  const conditions = new Map();
  for (const match of text.matchAll(/\bStar\b/gi)) {
    const tail = text.slice(match.index + match[0].length).replace(/^\s+/, '');
    const punctuation = tail.search(/[.:;,]/);
    const action = tail.search(actionWords);
    const cutoffCandidates = [punctuation, action, 70].filter((value) => value >= 0);
    const segment = tail.slice(0, Math.min(...cutoffCandidates)).trim();
    if (!segment) continue;
    if (/^items?\b/i.test(segment)) {
      conditions.set('any', { any: true, label: `Star ${segment}` });
      continue;
    }
    const matchedTypes = knownTypes.filter((type) => new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(segment));
    if (matchedTypes.length) {
      const uniqueTypes = [...new Set(matchedTypes)];
      const key = `types:${uniqueTypes.sort().join('|')}`;
      conditions.set(key, { anyTypes: uniqueTypes, label: `Star ${segment}` });
      continue;
    }
    const item = knownNames.find((candidate) => new RegExp(`^${candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(segment));
    if (item) conditions.set(`item:${item.id}`, { anyItemIds: [item.id], label: `Star ${segment}` });
  }
  return [...conditions.entries()].map(([key, condition], index) => {
    const target = { ...condition };
    delete target.label;
    if (/another type/i.test(condition.label)) target.excludedItemIds = [record.seed.slug];
    return {
      id: `generated-${slugify(key) || index + 1}`,
      label: condition.label,
      offsets: record.starOffsets,
      target,
      scoreMode: 'unique-target'
    };
  });
}

async function existingAsset(slug) {
  for (const extension of ['webp', 'png', 'jpg', 'jpeg']) {
    const candidate = path.join(assetDirectory, `${slug}.${extension}`);
    try { await fs.access(candidate); return `assets/items/${slug}.${extension}`; } catch { /* Continue. */ }
  }
  return null;
}

async function ensureImage(record) {
  const existing = await existingAsset(record.seed.slug);
  if (existing) return existing;
  if (!record.sourceImage) return null;
  const pathname = new URL(record.sourceImage).pathname;
  const extension = path.extname(pathname).toLowerCase().replace('.', '') || 'png';
  const safeExtension = ['webp', 'png', 'jpg', 'jpeg'].includes(extension) ? extension : 'png';
  const relative = `assets/items/${record.seed.slug}.${safeExtension}`;
  const destination = path.join(projectRoot, ...relative.split('/'));
  const response = await fetchResponse(record.sourceImage);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, bytes);
  return relative;
}

console.log('Reading the official current item library…');
const officialHtml = await fetchText(`${officialBase}/items/`);
const officialItems = parseOfficialItems(officialHtml);
if (officialItems.length < 850) throw new Error(`Official extraction returned only ${officialItems.length} board items.`);

console.log('Adding Skara, which is present in game 6.0.1 but absent from the official library page…');
const skaraUrl = `${proBase}/items?hero=skara&rarity=Common&rarity=Rare&rarity=Epic&rarity=Legendary&rarity=Mythic&rarity=Unique&rarity=Relic&hideUnavailable=1`;
const skaraItems = parseGalleryCards(await fetchText(skaraUrl), 'skara');
if (skaraItems.length < 30) throw new Error(`Skara extraction returned only ${skaraItems.length} items.`);

const seedsBySlug = new Map();
for (const item of [...officialItems, ...skaraItems]) seedsBySlug.set(item.slug, item);
const seeds = [...seedsBySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
console.log(`Fetching ${seeds.length} structured item pages with concurrency ${concurrency}…`);
let completed = 0;
const pageRecords = await mapConcurrent(seeds, async (seed) => {
  try {
    const html = await fetchText(`${proBase}/items/${seed.slug}/`);
    return parseItemPage(seed, html);
  } catch (error) {
    return { seed, footprint: [], starOffsets: [], types: [], rarity: seed.rarity, hero: seed.category, description: '', effects: [], sourceImage: seed.sourceImage, error: error.message };
  } finally {
    completed += 1;
    if (completed % 50 === 0 || completed === seeds.length) console.log(`Pages ${completed}/${seeds.length}`);
  }
});

const knownTypes = [...new Set(pageRecords.flatMap((record) => record.types))]
  .sort((a, b) => b.length - a.length || a.localeCompare(b));
const knownNames = seeds.map((seed) => ({ id: seed.slug, name: seed.name })).sort((a, b) => b.name.length - a.name.length);

console.log('Downloading missing local images…');
completed = 0;
const images = await mapConcurrent(pageRecords, async (record) => {
  try { return await ensureImage(record); }
  catch (error) { record.imageError = error.message; return null; }
  finally {
    completed += 1;
    if (completed % 100 === 0 || completed === pageRecords.length) console.log(`Images ${completed}/${pageRecords.length}`);
  }
});

const items = pageRecords.map((record, index) => {
  const starGroups = inferGroups(record, knownTypes, knownNames);
  const bag = record.types.includes('Bag');
  const missingLayout = !record.footprint.length;
  const ambiguousStars = record.starOffsets.length > 0 && !starGroups.length;
  const missingImage = !images[index];
  const selectable = !bag && !missingLayout && !ambiguousStars && !missingImage;
  let unsupportedReason = '';
  if (bag) unsupportedReason = 'Bag items are excluded from the fixed 9×6 board model.';
  else if (missingLayout) unsupportedReason = 'Structured footprint data is unavailable.';
  else if (ambiguousStars) unsupportedReason = 'Star target wording could not be mapped safely.';
  else if (missingImage) unsupportedReason = 'A local image could not be downloaded.';
  return {
    id: record.seed.slug,
    name: record.seed.name,
    hero: record.hero === 'shared' ? 'shared' : record.hero.replace('hob-gang', 'hob'),
    rarity: record.rarity,
    types: record.types,
    image: images[index] || '',
    footprint: record.footprint,
    rotations: [0, 90, 180, 270],
    starGroups,
    selectable,
    dataStatus: selectable ? 'generated' : 'partial',
    unsupportedReason: unsupportedReason || undefined,
    source: { url: `${proBase}/items/${record.seed.slug}/`, verifiedOn }
  };
});

const selectable = items.filter((item) => item.selectable).length;
const partial = items.length - selectable;
const withStars = items.filter((item) => item.starGroups.length).length;
const catalog = {
  schemaVersion: 1,
  version: '6.0.1',
  verifiedOn,
  generatedFrom: [
    `${officialBase}/items/`,
    `${proBase}/items`,
    skaraUrl
  ],
  itemCount: items.length,
  selectableCount: selectable,
  partialCount: partial,
  items
};

await fs.writeFile(outputPath, `globalThis.BB_OPTIMIZER_CATALOG = ${JSON.stringify(catalog)};\n`, 'utf8');
await fs.writeFile(reportPath, JSON.stringify({
  schemaVersion: 1,
  generatedOn: new Date().toISOString(),
  gameVersion: catalog.version,
  itemCount: items.length,
  selectableCount: selectable,
  partialCount: partial,
  withStars,
  partialItems: items.filter((item) => !item.selectable).map((item) => ({ id: item.id, reason: item.unsupportedReason }))
}, null, 2), 'utf8');

console.log(`Generated ${items.length} items: ${selectable} selectable, ${partial} review-required, ${withStars} with parsed Star groups.`);
console.log(outputPath);
