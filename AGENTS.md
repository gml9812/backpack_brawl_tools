# Codex repository notes: official Backpack Brawl data

Use the official Backpack Brawl Item Library as the canonical source for item identity, category, rarity, types, price, base stats, current effect text, recipe, footprint, Star cells, and item art URL.

## Refresh command

From the repository root, run:

```powershell
node .\scripts\build-official-item-data.mjs
```

Use `--force` to ignore `Last-Modified`, or `--offline` to rebuild consumers from the checked-in snapshot without network access. In Codex Desktop, call `codex_app__load_workspace_dependencies` first if `node` is not on PATH, then use the returned Node executable.

The updater makes one request to `https://www.backpackbrawl.com/items/`. The page is server-rendered and contains all item cards in `<template id="card-…">` elements. Do not scrape 956 individual pages and do not use Backpack Brawl Pro for fields already present on the official page.

## Generated outputs

- `raw/official-item-library.json`: canonical normalized snapshot of all official cards, including Boons.
- `raw/official-item-library-meta.json`: source URL, fetch time, `Last-Modified`, SHA-256, and counts.
- `raw/official-item-library-diff.json`: added, removed, and changed item IDs versus the previous snapshot.
- `optimizer-catalog.js` and `optimizer-catalog-report.json`: 956 board-item records.
- `optimizer-combat-stats.js` and its report: official price, base stats, and current effects.
- `data.js`: current purchasable Common–Mythic shop candidates.
- `econ-item-research.json`: official current effect research input.

Official cards do not expose per-level upgrade tables. `optimizer-combat-stats.js` therefore intentionally uses an empty `levels` array; do not silently reintroduce stale third-party levels as official data.

The Item Library does not expose generation-pool membership or internal weights. Keep `econ-pools.js` sourced from the wiki generation-table templates, and never assume uniform within-pool weights.

## Required safety checks

The builder must fail before replacing consumers if validation fails. Current sentinels are:

- 1,026 total official cards.
- 956 board items after excluding 20 current Boons and 50 Past Boons.
- Unique item IDs.
- Every board item has name, rarity, type, and footprint.
- Golden Skull contains `On shop entered: Gain 0-3 Gold`.
- Shop candidate count remains between 250 and 350 (currently 274).

Run after a refresh:

```powershell
node .\tests\official-item-library-parser.test.mjs
node .\tests\econ.test.js
node .\tests\optimizer-core.test.js
node .\tests\catalog.test.js
```

Review `raw/official-item-library-diff.json` before accepting a large change. A `304 Not Modified` response is expected when the official page has not changed.
