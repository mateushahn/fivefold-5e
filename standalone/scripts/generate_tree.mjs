import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// Polar helper: angleDeg where -90 is top (12 o'clock), 0 is right (3 o'clock)
function polar(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(rad) * radius),
    y: Math.round(Math.sin(rad) * radius),
  };
}

const ROLES = {
  combat: {
    id: 'combat',
    name: 'Combat',
    angle: -90,
    color: '#c93b2b',
    softBg: 'rgba(201, 59, 43, 0.14)',
    tagline: 'Martial prowess, steel, endurance, and battlefield dominance.',
  },
  devotion: {
    id: 'devotion',
    name: 'Devotion',
    angle: -18,
    color: '#c78212',
    softBg: 'rgba(199, 130, 18, 0.14)',
    tagline: 'Sacred vows, divine channeling, healing, and protective auras.',
  },
  magic: {
    id: 'magic',
    name: 'Magic',
    angle: 54,
    color: '#2b5cc7',
    softBg: 'rgba(43, 92, 199, 0.14)',
    tagline: 'Arcane weave, spellcraft, metamagic, and eldritch pacts.',
  },
  social: {
    id: 'social',
    name: 'Social',
    angle: 126,
    color: '#0d8299',
    softBg: 'rgba(13, 130, 153, 0.14)',
    tagline: 'Persuasion, bardic inspiration, intrigue, and commanding presence.',
  },
  exploring: {
    id: 'exploring',
    name: 'Exploring',
    angle: 198,
    color: '#1b8a5a',
    softBg: 'rgba(27, 138, 90, 0.14)',
    tagline: 'Scouting, stealth, wilderness mastery, and unmatched agility.',
  },
  hybrid: {
    id: 'hybrid',
    name: 'Hybrid',
    angle: 0,
    color: '#8f6339',
    softBg: 'rgba(143, 99, 57, 0.16)',
    tagline: 'Cross-role disciplines forged by uniting two or more roots.',
  },
};

const CATEGORIES = {
  root: { id: 'root', label: 'Role Root', shape: 'octagon' },
  class_feature: { id: 'class_feature', label: 'Class Feature', shape: 'hex' },
  subclass_feature: { id: 'subclass_feature', label: 'Subclass Feature', shape: 'crest' },
  feat: { id: 'feat', label: 'Feat', shape: 'diamond' },
  spellcasting: { id: 'spellcasting', label: 'Spellcasting', shape: 'halo' },
  hit_die: { id: 'hit_die', label: 'Hit Die', shape: 'shield' },
  save: { id: 'save', label: 'Saving Throw', shape: 'badge' },
  skill: { id: 'skill', label: 'Skill', shape: 'circle' },
  proficiency: { id: 'proficiency', label: 'Proficiency', shape: 'square' },
};

const META = {
  name: 'Fivefold 5e — Role-Rooted Skill Web',
  version: '1.0.0',
  startingPoints: 6,
  pointsPerLevel: 3,
  baseHitDie: 6,
  tierMinLevels: { 0: 1, 1: 1, 2: 5, 3: 11, 4: 17 },
  tierNames: {
    0: 'Tier 0 — Role Roots',
    1: 'Tier I — Local Heroes (Lv 1–4)',
    2: 'Tier II — Heroes of the Realm (Lv 5–10)',
    3: 'Tier III — Masters of the Realm (Lv 11–16)',
    4: 'Tier IV — Masters of the World (Lv 17–20)',
  },
};

const nodes = [];
const edges = [];

function addNode({
  id,
  name,
  role,
  secondaryRoles = [],
  category,
  tier,
  cost,
  prereqMode = 'all',
  angle,
  radius,
  x,
  y,
  source5e,
  summary,
  mechanics,
  grants = {},
  parents = [],
}) {
  const pos = x !== undefined && y !== undefined ? { x, y } : polar(angle, radius);
  nodes.push({
    id,
    name,
    role,
    secondaryRoles,
    category,
    tier,
    cost,
    prereqMode,
    x: pos.x,
    y: pos.y,
    source5e,
    summary,
    mechanics,
    grants: {
      hitDie: grants.hitDie ?? null,
      saves: grants.saves ?? [],
      skills: grants.skills ?? [],
      proficiencies: grants.proficiencies ?? [],
      spellTier: grants.spellTier ?? 0,
      tags: grants.tags ?? [],
    },
  });
  for (const p of parents) {
    edges.push({
      id: `edge_${p}__${id}`,
      from: p,
      to: id,
    });
  }
}

// ============================================================================
// 1. COMBAT BRANCH (Center Angle: -90°, span roughly -114° to -66°)
// ============================================================================
const C = -90;
addNode({
  id: 'combat_root',
  name: 'Combat',
  role: 'combat',
  category: 'root',
  tier: 0,
  cost: 1,
  angle: C,
  radius: 260,
  source5e: 'Core Role Root',
  summary: 'Mastery of weapons, armor, endurance, and direct battlefield force.',
  mechanics: 'Unlocks the Combat branch. Grants proficiency with Simple Weapons and +1 to Initiative rolls.',
  grants: { proficiencies: ['Simple Weapons'], tags: ['Martial Root'] },
});

// Combat Tier 1
addNode({
  id: 'combat_skill_athletics',
  name: 'Athletics',
  role: 'combat',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: C - 22,
  radius: 440,
  source5e: 'Core Skill (STR)',
  summary: 'Proficiency in climbing, jumping, swimming, grappling, and shoving.',
  mechanics: 'Gain proficiency in the Athletics skill. Advantage on checks to maintain a grapple once per short rest.',
  grants: { skills: ['Athletics'] },
  parents: ['combat_root'],
});

addNode({
  id: 'combat_save_str',
  name: 'Strength Save',
  role: 'combat',
  category: 'save',
  tier: 1,
  cost: 1,
  angle: C - 11,
  radius: 465,
  source5e: 'Saving Throw Proficiency',
  summary: 'Resist forced movement, restraints, and raw physical force.',
  mechanics: 'Gain proficiency in Strength saving throws.',
  grants: { saves: ['STR'] },
  parents: ['combat_root'],
});

addNode({
  id: 'combat_prof_weapons_martial',
  name: 'Martial Arms',
  role: 'combat',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: C,
  radius: 440,
  source5e: 'Fighter / Barbarian / Paladin',
  summary: 'Training with all martial melee and ranged weaponry.',
  mechanics: 'Gain proficiency with all Martial Weapons.',
  grants: { proficiencies: ['Martial Weapons'] },
  parents: ['combat_root'],
});

addNode({
  id: 'combat_hd_d8',
  name: 'Soldier’s Grit (d8)',
  role: 'combat',
  category: 'hit_die',
  tier: 1,
  cost: 1,
  angle: C + 11,
  radius: 465,
  source5e: 'Hit Die Upgrade',
  summary: 'Upgrade your base Hit Die from d6 to d8.',
  mechanics: 'Your Hit Die becomes at least d8 (retroactively increasing max HP by +1 per character level).',
  grants: { hitDie: 8 },
  parents: ['combat_root'],
});

addNode({
  id: 'combat_prof_armor_med',
  name: 'Battlefield Armor',
  role: 'combat',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: C + 22,
  radius: 440,
  source5e: 'Fighter / Paladin / Barbarian',
  summary: 'Wear Light Armor, Medium Armor, and wield Shields.',
  mechanics: 'Gain proficiency with Light Armor, Medium Armor, and Shields.',
  grants: { proficiencies: ['Light Armor', 'Medium Armor', 'Shields'] },
  parents: ['combat_root'],
});

addNode({
  id: 'combat_rage',
  name: 'Rage',
  role: 'combat',
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: C - 22,
  radius: 620,
  source5e: 'Barbarian 1',
  summary: 'Channel primal fury for bonus melee damage and damage resistance.',
  mechanics: 'Bonus action: enter Rage (2/LR, scaling with Tier). Gain advantage on STR checks/saves, +2 melee STR damage (+3 at T2, +4 at T3), and resistance to bludgeoning, piercing, and slashing damage. Cannot cast/concentrate on spells.',
  grants: { tags: ['Rage'] },
  parents: ['combat_skill_athletics', 'combat_save_str'],
});

addNode({
  id: 'combat_fighting_style',
  name: 'Fighting Style',
  role: 'combat',
  category: 'class_feature',
  tier: 1,
  cost: 1,
  angle: C - 4,
  radius: 615,
  source5e: 'Fighter 1 / Paladin 2 / Ranger 2',
  summary: 'Adopt a signature martial discipline.',
  mechanics: 'Choose one Fighting Style: Archery (+2 ranged attack), Defense (+1 AC in armor), Dueling (+2 one-handed damage), Great Weapon Fighting, Protection, or Two-Weapon Fighting.',
  grants: { tags: ['Fighting Style'] },
  parents: ['combat_prof_weapons_martial'],
});

addNode({
  id: 'combat_second_wind',
  name: 'Second Wind',
  role: 'combat',
  category: 'class_feature',
  tier: 1,
  cost: 1,
  angle: C + 9,
  radius: 635,
  source5e: 'Fighter 1',
  summary: 'Draw on stamina to recover HP mid-fight.',
  mechanics: 'Bonus action: regain 1d10 + character level HP. Recharges on a short or long rest.',
  grants: { tags: ['Self-Sustain'] },
  parents: ['combat_hd_d8'],
});

addNode({
  id: 'combat_save_con',
  name: 'Constitution Save',
  role: 'combat',
  category: 'save',
  tier: 1,
  cost: 1,
  angle: C + 20,
  radius: 615,
  source5e: 'Saving Throw Proficiency',
  summary: 'Shrug off poison, frost, exhaustion, and concentration breaks.',
  mechanics: 'Gain proficiency in Constitution saving throws.',
  grants: { saves: ['CON'] },
  parents: ['combat_hd_d8'],
});

// Combat Tier 2
addNode({
  id: 'combat_reckless_attack',
  name: 'Reckless Attack',
  role: 'combat',
  category: 'class_feature',
  tier: 2,
  cost: 2,
  angle: C - 24,
  radius: 820,
  source5e: 'Barbarian 2',
  summary: 'Trade defense for devastating melee advantage plus Danger Sense.',
  mechanics: 'Gain advantage on melee STR attacks this turn (attacks against you have advantage until next turn). Also gain advantage on DEX saves against effects you can see.',
  grants: { tags: ['Fury'] },
  parents: ['combat_rage'],
});

