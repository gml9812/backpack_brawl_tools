import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashText, parseOfficialItemLibrary, validateOfficialItems } from './official-item-library-parser.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const rawDirectory = path.join(projectRoot, 'raw');
const assetDirectory = path.join(projectRoot, 'assets', 'items');
const sourceUrl = 'https://www.backpackbrawl.com/items/';
const snapshotPath = path.join(rawDirectory, 'official-item-library.json');
const metadataPath = path.join(rawDirectory, 'official-item-library-meta.json');
const diffPath = path.join(rawDirectory, 'official-item-library-diff.json');
const offline = process.argv.includes('--offline');
const force = process.argv.includes('--force');
const verifiedOn = new Date().toISOString().slice(0, 10);
const boardCategories = new Set(['shared-shop', 'shared-craftable', 'relics', 'buzz', 'celeste', 'chana', 'dorf', 'enoch', 'fern', 'harkon', 'hob-gang', 'kragg', 'morrow', 'mycella', 'nymphedora', 'pepper', 'ronan', 'sage', 'skara', 'tink', 'zahir']);

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function readAssignment(file, prefix) {
  const raw = await fs.readFile(file, 'utf8');
  const json = raw.slice(prefix.length).trim().replace(/;$/, '');
  return JSON.parse(json);
}

async function atomicWrite(file, content) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, file);
}

function stableItem(item) {
  return JSON.stringify({ name: item.name, category: item.category, hero: item.hero, rarity: item.rarity, types: item.types, price: item.price, baseStats: item.baseStats, effect: item.effect, recipe: item.recipe, countsAs: item.countsAs, footprint: item.footprint, starOffsets: item.starOffsets, imageUrl: item.imageUrl });
}

function createDiff(previous, current) {
  const before = new Map((previous?.items || []).map((item) => [item.id, item]));
  const after = new Map(current.map((item) => [item.id, item]));
  return {
    generatedOn: new Date().toISOString(),
    added: current.filter((item) => !before.has(item.id)).map((item) => item.id),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    changed: current.filter((item) => before.has(item.id) && stableItem(before.get(item.id)) !== stableItem(item)).map((item) => item.id)
  };
}

async function fetchOfficial(previousSnapshot, previousMetadata) {
  if (offline) {
    if (!previousSnapshot) throw new Error('--offline requested but no official snapshot exists.');
    return { snapshot: previousSnapshot, metadata: previousMetadata, changed: false, status: 'offline-cache' };
  }
  const headers = { 'user-agent': 'BackpackBrawlOfficialDataBuilder/2.0' };
  if (!force && previousMetadata?.lastModified) headers['if-modified-since'] = previousMetadata.lastModified;
  const response = await fetch(sourceUrl, { headers, signal: AbortSignal.timeout(45000) });
  if (response.status === 304) {
    if (!previousSnapshot) throw new Error('Official server returned 304 but no local snapshot exists.');
    return { snapshot: previousSnapshot, metadata: previousMetadata, changed: false, status: 'not-modified' };
  }
  if (!response.ok) throw new Error(`Official Item Library request failed: ${response.status} ${response.statusText}`);
  const html = await response.text();
  const items = parseOfficialItemLibrary(html, { baseUrl: 'https://www.backpackbrawl.com' });
  const validation = validateOfficialItems(items);
  const metadata = {
    schemaVersion: 1,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    lastModified: response.headers.get('last-modified') || '',
    sha256: hashText(html),
    itemCount: validation.itemCount,
    boardItemCount: validation.boardItemCount
  };
  return { snapshot: { schemaVersion: 1, ...metadata, items }, metadata, changed: true, status: 'downloaded' };
}

function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
const actionWords = /\b(?:gain|gains|are|is|hit|hits|attack|attacks|activate|activates|trigger|triggers|have|has|deal|deals|inflict|inflicts|heal|heals|use|uses|lose|loses|start|gets|get|ignore|ignores|remove|removes|take|takes|become|becomes|cost|costs|cooldown|cooldowns|cannot|can|will)\b/i;

