import {
  CATEGORY_ICONS,
  DND5E_ARMOR_MAP,
  DND5E_SAVE_MAP,
  DND5E_SKILL_MAP,
  DND5E_TOOL_MAP,
  DND5E_WEAPON_MAP,
  FLAG_SCOPE,
  MODULE_ID,
} from './constants.mjs';

function toArray(val) {
  if (!val) return [];
  if (val instanceof Set) return Array.from(val);
  if (Array.isArray(val)) return val.slice();
  return [];
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getActorLevel(actor) {
  if (!actor) return 5;
  const lv = Number(actor.system?.details?.level);
  return Number.isFinite(lv) && lv >= 1 ? Math.min(20, Math.floor(lv)) : 1;
}

export function getActorConMod(actor) {
  if (!actor) return 2;
  const mod = Number(actor.system?.abilities?.con?.mod);
  return Number.isFinite(mod) ? mod : 0;
}

export function getActorUnlockedIds(actor) {
  if (!actor) return [];
  const saved = actor.getFlag(FLAG_SCOPE, 'unlocked');
  return Array.isArray(saved) ? saved.slice() : [];
}

function forceReplaceObject(obj) {
  if (typeof globalThis._replace === 'function') {
    return globalThis._replace(obj);
  }
  const ForcedReplacement = globalThis.foundry?.data?.operators?.ForcedReplacement;
  if (typeof ForcedReplacement === 'function') {
    return new ForcedReplacement(obj);
  }
  return obj;
}

export function getActorNodeChoices(actor) {
  if (!actor) return {};
  const saved = actor.getFlag(FLAG_SCOPE, 'choices');
  if (!saved || typeof saved !== 'object') return {};
  const unlockedSet = new Set(getActorUnlockedIds(actor));
  const clean = {};
  for (const [nodeId, list] of Object.entries(saved)) {
    if (unlockedSet.has(nodeId) && Array.isArray(list) && list.length > 0) {
      clean[nodeId] = Array.from(new Set(list.map(String)));
    }
  }
  return clean;
}

export async function saveActorUnlockedIds(actor, unlockedIds, choicesMap = null) {
  if (!actor) return;
  const unlockedSet = new Set(unlockedIds);
  const patch = {
    [`flags.${FLAG_SCOPE}.unlocked`]: Array.from(unlockedSet),
  };
  if (choicesMap !== null) {
    const cleanChoices = {};
    for (const [nid, list] of Object.entries(choicesMap || {})) {
      if (unlockedSet.has(nid) && Array.isArray(list) && list.length > 0) {
        cleanChoices[nid] = Array.from(new Set(list.map(String)));
      }
    }
    patch[`flags.${FLAG_SCOPE}.choices`] = forceReplaceObject(cleanChoices);
  }
  await actor.update(patch);
}

/**
 * Normalizes an array of passive effect definitions into Foundry v14.370 EffectChangeData entries.
 */
export function buildPassiveEffectData(itemName, itemImg, entryKey, rawEffects = []) {
  const valid = (Array.isArray(rawEffects) ? rawEffects : []).filter(
    (fx) => fx && typeof fx.key === 'string' && fx.key.trim() && fx.value !== undefined && fx.value !== ''
  );
  if (!valid.length) return null;

  const changes = valid.map((fx, idx) => ({
    key: fx.key.trim(),
    type: String(fx.type || globalThis.CONST?.ACTIVE_EFFECT_CHANGE_TYPES?.ADD || 'add').toLowerCase(),
    phase: String(fx.phase || globalThis.CONST?.ACTIVE_EFFECT_CHANGE_PHASES?.INITIAL || 'initial').toLowerCase(),
    value: String(fx.value),
    priority: Number.isFinite(Number(fx.priority)) ? Number(fx.priority) : 20 + idx,
  }));

  const fingerprint = JSON.stringify(changes);
  return {
    name: `${itemName} (Passive)`,
    img: itemImg || CATEGORY_ICONS.class_feature,
    transfer: true,
    disabled: false,
    changes,
    flags: {
      [FLAG_SCOPE]: {
        managedEffect: true,
        entryKey,
        fingerprint,
      },
    },
  };
}

/**
 * Computes desired dnd5e grants from unlocked Skill Web nodes + per-node selected choices.
 */
export function collectDesiredGrants(treeData, unlockedIds, choicesMap = {}) {
  const nodeMap = new Map(treeData.nodes.map((n) => [n.id, n]));
  const skills = new Set();
  const saves = new Set();
  const armor = new Set();
  const weapons = new Set();
  const tools = new Set();
  const skillExpertise = new Set();
  const toolExpertise = new Set();
  const featureEntries = []; // { key, node, choice, effects }
  let hitDie = treeData.meta?.baseHitDie || 6;
  let spellTier = 0;

  for (const id of unlockedIds) {
    const node = nodeMap.get(id);
    if (!node) continue;

    if (node.grants?.hitDie && node.grants.hitDie > hitDie) {
      hitDie = node.grants.hitDie;
    }
    if (node.grants?.spellTier && node.grants.spellTier > spellTier) {
      spellTier = node.grants.spellTier;
    }

    for (const sk of node.grants?.skills || []) {
      const key = DND5E_SKILL_MAP[String(sk).trim().toLowerCase()];
      if (key) skills.add(key);
    }

    for (const sv of node.grants?.saves || []) {
      const key = DND5E_SAVE_MAP[String(sv).trim().toUpperCase()];
      if (key) saves.add(key);
    }

    for (const pr of node.grants?.proficiencies || []) {
      const norm = String(pr).trim().toLowerCase();
      if (DND5E_ARMOR_MAP[norm]) armor.add(DND5E_ARMOR_MAP[norm]);
      else if (DND5E_WEAPON_MAP[norm]) {
        const mapped = Array.isArray(DND5E_WEAPON_MAP[norm])
          ? DND5E_WEAPON_MAP[norm]
          : [DND5E_WEAPON_MAP[norm]];
        for (const w of mapped) weapons.add(w);
      } else if (DND5E_TOOL_MAP[norm]) tools.add(DND5E_TOOL_MAP[norm]);
    }

    const nodeEffects = Array.isArray(node.effects) ? node.effects : [];
    const isFeatureCategory =
      node.category === 'root' ||
      node.category === 'class_feature' ||
      node.category === 'subclass_feature' ||
      node.category === 'feat' ||
      node.category === 'spellcasting' ||
      nodeEffects.length > 0;

    const selectedIds = Array.isArray(choicesMap?.[id]) ? choicesMap[id] : [];
    const nodeChoices = Array.isArray(node.choices) ? node.choices : [];

    if (nodeChoices.length > 0 && selectedIds.length > 0) {
      const choiceById = new Map(nodeChoices.map((c) => [c.id, c]));
      for (const cid of selectedIds) {
        const choice = choiceById.get(cid);
        if (!choice) continue;
        if (choice.grantExpertise && choice.skillKey) skillExpertise.add(choice.skillKey);
        if (choice.grantExpertise && choice.toolKey) toolExpertise.add(choice.toolKey);
        const combinedEffects = [...nodeEffects, ...(Array.isArray(choice.effects) ? choice.effects : [])];
        if (isFeatureCategory || combinedEffects.length > 0) {
          featureEntries.push({
            key: `${node.id}::${choice.id}`,
            node,
            choice,
            effects: combinedEffects,
          });
        }
      }
    } else if (isFeatureCategory) {
      featureEntries.push({
        key: node.id,
        node,
        choice: null,
        effects: nodeEffects,
      });
    }
  }

  return {
    skills,
    saves,
    armor,
    weapons,
    tools,
    skillExpertise,
    toolExpertise,
    featureEntries,
    hitDie,
    spellTier,
  };
}

async function resolveUuid(uuid) {
  const fn = foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  return typeof fn === 'function' ? fn(uuid) : null;
}

async function buildManagedItemData(entry, roles) {
  const { node, choice, key: entryKey, effects: rawEffects } = entry;
  const uuid = choice?.compendiumUuid || node.compendiumUuid || '';
  const itemImg = CATEGORY_ICONS[node.category] || CATEGORY_ICONS.class_feature;
  const itemName = choice ? `${node.name}: ${choice.name}` : node.name;
  const passiveEffect = buildPassiveEffectData(itemName, itemImg, entryKey, rawEffects);

  // If GM linked a Compendium Item UUID (on the choice or node), clone it directly via Foundry v14 foundry.utils.fromUuid
  if (uuid) {
    try {
      const doc = await resolveUuid(uuid);
      if (doc && typeof doc.toObject === 'function') {
        const obj = doc.toObject();
        delete obj._id;
        obj.flags = obj.flags || {};
        obj.flags[FLAG_SCOPE] = {
          managed: true,
          entryKey,
          nodeId: node.id,
          choiceId: choice?.id || null,
          role: node.role,
          tier: node.tier,
          fromCompendium: true,
        };
        // Only append module passive effect if the Compendium item does not already bring its own effects
        if (passiveEffect && (!Array.isArray(obj.effects) || obj.effects.length === 0)) {
          obj.effects = [passiveEffect];
        }
        return obj;
      }
    } catch (err) {
      console.warn(`[${MODULE_ID}] Could not resolve Compendium UUID "${uuid}":`, err);
    }
  }

  const roleName = roles?.[node.role]?.name || node.role;
  const featSubtype = node.category === 'feat' ? 'feat' : 'class';
  const descParts = [
    `<p><strong>${escapeHtml(roleName)} · Tier ${node.tier}</strong> — <em>${escapeHtml(node.source5e || 'Fivefold 5e')}</em></p>`,
  ];
  if (choice) {
    descParts.push(`<p><strong>${escapeHtml(choice.name)}:</strong> ${escapeHtml(choice.description || '')}</p>`);
  }
  if (node.summary) descParts.push(`<p>${escapeHtml(node.summary)}</p>`);
  if (node.mechanics) descParts.push(`<p>${escapeHtml(node.mechanics)}</p>`);

  return {
    name: itemName,
    type: 'feat',
    img: itemImg,
    system: {
      description: { value: descParts.join('\n') },
      requirements: `${roleName} (Tier ${node.tier})`,
      type: { value: featSubtype },
    },
    effects: passiveEffect ? [passiveEffect] : [],
    flags: {
      [FLAG_SCOPE]: {
        managed: true,
        entryKey,
        nodeId: node.id,
        choiceId: choice?.id || null,
        role: node.role,
        tier: node.tier,
      },
    },
  };
}

/**
 * Ensures an already-embedded managed Item has its passive ActiveEffect up to date (e.g. after upgrading from v1.2 or GM editing effects).
 */
async function syncPassiveEffectOnExistingItem(existingItem, entry) {
  if (!existingItem || existingItem.getFlag(FLAG_SCOPE, 'fromCompendium') === true) return;
  const itemImg = existingItem.img || CATEGORY_ICONS[entry.node.category] || CATEGORY_ICONS.class_feature;
  const itemName = entry.choice ? `${entry.node.name}: ${entry.choice.name}` : entry.node.name;
  const desiredEffect = buildPassiveEffectData(itemName, itemImg, entry.key, entry.effects);
  const itemEffects = existingItem.effects ? Array.from(existingItem.effects) : [];
  const managedEff = itemEffects.find((ef) => ef.getFlag?.(FLAG_SCOPE, 'managedEffect') === true);

  if (desiredEffect) {
    if (!managedEff) {
      if (typeof existingItem.createEmbeddedDocuments === 'function') {
        await existingItem.createEmbeddedDocuments('ActiveEffect', [desiredEffect]);
      }
    } else {
      const curFp = managedEff.getFlag(FLAG_SCOPE, 'fingerprint');
      const nextFp = desiredEffect.flags[FLAG_SCOPE].fingerprint;
      if (curFp !== nextFp && typeof managedEff.update === 'function') {
        await managedEff.update(desiredEffect);
      }
    }
  } else if (managedEff && typeof existingItem.deleteEmbeddedDocuments === 'function') {
    await existingItem.deleteEmbeddedDocuments('ActiveEffect', [managedEff.id]);
  }
}

/**
 * Non-destructively synchronizes unlocked Fivefold 5e Skill Web nodes & choices onto a dnd5e Actor.
 * Tracks module-applied grants in actor flags so refunds never strip racial/background proficiencies.
 */
export async function syncActorFromSkillWeb(actor, treeData, unlockedIds, options = {}) {
  if (!actor) return { updated: false };

  const choicesMap =
    options.choices !== undefined ? options.choices : getActorNodeChoices(actor);

  const applyHitDieHp =
    options.applyHitDieHp ??
    (typeof game !== 'undefined' && game.settings
      ? Boolean(game.settings.get(MODULE_ID, 'applyHitDieHp'))
      : true);

  const prevApplied = actor.getFlag(FLAG_SCOPE, 'appliedGrants') || {
    skills: [],
    saves: [],
    armor: [],
    weapons: [],
    tools: [],
    skillExpertise: {},
    toolExpertise: {},
  };

  const desired = collectDesiredGrants(treeData, unlockedIds, choicesMap);
  const updateData = {};

  // 1. Skills (proficiency = 1) + Choice-driven Skill Expertise (value = 2)
  const prevSkillExp = prevApplied.skillExpertise || {};
  const nextSkillExp = {};
  const nextAppliedSkills = [];

  for (const [skKey, prevVal] of Object.entries(prevSkillExp)) {
    if (!desired.skillExpertise.has(skKey)) {
      const currentVal = Number(actor.system?.skills?.[skKey]?.value || 0);
      if (currentVal === 2) {
        const fallback = desired.skills.has(skKey) ? Math.max(1, Number(prevVal) || 0) : Number(prevVal) || 0;
        updateData[`system.skills.${skKey}.value`] = fallback;
      }
    }
  }

  for (const skKey of prevApplied.skills || []) {
    if (!desired.skills.has(skKey) && !desired.skillExpertise.has(skKey)) {
      const currentVal = Number(actor.system?.skills?.[skKey]?.value || 0);
      if (currentVal === 1) {
        updateData[`system.skills.${skKey}.value`] = 0;
      }
    }
  }

  for (const skKey of desired.skills) {
    const currentVal = Number(actor.system?.skills?.[skKey]?.value || 0);
    const wasMine = (prevApplied.skills || []).includes(skKey);
    if (currentVal < 1) {
      updateData[`system.skills.${skKey}.value`] = 1;
      nextAppliedSkills.push(skKey);
    } else if (wasMine) {
      nextAppliedSkills.push(skKey);
    }
  }

  for (const skKey of desired.skillExpertise) {
    const currentVal = Number(actor.system?.skills?.[skKey]?.value || 0);
    const hadPrevRecord = Object.prototype.hasOwnProperty.call(prevSkillExp, skKey);
    if (hadPrevRecord) {
      nextSkillExp[skKey] = prevSkillExp[skKey];
      if (currentVal < 2) updateData[`system.skills.${skKey}.value`] = 2;
    } else if (currentVal < 2) {
      nextSkillExp[skKey] = currentVal;
      updateData[`system.skills.${skKey}.value`] = 2;
    }
  }

  // 2. Saving Throws
  const nextAppliedSaves = [];
  for (const svKey of prevApplied.saves || []) {
    if (!desired.saves.has(svKey)) {
      const currentProf = Number(actor.system?.abilities?.[svKey]?.proficient || 0);
      if (currentProf === 1) {
        updateData[`system.abilities.${svKey}.proficient`] = 0;
      }
    }
  }
  for (const svKey of desired.saves) {
    const currentProf = Number(actor.system?.abilities?.[svKey]?.proficient || 0);
    const wasMine = (prevApplied.saves || []).includes(svKey);
    if (currentProf < 1) {
      updateData[`system.abilities.${svKey}.proficient`] = 1;
      nextAppliedSaves.push(svKey);
    } else if (wasMine) {
      nextAppliedSaves.push(svKey);
    }
  }

  // 3. Armor & Weapon Proficiencies (dnd5e traits Sets/Arrays)
  function diffTraitSet(traitPath, prevList, desiredSet) {
    const existing = new Set(toArray(foundry.utils.getProperty(actor, traitPath)));
    const nextApplied = [];
    for (const key of prevList || []) {
      if (!desiredSet.has(key)) existing.delete(key);
    }
    for (const key of desiredSet) {
      const hadBefore = existing.has(key);
      const wasMine = (prevList || []).includes(key);
      if (!hadBefore) {
        existing.add(key);
        nextApplied.push(key);
      } else if (wasMine) {
        nextApplied.push(key);
      }
    }
    updateData[traitPath] = Array.from(existing);
    return nextApplied;
  }

  const nextAppliedArmor = diffTraitSet('system.traits.armorProf.value', prevApplied.armor, desired.armor);
  const nextAppliedWeapons = diffTraitSet('system.traits.weaponProf.value', prevApplied.weapons, desired.weapons);

  // 4. Tool Proficiencies + Tool Expertise (dnd5e v5+/v6+ system.tools.<key>.value)
  const nextAppliedTools = [];
  const prevToolExp = prevApplied.toolExpertise || {};
  const nextToolExp = {};
  const hasSystemTools = actor.system && typeof actor.system.tools === 'object';

  if (hasSystemTools) {
    for (const [tKey, prevVal] of Object.entries(prevToolExp)) {
      if (!desired.toolExpertise.has(tKey)) {
        const cur = Number(actor.system.tools?.[tKey]?.value || 0);
        if (cur === 2) {
          updateData[`system.tools.${tKey}.value`] = desired.tools.has(tKey)
            ? Math.max(1, Number(prevVal) || 0)
            : Number(prevVal) || 0;
        }
      }
    }

    for (const tKey of prevApplied.tools || []) {
      if (!desired.tools.has(tKey) && !desired.toolExpertise.has(tKey)) {
        const cur = Number(actor.system.tools?.[tKey]?.value || 0);
        if (cur === 1) updateData[`system.tools.${tKey}.value`] = 0;
      }
    }
    for (const tKey of desired.tools) {
      const cur = Number(actor.system.tools?.[tKey]?.value || 0);
      const wasMine = (prevApplied.tools || []).includes(tKey);
      if (cur < 1) {
        updateData[`system.tools.${tKey}.value`] = 1;
        nextAppliedTools.push(tKey);
      } else if (wasMine) {
        nextAppliedTools.push(tKey);
      }
    }
    for (const tKey of desired.toolExpertise) {
      const cur = Number(actor.system.tools?.[tKey]?.value || 0);
      if (Object.prototype.hasOwnProperty.call(prevToolExp, tKey)) {
        nextToolExp[tKey] = prevToolExp[tKey];
        if (cur < 2) updateData[`system.tools.${tKey}.value`] = 2;
      } else if (cur < 2) {
        nextToolExp[tKey] = cur;
        updateData[`system.tools.${tKey}.value`] = 2;
      }
    }
  }

  // Clean choicesMap so only unlocked nodes remain
  const unlockedSet = new Set(unlockedIds);
  const cleanChoices = {};
  for (const [nid, list] of Object.entries(choicesMap || {})) {
    if (unlockedSet.has(nid) && Array.isArray(list) && list.length > 0) {
      cleanChoices[nid] = Array.from(new Set(list));
    }
  }

  // Persist tracking flags + unlocked list + choices atomically (force-replace objects in Foundry v14 so removed keys don't linger!)
  updateData[`flags.${FLAG_SCOPE}.unlocked`] = Array.from(unlockedSet);
  updateData[`flags.${FLAG_SCOPE}.choices`] = forceReplaceObject(cleanChoices);
  updateData[`flags.${FLAG_SCOPE}.appliedGrants`] = forceReplaceObject({
    skills: nextAppliedSkills,
    saves: nextAppliedSaves,
    armor: nextAppliedArmor,
    weapons: nextAppliedWeapons,
    tools: nextAppliedTools,
    skillExpertise: nextSkillExp,
    toolExpertise: nextToolExp,
  });
  updateData[`flags.${FLAG_SCOPE}.summary`] = {
    hitDie: desired.hitDie,
    spellTier: desired.spellTier,
    lastSyncedAt: Date.now(),
  };

  await actor.update(updateData);

  // 5. Managed Feature / Feat / Spellcasting Items (with embedded transfer:true Passive Active Effects!)
  const desiredEntryKeys = new Set(desired.featureEntries.map((e) => e.key));
  const existingManaged = actor.items.filter(
    (it) => it.getFlag(FLAG_SCOPE, 'managed') === true
  );
  const existingByEntryKey = new Map();
  const toDeleteIds = [];

  for (const it of existingManaged) {
    const entryKey =
      it.getFlag(FLAG_SCOPE, 'entryKey') ||
      (it.getFlag(FLAG_SCOPE, 'choiceId')
        ? `${it.getFlag(FLAG_SCOPE, 'nodeId')}::${it.getFlag(FLAG_SCOPE, 'choiceId')}`
        : it.getFlag(FLAG_SCOPE, 'nodeId'));
    if (!desiredEntryKeys.has(entryKey) || existingByEntryKey.has(entryKey)) {
      toDeleteIds.push(it.id);
    } else {
      existingByEntryKey.set(entryKey, it);
    }
  }

  if (toDeleteIds.length > 0) {
    await actor.deleteEmbeddedDocuments('Item', toDeleteIds);
  }

  const toCreate = [];
  for (const entry of desired.featureEntries) {
    const existingItem = existingByEntryKey.get(entry.key);
    if (!existingItem) {
      toCreate.push(await buildManagedItemData(entry, treeData.roles));
    } else {
      await syncPassiveEffectOnExistingItem(existingItem, entry);
    }
  }

  if (toCreate.length > 0) {
    await actor.createEmbeddedDocuments('Item', toCreate);
  }

  // 6. Optional Managed ActiveEffect (Foundry v14.370 EffectChangeData + dnd5e 6.x hp.bonuses.level)
  if (actor.effects) {
    const baseHitDie = treeData.meta?.baseHitDie || 6;
    const bonusPerLv = Math.max(0, Math.floor((desired.hitDie - baseHitDie) / 2));
    const effectiveBonusPerLv = applyHitDieHp ? bonusPerLv : 0;

    const existingEffect = actor.effects.find(
      (ef) => ef.getFlag(FLAG_SCOPE, 'managedHitDie') === true
    );

    if (effectiveBonusPerLv > 0) {
      const changeType = globalThis.CONST?.ACTIVE_EFFECT_CHANGE_TYPES?.ADD ?? 'add';
      const changePhase = globalThis.CONST?.ACTIVE_EFFECT_CHANGE_PHASES?.INITIAL ?? 'initial';
      const effectData = {
        name: `Fivefold 5e Hit Die (d${desired.hitDie})`,
        img: CATEGORY_ICONS.hit_die,
        changes: [
          {
            key: 'system.attributes.hp.bonuses.level',
            type: changeType,
            phase: changePhase,
            value: String(effectiveBonusPerLv),
            priority: 20,
          },
        ],
        flags: {
          [FLAG_SCOPE]: {
            managedHitDie: true,
            hitDie: desired.hitDie,
            bonusPerLevel: effectiveBonusPerLv,
          },
        },
      };
      if (existingEffect) {
        await existingEffect.update(effectData);
      } else {
        await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      }
    } else if (existingEffect) {
      await actor.deleteEmbeddedDocuments('ActiveEffect', [existingEffect.id]);
    }
  }

  return {
    updated: true,
    createdItems: toCreate.length,
    deletedItems: toDeleteIds.length,
    hitDie: desired.hitDie,
    spellTier: desired.spellTier,
  };
}