addNode({
  id: 'combat_improved_crit',
  name: 'Improved Critical',
  role: 'combat',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: C - 14,
  radius: 810,
  source5e: 'Champion Fighter 3',
  summary: 'Score critical hits on natural 19 or 20.',
  mechanics: 'Your weapon attacks score a critical hit on a roll of 19 or 20. Also add half proficiency bonus to non-proficient STR/DEX/CON checks.',
  grants: { tags: ['Crit 19-20'] },
  parents: ['combat_fighting_style'],
});

addNode({
  id: 'combat_extra_attack',
  name: 'Extra Attack',
  role: 'combat',
  category: 'class_feature',
  tier: 2,
  cost: 3,
  angle: C - 4,
  radius: 830,
  source5e: 'Fighter / Barbarian / Paladin / Ranger / Monk 5',
  summary: 'Attack twice whenever you take the Attack action.',
  mechanics: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
  grants: { tags: ['2 Attacks'] },
  parents: ['combat_fighting_style'],
});

addNode({
  id: 'combat_maneuvers',
  name: 'Combat Superiority',
  role: 'combat',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: C + 6,
  radius: 815,
  source5e: 'Battle Master Fighter 3',
  summary: 'Four d8 Superiority Dice and three tactical combat maneuvers.',
  mechanics: 'Learn 3 Battle Master maneuvers (e.g., Trip Attack, Riposte, Precision Attack, Menacing Attack) and gain 4d8 Superiority Dice (short rest recharge).',
  grants: { tags: ['Maneuvers'] },
  parents: ['combat_fighting_style'],
});

addNode({
  id: 'combat_action_surge',
  name: 'Action Surge',
  role: 'combat',
  category: 'class_feature',
  tier: 2,
  cost: 3,
  angle: C + 15,
  radius: 835,
  source5e: 'Fighter 2',
  summary: 'Push beyond normal limits for an extra action.',
  mechanics: 'On your turn, take one additional action. Once per short or long rest (twice at Tier IV).',
  grants: { tags: ['Action Economy'] },
  parents: ['combat_second_wind'],
});

addNode({
  id: 'combat_hd_d10',
  name: 'Martial Vigor (d10)',
  role: 'combat',
  category: 'hit_die',
  tier: 2,
  cost: 2,
  angle: C + 23,
  radius: 815,
  source5e: 'Hit Die Upgrade',
  summary: 'Upgrade your Hit Die to d10.',
  mechanics: 'Your Hit Die becomes at least d10 (retroactively increasing max HP by +1 per level over d8).',
  grants: { hitDie: 10 },
  parents: ['combat_hd_d8', 'combat_save_con'],
});

addNode({
  id: 'combat_prof_armor_heavy',
  name: 'Heavy Plate',
  role: 'combat',
  category: 'proficiency',
  tier: 2,
  cost: 2,
  angle: C + 30,
  radius: 660,
  source5e: 'Fighter / Paladin / Heavy Armor',
  summary: 'Don Heavy Armor and absorb incoming blows.',
  mechanics: 'Gain proficiency with Heavy Armor. While wearing heavy armor, nonmagical B/P/S damage is reduced by 2.',
  grants: { proficiencies: ['Heavy Armor'] },
  parents: ['combat_prof_armor_med'],
});

addNode({
  id: 'combat_feat_gwm',
  name: 'Power Strike Mastery',
  role: 'combat',
  category: 'feat',
  tier: 2,
  cost: 2,
  angle: C - 11,
  radius: 990,
  source5e: 'Feat: Great Weapon Master / Sharpshooter',
  summary: 'Trade -5 accuracy for +10 weapon damage.',
  mechanics: 'Choose Heavy Melee (GWM: bonus attack on crit/kill, -5/+10) or Ranged (Sharpshooter: ignore cover/long range, -5/+10).',
  grants: { tags: ['Martial Feat'] },
  parents: ['combat_extra_attack'],
});

addNode({
  id: 'combat_feat_sentinel',
  name: 'Sentinel',
  role: 'combat',
  category: 'feat',
  tier: 2,
  cost: 2,
  angle: C + 28,
  radius: 960,
  source5e: 'Feat: Sentinel',
  summary: 'Lock down foes and punish attacks against allies.',
  mechanics: 'Opportunity attacks reduce target speed to 0; provoke even on Disengage; reaction melee attack when a creature within 5 ft attacks an ally.',
  grants: { tags: ['Tank Feat'] },
  parents: ['combat_prof_armor_heavy'],
});

// Combat Tier 3
addNode({
  id: 'combat_brutal_critical',
  name: 'Brutal Critical',
  role: 'combat',
  category: 'class_feature',
  tier: 3,
  cost: 3,
  angle: C - 20,
  radius: 1125,
  source5e: 'Barbarian 9 / 13',
  summary: 'Roll extra weapon damage dice on critical hits.',
  mechanics: 'Roll two additional weapon damage dice when determining extra damage for a critical hit with a melee attack. Gain Relentless Rage.',
  grants: { tags: ['Crit Scaling'] },
  parents: ['combat_reckless_attack', 'combat_improved_crit'],
});

addNode({
  id: 'combat_indomitable',
  name: 'Indomitable',
  role: 'combat',
  category: 'class_feature',
  tier: 3,
  cost: 3,
  angle: C + 12,
  radius: 1125,
  source5e: 'Fighter 9',
  summary: 'Reroll a failed saving throw through sheer willpower.',
  mechanics: 'Reroll a failed saving throw (2/LR). You must use the new roll.',
  grants: { tags: ['Save Reroll'] },
  parents: ['combat_action_surge', 'combat_save_con'],
});

addNode({
  id: 'combat_hd_d12',
  name: 'Juggernaut Vitality (d12)',
  role: 'combat',
  category: 'hit_die',
  tier: 3,
  cost: 3,
  angle: C + 23,
  radius: 1120,
  source5e: 'Barbarian Hit Die Upgrade',
  summary: 'Upgrade your Hit Die to the maximum d12.',
  mechanics: 'Your Hit Die becomes d12 (retroactively increasing max HP by +1 per level over d10).',
  grants: { hitDie: 12 },
  parents: ['combat_hd_d10'],
});

// Combat Tier 4
addNode({
  id: 'combat_three_attacks',
  name: 'Apex Blade (3 Attacks)',
  role: 'combat',
  category: 'class_feature',
  tier: 4,
  cost: 5,
  angle: C - 2,
  radius: 1340,
  source5e: 'Fighter 11 / 20',
  summary: 'Unleash three weapon strikes with every Attack action.',
  mechanics: 'You can attack three times whenever you take the Attack action. Your Superiority Dice become d10s if you possess Combat Superiority.',
  grants: { tags: ['3 Attacks', 'Capstone'] },
  parents: ['combat_extra_attack', 'combat_maneuvers'],
});

addNode({
  id: 'combat_capstone_titan',
  name: 'Primal Champion',
  role: 'combat',
  category: 'class_feature',
  tier: 4,
  cost: 5,
  angle: C - 16,
  radius: 1350,
  source5e: 'Barbarian 20',
  summary: 'Transcend mortal limits with +4 STR and +4 CON.',
  mechanics: 'Your Strength and Constitution scores increase by 4, and your maximum for those scores is now 24.',
  grants: { tags: ['+4 STR/CON', 'Capstone'] },
  parents: ['combat_brutal_critical', 'combat_hd_d12'],
});

// ============================================================================
// 2. DEVOTION BRANCH (Center Angle: -18°, span roughly -42° to +6°)
// ============================================================================
const D = -18;
addNode({
  id: 'devotion_root',
  name: 'Devotion',
  role: 'devotion',
  category: 'root',
  tier: 0,
  cost: 1,
  angle: D,
  radius: 260,
  source5e: 'Core Role Root',
  summary: 'Sacred vows, divine channeling, restoration, and radiant protection.',
  mechanics: 'Unlocks the Devotion branch. Grants proficiency with a Holy Symbol focus and the Guidance or Spare the Dying cantrip.',
  grants: { proficiencies: ['Holy Symbol'], tags: ['Divine Root'] },
});

// Devotion Tier 1
addNode({
  id: 'devotion_prof_armor_shield',
  name: 'Templar Vestments',
  role: 'devotion',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: D - 20,
  radius: 445,
  source5e: 'Cleric / Paladin',
  summary: 'Armor and shield proficiency consecrated for sacred service.',
  mechanics: 'Gain proficiency with Light Armor, Medium Armor, and Shields. You may emblazon your shield as a Holy Symbol.',
  grants: { proficiencies: ['Light Armor', 'Medium Armor', 'Shields'] },
  parents: ['devotion_root'],
});

addNode({
  id: 'devotion_skill_religion',
  name: 'Religion',
  role: 'devotion',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: D - 10,
  radius: 465,
  source5e: 'Core Skill (INT)',
  summary: 'Lore of deities, rites, planes, and sacred orders.',
  mechanics: 'Gain proficiency in the Religion skill.',
  grants: { skills: ['Religion'] },
  parents: ['devotion_root'],
});

addNode({
  id: 'devotion_hd_d8',
  name: 'Tempered Vessel (d8)',
  role: 'devotion',
  category: 'hit_die',
  tier: 1,
  cost: 1,
  angle: D,
  radius: 440,
  source5e: 'Cleric Hit Die Upgrade',
  summary: 'Fortify your body through devotion, upgrading Hit Die to d8.',
  mechanics: 'Your Hit Die becomes at least d8.',
  grants: { hitDie: 8 },
  parents: ['devotion_root'],
});

addNode({
  id: 'devotion_skill_medicine',
  name: 'Medicine',
  role: 'devotion',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: D + 10,
  radius: 465,
  source5e: 'Core Skill (WIS)',
  summary: 'Stabilize the dying, diagnose afflictions, and tend wounds.',
  mechanics: 'Gain proficiency in the Medicine skill.',
  grants: { skills: ['Medicine'] },
  parents: ['devotion_root'],
});

