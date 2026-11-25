export const MODULE_ID = 'fivefold-5e';
export const FLAG_SCOPE = 'fivefold-5e';

export const ALL_ROLES_ORDER = ['combat', 'devotion', 'magic', 'social', 'exploring', 'hybrid'];
export const ALL_SAVES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export const TIER_ROMAN = ['0', 'I', 'II', 'III', 'IV'];
export const TIER_RADII = [260, 560, 860, 1130, 1360];

export const SPELL_TIER_LABELS = [
  'None',
  'Tier I (1st–2nd Slots)',
  'Tier II (3rd–5th Slots)',
  'Tier III (6th–7th Slots)',
  'Tier IV — Archmage (8th–9th)',
];

// dnd5e v3.x & v4.x Skill Keys
export const DND5E_SKILL_MAP = {
  acrobatics: 'acr',
  'animal handling': 'ani',
  arcana: 'arc',
  athletics: 'ath',
  deception: 'dec',
  history: 'his',
  insight: 'ins',
  intimidation: 'itm',
  investigation: 'inv',
  medicine: 'med',
  nature: 'nat',
  perception: 'prc',
  performance: 'prf',
  persuasion: 'per',
  religion: 'rel',
  'sleight of hand': 'slt',
  stealth: 'ste',
  survival: 'sur',
};

// dnd5e Saving Throw Ability Keys
export const DND5E_SAVE_MAP = {
  STR: 'str',
  DEX: 'dex',
  CON: 'con',
  INT: 'int',
  WIS: 'wis',
  CHA: 'cha',
};

// dnd5e Armor, Weapon, and Tool Proficiency Keys
export const DND5E_ARMOR_MAP = {
  'light armor': 'lgt',
  'medium armor': 'med',
  'heavy armor': 'hvy',
  shields: 'shl',
};

export const DND5E_WEAPON_MAP = {
  'simple weapons': ['sim'],
  'martial weapons': ['mar'],
  'finesse & scout weapons': ['rapier', 'shortsword', 'handcrossbow', 'shortbow'],
};

export const DND5E_TOOL_MAP = {
  "thieves' tools": 'thief',
  'disguise kit': 'disg',
  'forgery kit': 'forg',
  'herbalism kit': 'herb',
  "cartographer's tools": 'cartographer',
  "alchemist's supplies": 'alchemist',
  "calligrapher's supplies": 'calligrapher',
};

export const CATEGORY_ICONS = {
  root: 'icons/magic/symbols/star-rising-purple.webp',
  class_feature: 'icons/skills/melee/strike-sword-steel-yellow.webp',
  subclass_feature: 'icons/magic/symbols/runes-star-pentagon-orange.webp',
  feat: 'icons/sundries/flags/banner-gold.webp',
  spellcasting: 'icons/magic/arcane/orb-energy-spiral-blue.webp',
  hit_die: 'icons/magic/life/heart-cross-strong-red.webp',
  save: 'icons/equipment/shield/heater-steel-worn.webp',
  skill: 'icons/sundries/books/book-open-brown.webp',
  proficiency: 'icons/tools/smithing/hammer-sledge-steel-grey.webp',
};
