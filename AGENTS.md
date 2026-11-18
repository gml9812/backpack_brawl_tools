# Codex repository notes: official Backpack Brawl data

Use the official Backpack Brawl Item Library as the canonical source for item identity, category, rarity, types, price, base stats, current effect text, recipe, footprint, Star cells, and item art URL.

## Refresh command

From the repository root, run:

```powershell
node .\scripts\build-official-item-data.mjs
```

Use `--force` to ignore `Last-Modified`, or `--offline` to rebuild consumers from the checked-in snapshot without network access. In Codex Desktop, call `codex_app__load_workspace_dependencies` first if `node` is not on PATH, then use the returned Node executable.

The updater makes one request to `https://www.backpackbrawl.com/items/`. The page is server-rendered and contains all item cards in `<template id="card-…">` elements. Do not add individual item page requests to this routine refresh, and do not use Backpack Brawl Pro for fields already present on the official page.

## Level tables

Per-level bonuses exist only on the individual official item pages. Collect them with the separate crawler, and only when level data is actually needed:

```powershell
node .\scripts\build-official-level-data.mjs
```

It fetches the 995 board item pages one at a time with a delay (about 15–20 minutes), resumes from a local cache after an interruption, and validates the result before replacing `raw/official-item-levels.json`. Use `--force` to ignore the cache. Never run it concurrently or lower its request delay.

## Generated outputs

- `raw/official-item-library.json`: canonical normalized snapshot of all official cards, including Boons.
- `raw/official-item-library-meta.json`: source URL, fetch time, `Last-Modified`, SHA-256, and counts.
- `raw/official-item-library-diff.json`: added, removed, and changed item IDs versus the previous snapshot.
- `optimizer-catalog.js` and `optimizer-catalog-report.json`: 995 board-item records.
- `optimizer-combat-stats.js` and its report: official price, base stats, and current effects.
- `data.js`: current purchasable Common–Mythic shop candidates.
- `econ-item-research.json`: official current effect research input.

- `raw/official-item-levels.json`: per-level text from the individual official pages (written only by the level crawler above).

Official cards do not expose per-level upgrade tables. `optimizer-combat-stats.js` therefore intentionally uses an empty `levels` array; do not silently reintroduce stale third-party levels as official data.

## Battle simulator

`battle.html` runs the turn-by-turn engine in `battle-engine.js`. Item behavior for the 37 supported items is hand-written in `battle-items.js`; adding an item means writing its hooks, not just adding data. `tests/battle-engine.test.js` pins the round 22 example to a golden hash, so change that hash only for an intentional rule change. Keep player nicknames out of `battle-example.js` and `tests/fixtures/`, because the repository root is deployed publicly.

The Item Library does not expose generation-pool membership or internal weights. Keep `econ-pools.js` sourced from the wiki generation-table templates, and never assume uniform within-pool weights.

## Required safety checks

The builder must fail before replacing consumers if validation fails. Current sentinels are:

- 1,065 total official cards.
- 995 board items after excluding 20 current Boons and 50 Past Boons.
- Unique item IDs.
- Every board item has name, rarity, type, and footprint.
- Golden Skull contains `On shop entered: Gain 0-3 Gold`.
- Shop candidate count remains between 250 and 350 (currently 280).

Run after a refresh:

```powershell
node .\tests\official-item-library-parser.test.mjs
node .\tests\econ.test.js
node .\tests\optimizer-core.test.js
node .\tests\catalog.test.js
node .\tests\battle-engine.test.js
node .\tests\battle-structure.test.js
node .\tests\official-item-levels.test.mjs
```

Review `raw/official-item-library-diff.json` before accepting a large change. A `304 Not Modified` response is expected when the official page has not changed.