function inferGroups(record, knownTypes, knownNames) {
  if (!record.starOffsets.length) return [];
  const text = record.effect;
  const conditions = new Map();
  for (const match of text.matchAll(/\bStar\b/gi)) {
    const tail = text.slice(match.index + match[0].length).replace(/^\s+/, '');
    const punctuation = tail.search(/[.:;,\n]/); const action = tail.search(actionWords);
    const segment = tail.slice(0, Math.min(...[punctuation, action, 70].filter((value) => value >= 0))).trim();
    if (!segment) continue;
    if (/^items?\b/i.test(segment)) { conditions.set('any', { any: true, label: `Star ${segment}` }); continue; }
    const namedItem = knownNames.find((candidate) => candidate.name.includes(' ') && new RegExp(`^${candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(segment));
    if (namedItem) { conditions.set(`item:${namedItem.id}`, { anyItemIds: [namedItem.id], label: `Star ${segment}` }); continue; }
    const matchedTypes = knownTypes.filter((type) => new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(segment));
    if (matchedTypes.length) {
      const uniqueTypes = [...new Set(matchedTypes)];
      conditions.set(`types:${uniqueTypes.sort().join('|')}`, { anyTypes: uniqueTypes, label: `Star ${segment}` });
      continue;
    }
    const item = knownNames.find((candidate) => new RegExp(`^${candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(segment));
    if (item) conditions.set(`item:${item.id}`, { anyItemIds: [item.id], label: `Star ${segment}` });
  }
  return [...conditions.entries()].map(([key, condition], index) => {
    const target = { ...condition }; delete target.label;
    if (/another type/i.test(condition.label)) target.excludedItemIds = [record.id];
    return { id: `official-${slugify(key) || index + 1}`, label: condition.label, offsets: record.starOffsets, target, scoreMode: 'unique-target' };
  });
}

async function findAsset(id) {
  for (const extension of ['webp', 'png', 'jpg', 'jpeg']) {
    const file = path.join(assetDirectory, `${id}.${extension}`);
    try { await fs.access(file); return `assets/items/${id}.${extension}`; } catch { /* continue */ }
  }
  return '';
}

async function ensureAsset(item) {
  const existing = await findAsset(item.id);
  if (existing) return existing;
  if (!item.imageUrl) return '';
  const extension = path.extname(new URL(item.imageUrl).pathname).toLowerCase().replace('.', '') || 'webp';
  const safeExtension = ['webp', 'png', 'jpg', 'jpeg'].includes(extension) ? extension : 'webp';
  const relative = `assets/items/${item.id}.${safeExtension}`;
  const response = await fetch(item.imageUrl, { headers: { 'user-agent': 'BackpackBrawlOfficialDataBuilder/2.0' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Image request failed for ${item.id}: ${response.status}`);
  await fs.writeFile(path.join(projectRoot, ...relative.split('/')), Buffer.from(await response.arrayBuffer()));
  return relative;
}

function resolveCountsAs(item, byName) {
  if (!item.countsAs) return [];
  const target = byName.get(item.countsAs.name.toLowerCase()) || byName.get(item.countsAs.name.replace(/s$/i, '').toLowerCase());
  if (!target) throw new Error(`Could not resolve counts-as target for ${item.id}: ${item.countsAs.name}`);
  return [{ itemId: target.id, count: item.countsAs.count }];
}

async function rebuildCatalog(boardItems, gameVersion) {
  const catalogPath = path.join(projectRoot, 'optimizer-catalog.js');
  const oldCatalog = await readAssignment(catalogPath, 'globalThis.BB_OPTIMIZER_CATALOG = ');
  const oldById = new Map(oldCatalog.items.map((item) => [item.id, item]));
  const byName = new Map(boardItems.map((item) => [item.name.toLowerCase(), item]));
  const knownTypes = [...new Set(boardItems.flatMap((item) => item.types))].sort((a, b) => b.length - a.length);
  const knownNames = boardItems.map((item) => ({ id: item.id, name: item.name })).sort((a, b) => b.name.length - a.name.length);
  const items = [];
  for (const official of boardItems) {
    const old = oldById.get(official.id);
    const image = await ensureAsset(official);
    let starGroups = [];
    if (official.starOffsets.length && old?.starGroups?.length) {
      starGroups = old.starGroups.map((group) => ({ ...group, offsets: official.starOffsets }));
    } else if (official.starOffsets.length) {
      starGroups = inferGroups(official, knownTypes, knownNames);
    }
    const bag = official.types.includes('Bag');
    const missingLayout = !official.footprint.length;
    const ambiguousStars = official.starOffsets.length > 0 && !starGroups.length;
    const missingImage = !image;
    const selectable = !bag && !missingLayout && !ambiguousStars && !missingImage;
    const hero = official.category === 'relics' && old ? old.hero : official.hero;
    let unsupportedReason = '';
    if (bag) unsupportedReason = 'Bag items are excluded from the fixed 9×6 board model.';
    else if (missingLayout) unsupportedReason = 'Official footprint data is unavailable.';
    else if (ambiguousStars) unsupportedReason = 'Official Star target wording could not be mapped safely.';
    else if (missingImage) unsupportedReason = 'Official item image is unavailable locally.';
    items.push({
      id: official.id, name: official.name, hero, rarity: official.rarity, types: official.types,
      image, footprint: official.footprint, rotations: old?.rotations || [0, 90, 180, 270], starGroups,
      selectable, countsAs: resolveCountsAs(official, byName),
      dataStatus: old?.dataStatus === 'verified' && selectable ? 'verified' : selectable ? 'generated' : 'partial',
      unsupportedReason: unsupportedReason || undefined,
      source: { url: official.sourceUrl, verifiedOn }
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  const catalog = {
    schemaVersion: 2, version: gameVersion, verifiedOn,
    sourceLastModified: currentMetadata.lastModified,
    generatedFrom: [sourceUrl], itemCount: items.length,
    selectableCount: items.filter((item) => item.selectable).length,
    partialCount: items.filter((item) => !item.selectable).length,
    items
  };
  await atomicWrite(catalogPath, `globalThis.BB_OPTIMIZER_CATALOG = ${JSON.stringify(catalog)};\n`);
  await atomicWrite(path.join(projectRoot, 'optimizer-catalog-report.json'), `${JSON.stringify({
    schemaVersion: 2, generatedOn: new Date().toISOString(), source: sourceUrl,
    sourceLastModified: currentMetadata.lastModified, gameVersion,
    itemCount: catalog.itemCount, selectableCount: catalog.selectableCount, partialCount: catalog.partialCount,
    withStars: items.filter((item) => item.starGroups.length).length,
    partialItems: items.filter((item) => !item.selectable).map((item) => ({ id: item.id, reason: item.unsupportedReason }))
  }, null, 2)}\n`);
  return catalog;
}

async function rebuildCombat(boardItems, gameVersion) {
  const items = Object.fromEntries(boardItems.map((item) => [item.id, {
    price: item.price, baseStats: item.baseStats, effects: item.effect ? [item.effect] : [], levels: [],
    sourceUrl: item.sourceUrl, verifiedOn
  }]));
  const snapshot = { schemaVersion: 2, version: gameVersion, verifiedOn, source: sourceUrl, sourceLastModified: currentMetadata.lastModified, itemCount: boardItems.length, failedCount: 0, items };
  await atomicWrite(path.join(projectRoot, 'optimizer-combat-stats.js'), `globalThis.BB_OPTIMIZER_COMBAT_STATS = ${JSON.stringify(snapshot)};\n`);
  await atomicWrite(path.join(projectRoot, 'optimizer-combat-stats-report.json'), `${JSON.stringify({
    schemaVersion: 2, generatedOn: new Date().toISOString(), source: sourceUrl, sourceLastModified: currentMetadata.lastModified,
    sourceItemCount: boardItems.length, itemCount: boardItems.length, failedCount: 0,
    withBaseStats: boardItems.filter((item) => item.baseStats.length).length,
    withEffects: boardItems.filter((item) => item.effect).length, withLevels: 0, failures: []
  }, null, 2)}\n`);
}

async function rebuildShopData(items, catalog) {
  const dataPath = path.join(projectRoot, 'data.js');
  const data = await readAssignment(dataPath, 'globalThis.BB_DATA = ');
  const allowedRarities = new Set(data.rarities);
  const excludedCategories = new Set(['shared-craftable', 'relics', 'boons', 'boons-past']);
  const catalogById = new Map(catalog.items.map((item) => [item.id, item]));
  const shopItems = items.filter((item) => allowedRarities.has(item.rarity) && !excludedCategories.has(item.category) && !item.recipe)
    .map((item) => ({ id: item.id, name: item.name, rarity: item.rarity, hero: item.hero, bag: item.types.includes('Bag'), status: 'available', weight: 1, image: catalogById.get(item.id)?.image || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (shopItems.length < 250 || shopItems.length > 350) throw new Error(`Official shop candidate validation failed: ${shopItems.length} items.`);
  data.verifiedOn = verifiedOn;
  data.sourceLastModified = currentMetadata.lastModified;
  data.sources = [{ label: 'Official Backpack Brawl Item Library', url: sourceUrl }, ...data.sources.filter((source) => source.url !== sourceUrl && !/backpackbrawlpro\.com\/items/i.test(source.url))];
  data.items = shopItems;
  await atomicWrite(dataPath, `globalThis.BB_DATA = ${JSON.stringify(data)};\n`);
}

async function rebuildEconResearch(boardItems, gameVersion) {
  const payload = {
    gameVersion, researchedOn: verifiedOn, source: sourceUrl, sourceLastModified: currentMetadata.lastModified,
    checked: boardItems.length, failed: 0,
    candidates: boardItems.map((item) => ({ id: item.id, name: item.name, hero: item.hero, rarity: item.rarity, types: item.types, url: item.sourceUrl, text: item.effect })),
    failures: []
  };
  await atomicWrite(path.join(projectRoot, 'econ-item-research.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

await fs.mkdir(rawDirectory, { recursive: true });
await fs.mkdir(assetDirectory, { recursive: true });
const previousSnapshot = await readJson(snapshotPath);
const previousMetadata = await readJson(metadataPath);
const fetched = await fetchOfficial(previousSnapshot, previousMetadata);
const currentSnapshot = fetched.snapshot;
const currentMetadata = fetched.metadata || currentSnapshot;
validateOfficialItems(currentSnapshot.items);
const diff = createDiff(previousSnapshot, currentSnapshot.items);

if (fetched.changed) {
  await atomicWrite(snapshotPath, `${JSON.stringify(currentSnapshot, null, 2)}\n`);
  await atomicWrite(metadataPath, `${JSON.stringify(currentMetadata, null, 2)}\n`);
}
await atomicWrite(diffPath, `${JSON.stringify(diff, null, 2)}\n`);

const currentData = await readAssignment(path.join(projectRoot, 'data.js'), 'globalThis.BB_DATA = ');
const gameVersion = currentData.version || 'unknown';
const boardItems = currentSnapshot.items.filter((item) => boardCategories.has(item.category));
if (boardItems.length !== currentMetadata.boardItemCount) throw new Error(`Board category mismatch: ${boardItems.length}/${currentMetadata.boardItemCount}.`);

console.log(`Official Item Library: ${currentSnapshot.items.length} cards (${fetched.status}), ${boardItems.length} board items.`);
console.log(`Diff: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length}.`);
await rebuildCombat(boardItems, gameVersion);
const catalog = await rebuildCatalog(boardItems, gameVersion);
await rebuildShopData(currentSnapshot.items, catalog);
await rebuildEconResearch(boardItems, gameVersion);
console.log(`Updated official raw snapshot, ${catalog.itemCount}-item optimizer catalog, combat stats, shop data, and econ research data.`);