addNode({
  id: 'devotion_save_wis',
  name: 'Wisdom Save',
  role: 'devotion',
  category: 'save',
  tier: 1,
  cost: 1,
  angle: D + 20,
  radius: 445,
  source5e: 'Saving Throw Proficiency',
  summary: 'Steadfast mind against charm, fear, and domination.',
  mechanics: 'Gain proficiency in Wisdom saving throws.',
  grants: { saves: ['WIS'] },
  parents: ['devotion_root'],
});

addNode({
  id: 'devotion_skill_insight',
  name: 'Insight',
  role: 'devotion',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: D + 26,
  radius: 615,
  source5e: 'Core Skill (WIS)',
  summary: 'Discern true intent, falsehoods, and hidden motives.',
  mechanics: 'Gain proficiency in the Insight skill.',
  grants: { skills: ['Insight'] },
  parents: ['devotion_save_wis'],
});

addNode({
  id: 'devotion_channel_divinity',
  name: 'Channel Divinity',
  role: 'devotion',
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: D - 12,
  radius: 635,
  source5e: 'Cleric 2 / Paladin 3',
  summary: 'Invoke divine energy to Turn Undead or fuel domain/oath powers.',
  mechanics: 'Gain Channel Divinity (1/SR, 2/SR at Tier II). Includes Turn Undead (WIS save, 30 ft) and unlocks Domain/Oath channel options.',
  grants: { tags: ['Channel Divinity'] },
  parents: ['devotion_skill_religion'],
});

addNode({
  id: 'devotion_divine_sense',
  name: 'Divine Sense & Health',
  role: 'devotion',
  category: 'class_feature',
  tier: 1,
  cost: 1,
  angle: D + 1,
  radius: 630,
  source5e: 'Paladin 1 & 3',
  summary: 'Detect celestials, fiends, and undead; immune to disease.',
  mechanics: 'Detect celestials/fiends/undead within 60 ft (1 + CHA mod/LR). You are immune to disease.',
  grants: { tags: ['Disease Immune'] },
  parents: ['devotion_hd_d8'],
});

addNode({
  id: 'devotion_lay_on_hands',
  name: 'Lay on Hands',
  role: 'devotion',
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: D + 13,
  radius: 640,
  source5e: 'Paladin 1',
  summary: 'A touch-healing pool of 5 × character level HP.',
  mechanics: 'Healing pool equal to 5 × character level (long rest). Spend HP to heal by touch, or spend 5 HP to cure one disease or neutralize one poison.',
  grants: { tags: ['Healing Pool'] },
  parents: ['devotion_skill_medicine'],
});

// Devotion Tier 2
addNode({
  id: 'devotion_warding_flare',
  name: 'Warding Flare',
  role: 'devotion',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: D - 18,
  radius: 835,
  source5e: 'Light Domain Cleric 1 & 2',
  summary: 'Blind attackers with radiant light and unleash Radiance of the Dawn.',
  mechanics: 'Reaction (WIS mod/LR): impose disadvantage on an attacker within 30 ft. Channel Divinity: dispel darkness and deal 2d10 + level radiant damage in 30 ft (CON half).',
  grants: { tags: ['Radiant'] },
  parents: ['devotion_channel_divinity'],
});

addNode({
  id: 'devotion_aura_protection',
  name: 'Aura of Protection',
  role: 'devotion',
  category: 'class_feature',
  tier: 2,
  cost: 3,
  angle: D - 4,
  radius: 845,
  source5e: 'Paladin 6',
  summary: 'Add your CHA or WIS modifier to all saving throws for you and nearby allies.',
  mechanics: 'While conscious, you and friendly creatures within 10 ft (30 ft at Tier IV) gain a bonus to all saving throws equal to your CHA or WIS modifier (min +1).',
  grants: { tags: ['Save Aura'] },
  parents: ['devotion_divine_sense', 'devotion_save_wis'],
});

addNode({
  id: 'devotion_disciple_life',
  name: 'Disciple of Life',
  role: 'devotion',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: D + 10,
  radius: 835,
  source5e: 'Life Domain Cleric 1 & 2',
  summary: 'Supercharge healing spells and Channel Divinity Preserve Life.',
  mechanics: 'Healing spells restore an extra 2 + spell level HP. Channel Divinity: restore up to 5 × level HP divided among creatures within 30 ft (up to half max HP).',
  grants: { tags: ['Master Healer'] },
  parents: ['devotion_lay_on_hands', 'devotion_channel_divinity'],
});

addNode({
  id: 'devotion_feat_healer_resilient',
  name: 'Sanctuary of Will',
  role: 'devotion',
  category: 'feat',
  tier: 2,
  cost: 2,
  angle: D + 22,
  radius: 825,
  source5e: 'Feat: Healer / Resilient Spirit',
  summary: 'Advantage on death saves and emergency field triage.',
  mechanics: 'Use a Healer’s Kit as an action to restore 1d6 + 4 + target HD HP (1/SR per creature). Gain advantage on death saving throws and +1 WIS or CHA.',
  grants: { tags: ['Support Feat'] },
  parents: ['devotion_skill_medicine', 'devotion_skill_insight'],
});

// Devotion Tier 3
addNode({
  id: 'devotion_destroy_undead',
  name: 'Destroy Undead',
  role: 'devotion',
  category: 'class_feature',
  tier: 3,
  cost: 3,
  angle: D - 16,
  radius: 1110,
  source5e: 'Cleric 8 / 11',
  summary: 'Annihilate low-CR undead outright and add radiant power to strikes/cantrips.',
  mechanics: 'Undead of CR 2 or lower (CR 4 at Tier IV) failing Turn Undead are instantly destroyed. Once per turn, add +1d8 radiant damage to a weapon hit or cantrip.',
  grants: { tags: ['Anti-Undead'] },
  parents: ['devotion_warding_flare'],
});

addNode({
  id: 'devotion_aura_warding',
  name: 'Aura of Warding',
  role: 'devotion',
  category: 'subclass_feature',
  tier: 3,
  cost: 3,
  angle: D + 1,
  radius: 1120,
  source5e: 'Oath of the Ancients 7 / Cleansing Touch 14',
  summary: 'Grant resistance to all spell damage inside your aura.',
  mechanics: 'You and friendly creatures within your Aura of Protection have resistance to damage from spells. Action: end one spell on yourself or a willing touched creature (CHA/WIS mod/LR).',
  grants: { tags: ['Spell Resist Aura'] },
  parents: ['devotion_aura_protection'],
});

// Devotion Tier 4
addNode({
  id: 'devotion_divine_intervention',
  name: 'Divine Intervention',
  role: 'devotion',
  category: 'class_feature',
  tier: 4,
  cost: 5,
  angle: D - 12,
  radius: 1345,
  source5e: 'Cleric 10 / 20',
  summary: 'Call directly upon your deity to reshape reality.',
  mechanics: 'Implore your deity for aid (automatic success at Level 20, or roll ≤ character level on d100). Replicates any Cleric spell or miracle of equal potency.',
  grants: { tags: ['Miracle', 'Capstone'] },
  parents: ['devotion_destroy_undead', 'devotion_aura_protection'],
});

addNode({
  id: 'devotion_capstone_avatar',
  name: 'Supreme Radiance',
  role: 'devotion',
  category: 'subclass_feature',
  tier: 4,
  cost: 5,
  angle: D + 8,
  radius: 1345,
  source5e: 'Life Cleric 17 / Devotion Paladin 20',
  summary: 'Maximize all healing dice and radiate a 30-ft Holy Nimbus.',
  mechanics: 'Maximize all dice rolled to restore HP with spells. Once per long rest, emanate sunlight for 1 minute dealing 10 radiant damage to enemies starting their turn within 30 ft.',
  grants: { tags: ['Max Healing', 'Capstone'] },
  parents: ['devotion_aura_warding', 'devotion_disciple_life'],
});

// ============================================================================
// 3. MAGIC BRANCH (Center Angle: 54°, span roughly 30° to 78°)
// ============================================================================
const M = 54;
addNode({
  id: 'magic_root',
  name: 'Magic',
  role: 'magic',
  category: 'root',
  tier: 0,
  cost: 1,
  angle: M,
  radius: 260,
  source5e: 'Core Role Root',
  summary: 'Shape the arcane weave, command cantrips, and unlock spell slots.',
  mechanics: 'Unlocks the Magic branch. Choose INT, WIS, or CHA as your primary spellcasting ability. Learn 2 cantrips and gain Arcane Focus proficiency.',
  grants: { proficiencies: ['Arcane Focus'], tags: ['Arcane Root', '2 Cantrips'] },
});

// Magic Tier 1
addNode({
  id: 'magic_save_int',
  name: 'Intelligence Save',
  role: 'magic',
  category: 'save',
  tier: 1,
  cost: 1,
  angle: M - 21,
  radius: 445,
  source5e: 'Saving Throw Proficiency',
  summary: 'Defend your mind against psionics, illusions, and feeblemind.',
  mechanics: 'Gain proficiency in Intelligence saving throws.',
  grants: { saves: ['INT'] },
  parents: ['magic_root'],
});

addNode({
  id: 'magic_skill_arcana',
  name: 'Arcana',
  role: 'magic',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: M - 10,
  radius: 465,
  source5e: 'Core Skill (INT)',
  summary: 'Knowledge of spells, magic items, eldritch symbols, and planes.',
  mechanics: 'Gain proficiency in the Arcana skill.',
  grants: { skills: ['Arcana'] },
  parents: ['magic_root'],
});

addNode({
  id: 'magic_spell_t1',
  name: 'Spellcasting I',
  role: 'magic',
  category: 'spellcasting',
  tier: 1,
  cost: 2,
  angle: M,
  radius: 445,
  source5e: '5e Tier I Spellcasting (Lv 1–4)',
  summary: 'Unlock 1st- and 2nd-level spell slots (up to 4/3 slots).',
  mechanics: 'Gain 1st-level spell slots (and 2nd-level at Lv 3), +1 cantrip, and prepare/know spells equal to casting mod + proficiency bonus.',
  grants: { spellTier: 1, tags: ['1st–2nd Slots'] },
  parents: ['magic_root'],
});

addNode({
  id: 'magic_skill_history',
  name: 'History',
  role: 'magic',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: M + 11,
  radius: 465,
  source5e: 'Core Skill (INT)',
  summary: 'Recall ancient empires, legendary artifacts, and lost lineages.',
  mechanics: 'Gain proficiency in the History skill.',
  grants: { skills: ['History'] },
  parents: ['magic_root'],
});

