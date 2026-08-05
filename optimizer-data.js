(function (root) {
  'use strict';

  const verifiedOn = '2026-08-05';
  const source = (slug) => ({
    url: `https://backpackbrawlpro.com/items/${slug}/`,
    verifiedOn
  });

  root.BB_OPTIMIZER_DATA = {
    schemaVersion: 1,
    version: '6.0.1',
    verifiedOn,
    supportLevel: 'verified-fixtures',
    board: { columns: 6, rows: 9 },
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
        selectable: false, dataStatus: 'verified', unsupportedReason: 'Bag items are excluded from the fixed 6×9 board model.',
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
      return curated ? { ...generated, ...curated, dataStatus: curated.dataStatus || 'verified' } : generated;
    });
    curatedItems.filter((item) => !generatedIds.has(item.id)).forEach((item) => root.BB_OPTIMIZER_DATA.items.push(item));
    root.BB_OPTIMIZER_DATA.types = [...new Set(root.BB_OPTIMIZER_DATA.items.flatMap((item) => item.types || []))].sort();
    root.BB_OPTIMIZER_DATA.supportLevel = 'full-generated-catalog';
    root.BB_OPTIMIZER_DATA.catalog = {
      total: root.BB_OPTIMIZER_DATA.items.length,
      selectable: root.BB_OPTIMIZER_DATA.items.filter((item) => item.selectable).length,
      reviewRequired: root.BB_OPTIMIZER_DATA.items.filter((item) => !item.selectable).length,
      generatedOn: generatedCatalog.verifiedOn
    };
  }})(typeof globalThis !== 'undefined' ? globalThis : this);
