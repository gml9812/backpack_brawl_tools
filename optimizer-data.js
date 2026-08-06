(function (root) {
  'use strict';

  const verifiedOn = '2026-08-05';
  const source = (slug) => ({
    url: `https://backpackbrawlpro.com/items/${slug}/`,
    verifiedOn
  });
  const officialTargetSource = (slug) => ({
    url: `https://www.backpackbrawl.com/items/${slug}`,
    verifiedOn: '2026-08-06'
  });
  const reviewedStarSpecifications = {
    'admiralty-anchor': [{ id: 'reef-knot', label: 'Star Reef Knot', offsets: [[1, -1]], target: { anyItemIds: ['reef-knot'] } }],
    'blast-furnace-bellows': [
      { id: 'lumps-of-coal', label: 'Star Lumps of Coal', offsets: [[-2, -1], [-3, 0], [-1, 0], [-2, 1]], target: { anyItemIds: ['lumps-of-coal'] } },
      { id: 'lava-rock', label: 'Star Lava Rock', offsets: [[-2, -1], [-3, 0], [-1, 0], [-2, 1]], target: { anyItemIds: ['lava-rock'] } }
    ],
    'cast-iron-anchor': [{ id: 'reef-knot', label: 'Star Reef Knot', offsets: [[1, -1]], target: { anyItemIds: ['reef-knot'] } }],
    dragonfang: [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[-1, 0], [1, 0], [-1, 1], [1, 1]], target: { anyItemIds: ['dragonleaf'] } }],
    'dragonleaf-acorn': [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[-1, -1], [-1, 0], [1, 0], [1, 1]], target: { anyItemIds: ['dragonleaf'] } }],
    'dull-oyster-shucker': [{ id: 'tidal-clam', label: 'Star Tidal Clam', offsets: [[-1, -1]], target: { anyItemIds: ['tidal-clam'] } }],
    'elven-blade': [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[-1, 0], [1, 0]], target: { anyItemIds: ['dragonleaf'] } }],
    'errant-lance': [{ id: 'cactus', label: 'Star Cactus', offsets: [[0, -1], [-1, 1], [1, 1]], target: { anyItemIds: ['cactus'] } }],
    'everdrift-anchor': [{ id: 'reef-knot', label: 'Star Reef Knot', offsets: [[1, -1]], target: { anyItemIds: ['reef-knot'] } }],
    'evergreen-arc': [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[-1, 0], [-1, 1], [-1, 2], [-1, 3]], target: { anyItemIds: ['dragonleaf'] } }],
    'grapeshot-slinger': [{ id: 'grapes', label: 'Star Grapes', offsets: [[0, 1]], target: { anyItemIds: ['grapes'] } }],
    'predator-scales': [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[-2, 0], [-1, 0], [2, 0], [3, 0]], target: { anyItemIds: ['dragonleaf'] } }],
    'reptile-stalker': [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]], target: { anyItemIds: ['dragonleaf'] } }],
    rhongomiant: [{ id: 'cactus', label: 'Star Cactus', offsets: [[0, -1], [-1, 2], [1, 2]], target: { anyItemIds: ['cactus'] } }],
    'rolling-pin-nunchucks': [{ id: 'flour-or-pie', label: 'Star Bag of Flour or Blind Bake Pie', offsets: [[1, -1], [-1, 2]], target: { anyItemIds: ['bag-of-flour', 'blind-bake-pie'] } }],
    'shadow-armor': [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[-1, 0], [2, 0]], target: { anyItemIds: ['dragonleaf'] } }],
    'stalker-s-shiv': [{ id: 'dragonleaf', label: 'Star Dragonleaf', offsets: [[-1, 0], [1, 0]], target: { anyItemIds: ['dragonleaf'] } }]
  };
  const reviewedStarOverrides = new Map(Object.entries(reviewedStarSpecifications).map(([slug, starGroups]) => [slug, {
    starGroups: starGroups.map((group) => ({ ...group, scoreMode: 'unique-target' })),
    selectable: true,
    dataStatus: 'verified',
    targetSource: officialTargetSource(slug)
  }]));

  root.BB_OPTIMIZER_DATA = {
    schemaVersion: 1,
    version: '6.0.1',
    verifiedOn,
    supportLevel: 'verified-fixtures',
    board: { columns: 9, rows: 6 },
    types: ['Accessory', 'Bag', 'Food', 'Ingredient', 'Melee', 'Mineral', 'Part', 'Pet', 'Ranged', 'Rat', 'Wand Or Staff', 'Weapon'],
    sources: [
      {
        label: 'Official Backpack Brawl item library and game version',
        url: 'https://www.backpackbrawl.com/items/'
      },
      {
        label: 'Official Backpack Brawl 6.0.1 patch notes',
        url: 'https://www.backpackbrawl.com/patch-notes/6-0-1/'
      },
      {
        label: 'Backpack Brawl Pro item layouts (cross-checked fixtures)',
        url: 'https://backpackbrawlpro.com/items'
      }
    ],
    items: [
      {
        id: 'rock', name: 'Rock', hero: 'shared', rarity: 'Common',
        types: ['Mineral', 'Ranged', 'Weapon'], image: 'assets/items/rock.webp',
        footprint: [[0, 0]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: true, dataStatus: 'verified', source: source('rock')
      },
      {
        id: 'wooden-stick', name: 'Wooden Stick', hero: 'shared', rarity: 'Common',
        types: ['Ranged', 'Weapon', 'Wand Or Staff'], image: 'assets/items/wooden-stick.webp',
        footprint: [[0, 0], [0, 1]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: true, dataStatus: 'verified', source: source('wooden-stick')
      },
      {
        id: 'wooden-sword', name: 'Wooden Sword', hero: 'shared', rarity: 'Common',
        types: ['Melee', 'Weapon'], image: 'assets/items/wooden-sword.webp',
        footprint: [[0, 0], [0, 1]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: true, dataStatus: 'verified', source: source('wooden-sword')
      },
      {
        id: 'dagger', name: 'Dagger', hero: 'shared', rarity: 'Rare',
        types: ['Melee', 'Weapon'], image: 'assets/items/dagger.webp',
        footprint: [[0, 0], [0, 1]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: true, dataStatus: 'verified', source: source('dagger')
      },
      {
        id: 'apple', name: 'Apple', hero: 'shared', rarity: 'Rare',
        types: ['Food', 'Ingredient'], image: 'assets/items/apple.webp',
        footprint: [[0, 0]], rotations: [0, 90, 180, 270],
        starGroups: [{
          id: 'other-food', label: 'Faster for every Star Food of another type',
          offsets: [[0, -1], [-1, 0], [1, 0], [0, 1]],
          target: { anyTypes: ['Food'], excludedItemIds: ['apple'] }, scoreMode: 'unique-target'
        }],
        selectable: true, dataStatus: 'verified', source: source('apple')
      },
      {
        id: 'brown-rat', name: 'Brown Rat', hero: 'shared', rarity: 'Common',
        types: ['Pet', 'Rat'], image: 'assets/items/brown-rat.webp',
        footprint: [[0, 0], [1, 0]], rotations: [0, 90, 180, 270],
        starGroups: [{
          id: 'star-rats', label: 'Gain damage per Star Rat',
          offsets: [[1, -1], [-1, 0], [2, 0], [0, 1]],
          target: { anyTypes: ['Rat'] }, scoreMode: 'unique-target'
        }],
        selectable: true, dataStatus: 'verified', source: source('brown-rat')
      },
      {
        id: 'banana', name: 'Banana', hero: 'shared', rarity: 'Common',
        types: ['Food', 'Ingredient'], image: 'assets/items/banana.webp',
        footprint: [[1, 0], [0, 1], [1, 1]], rotations: [0, 90, 180, 270],
        starGroups: [{
          id: 'other-food', label: 'Faster for every Star Food of another type',
          offsets: [[1, -1], [0, 0], [2, 0], [-1, 1], [2, 1], [0, 2], [1, 2]],
          target: { anyTypes: ['Food'], excludedItemIds: ['banana'] }, scoreMode: 'unique-target'
        }],
        selectable: true, dataStatus: 'verified', source: source('banana')
      },
      {
        id: 'mana-strudel', name: 'Mana Strudel', hero: 'chana', rarity: 'Rare',
        types: ['Food', 'Ingredient'], image: 'assets/items/mana-strudel.png',
        footprint: [[0, 0], [1, 0]], rotations: [0, 90, 180, 270],
        starGroups: [{
          id: 'other-food', label: 'Faster for every Star Food of another type',
          offsets: [[0, -1], [1, -1], [-1, 0], [2, 0], [0, 1], [1, 1]],
          target: { anyTypes: ['Food'], excludedItemIds: ['mana-strudel'] }, scoreMode: 'unique-target'
        }],
        selectable: true, dataStatus: 'verified', source: source('mana-strudel')
      },
      {
        id: 'light-bow', name: 'Light Bow', hero: 'nymphedora', rarity: 'Common',
        types: ['Ranged', 'Weapon'], image: 'assets/items/light-bow.png',
        footprint: [[0, 0], [0, 1]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: true, dataStatus: 'verified', source: source('light-bow')
      },
      {
        id: 'searing-wand', name: 'Searing Wand', hero: 'chana', rarity: 'Common',
        types: ['Ranged', 'Weapon', 'Wand Or Staff'], image: 'assets/items/searing-wand.png',
        footprint: [[0, 0], [0, 1]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: true, dataStatus: 'verified', source: source('searing-wand')
      },
      {
        id: 'iron-bar', name: 'Iron Bar', hero: 'shared', rarity: 'Common',
        types: ['Accessory', 'Part'], image: 'assets/items/iron-bar.webp',
        footprint: [[0, 0], [1, 0]], rotations: [0, 90, 180, 270],
        starGroups: [{
          id: 'star-items', label: 'Chance to gain Armor when a Star item activates',
          offsets: [[-1, 0], [2, 0]], target: { any: true }, scoreMode: 'unique-target'
        }],
        selectable: true, dataStatus: 'verified', source: source('iron-bar')
      },
      {
        id: 'pet-collar', name: 'Pet Collar', hero: 'shared', rarity: 'Legendary',
        types: ['Accessory'], image: 'assets/items/pet-collar.webp',
        footprint: [[0, 0], [1, 0]], rotations: [0, 90, 180, 270],
        starGroups: [{
          id: 'star-pets', label: 'Buff Star Pets',
          offsets: [[-1, 0], [2, 0], [0, 1], [1, 1]],
          target: { anyTypes: ['Pet'] }, scoreMode: 'unique-target'
        }],
        selectable: true, dataStatus: 'verified', source: source('pet-collar')
      },
      {
        id: 'cauldron', name: 'Cauldron', hero: 'shared', rarity: 'Rare',
        types: ['Accessory'], image: 'assets/items/cauldron.webp',
        footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: true, dataStatus: 'verified', source: source('cauldron')
      },
      {
        id: 'simple-quiver', name: 'Simple Quiver', hero: 'nymphedora', rarity: 'Rare',
        types: ['Accessory'], image: 'assets/items/simple-quiver.png',
        footprint: [[0, 0], [0, 1], [0, 2]], rotations: [0, 90, 180, 270],
        starGroups: [{
          id: 'star-ranged', label: 'Star Ranged weapons attack faster',
          offsets: [[-1, 0], [1, 0], [-1, 2], [1, 2]],
          target: { anyTypes: ['Ranged'] }, scoreMode: 'unique-target'
        }],
        selectable: true, dataStatus: 'verified', source: source('simple-quiver')
      },
      {
        id: 'armor-pack', name: 'Armor Pack', hero: 'shared', rarity: 'Rare',
        types: ['Bag'], image: 'assets/items/armor-pack.webp',
        footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], rotations: [0, 90, 180, 270], starGroups: [],
        selectable: false, dataStatus: 'verified', unsupportedReason: 'Bag items are excluded from the fixed 9×6 board model.',
        source: source('armor-pack')
      }
    ]
  };
  const generatedCatalog = root.BB_OPTIMIZER_CATALOG;
  if (generatedCatalog && Array.isArray(generatedCatalog.items)) {
    const curatedItems = root.BB_OPTIMIZER_DATA.items;
    const curatedById = new Map(curatedItems.map((item) => [item.id, item]));
    const generatedIds = new Set(generatedCatalog.items.map((item) => item.id));
    root.BB_OPTIMIZER_DATA.items = generatedCatalog.items.map((generated) => {
      const curated = curatedById.get(generated.id);
      const reviewedStar = reviewedStarOverrides.get(generated.id);
      const merged = { ...generated, ...(curated || {}), ...(reviewedStar || {}) };
      merged.dataStatus = curated?.dataStatus || reviewedStar?.dataStatus || generated.dataStatus;
      if (merged.selectable) delete merged.unsupportedReason;
      return merged;
    });
    curatedItems.filter((item) => !generatedIds.has(item.id)).forEach((item) => root.BB_OPTIMIZER_DATA.items.push(item));
    root.BB_OPTIMIZER_DATA.items = root.BB_OPTIMIZER_DATA.items.map((item) => item.types?.includes('Bag')
      ? { ...item, unsupportedReason: 'Bag items are excluded from the fixed 9×6 board model.' }
      : item);

    root.BB_OPTIMIZER_DATA.types = [...new Set(root.BB_OPTIMIZER_DATA.items.flatMap((item) => item.types || []))].sort();
    root.BB_OPTIMIZER_DATA.supportLevel = 'full-generated-catalog';
    root.BB_OPTIMIZER_DATA.catalog = {
      total: root.BB_OPTIMIZER_DATA.items.length,
      selectable: root.BB_OPTIMIZER_DATA.items.filter((item) => item.selectable).length,
      reviewRequired: root.BB_OPTIMIZER_DATA.items.filter((item) => !item.selectable).length,
      generatedOn: generatedCatalog.verifiedOn
    };
  }})(typeof globalThis !== 'undefined' ? globalThis : this);