addNode({
  id: 'magic_prof_arcane_tools',
  name: 'Arcane Craft',
  role: 'magic',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: M + 21,
  radius: 445,
  source5e: 'Artisan Tools & Scroll Scribing',
  summary: 'Brew potions and scribe spell scrolls.',
  mechanics: 'Gain proficiency with Alchemist’s Supplies and Calligrapher’s Supplies. Halve time and gold cost to scribe scrolls.',
  grants: { proficiencies: ["Alchemist's Supplies", "Calligrapher's Supplies"] },
  parents: ['magic_root'],
});

addNode({
  id: 'magic_ritual_casting',
  name: 'Ritual Casting',
  role: 'magic',
  category: 'class_feature',
  tier: 1,
  cost: 1,
  angle: M - 20,
  radius: 635,
  source5e: 'Wizard / Ritual Caster',
  summary: 'Cast ritual spells without expending spell slots.',
  mechanics: 'Maintain a ritual grimoire. Cast any spell you know with the ritual tag by adding 10 minutes without spending a slot.',
  grants: { tags: ['Rituals'] },
  parents: ['magic_skill_arcana'],
});

addNode({
  id: 'magic_arcane_recovery',
  name: 'Arcane Recovery',
  role: 'magic',
  category: 'class_feature',
  tier: 1,
  cost: 1,
  angle: M - 9,
  radius: 645,
  source5e: 'Wizard 1',
  summary: 'Recover expended spell slots during a short rest.',
  mechanics: 'Once per day on a short rest, recover spell slots with combined levels ≤ ceil(character level / 2) (none 6th or higher).',
  grants: { tags: ['Slot Recovery'] },
  parents: ['magic_spell_t1'],
});

addNode({
  id: 'magic_font_metamagic',
  name: 'Metamagic',
  role: 'magic',
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: M + 8,
  radius: 645,
  source5e: 'Sorcerer 2 & 3',
  summary: 'Twist spells with Sorcery Points (Quickened, Twinned, Subtle).',
  mechanics: 'Gain Sorcery Points equal to character level (or 3 + Tier×2) and 2 Metamagic options (Quickened, Twinned, Subtle, Careful, Distant, Empowered).',
  grants: { tags: ['Metamagic'] },
  parents: ['magic_spell_t1'],
});

addNode({
  id: 'magic_eldritch_invocations',
  name: 'Eldritch Invocations',
  role: 'magic',
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: M + 20,
  radius: 635,
  source5e: 'Warlock 2',
  summary: 'Always-on eldritch augmentations and cantrip empowerment.',
  mechanics: 'Learn 2 Eldritch Invocations (e.g., Agonizing Blast, Devil’s Sight, Mask of Many Faces, Repelling Blast); learn +1 additional invocation per Tier.',
  grants: { tags: ['Invocations'] },
  parents: ['magic_skill_arcana', 'magic_skill_history'],
});

// Magic Tier 2
addNode({
  id: 'magic_arcane_ward',
  name: 'Arcane Ward',
  role: 'magic',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: M - 22,
  radius: 840,
  source5e: 'Abjuration Wizard 2 & 6',
  summary: 'Project a rechargeable magical shield that absorbs damage.',
  mechanics: 'Create an Arcane Ward with HP = 2 × level + casting mod. Recharge it when casting abjuration spells; at Tier III, project it to shield allies within 30 ft.',
  grants: { tags: ['Ward'] },
  parents: ['magic_save_int', 'magic_ritual_casting'],
});

addNode({
  id: 'magic_sculpt_spells',
  name: 'Sculpt Spells',
  role: 'magic',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: M - 11,
  radius: 855,
  source5e: 'Evocation Wizard 2 & 10',
  summary: 'Carve safe pockets in area blasts to spare your allies.',
  mechanics: 'Choose 1 + spell level allies when casting an AoE evocation spell; they automatically succeed on their save and take 0 damage.',
  grants: { tags: ['Evocation'] },
  parents: ['magic_arcane_recovery'],
});

addNode({
  id: 'magic_spell_t2',
  name: 'Spellcasting II',
  role: 'magic',
  category: 'spellcasting',
  tier: 2,
  cost: 3,
  angle: M,
  radius: 845,
  source5e: '5e Tier II Spellcasting (Lv 5–10)',
  summary: 'Unlock 3rd-, 4th-, and 5th-level spell slots.',
  mechanics: 'Unlock 3rd-level slots (4th at Lv 7, 5th at Lv 9), +1 cantrip, and access to iconic mid-tier spells (Fireball, Counterspell, Haste, Fly, Wall of Force).',
  grants: { spellTier: 2, tags: ['3rd–5th Slots'] },
  parents: ['magic_spell_t1'],
});

addNode({
  id: 'magic_pact_boon',
  name: 'Pact Boon',
  role: 'magic',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: M + 18,
  radius: 840,
  source5e: 'Warlock 3',
  summary: 'Claim a Pact of the Tome, Chain familiar, or summoned Pact Blade.',
  mechanics: 'Choose Pact of the Chain (upgraded familiar), Pact of the Tome (+3 cantrips from any list), or Pact of the Blade (summonable magical weapon using casting stat).',
  grants: { tags: ['Pact Boon'] },
  parents: ['magic_eldritch_invocations'],
});

addNode({
  id: 'magic_feat_warcaster',
  name: 'War Caster',
  role: 'magic',
  category: 'feat',
  tier: 2,
  cost: 2,
  angle: M - 19,
  radius: 1015,
  source5e: 'Feat: War Caster',
  summary: 'Advantage on Concentration saves and opportunity-attack spells.',
  mechanics: 'Advantage on CON saves to maintain concentration; perform somatic components with hands full; cast a single-target spell as an opportunity attack.',
  grants: { tags: ['Caster Feat'] },
  parents: ['magic_arcane_ward'],
});

// Magic Tier 3
addNode({
  id: 'magic_feat_elem_adept',
  name: 'Elemental Adept',
  role: 'magic',
  category: 'feat',
  tier: 3,
  cost: 3,
  angle: M - 11,
  radius: 1125,
  source5e: 'Feat: Elemental Adept & Spell Sniper',
  summary: 'Pierce elemental resistance and double ranged spell reach.',
  mechanics: 'Spells of your chosen element ignore resistance and treat 1s on damage dice as 2s. Double range on attack-roll spells and ignore half/three-quarters cover.',
  grants: { tags: ['Elemental Pierce'] },
  parents: ['magic_sculpt_spells'],
});

addNode({
  id: 'magic_spell_t3',
  name: 'Spellcasting III',
  role: 'magic',
  category: 'spellcasting',
  tier: 3,
  cost: 4,
  angle: M,
  radius: 1130,
  source5e: '5e Tier III Spellcasting (Lv 11–16)',
  summary: 'Unlock 6th- and 7th-level spell slots.',
  mechanics: 'Unlock 6th-level slots (7th at Lv 13) and high-magic incantations (Disintegrate, Chain Lightning, Forcecage, Teleport).',
  grants: { spellTier: 3, tags: ['6th–7th Slots'] },
  parents: ['magic_spell_t2'],
});

addNode({
  id: 'magic_wild_surge',
  name: 'Bend Luck & Chaos',
  role: 'magic',
  category: 'subclass_feature',
  tier: 3,
  cost: 3,
  angle: M + 13,
  radius: 1120,
  source5e: 'Wild Magic Sorcerer 6 / 14',
  summary: 'Manipulate d20 rolls with Sorcery Points and master arcane flux.',
  mechanics: 'Reaction (2 Sorcery Points): add or subtract 1d4 from another creature’s attack roll, ability check, or saving throw. Gain +1 Metamagic option.',
  grants: { tags: ['Fate Warp'] },
  parents: ['magic_font_metamagic', 'magic_spell_t2'],
});

// Magic Tier 4
addNode({
  id: 'magic_spell_mastery',
  name: 'Spell Mastery',
  role: 'magic',
  category: 'class_feature',
  tier: 4,
  cost: 4,
  angle: M - 10,
  radius: 1350,
  source5e: 'Wizard 18',
  summary: 'Cast a chosen 1st- and 2nd-level spell at will without slots.',
  mechanics: 'Choose one 1st-level and one 2nd-level spell you know. Cast them at their lowest level at will without expending spell slots.',
  grants: { tags: ['At-Will Spells', 'Capstone'] },
  parents: ['magic_spell_t3', 'magic_feat_elem_adept'],
});

addNode({
  id: 'magic_spell_t4',
  name: 'Archmage (Spellcasting IV)',
  role: 'magic',
  category: 'spellcasting',
  tier: 4,
  cost: 5,
  angle: M + 4,
  radius: 1360,
  source5e: '5e Tier IV Spellcasting (Lv 17–20)',
  summary: 'Command 8th- and 9th-level world-shaping magic (Wish, Meteor Swarm).',
  mechanics: 'Unlock 8th-level slots (9th at Lv 17) and ascend to true Archmage mastery.',
  grants: { spellTier: 4, tags: ['8th–9th Slots', 'Capstone'] },
  parents: ['magic_spell_t3'],
});

// ============================================================================
// 4. SOCIAL BRANCH (Center Angle: 126°, span roughly 102° to 150°)
// ============================================================================
const S = 126;
addNode({
  id: 'social_root',
  name: 'Social',
  role: 'social',
  category: 'root',
  tier: 0,
  cost: 1,
  angle: S,
  radius: 260,
  source5e: 'Core Role Root',
  summary: 'Diplomacy, performance, leadership, deception, and inspiring allies.',
  mechanics: 'Unlocks the Social branch. Learn 1 extra Language and gain proficiency with 1 Musical Instrument or Gaming Set.',
  grants: { proficiencies: ['Musical Instrument / Gaming Set', 'Extra Language'], tags: ['Social Root'] },
});

// Social Tier 1
addNode({
  id: 'social_skill_performance',
  name: 'Performance',
  role: 'social',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: S - 21,
  radius: 445,
  source5e: 'Core Skill (CHA)',
  summary: 'Captivate audiences through music, oratory, or theater.',
  mechanics: 'Gain proficiency in the Performance skill.',
  grants: { skills: ['Performance'] },
  parents: ['social_root'],
});

