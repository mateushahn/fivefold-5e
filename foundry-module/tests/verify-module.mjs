import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOD_DIR = path.resolve(__dirname, '..', 'fivefold-5e');

// 1. Validate module.json & declared assets for Foundry VTT 14.370
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'module.json'), 'utf8'));
assert.equal(manifest.id, 'fivefold-5e');
assert.equal(manifest.compatibility.minimum, '14');
assert.equal(manifest.compatibility.verified, '14.370');
assert.equal(manifest.relationships.systems[0].id, 'dnd5e');
assert.equal(manifest.relationships.systems[0].compatibility.verified, '6.1.1');

for (const f of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((l) => l.path)]) {
  assert.ok(fs.existsSync(path.join(MOD_DIR, f)), `Missing declared file: ${f}`);
}
assert.ok(fs.existsSync(path.join(MOD_DIR, 'templates/skill-web.hbs')), 'Missing Handlebars template');
assert.ok(fs.existsSync(path.join(MOD_DIR, 'data/default-skill-tree.json')), 'Missing default skill tree');

// 2. Verify zero removed/deprecated v12/v13 APIs remain in module scripts
for (const file of fs.readdirSync(path.join(MOD_DIR, 'scripts'))) {
  const src = fs.readFileSync(path.join(MOD_DIR, 'scripts', file), 'utf8');
  assert.ok(!src.includes('ACTIVE_EFFECT_MODES'), `${file} must not use removed CONST.ACTIVE_EFFECT_MODES`);
  assert.ok(!src.includes('getActorSheetHeaderButtons'), `${file} must not use legacy AppV1 getActorSheetHeaderButtons`);
}

// 3. Verify 100% key parity between en.json and pt-BR.json
function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flattenKeys(v, full));
    else keys.push(full);
  }
  return keys.sort();
}

const enLang = JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'lang/en.json'), 'utf8'));
const ptLang = JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'lang/pt-BR.json'), 'utf8'));
assert.deepEqual(flattenKeys(enLang), flattenKeys(ptLang), 'en.json and pt-BR.json key mismatch!');

// 4. Mock Foundry VTT v14.370 globals and test actor-sync.mjs end-to-end
globalThis.CONST = {
  ACTIVE_EFFECT_CHANGE_TYPES: { ADD: 'add', SUBTRACT: 'subtract', OVERRIDE: 'override' },
  ACTIVE_EFFECT_CHANGE_PHASES: { INITIAL: 'initial', FINAL: 'final' },
};

let fromUuidCalledViaFoundryUtils = false;
globalThis.foundry = {
  utils: {
    getProperty(obj, keyPath) {
      return keyPath.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
    },
    setProperty(obj, keyPath, value) {
      const parts = keyPath.split('.');
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
    },
    async fromUuid(uuid) {
      fromUuidCalledViaFoundryUtils = true;
      if (uuid === 'Compendium.dnd5e.classfeatures.Item.smiteTest') {
        return {
          name: 'Official Divine Smite (SRD)',
          toObject: () => ({
            _id: 'orig123',
            name: 'Official Divine Smite (SRD)',
            type: 'feat',
            system: { description: { value: '<p>Official SRD Smite</p>' } },
          }),
        };
      }
      return null;
    },
  },
};

// Mock Foundry v14 ForcedReplacement operator & global _replace helper
class MockForcedReplacement {
  constructor(value) {
    this.value = value;
  }
}
globalThis.foundry.data = { operators: { ForcedReplacement: MockForcedReplacement } };
globalThis._replace = (value) => new MockForcedReplacement(value);

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Set) && !(v instanceof MockForcedReplacement);
}

function foundryMergeValue(current, incoming) {
  if (incoming instanceof MockForcedReplacement) {
    return structuredClone(incoming.value);
  }
  if (isPlainObject(current) && isPlainObject(incoming)) {
    const merged = { ...current };
    for (const [k, v] of Object.entries(incoming)) {
      merged[k] = foundryMergeValue(current[k], v);
    }
    return merged;
  }
  return incoming;
}

const actorUpdateListeners = new Set();

