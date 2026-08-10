import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await fs.readFile(path.join(projectRoot, 'optimizer-catalog.js'), 'utf8');
const catalog = JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1));
const concurrency = 16;

function decode(value = '') {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, token) => {
    if (token[0] === '#') {
      const hex = token[1].toLowerCase() === 'x';
      return String.fromCodePoint(Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return named[token.toLowerCase()] ?? `&${token};`;
  });
}

function stripTags(value = '') {
  return decode(value.replace(/<img[^>]+alt="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'BackpackBrawlEconAudit/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

function parseText(html) {
  const jsonLd = html.match(/<script type="application\/ld\+json">(?<json>[\s\S]*?)<\/script>/)?.groups?.json;
  let description = '';
  try { description = jsonLd ? JSON.parse(jsonLd).description || '' : ''; } catch { /* Ignore malformed JSON-LD. */ }
  const effects = [...html.matchAll(/<div class="game-effect">(?<effect>[\s\S]*?)<\/div>/g)]
    .map((match) => stripTags(match.groups.effect));
  return decode([description, ...effects].filter(Boolean).join(' | ')).replace(/\s+/g, ' ').trim();
}

// Deliberately broad: final inclusion is a manual review of these candidates.
const economyPattern = /\b(?:gold|free reroll|free item|gain|get|find|produce|create|generate|spawn|receive|add)\b/i;
const shopOrItemPattern = /\b(?:shop entered|item|treasure|ore|gem|part|potion|food|weapon|pet|plant|fish|bolt|dart|scroll|ingredient|accessory|armor|melee|ranged|tool|bag)\b/i;

const results = new Array(catalog.items.length);
let cursor = 0;
async function worker() {
  while (cursor < catalog.items.length) {
    const index = cursor++;
    const item = catalog.items[index];
    const url = `https://backpackbrawlpro.com/items/${item.id}`;
    try {
      const text = parseText(await fetchText(url));
      results[index] = { ...item, url, text, candidate: economyPattern.test(text) && shopOrItemPattern.test(text) };
    } catch (error) {
      results[index] = { ...item, url, text: '', candidate: false, error: String(error) };
    }
    if ((index + 1) % 100 === 0) process.stderr.write(`Checked ${index + 1}/${catalog.items.length}\n`);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
const report = {
  gameVersion: catalog.version,
  researchedOn: new Date().toISOString().slice(0, 10),
  checked: results.length,
  failed: results.filter((item) => item.error).length,
  candidates: results.filter((item) => item.candidate).map(({ id, name, hero, rarity, types, url, text }) => (
    { id, name, hero, rarity, types, url, text }
  )),
  failures: results.filter((item) => item.error).map(({ id, name, url, error }) => ({ id, name, url, error }))
};

await fs.writeFile(path.join(projectRoot, 'econ-item-research.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ checked: report.checked, candidates: report.candidates.length, failed: report.failed }));