addNode({
  id: 'social_save_cha',
  name: 'Charisma Save',
  role: 'social',
  category: 'save',
  tier: 1,
  cost: 1,
  angle: S - 10,
  radius: 465,
  source5e: 'Saving Throw Proficiency',
  summary: 'Anchor your sense of self against banishment and possession.',
  mechanics: 'Gain proficiency in Charisma saving throws.',
  grants: { saves: ['CHA'] },
  parents: ['social_root'],
});

addNode({
  id: 'social_skill_persuasion',
  name: 'Persuasion',
  role: 'social',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: S,
  radius: 440,
  source5e: 'Core Skill (CHA)',
  summary: 'Win allies, broker treaties, and sway hearts in good faith.',
  mechanics: 'Gain proficiency in the Persuasion skill.',
  grants: { skills: ['Persuasion'] },
  parents: ['social_root'],
});

addNode({
  id: 'social_skill_deception',
  name: 'Deception',
  role: 'social',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: S + 10,
  radius: 465,
  source5e: 'Core Skill (CHA)',
  summary: 'Spin convincing bluffs, fast-talk guards, and conceal truths.',
  mechanics: 'Gain proficiency in the Deception skill.',
  grants: { skills: ['Deception'] },
  parents: ['social_root'],
});

addNode({
  id: 'social_skill_intimidation',
  name: 'Intimidation',
  role: 'social',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: S + 21,
  radius: 445,
  source5e: 'Core Skill (CHA)',
  summary: 'Project menace, command obedience, and shatter enemy morale.',
  mechanics: 'Gain proficiency in the Intimidation skill.',
  grants: { skills: ['Intimidation'] },
  parents: ['social_root'],
});

addNode({
  id: 'social_bardic_inspiration',
  name: 'Bardic Inspiration',
  role: 'social',
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: S - 16,
  radius: 640,
  source5e: 'Bard 1',
  summary: 'Grant allies bonus inspiration dice (d6 → d12) on key rolls.',
  mechanics: 'Bonus action (CHA mod/LR; SR at Tier II): grant an ally within 60 ft an Inspiration die (d6 at T1, d8 at T2, d10 at T3, d12 at T4) to add to an ability check, attack roll, or save.',
  grants: { tags: ['Inspiration'] },
  parents: ['social_skill_performance'],
});

addNode({
  id: 'social_jack_of_trades',
  name: 'Jack of All Trades',
  role: 'social',
  category: 'class_feature',
  tier: 1,
  cost: 1,
  angle: S,
  radius: 635,
  source5e: 'Bard 2',
  summary: 'Add half proficiency to all non-proficient checks & Song of Rest.',
  mechanics: 'Add half your proficiency bonus (rounded down) to any ability check you make that doesn’t already include your proficiency bonus (including Initiative). Allies regain +1d6 HP on short rests.',
  grants: { tags: ['Versatile'] },
  parents: ['social_skill_persuasion'],
});

addNode({
  id: 'social_prof_intrigue_tools',
  name: 'Persona & Forgery',
  role: 'social',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: S + 15,
  radius: 640,
  source5e: 'Charlatan / Spy / Assassin',
  summary: 'Master Disguise Kits and Forgery Kits.',
  mechanics: 'Gain proficiency with Disguise Kits and Forgery Kits, plus one established false identity.',
  grants: { proficiencies: ['Disguise Kit', 'Forgery Kit'] },
  parents: ['social_skill_deception'],
});

// Social Tier 2
addNode({
  id: 'social_cutting_words',
  name: 'Cutting Words',
  role: 'social',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: S - 18,
  radius: 845,
  source5e: 'College of Lore Bard 3 & 5',
  summary: 'Subtract Inspiration dice from enemy attacks, checks, or damage.',
  mechanics: 'Reaction: spend a Bardic Inspiration die to subtract its roll from a visible creature’s attack roll, ability check, or damage roll within 60 ft. Inspiration now recharges on a short rest.',
  grants: { tags: ['Debuff Reaction'] },
  parents: ['social_bardic_inspiration'],
});

addNode({
  id: 'social_countercharm',
  name: 'Countercharm',
  role: 'social',
  category: 'class_feature',
  tier: 2,
  cost: 2,
  angle: S - 7,
  radius: 830,
  source5e: 'Bard 6',
  summary: 'Rally allies with advantage against frightened and charmed effects.',
  mechanics: 'Action (or Bonus Action once/SR): for 1 round, allies within 30 ft have advantage on saves against being frightened or charmed, and may immediately retry one failed save.',
  grants: { tags: ['Anti-Fear/Charm'] },
  parents: ['social_save_cha', 'social_bardic_inspiration'],
});

addNode({
  id: 'social_feat_inspiring_leader',
  name: 'Inspiring Leader',
  role: 'social',
  category: 'feat',
  tier: 2,
  cost: 2,
  angle: S + 4,
  radius: 845,
  source5e: 'Feat: Inspiring Leader',
  summary: 'Deliver a 10-minute speech granting Level + CHA Temp HP to the party.',
  mechanics: 'Up to 6 friendly creatures who hear your 10-minute address gain temporary HP equal to your character level + CHA modifier (1/SR per creature).',
  grants: { tags: ['Party Temp HP'] },
  parents: ['social_jack_of_trades'],
});

addNode({
  id: 'social_silver_tongue',
  name: 'Silver Tongue',
  role: 'social',
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: S + 15,
  radius: 850,
  source5e: 'College of Eloquence Bard 3',
  summary: 'Treat d20 rolls of 9 or lower as 10 on Persuasion and Deception.',
  mechanics: 'Whenever you make a Persuasion or Deception check, treat a d20 roll of 9 or lower as a 10.',
  grants: { tags: ['Social Floor 10'] },
  parents: ['social_skill_persuasion', 'social_skill_deception'],
});

addNode({
  id: 'social_feat_actor',
  name: 'Master Mimic (Actor)',
  role: 'social',
  category: 'feat',
  tier: 2,
  cost: 2,
  angle: S + 24,
  radius: 825,
  source5e: 'Feat: Actor',
  summary: 'Imitate voices flawlessly and gain advantage while disguised.',
  mechanics: 'Gain +1 CHA, advantage on Deception and Performance checks when passing yourself off as another person, and mimic any speech or sound heard for 1 minute.',
  grants: { tags: ['Social Feat'] },
  parents: ['social_prof_intrigue_tools'],
});

// Social Tier 3
addNode({
  id: 'social_peerless_skill',
  name: 'Peerless Skill',
  role: 'social',
  category: 'subclass_feature',
  tier: 3,
  cost: 3,
  angle: S - 12,
  radius: 1125,
  source5e: 'College of Lore 14 / Swashbuckler Panache',
  summary: 'Inspire your own ability checks and taunt or charm foes with pure panache.',
  mechanics: 'Roll a Bardic Inspiration die and add it to your own ability check. Action: make a Persuasion check contested by Insight to impose disadvantage on a hostile foe attacking anyone else, or charm a non-hostile target for 1 minute.',
  grants: { tags: ['Self-Inspire'] },
  parents: ['social_cutting_words', 'social_countercharm'],
});

addNode({
  id: 'social_command_presence',
  name: 'Commanding Presence',
  role: 'social',
  category: 'class_feature',
  tier: 3,
  cost: 3,
  angle: S + 8,
  radius: 1125,
  source5e: 'Warlord / Banneret / Conquest Presence',
  summary: 'Turn fear and authority into decisive battlefield orders.',
  mechanics: 'Bonus action (CHA mod/LR): issue a command allowing an ally within 60 ft to immediately use their reaction to move half speed or make one weapon attack; or force a foe within 30 ft to make a WIS save or become frightened for 1 minute.',
  grants: { tags: ['Tactical Command'] },
  parents: ['social_feat_inspiring_leader', 'social_skill_intimidation'],
});

// Social Tier 4
addNode({
  id: 'social_capstone_sovereign',
  name: 'Sovereign Voice',
  role: 'social',
  category: 'class_feature',
  tier: 4,
  cost: 5,
  angle: S - 2,
  radius: 1350,
  source5e: 'Bard 20 / Universal Speech',
  summary: 'Never start a fight without Inspiration and speak to all minds.',
  mechanics: 'Roll initiative with 0 Inspiration dice to immediately regain 2 dice. All creatures with INT 4+ understand your speech; once per long rest, issue a Sovereign Decree granting all allies within 60 ft advantage on attacks and saves for 1 round.',
  grants: { tags: ['Capstone'] },
  parents: ['social_peerless_skill', 'social_command_presence'],
});

// ============================================================================
// 5. EXPLORING BRANCH (Center Angle: 198°, span roughly 174° to 222°)
// ============================================================================
const E = 198;
addNode({
  id: 'exploring_root',
  name: 'Exploring',
  role: 'exploring',
  category: 'root',
  tier: 0,
  cost: 1,
  angle: E,
  radius: 260,
  source5e: 'Core Role Root',
  summary: 'Stealth, scouting, traps, survival, mobility, and sharp senses.',
  mechanics: 'Unlocks the Exploring branch. Gain +5 ft walking speed and proficiency with Explorer’s Pack navigation.',
  grants: { tags: ['Explorer Root', '+5 ft Speed'] },
});

// Exploring Tier 1 — Inner ring
addNode({
  id: 'exploring_skill_investigation',
  name: 'Investigation',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E - 22,
  radius: 445,
  source5e: 'Core Skill (INT)',
  summary: 'Uncover traps, secret doors, clues, and logical deductions.',
  mechanics: 'Gain proficiency in the Investigation skill.',
  grants: { skills: ['Investigation'] },
  parents: ['exploring_root'],
});

addNode({
  id: 'exploring_skill_perception',
  name: 'Perception',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E - 13,
  radius: 470,
  source5e: 'Core Skill (WIS)',
  summary: 'Spot ambushes, hidden creatures, and faint details.',
  mechanics: 'Gain proficiency in the Perception skill.',
  grants: { skills: ['Perception'] },
  parents: ['exploring_root'],
});