function createMockActor() {
  return {
    id: 'actor_paladin_1',
    name: 'Sir Aldric',
    type: 'character',
    system: {
      details: { level: 5 },
      abilities: {
        str: { mod: 3, proficient: 1 },
        dex: { mod: 1, proficient: 0 },
        con: { mod: 2, proficient: 0 },
        int: { mod: 0, proficient: 0 },
        wis: { mod: 1, proficient: 0 },
        cha: { mod: 3, proficient: 0 },
      },
      skills: {
        ath: { value: 1 },
        prc: { value: 2 },
        rel: { value: 0 },
        med: { value: 0 },
      },
      traits: {
        armorProf: { value: new Set(['lgt']) },
        weaponProf: { value: new Set() },
      },
      tools: {
        thief: { value: 0 },
      },
    },
    flags: {},
    items: [],
    effects: [],
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async setFlag(scope, key, value) {
      this.flags[scope] = this.flags[scope] || {};
      this.flags[scope][key] = foundryMergeValue(this.flags[scope][key], value);
    },
    async update(data) {
      for (const [k, v] of Object.entries(data)) {
        const parts = k.split('.');
        let cur = this;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        const leaf = parts[parts.length - 1];
        cur[leaf] = foundryMergeValue(cur[leaf], v);
      }
      for (const listener of actorUpdateListeners) listener(this);
    },
    async createEmbeddedDocuments(type, docs) {
      const target = type === 'Item' ? this.items : this.effects;
      for (const d of docs) {
        const entry = {
          ...structuredClone(d),
          id: `${type.toLowerCase()}_${target.length + 1}`,
          getFlag(scope, key) {
            return this.flags?.[scope]?.[key];
          },
          async update(patch) {
            Object.assign(this, patch);
          },
        };
        target.push(entry);
      }
    },
    async deleteEmbeddedDocuments(type, ids) {
      const idSet = new Set(ids);
      if (type === 'Item') this.items = this.items.filter((i) => !idSet.has(i.id));
      else this.effects = this.effects.filter((e) => !idSet.has(e.id));
    },
  };
}

const treeData = JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'data/default-skill-tree.json'), 'utf8'));
const smiteNode = treeData.nodes.find((n) => n.id === 'hybrid_divine_smite');
smiteNode.compendiumUuid = 'Compendium.dnd5e.classfeatures.Item.smiteTest';

const { syncActorFromSkillWeb } = await import(path.join(MOD_DIR, 'scripts/actor-sync.mjs'));

const actor = createMockActor();
const paladinPreset = treeData.presets.find((p) => p.id === 'preset_paladin');

// Sync Paladin preset + Exploring scout weapons onto Actor
const testNodes = [...paladinPreset.unlocked, 'exploring_prof_light_finesse'];
const res1 = await syncActorFromSkillWeb(actor, treeData, testNodes, { applyHitDieHp: true });
assert.equal(res1.updated, true);
assert.equal(res1.hitDie, 8);
assert.equal(fromUuidCalledViaFoundryUtils, true, 'Must resolve UUIDs via foundry.utils.fromUuid');
assert.equal(actor.system.skills.rel.value, 1);
assert.equal(actor.system.skills.med.value, 1);
assert.equal(actor.system.skills.prc.value, 2, 'Pre-existing Expertise preserved');
assert.equal(actor.system.skills.ath.value, 1, 'Pre-existing Athletics preserved');
assert.ok(actor.system.traits.armorProf.value.includes('med'));
assert.ok(actor.system.traits.armorProf.value.includes('shl'));
assert.ok(actor.system.traits.weaponProf.value.includes('mar'));
assert.ok(actor.system.traits.weaponProf.value.includes('rapier'), 'Finesse & Scout Weapons maps to rapier');
assert.ok(actor.system.traits.weaponProf.value.includes('shortbow'), 'Finesse & Scout Weapons maps to shortbow');
assert.ok(actor.items.some((i) => i.name === 'Official Divine Smite (SRD)'));

// Verify Foundry v14.370 EffectChangeData contract
assert.equal(actor.effects.length, 1);
const eff = actor.effects[0];
assert.ok(eff.img && !eff.icon, 'ActiveEffect must use img (not legacy icon)');
assert.equal(eff.changes[0].key, 'system.attributes.hp.bonuses.level');
assert.equal(eff.changes[0].type, 'add');
assert.equal(eff.changes[0].phase, 'initial');
assert.equal(eff.changes[0].mode, undefined, 'Legacy numeric mode must not be present');
assert.equal(eff.changes[0].value, '1', 'd8 over d6 = +1 HP per level');

