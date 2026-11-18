(function (root) {
  'use strict';
  const SOURCE = 'Backpack Brawl Wiki generation-table template';
  const pools = {
    fishingShallow: { label: 'Fishing · Shallow', source: SOURCE, names: ['Coldfin Cod', 'Flotsam', 'Guppy', 'Leather Cloak', 'Length of Rope', 'Tidal Clam', "Traveler's Hat", 'Electric Seasnake', 'Carp', 'Jetsam', 'Leather Boots', 'Sundancer', 'Willowfin', 'Pinktail', 'River Rat'] },
    fishingDeep: { label: 'Fishing · Deep', source: SOURCE, names: ['Coldfin Cod', 'Flotsam', 'Guppy', 'Leather Cloak', 'Length of Rope', 'Tidal Clam', "Traveler's Hat", 'Electric Seasnake', 'Carp', 'Jetsam', 'Leather Boots', 'Odd Cod', 'Seafoam Pipe', 'Sundancer', 'Willowfin', 'Blasted Gull', 'Lucky Tuna', 'Pinktail', 'Reefspike', 'River Rat', 'Sawfin Shark', 'Vampire Worm', 'Deepsea Candiru', 'Green Snapper', 'Octorius', 'Struggling Marlin', 'Tidepiercer', 'Treasure Chest', 'Unfortunate Tuna'] },
    fishingAbyssal: { label: 'Fishing · Abyssal', source: SOURCE, names: ['Coldfin Cod', 'Flotsam', 'Guppy', 'Leather Cloak', 'Length of Rope', 'Tidal Clam', "Traveler's Hat", 'Electric Seasnake', 'Carp', 'Jetsam', 'Leather Boots', 'Odd Cod', 'Seafoam Pipe', 'Sundancer', 'Willowfin', 'Blasted Gull', 'Lucky Tuna', 'Nebula Jelly', 'Pinktail', 'Reefspike', 'River Rat', 'Sawfin Shark', 'Vampire Worm', 'Deepsea Candiru', "Dragon's Tail Jelly", 'Glasshead', 'Green Snapper', 'Night Angler', 'Octorius', 'Struggling Marlin', 'Tidepiercer', 'Treasure Chest', 'Unfortunate Tuna', 'Whispering Conch', 'Writhing Tentacle', 'Doomsday Oarfish', 'Leviathan', "Rune of R'lyeh"] },
    miningSurface: { label: 'Mining · Surface', source: SOURCE, names: ['Iron Ore', 'Lumps of Coal', 'Rock', 'Crystal Shard'] },
    miningUnderground: { label: 'Mining · Underground', source: SOURCE, names: ['Iron Ore', 'Lumps of Coal', 'Rock', 'Amethyst', 'Crystal Shard', 'Emerald', 'Ruby', 'Sapphire', 'Adamantite Ore', 'Diamond', 'Gold Ore', 'Lava Rock'] },
    miningCore: { label: 'Mining · Core', source: SOURCE, names: ['Iron Ore', 'Lumps of Coal', 'Rock', 'Amethyst', 'Crystal Shard', 'Emerald', 'Ruby', 'Sapphire', 'Adamantite Ore', 'Diamond', 'Gold Ore', 'Lava Rock', 'Quartz Sprite', 'Molten Core Creeper'] },
    insect: { label: 'Insect', source: SOURCE, names: ['Arcanefly', 'Caterpillar', 'Honey Bee', 'Pyrefly', 'Worker Bee', 'Red Widow', 'Emerald Scarab'] },
    essence: { label: 'Essence', source: SOURCE, names: ['Death Essence', 'Holy Essence', 'Life Essence', 'Magic Essence', 'Speed Essence'] },
    partCommon: { label: 'Part · Common table', source: SOURCE, names: ['Steel Bolts', 'Gear', 'Scrap Metal', 'Spring'] },
    partRare: { label: 'Part · Rare table', source: SOURCE, names: ['Steel Bolts', 'Gear', 'Scrap Metal', 'Spring', 'Clockwork'] },
    partLegendary: { label: 'Part · Legendary table', source: SOURCE, names: ['Steel Bolts', 'Gear', 'Scrap Metal', 'Spring', 'Clockwork', 'Arcane Core', 'Elemental Core'] },
    plantCommon: { label: 'Plant · Common', source: SOURCE, names: ['Cactus', 'Dragonleaf', 'Ginseng Root', 'Lucky Clover', 'Nightshade', 'Poppy', 'Starbloom', 'Sunflower'] },
    plant: { label: 'Plant', source: SOURCE, names: ['Cactus', 'Dragonleaf', 'Ginseng Root', 'Lucky Clover', 'Nightshade', 'Poppy', 'Starbloom', 'Sunflower', 'Brambleheart', 'Longing Begonia', 'Night Dahlia', 'Poison Apple', 'Succulent', 'Tulip', 'Wild Rose', 'Briarthorn', 'Dragonleaf Acorn', 'Snapdragon', 'Mars Flytrap'] },
    bramble: { label: 'Bramble', source: SOURCE, names: ['Brambleheart', 'Wild Rose', 'Bloodthorn', 'Briarthorn'] },
    ore: { label: 'Ore', source: SOURCE, names: ['Iron Ore', 'Adamantite Ore', 'Gold Ore'] },
    oreBeforeGem: { label: 'Ore · Gem conversion', source: SOURCE, names: ['Iron Ore', 'Adamantite Ore', 'Elementium Ore', 'Gold Ore'] },
    gem: { label: 'Gem', source: SOURCE, names: ['Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Diamond'] },
    treat: { label: 'Treat', source: SOURCE, names: ['Candy Corn', 'Spectral Sweet', 'Boo Bar', 'Candy Swirl', 'Cursed Candy'] },
    crab: { label: 'Crab', source: SOURCE, names: ['Perfectly Normal Crab', 'Three Eyed Crab'] },
    lobster: { label: 'Lobster', source: SOURCE, names: ['Regular Old Lobster', 'Slithering Lobster'] },
    jelly: { label: 'Jelly Bean', source: SOURCE, names: ['Vanilla Dream', 'Blueberry Bliss', 'Grape Burst', 'Blazing Berry', 'Kiwi Dewdrop', 'Mango Delight'] },
    gold: { label: 'Gold or gems', source: SOURCE, names: ['Rock', 'Gold Elixir', 'Golden Egg', 'Gold Ore', 'Golden Clover', 'Golden Omelette', 'Golden Tail', 'Golden Skull'] }
  };
  root.BB_ECON_POOLS = { pools, sourceUrl: 'https://backpackbrawl.wiki.gg/wiki/Category:Item_Pools' };
})(typeof globalThis !== 'undefined' ? globalThis : window);