addNode({
  id: 'exploring_skill_survival',
  name: 'Survival',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E - 4,
  radius: 440,
  source5e: 'Core Skill (WIS)',
  summary: 'Track quarry, forage food, predict storms, and guide expeditions.',
  mechanics: 'Gain proficiency in the Survival skill.',
  grants: { skills: ['Survival'] },
  parents: ['exploring_root'],
});

addNode({
  id: 'exploring_skill_nature',
  name: 'Nature',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E + 5,
  radius: 470,
  source5e: 'Core Skill (INT)',
  summary: 'Know beasts, flora, weather, and primal ecosystems.',
  mechanics: 'Gain proficiency in the Nature skill.',
  grants: { skills: ['Nature'] },
  parents: ['exploring_root'],
});

addNode({
  id: 'exploring_save_dex',
  name: 'Dexterity Save',
  role: 'exploring',
  category: 'save',
  tier: 1,
  cost: 1,
  angle: E + 13,
  radius: 445,
  source5e: 'Saving Throw Proficiency',
  summary: 'Dodge fireballs, falling rubble, and dragon breath.',
  mechanics: 'Gain proficiency in Dexterity saving throws.',
  grants: { saves: ['DEX'] },
  parents: ['exploring_root'],
});

addNode({
  id: 'exploring_skill_stealth',
  name: 'Stealth',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E + 22,
  radius: 465,
  source5e: 'Core Skill (DEX)',
  summary: 'Move unseen and unheard through shadows and wilderness.',
  mechanics: 'Gain proficiency in the Stealth skill.',
  grants: { skills: ['Stealth'] },
  parents: ['exploring_root'],
});

// Exploring Tier 1 — Outer ring
addNode({
  id: 'exploring_prof_thieves_tools',
  name: "Thieves' Tools",
  role: 'exploring',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: E - 24,
  radius: 645,
  source5e: 'Rogue 1',
  summary: 'Pick locks, disable traps, and bypass security mechanisms.',
  mechanics: 'Gain proficiency with Thieves’ Tools and learn Thieves’ Cant.',
  grants: { proficiencies: ["Thieves' Tools"], tags: ["Thieves' Cant"] },
  parents: ['exploring_skill_investigation'],
});

addNode({
  id: 'exploring_expertise',
  name: 'Expertise',
  role: 'exploring',
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: E - 15,
  radius: 660,
  source5e: 'Rogue 1 / Bard 3',
  summary: 'Double your proficiency bonus on two chosen skills or tools.',
  mechanics: 'Choose two of your skill proficiencies (or one skill and Thieves’ Tools). Your proficiency bonus is doubled for any ability check using them.',
  grants: { tags: ['Double Prof (2)'] },
  parents: ['exploring_skill_investigation', 'exploring_skill_perception'],
});

addNode({
  id: 'exploring_hd_d8',
  name: 'Hardened Scout (d8)',
  role: 'exploring',
  category: 'hit_die',
  tier: 1,
  cost: 1,
  angle: E - 6,
  radius: 635,
  source5e: 'Rogue / Monk / Druid Hit Die',
  summary: 'Build trail-forged resilience, upgrading your Hit Die to d8.',
  mechanics: 'Your Hit Die becomes at least d8.',
  grants: { hitDie: 8 },
  parents: ['exploring_skill_survival'],
});

addNode({
  id: 'exploring_prof_wild_tools',
  name: 'Herbalism & Maps',
  role: 'exploring',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: E + 2,
  radius: 665,
  source5e: 'Druid / Outlander',
  summary: 'Craft healing potions and chart unknown regions.',
  mechanics: 'Gain proficiency with Herbalism Kits and Cartographer’s Tools.',
  grants: { proficiencies: ['Herbalism Kit', "Cartographer's Tools"] },
  parents: ['exploring_skill_survival', 'exploring_skill_nature'],
});

addNode({
  id: 'exploring_skill_animal',
  name: 'Animal Handling',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E + 10,
  radius: 635,
  source5e: 'Core Skill (WIS)',
  summary: 'Calm mounts, read beasts, and bond with wild companions.',
  mechanics: 'Gain proficiency in the Animal Handling skill.',
  grants: { skills: ['Animal Handling'] },
  parents: ['exploring_skill_nature'],
});

addNode({
  id: 'exploring_skill_acrobatics',
  name: 'Acrobatics',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E + 18,
  radius: 660,
  source5e: 'Core Skill (DEX)',
  summary: 'Tumble, balance on narrow ledges, and escape grapples.',
  mechanics: 'Gain proficiency in the Acrobatics skill.',
  grants: { skills: ['Acrobatics'] },
  parents: ['exploring_save_dex'],
});

addNode({
  id: 'exploring_skill_sleight',
  name: 'Sleight of Hand',
  role: 'exploring',
  category: 'skill',
  tier: 1,
  cost: 1,
  angle: E + 27,
  radius: 635,
  source5e: 'Core Skill (DEX)',
  summary: 'Legerdemain, pickpocketing, and concealing small objects.',
  mechanics: 'Gain proficiency in the Sleight of Hand skill.',
  grants: { skills: ['Sleight of Hand'] },
  parents: ['exploring_skill_stealth'],
});

addNode({
  id: 'exploring_prof_light_finesse',
  name: 'Skirmisher Gear',
  role: 'exploring',
  category: 'proficiency',
  tier: 1,
  cost: 1,
  angle: E + 31,
  radius: 490,
  source5e: 'Rogue 1',
  summary: 'Light Armor plus rapiers, shortswords, hand crossbows, and shortbows.',
  mechanics: 'Gain proficiency with Light Armor, Shortswords, Rapiers, Hand Crossbows, and Shortbows.',
  grants: { proficiencies: ['Light Armor', 'Finesse & Scout Weapons'] },
  parents: ['exploring_root'],
});

// Exploring Tier 2
addNode({
  id: 'exploring_feat_alert_mobile',
  name: 'Alert & Mobile',
  role: 'exploring',
  category: 'feat',
  tier: 2,
  cost: 2,
  angle: E - 18,
  radius: 865,
  source5e: 'Feats: Alert / Mobile',
  summary: '+5 Initiative, cannot be surprised, and +10 ft movement speed.',
  mechanics: 'Gain +5 bonus to Initiative, you can’t be surprised while conscious, and your walking speed increases by +10 ft.',
  grants: { tags: ['+5 Init', '+10 ft Speed'] },
  parents: ['exploring_expertise', 'exploring_hd_d8'],
});

addNode({
  id: 'exploring_natural_explorer',
  name: 'Natural Explorer',
  role: 'exploring',
  category: 'class_feature',
  tier: 2,
  cost: 2,
  angle: E - 5,
  radius: 860,
  source5e: 'Ranger 1 & 8',
  summary: 'Ignore nonmagical difficult terrain and master overland travel.',
  mechanics: 'Moving through nonmagical difficult terrain costs no extra movement. Gain climbing and swimming speed equal to walking speed, plus double foraging and tracking mastery.',
  grants: { tags: ['Climb/Swim Speed'] },
  parents: ['exploring_prof_wild_tools', 'exploring_skill_animal'],
});

addNode({
  id: 'exploring_cunning_action',
  name: 'Cunning Action',
  role: 'exploring',
  category: 'class_feature',
  tier: 2,
  cost: 2,
  angle: E + 12,
  radius: 855,
  source5e: 'Rogue 2',
  summary: 'Dash, Disengage, or Hide as a bonus action every turn.',
  mechanics: 'On each of your turns in combat, you can use a bonus action to take the Dash, Disengage, or Hide action.',
  grants: { tags: ['Bonus Mobility'] },
  parents: ['exploring_skill_stealth', 'exploring_skill_acrobatics'],
});

addNode({
  id: 'exploring_evasion',
  name: 'Evasion & Uncanny Dodge',
  role: 'exploring',
  category: 'class_feature',
  tier: 2,
  cost: 3,
  angle: E + 22,
  radius: 950,
  source5e: 'Rogue 5 & 7 / Monk 7',
  summary: 'Halve attack damage with a reaction and take 0 damage on passed DEX saves.',
  mechanics: 'Reaction: halve damage of an attack that hits you from an attacker you can see. On DEX saves for half damage, take 0 damage on success and half on failure.',
  grants: { tags: ['Evasion', 'Uncanny Dodge'] },
  parents: ['exploring_save_dex', 'exploring_cunning_action'],
});

// Exploring Tier 3
addNode({
  id: 'exploring_reliable_talent',
  name: 'Reliable Talent',
  role: 'exploring',
  category: 'class_feature',
  tier: 3,
  cost: 3,
  angle: E - 12,
  radius: 1135,
  source5e: 'Rogue 11',
  summary: 'Never roll below 10 on any proficient ability check.',
  mechanics: 'Whenever you make an ability check that lets you add your proficiency bonus, treat a d20 roll of 9 or lower as a 10.',
  grants: { tags: ['Skill Floor 10'] },
  parents: ['exploring_expertise', 'exploring_feat_alert_mobile'],
});

addNode({
  id: 'exploring_vanish',
  name: 'Vanish & Feral Senses',
  role: 'exploring',
  category: 'class_feature',
  tier: 3,
  cost: 3,
  angle: E + 8,
  radius: 1135,
  source5e: 'Ranger 14 & 18 / Rogue 14',
  summary: 'Sense invisible foes within 30 ft and leave no trail.',
  mechanics: 'You can’t be tracked by nonmagical means unless you choose to leave a trail. Gain 10-ft Blindsight and never suffer disadvantage attacking invisible creatures you can hear.',
  grants: { tags: ['Blindsight 10 ft'] },
  parents: ['exploring_natural_explorer', 'exploring_evasion'],
});

// Exploring Tier 4
addNode({
  id: 'exploring_capstone_phantom',
  name: 'Stroke of Luck',
  role: 'exploring',
  category: 'class_feature',
  tier: 4,
  cost: 5,
  angle: E - 2,
  radius: 1350,
  source5e: 'Rogue 20',
  summary: 'Turn a missed attack into a hit or a failed check into a natural 20.',
  mechanics: 'Once per short or long rest, turn a missed weapon attack into a hit, OR treat a failed ability check as if you rolled a 20 on the d20.',
  grants: { tags: ['Auto-20', 'Capstone'] },
  parents: ['exploring_reliable_talent', 'exploring_vanish'],
});

// ============================================================================
// 6. CROSS-ROOT HYBRID BRIDGES (Multi-Parent DAG Nodes!)
// ============================================================================

