# Star Optimizer data notes

## Verified baseline

- Game version: `6.0.1`
- Verification date: `2026-08-05`
- Runtime data: `optimizer-catalog.js` plus reviewed overrides in `optimizer-data.js`
- Board model: 9 columns × 6 rows, all 54 cells active
- Current board catalog: 940 items
- Calculation-ready: 889 items
- Review-required: 51 items — 32 Bags and 19 items with incomplete Star target wording
- Manually reviewed overrides: 15 representative fixtures

The official 6.0.1 patch notes establish the game version. The official item library provides 970 current English records and their categories. Its 70 Boon and Past Boon records are excluded because they are not placed on the board, leaving 900 official board records. The official page currently omits Season 6 hero Skara, so 40 Skara records are added from the game-6.0.1 Backpack Brawl Pro catalog. The resulting current board catalog contains 940 unique ids.

The official library does not expose cell-level layouts in its readable page data. Backpack Brawl Pro individual pages expose explicit `occupied` and `star` grid cells, type tags, item art, and effect text. `scripts/build-full-optimizer-catalog.mjs` reads those structured fields for every catalog item and downloads missing images locally.

## Data status policy

- `verified`: one of the 15 manually reviewed fixtures; this record overrides generated data.
- `generated`: footprint, image, types, Star cells, and an explicit target token were structurally extracted. These items are calculation-ready.
- `partial`: shown in search but not selectable. No placeholder footprint or `any item` target is invented.
- Bag: always non-selectable because a fixed fully active board does not model slots created by Bags.
- Boon and Past Boon: excluded from the board catalog.
- Items without Stars: calculation-ready when footprint and image are present; they still participate in packing and may be targets.

The generated Star target mapper is deterministic. It only accepts an explicit `Star item`, `Star <type>`, or `Star <item name>` token found in the source effect text and maps it to `any`, `anyTypes`, or `anyItemIds`. `Ingredient` and `Part` are valid target types. “Another type” adds the source item id to `excludedItemIds`. Text such as `Star Details unavailable for this data version` is not guessed and remains `partial`.

## Rule checks

- Footprints are occupied-cell sets; non-rectangular items are preserved.
- Footprint and Star offsets rotate together around the normalized footprint anchor.
- `Weapon` is a normalized supertype on both `Melee` and `Ranged` weapons while the specific tags remain available.
- A target covering multiple cells of one source group counts once (`unique-target`).
- Different source instances and distinct extracted target groups count independently.
- Runtime never calls external sites; all 940 item records and images are local.

## Reports and rebuilds

- `optimizer-catalog-report.json`: full-catalog totals and every review-required id/reason.
- `optimizer-data-report.json`: strict comparison of the 15 manually reviewed fixture layouts.
- `scripts/build-full-optimizer-catalog.mjs`: rebuilds the official-current + Skara catalog and local images.
- `scripts/build-optimizer-data.ps1`: rechecks the 15 reviewed layouts and never overwrites them on mismatch.

## Remaining limits

- The 19 ambiguous Star items remain visible but disabled until their source tooltip exposes the missing target type or they are verified in the game client.
- Relic, Unique, Crafted, and Special board items are included when they are in the official current item categories.
- Image art is used for identification in this unofficial fan tool; rights remain with the respective owners.
- The program optimizes valid Star connections, not damage, survival, or win rate.