# Fivefold 5e — Role-Rooted Skill Web RPG System

**Fivefold 5e** reimagines D&D 5e as a **classless, role-rooted skill web (DAG)**. Instead of locking class features, subclass abilities, skills, saving throws, proficiencies, hit dice, and feats behind rigid 1–20 class tables, every character builds organically outward from **five Role Roots** on a shared constellation canvas.

---

## 1. The Five Role Roots

| Root | Core Identity | Starting Grant (Tier 0, 1 SP) | Associated Saves & Hit Dice |
| :--- | :--- | :--- | :--- |
| **Combat** | Martial prowess, weapons, armor, endurance, tactics | Simple Weapons + `+1` Initiative | `STR`, `CON` · Hit Dice `d8 → d10 → d12` |
| **Devotion** | Sacred vows, divine channeling, healing, protective auras | Holy Symbol focus + *Guidance* or *Spare the Dying* | `WIS` · Hit Die `d8` |
| **Magic** | Arcane weave, spell slots, metamagic, eldritch pacts | Arcane Focus + 2 Cantrips (choose INT/WIS/CHA) | `INT` · Base `d6` |
| **Social** | Diplomacy, bardic inspiration, intrigue, leadership | 1 Extra Language + 1 Instrument or Gaming Set | `CHA` · Base `d6` |
| **Exploring** | Stealth, scouting, wilderness lore, mobility, traps | `+5 ft` walking speed + Explorer's navigation | `DEX` · Hit Die `d8` |

> **Hybrid Convergence Nodes**: Because the five roots share one Directed Acyclic Graph (DAG), iconic multi-role features sit on the seams between roots and require prerequisites from two branches — e.g., **Divine Smite** (*Combat + Devotion*), **War Magic / Spellblade** (*Combat + Magic*), **Wild Shape** (*Exploring + Magic*), **Sneak Attack** & **Martial Arts** (*Exploring + Combat*), **Divine Soul** (*Devotion + Magic*), **Magical Secrets** (*Magic + Social*), and **Master of Intrigue** (*Social + Exploring*).

---

## 2. Character Creation & Tier-Gated Skill Points

### Base Character (Before Spending Points)
- **Ability Scores, Species/Ancestry, and Background**: Standard D&D 5e rules.
- **Base Hit Die**: `d6` (upgradeable to `d8`, `d10`, or `d12` by unlocking Hit Die nodes; upgrades apply retroactively to all levels).
- **Proficiency Bonus**: Standard 5e progression (`+2` at Lv 1–4, `+3` at Lv 5–8, `+4` at Lv 9–12, `+5` at Lv 13–16, `+6` at Lv 17–20).
- **Ability Score Improvements (ASIs)**: Characters still receive standard `+2` to ability scores at Levels `4, 8, 12, 16, 19` (while Feats live directly in the Skill Web so players don't have to sacrifice core stat growth for thematic feats!).

### Skill Point (SP) Economy
- **Level 1**: Start with **6 Skill Points**.
- **Each Level Up (2–20)**: Gain **+3 Skill Points** per level.
  - Level 1 = `6 SP` · Level 5 = `18 SP` · Level 11 = `36 SP` · Level 17 = `54 SP` · Level 20 = `63 SP`.

### Tier Gates (Matching 5e Tiers of Play)

| Tier | Title | Min Character Level | Typical Node Cost | Contents |
| :---: | :--- | :---: | :---: | :--- |
| **Tier 0** | Role Roots | Level 1 | 1 SP | The 5 Role Root gateways |
| **Tier I** | Local Heroes | Level 1 | 1–2 SP | All 18 Skills, all 6 Saves, Core Armor/Weapon/Tool Proficiencies, `d8` Hit Die, Spellcasting I, foundational Lv 1–4 features |
| **Tier II** | Heroes of the Realm | Level 5 | 2–3 SP | Extra Attack, Spellcasting II (3rd–5th slots), `d10` Hit Die, Aura of Protection, Evasion, Signature Subclasses, Tier II Feats, Core Hybrids |
| **Tier III** | Masters of the Realm | Level 11 | 3–4 SP | Spellcasting III (6th–7th slots), `d12` Hit Die, Reliable Talent, Indomitable, Brutal Critical, Stunning Strike, Advanced Hybrids |
| **Tier IV** | Masters of the World | Level 17 | 4–5 SP | Archmage Spellcasting IV (8th–9th slots), Apex Blade (3 Attacks), Primal Champion, Divine Intervention, Stroke of Luck, Sovereign Voice |

### Prerequisite Rules
Each node has one or more parent edges and a `prereqMode`:
- **`all` (default)**: Every parent node must be unlocked before buying this node (used for hybrid convergence nodes and deep specializations).
- **`any`**: At least one parent node must be unlocked (configurable per node in the Editor for flexible alternate entry paths).

---

## 3. Spellcasting Progression

Spell slots are unified into four clean spine nodes under **Magic** (`Spellcasting I → II → III → IV`), while hybrid nodes (**Divine Soul**, **Magical Secrets**, **Wild Shape**) expand which spell lists you can draw from:

| Spellcasting Node | Unlocks Slot Levels | Character Level Milestone |
| :--- | :--- | :--- |
| **Spellcasting I** | 1st (Lv 1), 2nd (Lv 3) | Tier I (Lv 1+) |
| **Spellcasting II** | 3rd (Lv 5), 4th (Lv 7), 5th (Lv 9) | Tier II (Lv 5+) |
| **Spellcasting III** | 6th (Lv 11), 7th (Lv 13) | Tier III (Lv 11+) |
| **Spellcasting IV (Archmage)** | 8th (Lv 15), 9th (Lv 17) | Tier IV (Lv 17+) |

---

## 4. Data Schema (`data/skill-tree.json`)

The entire system is driven by a portable JSON file so Game Masters can fork, rebalance, homebrew, and share custom skill webs directly in the interactive editor:

```json
{
  "meta": {
    "name": "Fivefold 5e — Role-Rooted Skill Web",
    "version": "1.0.0",
    "startingPoints": 6,
    "pointsPerLevel": 3,
    "baseHitDie": 6,
    "tierMinLevels": { "0": 1, "1": 1, "2": 5, "3": 11, "4": 17 }
  },
  "nodes": [
    {
      "id": "hybrid_divine_smite",
      "name": "Divine Smite",
      "role": "hybrid",
      "secondaryRoles": ["combat", "devotion"],
      "category": "class_feature",
      "tier": 2,
      "cost": 3,
      "prereqMode": "all",
      "x": 461,
      "y": -635,
      "source5e": "Paladin 2 (Combat + Devotion)",
      "summary": "Channel sacred wrath into melee hits for explosive radiant damage.",
      "mechanics": "...",
      "grants": {
        "hitDie": null,
        "saves": [],
        "skills": [],
        "proficiencies": [],
        "spellTier": 0,
        "tags": ["Hybrid: Combat+Devotion", "Smite"]
      }
    }
  ],
  "edges": [
    { "id": "edge_combat_prof_weapons_martial__hybrid_divine_smite", "from": "combat_prof_weapons_martial", "to": "hybrid_divine_smite" }
  ]
}
```
