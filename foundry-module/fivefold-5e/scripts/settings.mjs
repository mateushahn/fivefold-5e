import { MODULE_ID } from './constants.mjs';

let cachedDefaultTree = null;

export async function loadDefaultTree() {
  if (cachedDefaultTree) return structuredClone(cachedDefaultTree);
  const url = `modules/${MODULE_ID}/data/default-skill-tree.json`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Fivefold 5e default skill web (${resp.status})`);
  }
  cachedDefaultTree = await resp.json();
  return structuredClone(cachedDefaultTree);
}

export function getWorldTreeData() {
  const saved = game.settings.get(MODULE_ID, 'treeData');
  if (saved && Array.isArray(saved.nodes) && Array.isArray(saved.edges) && saved.nodes.length > 0) {
    const clone = structuredClone(saved);
    clone.meta = {
      ...clone.meta,
      startingPoints: Number(game.settings.get(MODULE_ID, 'startingPoints')) || 6,
      pointsPerLevel: Number(game.settings.get(MODULE_ID, 'pointsPerLevel')) || 3,
    };
    return clone;
  }
  if (cachedDefaultTree) {
    const clone = structuredClone(cachedDefaultTree);
    clone.meta = {
      ...clone.meta,
      startingPoints: Number(game.settings.get(MODULE_ID, 'startingPoints')) || 6,
      pointsPerLevel: Number(game.settings.get(MODULE_ID, 'pointsPerLevel')) || 3,
    };
    return clone;
  }
  return null;
}

export async function saveWorldTreeData(treeData) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize('FIVEFOLD.Labels.GmOnlyEdit'));
    return false;
  }
  await game.settings.set(MODULE_ID, 'treeData', structuredClone(treeData));
  return true;
}

export function registerModuleSettings(openStudioCallback, onTreeChangedCallback) {
  // Hidden world JSON storage for the editable skill web
  game.settings.register(MODULE_ID, 'treeData', {
    scope: 'world',
    config: false,
    type: Object,
    default: null,
    onChange: () => {
      if (typeof onTreeChangedCallback === 'function') onTreeChangedCallback();
    },
  });

  // Settings menu button to launch the studio directly from Module Settings
  const MenuLauncher = class extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-menu-launcher`,
    };

    async render() {
      openStudioCallback();
      return this;
    }
  };

  game.settings.registerMenu(MODULE_ID, 'openStudioMenu', {
    name: 'FIVEFOLD.Settings.OpenStudioName',
    label: 'FIVEFOLD.Settings.OpenStudioLabel',
    hint: 'FIVEFOLD.Settings.OpenStudioHint',
    icon: 'fa-solid fa-diagram-project',
    type: MenuLauncher,
    restricted: false,
  });

  game.settings.register(MODULE_ID, 'autoSync', {
    name: 'FIVEFOLD.Settings.AutoSyncName',
    hint: 'FIVEFOLD.Settings.AutoSyncHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'applyHitDieHp', {
    name: 'FIVEFOLD.Settings.ApplyHitDieHpName',
    hint: 'FIVEFOLD.Settings.ApplyHitDieHpHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'startingPoints', {
    name: 'FIVEFOLD.Settings.StartingPointsName',
    hint: 'FIVEFOLD.Settings.StartingPointsHint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 1, max: 30, step: 1 },
    default: 6,
    onChange: () => {
      if (typeof onTreeChangedCallback === 'function') onTreeChangedCallback();
    },
  });

  game.settings.register(MODULE_ID, 'pointsPerLevel', {
    name: 'FIVEFOLD.Settings.PointsPerLevelName',
    hint: 'FIVEFOLD.Settings.PointsPerLevelHint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 1, max: 10, step: 1 },
    default: 3,
    onChange: () => {
      if (typeof onTreeChangedCallback === 'function') onTreeChangedCallback();
    },
  });

  game.settings.register(MODULE_ID, 'allowPlayerReset', {
    name: 'FIVEFOLD.Settings.AllowPlayerResetName',
    hint: 'FIVEFOLD.Settings.AllowPlayerResetHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
}