// Seam 1: Combat (-90°) + Devotion (-18°) => Mid-angle -54°
addNode({
  id: 'hybrid_divine_smite',
  name: 'Divine Smite',
  role: 'hybrid',
  secondaryRoles: ['combat', 'devotion'],
  category: 'class_feature',
  tier: 2,
  cost: 3,
  angle: -54,
  radius: 785,
  source5e: 'Paladin 2 (Combat + Devotion)',
  summary: 'Channel sacred wrath into melee hits for explosive radiant damage.',
  mechanics: 'When you hit with a melee weapon attack, expend a spell slot or Channel Divinity charge to deal +2d8 radiant damage (+1d8 per slot level above 1st; +1d8 vs undead/fiends).',
  grants: { tags: ['Hybrid: Combat+Devotion', 'Smite'] },
  parents: ['combat_prof_weapons_martial', 'devotion_channel_divinity'],
});

addNode({
  id: 'hybrid_sacred_weapon',
  name: 'Sacred Avenger',
  role: 'hybrid',
  secondaryRoles: ['combat', 'devotion'],
  category: 'subclass_feature',
  tier: 3,
  cost: 3,
  angle: -54,
  radius: 1055,
  source5e: 'Oath of Devotion 3 & Paladin 11',
  summary: 'Every melee strike deals +1d8 radiant damage and glows with holy accuracy.',
  mechanics: 'All melee weapon hits deal an extra 1d8 radiant damage (Improved Divine Smite). Channel Divinity: add CHA/WIS modifier to weapon attack rolls for 1 minute.',
  grants: { tags: ['Hybrid: Combat+Devotion', '+1d8 Radiant'] },
  parents: ['hybrid_divine_smite', 'combat_extra_attack'],
});

// Seam 2: Devotion (-18°) + Magic (54°) => Mid-angle +18°
addNode({
  id: 'hybrid_divine_magic',
  name: 'Divine Soul',
  role: 'hybrid',
  secondaryRoles: ['devotion', 'magic'],
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: 18,
  radius: 785,
  source5e: 'Cleric / Divine Soul Sorcerer (Devotion + Magic)',
  summary: 'Unite divine and arcane spell lists and bend fate once per short rest.',
  mechanics: 'You may learn/prepare both Cleric and Arcane spells using your spellcasting slots. Once per short rest, add 2d4 to a failed saving throw or missed attack roll.',
  grants: { tags: ['Hybrid: Devotion+Magic', 'Cleric Spells'] },
  parents: ['devotion_channel_divinity', 'magic_spell_t1'],
});

addNode({
  id: 'hybrid_radiant_conduit',
  name: 'Celestial Conduit',
  role: 'hybrid',
  secondaryRoles: ['devotion', 'magic'],
  category: 'subclass_feature',
  tier: 3,
  cost: 3,
  angle: 18,
  radius: 1055,
  source5e: 'Celestial Warlock / Light Cleric 8',
  summary: 'Empower radiant/healing spells and summon spectral wings of light.',
  mechanics: 'Add your casting modifier to one damage roll of any radiant or fire spell. Gain a 30-ft flying speed for 1 minute once per short rest.',
  grants: { tags: ['Hybrid: Devotion+Magic', 'Flight'] },
  parents: ['hybrid_divine_magic', 'magic_spell_t2'],
});

// Seam 3: Magic (54°) + Social (126°) => Mid-angle +90°
addNode({
  id: 'hybrid_magical_secrets',
  name: 'Magical Secrets',
  role: 'hybrid',
  secondaryRoles: ['magic', 'social'],
  category: 'class_feature',
  tier: 2,
  cost: 3,
  angle: 90,
  radius: 785,
  source5e: 'Bard 6 / 10 (Magic + Social)',
  summary: 'Poach two spells from any tradition and weave subtle enchantments.',
  mechanics: 'Learn 2 spells of any class list that you have slots to cast. Impose disadvantage on a target’s save against your enchantment or illusion spell once per short rest.',
  grants: { tags: ['Hybrid: Magic+Social', 'Any-List Spells'] },
  parents: ['magic_spell_t1', 'social_bardic_inspiration'],
});

addNode({
  id: 'hybrid_enthralling_weave',
  name: 'Split Enchantment',
  role: 'hybrid',
  secondaryRoles: ['magic', 'social'],
  category: 'subclass_feature',
  tier: 3,
  cost: 3,
  angle: 90,
  radius: 1055,
  source5e: 'Enchantment Wizard 10 / Glamour Bard',
  summary: 'Twin single-target enchantment spells automatically for free.',
  mechanics: 'When you cast a single-target enchantment spell of 1st level or higher, you may target a second creature in range at no extra cost.',
  grants: { tags: ['Hybrid: Magic+Social', 'Twin Enchant'] },
  parents: ['hybrid_magical_secrets', 'magic_spell_t2'],
});

// Seam 4: Social (126°) + Exploring (198°) => Mid-angle +162°
addNode({
  id: 'hybrid_master_intrigue',
  name: 'Master of Intrigue',
  role: 'hybrid',
  secondaryRoles: ['social', 'exploring'],
  category: 'subclass_feature',
  tier: 2,
  cost: 2,
  angle: 162,
  radius: 785,
  source5e: 'Mastermind Rogue 3 (Social + Exploring)',
  summary: 'Use the Help action at 30 ft as a bonus action and read social tells.',
  mechanics: 'Use the Help action as a bonus action; when aiding an ally’s attack, the target can be within 30 ft. Spend 1 minute observing a creature to learn two of its relative stats.',
  grants: { tags: ['Hybrid: Social+Exploring', '30-ft Help'] },
  parents: ['social_prof_intrigue_tools', 'exploring_expertise'],
});

addNode({
  id: 'hybrid_shadow_network',
  name: 'Spymaster’s Web',
  role: 'hybrid',
  secondaryRoles: ['social', 'exploring'],
  category: 'subclass_feature',
  tier: 3,
  cost: 3,
  angle: 162,
  radius: 1055,
  source5e: 'Mastermind 13 / Whispers Bard',
  summary: 'Redirect attacks onto nearby foes and shield your thoughts from magic.',
  mechanics: 'Reaction: when targeted by an attack while a creature within 5 ft gives you cover, force the attack to target that creature instead. Thoughts cannot be read telepathically.',
  grants: { tags: ['Hybrid: Social+Exploring', 'Misdirection'] },
  parents: ['hybrid_master_intrigue', 'social_silver_tongue'],
});

// Seam 5: Exploring (198°) + Combat (270° / -90°) => Mid-angle 234° (-126°)
addNode({
  id: 'hybrid_sneak_attack',
  name: 'Sneak Attack',
  role: 'hybrid',
  secondaryRoles: ['exploring', 'combat'],
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: -130,
  radius: 615,
  source5e: 'Rogue 1 (Exploring + Combat)',
  summary: 'Deal precision bonus dice (+1d6 to +6d6) with finesse or ranged weapons.',
  mechanics: 'Once per turn, deal extra precision damage with a finesse or ranged weapon when you have advantage or an ally is within 5 ft of target: 2d6 at T1, 4d6 at T2, 6d6 at T3, 8d6 at T4.',
  grants: { tags: ['Hybrid: Exploring+Combat', 'Sneak Attack'] },
  parents: ['exploring_prof_light_finesse', 'combat_prof_weapons_martial'],
});

addNode({
  id: 'hybrid_martial_arts',
  name: 'Martial Arts & Ki',
  role: 'hybrid',
  secondaryRoles: ['exploring', 'combat'],
  category: 'class_feature',
  tier: 1,
  cost: 2,
  angle: -119,
  radius: 660,
  source5e: 'Monk 1 & 2 (Exploring + Combat)',
  summary: 'Unarmored Defense, DEX unarmed strikes, and Ki Flurry of Blows.',
  mechanics: 'While unarmored, AC = 10 + DEX + WIS, unarmed strikes use DEX and d6 (d8 at T2, d10 at T3) + bonus unarmed strike. Gain Ki points (SR recharge) for Flurry of Blows & Patient Defense.',
  grants: { tags: ['Hybrid: Exploring+Combat', 'Ki'] },
  parents: ['exploring_skill_acrobatics', 'combat_skill_athletics'],
});

addNode({
  id: 'hybrid_assassinate',
  name: 'Assassinate & Hunter',
  role: 'hybrid',
  secondaryRoles: ['exploring', 'combat'],
  category: 'subclass_feature',
  tier: 2,
  cost: 3,
  angle: -132,
  radius: 895,
  source5e: 'Assassin Rogue 3 / Hunter Ranger 3',
  summary: 'Auto-crit surprised foes and add +1d8 Colossus Slayer damage.',
  mechanics: 'Advantage on attacks against creatures that haven’t acted yet; any hit against a surprised creature is a critical hit. Once per turn, deal +1d8 damage to an injured foe.',
  grants: { tags: ['Hybrid: Exploring+Combat', 'Ambush Crit'] },
  parents: ['hybrid_sneak_attack', 'exploring_cunning_action'],
});

addNode({
  id: 'hybrid_stunning_strike',
  name: 'Stunning Strike',
  role: 'hybrid',
  secondaryRoles: ['exploring', 'combat'],
  category: 'class_feature',
  tier: 3,
  cost: 3,
  angle: -120,
  radius: 1065,
  source5e: 'Monk 5 & 14 (Diamond Soul)',
  summary: 'Spend 1 Ki on melee hit to Stun enemies (CON save).',
  mechanics: 'When you hit with a melee attack, spend 1 Ki to force a CON save or Stun the target until the end of your next turn. Also spend 1 Ki to reroll a failed saving throw.',
  grants: { tags: ['Hybrid: Exploring+Combat', 'Stun'] },
  parents: ['hybrid_martial_arts', 'combat_extra_attack'],
});

