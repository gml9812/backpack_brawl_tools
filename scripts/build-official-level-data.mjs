// Collects per-level tables from the official item pages into raw/official-item-levels.json.
// This is deliberately separate from build-official-item-data.mjs: the routine refresh stays at one
// request, and this slower crawl (one page at a time, about 15-20 minutes) only runs when asked for.
//
//   node .\scripts\build-official-level-data.mjs            resume from the local cache if present
//   node .\scripts\build-official-level-data.mjs --force    ignore the cache and fetch every page
//   node .\scripts\build-official-level-data.mjs --limit=5  fetch at most 5 pages, then stop (no output)

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLevelSection, parseLevelSection, validateLevelRecords } from './official-item-levels-parser.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const snapshotPath = path.join(projectRoot, 'raw', 'official-item-library.json');
const outputPath = path.join(projectRoot, 'raw', 'official-item-levels.json');
const cachePath = path.join(os.tmpdir(), 'bb-official-level-sections.json');
const headers = { 'user-agent': 'BackpackBrawlOfficialDataBuilder/2.0' };
const requestDelayMs = 800;
const maxAttempts = 4;
const limitArgument = process.argv.find((value) => value.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : Infinity;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSection(url) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (response.ok) return extractLevelSection(await response.text());
      if (response.status !== 429 && response.status < 500) throw new Error(`HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after')) || 0;
      await sleep(Math.max(retryAfter * 1000, 5000 * attempt));
    } catch (error) {
      if (attempt === maxAttempts || /^HTTP 4/.test(error.message)) throw new Error(`${url}: ${error.message}`);
      await sleep(5000 * attempt);
    }
  }
  throw new Error(`${url}: gave up after ${maxAttempts} attempts`);
}

async function readCache() {
  if (process.argv.includes('--force')) return {};
  try { return JSON.parse(await fs.readFile(cachePath, 'utf8')); } catch { return {}; }
}

const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
const boardItems = snapshot.items.filter((item) => item.category !== 'boons' && item.category !== 'boons-past');
const sections = await readCache();
let fetched = 0;

for (const item of boardItems) {
  if (item.id in sections) continue;
  if (fetched >= limit) break;
  sections[item.id] = await fetchSection(item.sourceUrl);
  fetched += 1;
  if (fetched % 25 === 0) {
    await fs.writeFile(cachePath, JSON.stringify(sections), 'utf8');
    console.log(`${Object.keys(sections).length}/${boardItems.length} pages`);
  }
  await sleep(requestDelayMs);
}
await fs.writeFile(cachePath, JSON.stringify(sections), 'utf8');

if (boardItems.some((item) => !(item.id in sections))) {
  console.log(`Stopped at ${Object.keys(sections).length}/${boardItems.length} pages. Run again to continue.`);
  process.exit(0);
}

const records = {};
for (const item of boardItems) records[item.id] = parseLevelSection(sections[item.id]);
const validation = validateLevelRecords(records, Object.fromEntries(boardItems.map((item) => [item.id, item.rarity])));
const output = {
  schemaVersion: 1,
  sourcePattern: 'https://www.backpackbrawl.com/items/<id>/',
  fetchedAt: new Date().toISOString(),
  librarySha256: snapshot.sha256,
  ...validation,
  items: records,
};
const temporary = `${outputPath}.tmp`;
await fs.writeFile(temporary, `${JSON.stringify(output, null, 1)}\n`, 'utf8');
await fs.rename(temporary, outputPath);
await fs.rm(cachePath, { force: true });
console.log(`Wrote ${path.relative(projectRoot, outputPath)}: ${validation.withLevelBonus}/${validation.itemCount} items have level bonuses.`);