// Refund test: ensure non-destructive rollback
const reduced = paladinPreset.unlocked.filter(
  (id) => !['devotion_skill_medicine', 'hybrid_divine_smite', 'combat_prof_armor_med', 'combat_hd_d8'].includes(id)
);
const res2 = await syncActorFromSkillWeb(actor, treeData, reduced, { applyHitDieHp: true });
assert.equal(res2.hitDie, 6);
assert.equal(actor.system.skills.med.value, 0);
assert.equal(actor.system.skills.rel.value, 1);
assert.ok(actor.system.traits.armorProf.value.includes('lgt'), 'Pre-existing Light Armor preserved');
assert.ok(!actor.system.traits.armorProf.value.includes('med'), 'Refunded Medium Armor removed');
assert.ok(!actor.system.traits.weaponProf.value.includes('rapier'), 'Refunded Scout weapon removed');
assert.ok(!actor.items.some((i) => i.name === 'Official Divine Smite (SRD)'));
assert.equal(actor.effects.length, 0);

// 5. Instantiate FivefoldSkillWebApp against a strict Foundry v14 ApplicationV2 mock
//    (enforcing read-only getters like `state`, `id`, `rendered`, `element` & structuredClone of super(options))
class MockApplicationV2 {
  #state = 0;
  #id;
  constructor(options = {}) {
    // Foundry's ApplicationV2 deep-clones options; passing an Actor with methods/cycles would throw here!
    const cloned = structuredClone(options);
    this.#id = cloned.id ?? this.constructor.DEFAULT_OPTIONS?.id ?? 'app';
    this.options = cloned;
  }
  get state() { return this.#state; }
  get id() { return this.#id; }
  get rendered() { return this.#state === 2; }
  get element() { return null; }
  get window() { return {}; }
}
globalThis.foundry.applications = {
  api: {
    ApplicationV2: MockApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
  },
};
globalThis.game = {
  user: { isGM: true },
  i18n: { localize: (k) => k, format: (k) => k },
  settings: {
    get(_mod, key) {
      if (key === 'treeData') return treeData;
      if (key === 'startingPoints') return 6;
      if (key === 'pointsPerLevel') return 3;
      return true;
    },
  },
};

const { FivefoldSkillWebApp } = await import(path.join(MOD_DIR, 'scripts/skill-web-app.mjs'));
const appInstance = new FivefoldSkillWebApp({ actor, initialMode: 'build' });
assert.equal(appInstance.state, 0, 'ApplicationV2 read-only state getter remains intact');
assert.equal(appInstance.id, `fivefold-5e-actor-${actor.id}`);
assert.equal(appInstance.webState.mode, 'build');
assert.equal(appInstance.actor, actor);

// 6. Test Repeatable Choice Nodes (Fighting Style picked TWICE + Expertise picked TWICE)
const choiceActor = createMockActor();
choiceActor.system.skills.ste = { value: 1 };
choiceActor.isOwner = true;

// Mock DialogV2.wait returning chosen options sequentially, plus UI notifications
const queuedDialogChoices = ['defense', 'archery', 'exp_ath', 'exp_ste'];
const promptedHtmls = [];
globalThis.foundry.applications.api.DialogV2 = {
  async wait(cfg) {
    promptedHtmls.push(cfg.content);
    return queuedDialogChoices.shift() ?? null;
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const appChoices = new FivefoldSkillWebApp({ actor: choiceActor, initialMode: 'build' });
appChoices._renderAll = () => {}; // headless unit test without DOM

// Unlock prerequisites for Fighting Style and Expertise
appChoices.webState.unlocked.add('combat_root');
appChoices.webState.unlocked.add('combat_prof_weapons_martial');
appChoices.webState.unlocked.add('exploring_root');
appChoices.webState.unlocked.add('exploring_skill_investigation');
appChoices.webState.unlocked.add('exploring_skill_perception');

const spBefore = appChoices._getSpentSP();
// Buy Fighting Style #1 (Defense) -> opens DialogV2 prompt
await appChoices._toggleBuildNode('combat_fighting_style');
assert.deepEqual(appChoices.webState.choices.combat_fighting_style, ['defense']);
assert.equal(appChoices._getSpentSP(), spBefore + 1);
assert.ok(choiceActor.items.some((i) => i.name === 'Fighting Style: Defense'));

// Click Fighting Style AGAIN -> opens DialogV2 prompt with Defense marked already chosen, picks Archery!
await appChoices._toggleBuildNode('combat_fighting_style');
assert.deepEqual(appChoices.webState.choices.combat_fighting_style, ['defense', 'archery']);
assert.equal(appChoices._getSpentSP(), spBefore + 2, 'Buying Fighting Style twice must cost 2x SP');
assert.ok(promptedHtmls[1].includes('value="defense"  disabled'), 'Already chosen option must be disabled in prompt');

const defenseItem = choiceActor.items.find((i) => i.name === 'Fighting Style: Defense');
const archeryItem = choiceActor.items.find((i) => i.name === 'Fighting Style: Archery');
assert.ok(defenseItem, 'Defense item created');
assert.ok(archeryItem, 'Archery item created');

// Verify Passive Active Effects embedded on generated Items (Foundry v14.370 + dnd5e 6.1.x)!
assert.equal(archeryItem.effects.length, 1, 'Archery must embed 1 passive ActiveEffect');
assert.equal(archeryItem.effects[0].transfer, true, 'Archery passive effect must transfer to Actor');
assert.equal(archeryItem.effects[0].changes[0].key, 'system.rolls.attack.rwak.bonus');
assert.equal(archeryItem.effects[0].changes[0].type, 'add');
assert.equal(archeryItem.effects[0].changes[0].phase, 'initial');
assert.equal(archeryItem.effects[0].changes[0].value, '2');

assert.equal(defenseItem.effects.length, 1, 'Defense must embed 1 passive ActiveEffect');
assert.equal(defenseItem.effects[0].transfer, true);
assert.equal(defenseItem.effects[0].changes[0].key, 'system.attributes.ac.bonus');
assert.equal(defenseItem.effects[0].changes[0].value, '1');

// Verify Combat Root (+1 Initiative) passive effect is also embedded
const combatRootItem = choiceActor.items.find((i) => i.name === 'Combat');
assert.equal(combatRootItem?.effects?.[0]?.changes?.[0]?.key, 'system.attributes.init.roll.bonus');
assert.equal(combatRootItem?.effects?.[0]?.changes?.[0]?.value, '1');

// Verify existing Item auto-upgrade (simulating a v1.2 item without passive effect getting upgraded on sync!)
let upgradedEffectAdded = false;
defenseItem.effects = [];
defenseItem.createEmbeddedDocuments = async (_type, docs) => {
  defenseItem.effects.push(...docs);
  upgradedEffectAdded = true;
};
await syncActorFromSkillWeb(choiceActor, treeData, Array.from(appChoices.webState.unlocked), {
  choices: appChoices.webState.choices,
});
assert.equal(upgradedEffectAdded, true, 'Existing managed Item without passive effect must be auto-upgraded on sync');
assert.equal(defenseItem.effects[0].changes[0].key, 'system.attributes.ac.bonus');

// Buy Expertise twice: Athletics (was 1 -> becomes 2) and Stealth (was 1 -> becomes 2)
await appChoices._toggleBuildNode('exploring_expertise');
await appChoices._toggleBuildNode('exploring_expertise');
assert.deepEqual(appChoices.webState.choices.exploring_expertise, ['exp_ath', 'exp_ste']);
assert.equal(choiceActor.system.skills.ath.value, 2, 'Expertise should upgrade Athletics to 2');
assert.equal(choiceActor.system.skills.ste.value, 2, 'Expertise should upgrade Stealth to 2');

// Refund ONLY Archery from Fighting Style and ONLY Athletics from Expertise
await appChoices._refundNodeChoice('combat_fighting_style', 'archery');
assert.deepEqual(appChoices.webState.choices.combat_fighting_style, ['defense']);
assert.ok(choiceActor.items.some((i) => i.name === 'Fighting Style: Defense'), 'Defense remains on Actor');
assert.ok(!choiceActor.items.some((i) => i.name === 'Fighting Style: Archery'), 'Refunded Archery removed');

await appChoices._refundNodeChoice('exploring_expertise', 'exp_ath');
assert.deepEqual(appChoices.webState.choices.exploring_expertise, ['exp_ste']);
assert.equal(choiceActor.system.skills.ath.value, 1, 'Athletics reverts to exact prior proficiency (1)');
assert.equal(choiceActor.system.skills.ste.value, 2, 'Stealth Expertise remains active (2)');

// 7. Regression test: refunding last choice / resetting build MUST release all previously selected options
//    even when Foundry's updateActor hook triggers reloadFromActor() right after actor.update()!
actorUpdateListeners.add((updatedActor) => appChoices.reloadFromActor(updatedActor));

// Refund the remaining Defense choice (locks combat_fighting_style completely)
await appChoices._refundNodeChoice('combat_fighting_style', 'defense');
assert.equal(appChoices.webState.unlocked.has('combat_fighting_style'), false, 'Fighting Style locked after final choice refund');
assert.equal(choiceActor.flags['fivefold-5e'].choices.combat_fighting_style, undefined, 'Refunded node key must be deleted from actor flags (not merged)');
assert.deepEqual(appChoices._getSelectedChoiceIds('combat_fighting_style'), [], 'No stale choices after refund');

// Re-buy Fighting Style -> Defense MUST be enabled (not disabled!) and selectable again
queuedDialogChoices.push('defense');
await appChoices._toggleBuildNode('combat_fighting_style');
const rebuyPromptHtml = promptedHtmls[promptedHtmls.length - 1];
assert.ok(!rebuyPromptHtml.includes('value="defense"  disabled'), 'Defense must NOT be disabled after refund');
assert.ok(!rebuyPromptHtml.includes('value="archery"  disabled'), 'Archery must NOT be disabled after refund');
assert.deepEqual(appChoices.webState.choices.combat_fighting_style, ['defense'], 'Defense can be re-selected after refund');

// Full Reset Build -> clears all unlocked + choices on Actor (even with updateActor -> reloadFromActor)
appChoices.webState.unlocked.clear();
appChoices.webState.choices = {};
await appChoices._persistBuildAndMaybeSync();
assert.deepEqual(choiceActor.flags['fivefold-5e'].unlocked, []);
assert.deepEqual(choiceActor.flags['fivefold-5e'].choices, {}, 'Reset build must completely replace choices flag with {}');

// Legacy self-healing: an Actor from v1.3.0 with stale choices on locked nodes must read cleanly as {}
const { getActorNodeChoices } = await import(path.join(MOD_DIR, 'scripts/actor-sync.mjs'));
choiceActor.flags['fivefold-5e'].unlocked = [];
choiceActor.flags['fivefold-5e'].choices = { combat_fighting_style: ['archery'] };
assert.deepEqual(getActorNodeChoices(choiceActor), {}, 'Stale choices on locked nodes must be filtered out on read');
actorUpdateListeners.clear();

console.log('ALL FOUNDRY V14.370 MODULE CHECKS PASSED!', {
  version: manifest.version,
  verifiedCore: manifest.compatibility.verified,
  verifiedSystem: manifest.relationships.systems[0].compatibility.verified,
  langKeys: flattenKeys(enLang).length,
  nodes: treeData.nodes.length,
  edges: treeData.edges.length,
  choiceNodesCount: treeData.nodes.filter((n) => n.choices?.length > 0).length,
  passiveEffectNodes: treeData.nodes.filter((n) => n.effects?.length > 0).length,
  passiveEffectChoices: treeData.nodes.flatMap((n) => n.choices || []).filter((c) => c.effects?.length > 0).length,
  v14ActiveEffectSchema: 'PASS',
  foundryUtilsFromUuid: 'PASS',
  nonDestructiveRefund: 'PASS',
  appV2Instantiation: 'PASS',
  repeatableChoicePromptAndSync: 'PASS',
  embeddedPassiveEffects: 'PASS',
  choiceRefundAndResetRelease: 'PASS',
});
