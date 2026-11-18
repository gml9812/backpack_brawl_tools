# Star Optimizer data notes

## Verified baseline

- Game version: `7.2.0` (official patch notes 6.1.0–7.2.0 applied on 2026-11-18)
- Verification date: `2026-08-07`
- Star-target override verification date: `2026-08-06`
- Runtime data: `optimizer-catalog.js` plus reviewed overrides in `optimizer-data.js`
- Board model: 9 columns × 6 rows, all 54 cells active
- Current board catalog: 995 items
- Calculation-ready: 960 items
- Review-required: 35 items — 33 Bags and 2 items with incomplete Star target wording
- Manually reviewed overrides: 15 representative fixtures plus 17 official Star-target restorations

The official 7.2.0 patch notes establish the game version. The local snapshot holds 1,065 English records. Its 70 Boon and Past Boon records are excluded because they are not placed on the board, leaving 995 board records. Season 7 Boons are not in the snapshot yet because the patch notes do not publish them all. The official page now includes Skara; the 40-record Backpack Brawl Pro Skara query is retained as a cross-check and deduplicated by slug. The resulting current board catalog contains 995 unique ids.

The official library does not expose cell-level layouts in its readable page data. Backpack Brawl Pro individual pages expose explicit `occupied` and `star` grid cells, type tags, item art, and effect text. `scripts/build-full-optimizer-catalog.mjs` reads those structured fields for every catalog item and downloads missing images locally.

## Data status policy

- `verified`: one of the 15 manually reviewed fixtures or 17 official Star-target restorations; this record overrides generated data.
- `generated`: footprint, image, types, Star cells, and an explicit target token were structurally extracted. These items are calculation-ready.
- `partial`: shown in search but not selectable. No placeholder footprint or `any item` target is invented.
- Bag: always non-selectable because a fixed fully active board does not model slots created by Bags.
- Boon and Past Boon: excluded from the board catalog.
- Items without Stars: calculation-ready when footprint and image are present; they still participate in packing and may be targets.

The generated Star target mapper is deterministic. It only accepts an explicit `Star item`, `Star <type>`, or `Star <item name>` token found in the source effect text and maps it to `any`, `anyTypes`, or `anyItemIds`. `Ingredient` and `Part` are valid target types. “Another type” adds the source item id to `excludedItemIds`. Text such as `Star Details unavailable for this data version` is not guessed and remains `partial`.
The official library's `This counts as [N] <item name>` wording is extracted into `countsAs: [{ itemId, count }]`. Item-target Star matching uses that effective identity, and `count` weights placement scores and per-Star combat multipliers. An unrecognized counts-as target fails catalog generation instead of being silently omitted.

Seventeen previously partial items now use Star target wording verified against the official item library. `Cursed Idol` and `Stone Golem` remain `partial` because their targets are still not explicit enough to map safely.

## Rule checks

- Footprints are occupied-cell sets; non-rectangular items are preserved.
- Footprint and Star offsets rotate together around the normalized footprint anchor.
- `Weapon` is a normalized supertype on both `Melee` and `Ranged` weapons while the specific tags remain available.
- A target covering multiple cells of one source group counts once (`unique-target`).
- Different source instances and distinct extracted target groups count independently.
- Runtime never calls external sites; all 995 item records and images are local.

## Reports and rebuilds

- `optimizer-catalog-report.json`: raw generated catalog totals and every review-required id/reason before reviewed overrides.
- `optimizer-data-report.json`: strict comparison of the 15 manually reviewed fixture layouts.
- `scripts/build-full-optimizer-catalog.mjs`: rebuilds the official-current + Skara catalog and local images.
- `scripts/build-optimizer-data.ps1`: rechecks the 15 reviewed layouts and never overwrites them on mismatch.

## Remaining limits

- `Cursed Idol` and `Stone Golem` remain visible but disabled until their target wording can be mapped safely.
- Relic, Unique, Crafted, and Special board items are included when they are in the official current item categories.
- Image art is used for identification in this unofficial fan tool; rights remain with the respective owners.
- The program optimizes valid Star connections, not damage, survival, or win rate.