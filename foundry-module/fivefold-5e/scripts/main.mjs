import { MODULE_ID } from './constants.mjs';
import { getActorUnlockedIds, syncActorFromSkillWeb } from './actor-sync.mjs';
import {
  getWorldTreeData,
  loadDefaultTree,
  registerModuleSettings,
  saveWorldTreeData,
} from './settings.mjs';
import { FivefoldSkillWebApp } from './skill-web-app.mjs';

function openSkillWeb(actor = null, initialMode = null) {
  const existing = Array.from(FivefoldSkillWebApp.activeInstances).find(
    (app) => (actor ? app.actor?.id === actor.id : !app.actor)
  );
  if (existing) {
    if (!existing.rendered) existing.render({ force: true });
    existing.bringToFront?.();
    return existing;
  }
  const app = new FivefoldSkillWebApp({ actor, initialMode });
  app.render({ force: true });
  return app;
}

Hooks.once('init', () => {
  registerModuleSettings(
    () => openSkillWeb(null, game.user.isGM ? 'inspect' : 'build'),
    () => {
      for (const app of FivefoldSkillWebApp.activeInstances) {
        app.reloadFromWorld();
      }
    }
  );
});

Hooks.once('ready', async () => {
  const defaultTree = await loadDefaultTree();
  const existing = game.settings.get(MODULE_ID, 'treeData');
  if (game.user.isGM) {
    if (!existing || !Array.isArray(existing.nodes) || !existing.nodes.length) {
      await saveWorldTreeData(defaultTree);
    } else {
      // Non-destructive migration: backfill new SRD `choices` & passive `effects` onto existing world nodes
      const defaultById = new Map(defaultTree.nodes.map((n) => [n.id, n]));
      let dirty = false;
      const cloned = structuredClone(existing);
      for (const node of cloned.nodes) {
        const def = defaultById.get(node.id);
        if (!def) continue;
        if ((!Array.isArray(node.choices) || node.choices.length === 0) && def.choices?.length > 0) {
          node.choices = structuredClone(def.choices);
          node.repeatable = Boolean(def.repeatable);
          node.maxChoices = Number(def.maxChoices) || 0;
          dirty = true;
        }
        if ((!Array.isArray(node.effects) || node.effects.length === 0) && def.effects?.length > 0) {
          node.effects = structuredClone(def.effects);
          dirty = true;
        }
        if (Array.isArray(node.choices) && Array.isArray(def.choices)) {
          const defChById = new Map(def.choices.map((c) => [c.id, c]));
          for (const ch of node.choices) {
            const dch = defChById.get(ch.id);
            if (dch && (!Array.isArray(ch.effects) || ch.effects.length === 0) && dch.effects?.length > 0) {
              ch.effects = structuredClone(dch.effects);
              dirty = true;
            }
          }
        }
      }
      if (Array.isArray(cloned.presets) && Array.isArray(defaultTree.presets)) {
        const defPresetById = new Map(defaultTree.presets.map((p) => [p.id, p]));
        for (const p of cloned.presets) {
          const dp = defPresetById.get(p.id);
          if (dp && !p.choices && dp.choices) {
            p.choices = structuredClone(dp.choices);
            dirty = true;
          }
        }
      }
      if (dirty) {
        await saveWorldTreeData(cloned);
      }
    }
  }

  // Expose public Macro & Module API: game.modules.get('fivefold-5e').api.open(actor)
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      open: openSkillWeb,
      getTreeData: getWorldTreeData,
      syncActor: async (actor) => {
        const tree = getWorldTreeData() || (await loadDefaultTree());
        return syncActorFromSkillWeb(actor, tree, getActorUnlockedIds(actor));
      },
      FivefoldSkillWebApp,
    };
  }
});

// Foundry VTT v14 ApplicationV2 Character Sheet Header Control
Hooks.on('getHeaderControlsApplicationV2', (app, controls) => {
  const actor = app.document || app.actor;
  if (!actor || actor.documentName !== 'Actor' || actor.type !== 'character') return;
  if (controls.some((c) => c.action === 'fivefold-5e-open')) return;

  controls.push({
    action: 'fivefold-5e-open',
    icon: 'fa-solid fa-diagram-project',
    label: game.i18n.localize('FIVEFOLD.OpenSkillWeb'),
    onClick: () => openSkillWeb(actor, 'build'),
  });
});

// Foundry VTT v14 SceneControlTool (Record<string, SceneControlTool> with onChange + order)
Hooks.on('getSceneControlButtons', (controls) => {
  const tokenControls = controls?.tokens;
  if (!tokenControls?.tools || typeof tokenControls.tools !== 'object') return;

  const existingOrders = Object.values(tokenControls.tools)
    .map((tool) => Number(tool?.order))
    .filter(Number.isFinite);
  const nextOrder = existingOrders.length ? Math.max(...existingOrders) + 1 : 99;

  tokenControls.tools['fivefold-5e-studio'] = {
    name: 'fivefold-5e-studio',
    title: 'FIVEFOLD.OpenGlobal',
    icon: 'fa-solid fa-diagram-project',
    order: nextOrder,
    button: true,
    visible: true,
    onChange: () => {
      const selectedTokenActor = canvas?.tokens?.controlled?.[0]?.actor;
      const actor =
        selectedTokenActor?.type === 'character'
          ? selectedTokenActor
          : game.user.character || null;
      openSkillWeb(actor, actor ? 'build' : 'inspect');
    },
  };
});

// Auto-refresh open Skill Web windows whenever a linked Character Actor updates (e.g. levels up)
Hooks.on('updateActor', (actor) => {
  if (actor.type !== 'character') return;
  for (const app of FivefoldSkillWebApp.activeInstances) {
    app.reloadFromActor(actor);
  }
});