// Inner-Pentagon Convergence Nodes (Non-Adjacent Iconic Hybrids!)
addNode({
  id: 'hybrid_war_magic',
  name: 'War Magic (Spellblade)',
  role: 'hybrid',
  secondaryRoles: ['combat', 'magic'],
  category: 'subclass_feature',
  tier: 2,
  cost: 3,
  x: 42,
  y: -55,
  source5e: 'Eldritch Knight 7 / Bladesinger (Combat + Magic)',
  summary: 'Weave steel and spells: cast a cantrip and strike as a bonus action.',
  mechanics: 'When you use your action to cast a cantrip, make one weapon attack as a bonus action. Bond up to two weapons (cannot be disarmed; summon as bonus action).',
  grants: { tags: ['Hybrid: Combat+Magic', 'Gish'] },
  parents: ['combat_fighting_style', 'magic_spell_t1'],
});

addNode({
  id: 'hybrid_wild_shape',
  name: 'Wild Shape',
  role: 'hybrid',
  secondaryRoles: ['exploring', 'magic'],
  category: 'class_feature',
  tier: 2,
  cost: 3,
  x: -72,
  y: 55,
  source5e: 'Druid 2 / Circle of the Moon (Exploring + Magic)',
  summary: 'Transform into beasts as a bonus action (2/SR) with Primal spell access.',
  mechanics: 'Bonus action (2/SR): transform into a beast up to CR 1 (CR = floor(level/3) at Tier III). Gain access to Druid primal spells through your spellcasting slots.',
  grants: { tags: ['Hybrid: Exploring+Magic', 'Shapeshift'] },
  parents: ['exploring_natural_explorer', 'magic_spell_t1'],
});

// ============================================================================
// VALIDATION & COLLISION RELAXATION
// ============================================================================
function validateAndRelax() {
  const nodeMap = new Map();
  for (const n of nodes) {
    if (nodeMap.has(n.id)) {
      throw new Error(`Duplicate node ID: ${n.id}`);
    }
    nodeMap.set(n.id, n);
  }

  // Validate edges
  const adj = new Map();
  const indeg = new Map();
  for (const n of nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }

  const edgeSet = new Set();
  for (const e of edges) {
    if (!nodeMap.has(e.from)) throw new Error(`Edge ${e.id} missing source node: ${e.from}`);
    if (!nodeMap.has(e.to)) throw new Error(`Edge ${e.id} missing target node: ${e.to}`);
    if (e.from === e.to) throw new Error(`Self-loop on ${e.from}`);
    const key = `${e.from}->${e.to}`;
    if (edgeSet.has(key)) throw new Error(`Duplicate edge: ${key}`);
    edgeSet.add(key);
    adj.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }

  // Acyclicity check (Kahn's algorithm)
  const queue = [];
  for (const [id, deg] of indeg.entries()) {
    if (deg === 0) queue.push(id);
  }
  let visitedCount = 0;
  while (queue.length > 0) {
    const curr = queue.shift();
    visitedCount++;
    for (const nxt of adj.get(curr)) {
      indeg.set(nxt, indeg.get(nxt) - 1);
      if (indeg.get(nxt) === 0) queue.push(nxt);
    }
  }
  if (visitedCount !== nodes.length) {
    throw new Error(`Graph contains a cycle! Visited ${visitedCount}/${nodes.length}`);
  }

  // Reachability from roots
  const roots = nodes.filter((n) => n.category === 'root');
  if (roots.length !== 5) throw new Error(`Expected 5 roots, got ${roots.length}`);
  const reachable = new Set();
  const bfs = roots.map((r) => r.id);
  for (const id of bfs) reachable.add(id);
  while (bfs.length > 0) {
    const curr = bfs.shift();
    for (const nxt of adj.get(curr)) {
      if (!reachable.has(nxt)) {
        reachable.add(nxt);
        bfs.push(nxt);
      }
    }
  }
  const unreachable = nodes.filter((n) => !reachable.has(n.id)).map((n) => n.id);
  if (unreachable.length > 0) {
    throw new Error(`Unreachable nodes from roots: ${unreachable.join(', ')}`);
  }

  // Verify 5e coverage (18 skills, 6 saves, d8/d10/d12 hit dice)
  const expectedSkills = [
    'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
    'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
    'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
    'Sleight of Hand', 'Stealth', 'Survival',
  ];
  const expectedSaves = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const foundSkills = new Set(nodes.flatMap((n) => n.grants.skills));
  const foundSaves = new Set(nodes.flatMap((n) => n.grants.saves));
  const foundHitDice = new Set(nodes.map((n) => n.grants.hitDie).filter(Boolean));

  const missingSkills = expectedSkills.filter((s) => !foundSkills.has(s));
  const missingSaves = expectedSaves.filter((s) => !foundSaves.has(s));
  if (missingSkills.length) throw new Error(`Missing 5e skills: ${missingSkills.join(', ')}`);
  if (missingSaves.length) throw new Error(`Missing 5e saves: ${missingSaves.join(', ')}`);
  for (const hd of [8, 10, 12]) {
    if (!foundHitDice.has(hd)) throw new Error(`Missing Hit Die d${hd}`);
  }

  // Gentle collision relaxation so no two nodes sit closer than 128px
  const MIN_DIST = 132;
  for (let iter = 0; iter < 120; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist < MIN_DIST) {
          const push = (MIN_DIST - dist) * 0.52;
          const ux = dx / dist;
          const uy = dy / dist;
          if (a.category !== 'root') {
            a.x -= ux * push;
            a.y -= uy * push;
          }
          if (b.category !== 'root') {
            b.x += ux * push;
            b.y += uy * push;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // Round coordinates & check final min distance
  let minPairDist = Infinity;
  let closestPair = null;
  for (const n of nodes) {
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
      if (d < minPairDist) {
        minPairDist = d;
        closestPair = `${nodes[i].id} <-> ${nodes[j].id}`;
      }
    }
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    skillsCovered: foundSkills.size,
    savesCovered: foundSaves.size,
    minPairDist: Math.round(minPairDist),
    closestPair,
  };
}

const stats = validateAndRelax();

const dataset = {
  meta: META,
  roles: ROLES,
  categories: CATEGORIES,
  nodes,
  edges,
  presets: [
    {
      id: 'preset_paladin',
      name: 'Lv 5 Oathbound Paladin',
      level: 5,
      description: 'Combat + Devotion vanguard wielding Divine Smite, Heavy Armor, and Lay on Hands.',
      unlocked: [
        'combat_root', 'combat_prof_weapons_martial', 'combat_prof_armor_med', 'combat_hd_d8',
        'combat_fighting_style', 'combat_extra_attack',
        'devotion_root', 'devotion_skill_religion', 'devotion_skill_medicine', 'devotion_channel_divinity',
        'devotion_lay_on_hands', 'hybrid_divine_smite',
      ],
    },
    {
      id: 'preset_spellblade',
      name: 'Lv 5 Eldritch Spellblade',
      level: 5,
      description: 'Combat + Magic gish blending Fighting Style, Arcane Ward, and War Magic.',
      unlocked: [
        'combat_root', 'combat_prof_weapons_martial', 'combat_prof_armor_med', 'combat_hd_d8',
        'combat_fighting_style', 'combat_save_con',
        'magic_root', 'magic_skill_arcana', 'magic_save_int', 'magic_spell_t1',
        'magic_ritual_casting', 'magic_arcane_ward', 'hybrid_war_magic',
      ],
    },
    {
      id: 'preset_shadow_scout',
      name: 'Lv 5 Shadow Assassin',
      level: 5,
      description: 'Exploring + Combat skirmisher with Sneak Attack, Cunning Action, Expertise, and Assassinate.',
      unlocked: [
        'exploring_root', 'exploring_skill_stealth', 'exploring_skill_perception', 'exploring_skill_investigation',
        'exploring_save_dex', 'exploring_skill_acrobatics', 'exploring_prof_light_finesse',
        'exploring_expertise', 'exploring_cunning_action',
        'combat_root', 'combat_prof_weapons_martial', 'hybrid_sneak_attack', 'hybrid_assassinate',
      ],
    },
    {
      id: 'preset_arcane_diplomat',
      name: 'Lv 5 Lore Bard',
      level: 5,
      description: 'Social + Magic maestro combining Bardic Inspiration, Cutting Words, and Magical Secrets.',
      unlocked: [
        'social_root', 'social_skill_performance', 'social_skill_persuasion', 'social_save_cha',
        'social_bardic_inspiration', 'social_jack_of_trades', 'social_cutting_words',
        'magic_root', 'magic_spell_t1', 'magic_spell_t2', 'hybrid_magical_secrets',
      ],
    },
  ],
};

// Verify every preset is valid (respects prerequisites, tiers, and level SP budget)
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const parentsById = new Map(nodes.map((n) => [n.id, []]));
for (const e of edges) parentsById.get(e.to).push(e.from);

for (const preset of dataset.presets) {
  const budget = META.startingPoints + (preset.level - 1) * META.pointsPerLevel;
  const set = new Set(preset.unlocked);
  let spent = 0;
  for (const id of preset.unlocked) {
    const n = nodeById.get(id);
    if (!n) throw new Error(`Preset ${preset.id} unknown node ${id}`);
    if (META.tierMinLevels[n.tier] > preset.level) {
      throw new Error(`Preset ${preset.id} node ${id} exceeds level ${preset.level}`);
    }
    const ps = parentsById.get(id);
    if (ps.length > 0) {
      const ok = n.prereqMode === 'any' ? ps.some((p) => set.has(p)) : ps.every((p) => set.has(p));
      if (!ok) throw new Error(`Preset ${preset.id} node ${id} missing prereq: ${ps.join(', ')}`);
    }
    spent += n.cost;
  }
  if (spent > budget) {
    throw new Error(`Preset ${preset.id} over budget: ${spent} > ${budget}`);
  }
}

fs.mkdirSync(path.join(ROOT_DIR, 'data'), { recursive: true });
fs.mkdirSync(path.join(ROOT_DIR, 'src'), { recursive: true });

fs.writeFileSync(
  path.join(ROOT_DIR, 'data', 'skill-tree.json'),
  JSON.stringify(dataset, null, 2) + '\n',
  'utf8'
);

fs.writeFileSync(
  path.join(ROOT_DIR, 'src', 'defaultTree.js'),
  `// Auto-generated from scripts/generate_tree.mjs — edit data/skill-tree.json or use the in-app Editor.\nwindow.FIVEFOLD_DEFAULT_TREE = ${JSON.stringify(dataset)};\n`,
  'utf8'
);

console.log('Generated Fivefold 5e Skill Web successfully:', stats);
