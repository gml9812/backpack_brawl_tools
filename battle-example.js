(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BB_BATTLE_EXAMPLE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    "title": "라운드 22 예시: Harkon vs Nymphedora",
    "notes": [
      "실제 전투 로그 한 판에서 역산해 재구성한 빌드입니다.",
      "Fanny Pack 개수는 각 아이템의 첫 발동 시각에서 역산했습니다.",
      "아이템 레벨과 일부 별 대상은 로그에서 추정한 값이라 정확하지 않을 수 있습니다.",
      "로그에 발동 기록이 없는 물약은 빌드에서 제외했습니다."
    ],
    "round": 22,
    "sides": [
      {
        "name": "Harkon",
        "hero": "Harkon",
        "heroLevel": 20,
        "healthBonus": 0.5,
        "items": [
          {
            "item": "Armor Pack",
            "level": 11,
            "count": 2
          },
          {
            "item": "Medium Bag",
            "level": 15
          },
          {
            "item": "Stamina Sack",
            "level": 12,
            "count": 4
          },
          {
            "item": "Fanny Pack",
            "level": 15,
            "count": 11
          },
          {
            "item": "Berserker Sack",
            "level": 15,
            "inside": 3
          },
          {
            "id": "wrath",
            "item": "Wrath Potion",
            "level": 15
          },
          {
            "item": "Giant's Belt",
            "level": 15,
            "count": 2,
            "stars": [
              "wrath"
            ]
          },
          {
            "item": "Magic Belt",
            "level": 15,
            "stars": [
              "wrath"
            ]
          },
          {
            "item": "Giant's Belt",
            "level": 15,
            "count": 2
          },
          {
            "item": "Magic Belt",
            "level": 15
          },
          {
            "item": "Gloves of Power",
            "level": 10,
            "stars": [
              "we",
              "rs1"
            ]
          },
          {
            "item": "Amethyst Pendant",
            "level": 10,
            "stars": [
              "rs1",
              "rs4"
            ]
          },
          {
            "item": "Fur Boots",
            "level": 15,
            "bags": {
              "Fanny Pack": 4
            }
          },
          {
            "item": "Ethereal Cloak",
            "level": 10
          },
          {
            "id": "we",
            "item": "World's End",
            "level": 10,
            "bags": {
              "Fanny Pack": 6
            }
          },
          {
            "id": "rs1",
            "item": "Royal Seax",
            "level": 10,
            "bags": {
              "Fanny Pack": 2
            }
          },
          {
            "id": "rs2",
            "item": "Royal Seax",
            "level": 10,
            "bags": {
              "Fanny Pack": 1
            }
          },
          {
            "id": "rs3",
            "item": "Royal Seax",
            "level": 10
          },
          {
            "id": "rs4",
            "item": "Royal Seax",
            "level": 10
          },
          {
            "item": "Mallet",
            "level": 8,
            "bags": {
              "Fanny Pack": 2
            }
          },
          {
            "item": "Mallet",
            "level": 8
          },
          {
            "item": "Skullsmasher",
            "level": 8,
            "bags": {
              "Fanny Pack": 2
            }
          },
          {
            "item": "Hooked Dagger",
            "level": 12,
            "bags": {
              "Fanny Pack": 2
            }
          },
          {
            "item": "Golden Skull",
            "level": 5,
            "bags": {
              "Fanny Pack": 1
            }
          }
        ]
      },
      {
        "name": "Nymphedora",
        "hero": "Nymphedora",
        "heroLevel": 20,
        "healthBonus": 0.5,
        "items": [
          {
            "item": "Ranger's Satchel",
            "level": 10,
            "inside": 4,
            "dragonleafInside": 2
          },
          {
            "item": "Armor Pack",
            "level": 6,
            "count": 5
          },
          {
            "item": "Medium Bag",
            "level": 15,
            "count": 2
          },
          {
            "item": "Dragonleaf",
            "level": 5,
            "count": 3,
            "stars": 1
          },
          {
            "id": "scales",
            "item": "Predator Scales",
            "level": 13,
            "stars": 4
          },
          {
            "item": "Speed Essence",
            "level": 10,
            "stars": [
              "scales",
              "bat"
            ]
          },
          {
            "item": "Man-o-lorian Helmet",
            "level": 1
          },
          {
            "item": "Heavenly Skull",
            "level": 5
          },
          {
            "item": "Leafbound Striders",
            "level": 5,
            "stars": [
              "fang"
            ]
          },
          {
            "id": "fang",
            "item": "Dragonfang",
            "level": 10,
            "stars": 4
          },
          {
            "id": "bat",
            "item": "Vampire Bat",
            "level": 10
          },
          {
            "item": "Frost Emblem",
            "level": 12
          },
          {
            "id": "rod",
            "item": "Rod of Memories",
            "level": 8,
            "bags": {
              "Ranger's Satchel": 1
            }
          },
          {
            "id": "arc",
            "item": "Evergreen Arc",
            "level": 12,
            "stars": 5,
            "bags": {
              "Ranger's Satchel": 1
            }
          },
          {
            "item": "Poison Arrows",
            "level": 12,
            "stars": [
              "arc"
            ]
          },
          {
            "item": "Stinkbug",
            "level": 5
          },
          {
            "item": "Golden Skull",
            "level": 5
          },
          {
            "item": "Cleansing Crown",
            "level": 5
          },
          {
            "item": "Cursed Clover",
            "level": 5
          },
          {
            "item": "Werewolf Paw",
            "level": 15,
            "stars": [
              "arc"
            ]
          },
          {
            "item": "Wilderness Potion",
            "level": 5
          },
          {
            "item": "Dragonflower",
            "level": 10,
            "count": 2
          }
        ]
      }
    ]
  };
});
