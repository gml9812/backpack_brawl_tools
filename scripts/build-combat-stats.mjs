import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCombatStats } from './combat-stats-parser.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const catalogPath = path.join(projectRoot, 'optimizer-catalog.js');
const outputPath = path.join(projectRoot, 'optimizer-combat-stats.js');
const reportPath = path.join(projectRoot, 'optimizer-combat-stats-report.json');
const concurrency = Math.max(2, Math.min(24, Number(process.env.BB_COMBAT_CONCURRENCY || 12)));
const verifiedOn = new Date().toISOString().slice(0, 10);

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'BackpackBrawlStarOptimizerCombatDataBuilder/1.0' },
        signal: AbortSignal.timeout(25000)
      });
      if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}

async function mapConcurrent(values, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

const sourceText = await fs.readFile(catalogPath, 'utf8');
const assignment = sourceText.match(/^globalThis\.BB_OPTIMIZER_CATALOG\s*=\s*([\s\S]*);\s*$/);
if (!assignment) throw new Error('Could not parse optimizer-catalog.js');
const catalog = JSON.parse(assignment[1]);
const sourceItems = catalog.items.filter((item) => item.source?.url);

console.log('Fetching combat specs for ' + sourceItems.length + ' items with concurrency ' + concurrency + '...');
let completed = 0;
const records = await mapConcurrent(sourceItems, async (item) => {
  try {
    const html = await fetchText(item.source.url);
    const combat = parseCombatStats(html);
    return {
      id: item.id,
      combat: {
        price: combat.price,
        baseStats: combat.baseStats,
        effects: combat.effects,
        levels: combat.levels,
        sourceUrl: item.source.url,
        verifiedOn
      }
    };
  } catch (error) {
    return { id: item.id, error: error instanceof Error ? error.message : String(error) };
  } finally {
    completed += 1;
    if (completed % 50 === 0 || completed === sourceItems.length) {
      console.log('Pages ' + completed + '/' + sourceItems.length);
    }
  }
});

const failures = records.filter((record) => record.error);
const items = Object.fromEntries(records.filter((record) => record.combat).map((record) => [record.id, record.combat]));
const withBaseStats = Object.values(items).filter((combat) => combat.baseStats.length).length;
const withEffects = Object.values(items).filter((combat) => combat.effects.length).length;
const withLevels = Object.values(items).filter((combat) => combat.levels.length).length;
const snapshot = {
  schemaVersion: 1,
  verifiedOn,
  source: 'https://backpackbrawlpro.com/items',
  itemCount: Object.keys(items).length,
  failedCount: failures.length,
  items
};

await fs.writeFile(outputPath, 'globalThis.BB_OPTIMIZER_COMBAT_STATS = ' + JSON.stringify(snapshot) + ';\n', 'utf8');
await fs.writeFile(reportPath, JSON.stringify({
  schemaVersion: 1,
  generatedOn: new Date().toISOString(),
  sourceItemCount: sourceItems.length,
  itemCount: snapshot.itemCount,
  failedCount: failures.length,
  withBaseStats,
  withEffects,
  withLevels,
  failures
}, null, 2) + '\n', 'utf8');

console.log('Generated ' + snapshot.itemCount + ' combat records: ' + withBaseStats + ' with base stats, ' + withEffects + ' with effects, ' + withLevels + ' with levels, ' + failures.length + ' failures.');
console.log(outputPath);
