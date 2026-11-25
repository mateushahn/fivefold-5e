import {
  ALL_ROLES_ORDER,
  ALL_SAVES,
  MODULE_ID,
  SPELL_TIER_LABELS,
  TIER_RADII,
  TIER_ROMAN,
} from './constants.mjs';
import {
  getActorConMod,
  getActorLevel,
  getActorNodeChoices,
  getActorUnlockedIds,
  saveActorUnlockedIds,
  syncActorFromSkillWeb,
} from './actor-sync.mjs';
import { getWorldTreeData, loadDefaultTree, saveWorldTreeData } from './settings.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function t(key, data = null) {
  if (data) return game.i18n.format(`FIVEFOLD.${key}`, data);
  return game.i18n.localize(`FIVEFOLD.${key}`);
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FivefoldSkillWebApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static activeInstances = new Set();

  static DEFAULT_OPTIONS = {
    id: 'fivefold-5e-studio',
    classes: ['fivefold-5e-app'],
    tag: 'div',
    window: {
      title: 'FIVEFOLD.Title',
      icon: 'fa-solid fa-diagram-project',
      resizable: true,
    },
    position: {
      width: 1240,
      height: 780,
    },
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/skill-web.hbs`,
    },
  };

  constructor(options = {}) {
    const { actor = null, initialMode = null, ...appOptions } = options;
    const appId = actor ? `fivefold-5e-actor-${actor.id}` : 'fivefold-5e-studio';
    super({ ...appOptions, id: appId });

    this._appUniqueId = appId;
    this.actor = actor;
    this.webState = {
      data: getWorldTreeData(),
      mode: initialMode || (actor ? 'build' : 'inspect'),
      buildSubTab: 'sheet',
      selectedNodeId: 'combat_root',
      hoveredNodeId: null,
      filterRole: 'all',
      filterCategory: 'all',
      filterTier: 'all',
      searchQuery: '',
      showRings: true,
      view: { tx: 0, ty: 0, scale: 0.9 },
      sandboxLevel: 5,
      sandboxConMod: 2,
      unlocked: new Set(actor ? getActorUnlockedIds(actor) : []),
      choices: actor ? getActorNodeChoices(actor) : {},
      linkMode: false,
      linkSourceId: null,
      cursorWorld: { x: 0, y: 0 },
      undoStack: [],
      redoStack: [],
    };
    this._mounted = false;
    this._saveTimer = null;
    this._boundListeners = [];
    this._activeDrag = null;
  }

  get title() {
    if (this.actor) {
      return `${t('ShortTitle')} — ${this.actor.name}`;
    }
    return t('Title');
  }

  async _prepareContext() {
    if (!this.webState.data) {
      this.webState.data = (await getWorldTreeData()) || (await loadDefaultTree());
    }
    return {
      isGM: game.user.isGM,
      appId: this._appUniqueId,
    };
  }

  _cleanupListeners() {
    for (const { target, type, fn } of this._boundListeners) {
      target.removeEventListener(type, fn);
    }
    this._boundListeners = [];
  }

  _onRender(_context, _options) {
    FivefoldSkillWebApp.activeInstances.add(this);
    const currentSvg = this._ref('tree-svg');
    const needsMount = !this._mounted || this.refs?.svg !== currentSvg;
    if (needsMount) {
      const firstMount = !this._mounted;
      this._cleanupListeners();
      this._mounted = true;
      this._cacheRefs();
      this._bindEvents();
      this._setMode(this.webState.mode);
      if (firstMount) this._fitToNodes();
      else this._applyViewport();
    } else {
      this._renderAll();
    }
  }

  async _onClose(_options) {
    FivefoldSkillWebApp.activeInstances.delete(this);
    this._cleanupListeners();
    this._mounted = false;
    clearTimeout(this._saveTimer);
  }

  reloadFromWorld() {
    const fresh = getWorldTreeData();
    if (!fresh) return;
    this.webState.data = fresh;
    this._pruneInvalidUnlocked();
    if (this._mounted) this._renderAll();
  }

  reloadFromActor(actor) {
    if (!this.actor || actor.id !== this.actor.id) return;
    this.webState.unlocked = new Set(getActorUnlockedIds(this.actor));
    this.webState.choices = getActorNodeChoices(this.actor);
    if (this._mounted) this._renderAll();
  }

  // =========================================================================
  // DOM REFS & EVENT BINDING
  // =========================================================================
  _ref(name) {
    return this.element.querySelector(`[data-ref="${name}"]`);
  }

  _listen(target, type, fn, opts) {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    this._boundListeners.push({ target, type, fn });
  }

  _cacheRefs() {
    this.refs = {
      svg: this._ref('tree-svg'),
      viewportG: this._ref('viewport-group'),
      guidesLayer: this._ref('guides-layer'),
      edgesLayer: this._ref('edges-layer'),
      tempLinkLayer: this._ref('temp-link-layer'),
      nodesLayer: this._ref('nodes-layer'),
      inspector: this._ref('inspector-content'),
      buildSubtabs: this._ref('build-subtabs'),
      rolePills: this._ref('role-pills'),
      treeCounts: this._ref('tree-counts'),
      zoomReadout: this._ref('zoom-readout'),
      editTools: this._ref('edit-canvas-tools'),
      hudStatus: this._ref('hud-status'),
      hudStatusText: this._ref('hud-status-text'),
      searchInput: this._ref('search-input'),
      searchClear: this._ref('search-clear'),
      searchResults: this._ref('search-results'),
      btnUndo: this._ref('btn-undo'),
      btnRedo: this._ref('btn-redo'),
      btnLinkMode: this._ref('btn-link-mode'),
    };
  }

  _bindEvents() {
    this.element.querySelectorAll('.ff5e-mode-btn').forEach((btn) => {
      this._listen(btn, 'click', () => this._setMode(btn.dataset.mode));
    });

    this.refs.buildSubtabs.querySelectorAll('.ff5e-subtab').forEach((btn) => {
      this._listen(btn, 'click', () => {
        this.webState.buildSubTab = btn.dataset.btab;
        this._renderInspector();
      });
    });

    this._listen(this._ref('filter-category'), 'change', (e) => {
      this.webState.filterCategory = e.target.value;
      this._renderCanvas();
    });
    this._listen(this._ref('filter-tier'), 'change', (e) => {
      this.webState.filterTier = e.target.value;
      this._renderCanvas();
    });

    this._listen(this.refs.searchInput, 'input', (e) => {
      this.webState.searchQuery = e.target.value;
      this._renderCanvas();
      this._renderSearchDropdown();
    });
    this._listen(this.refs.searchClear, 'click', () => {
      this.webState.searchQuery = '';
      this.refs.searchInput.value = '';
      this._renderCanvas();
      this._renderSearchDropdown();
    });
    this._listen(this.element, 'click', (e) => {
      if (!e.target.closest('.ff5e-search-wrap')) {
        this.refs.searchResults.classList.remove('open');
      }
    });

    // Zoom & Canvas controls
    this._listen(this._ref('btn-zoom-in'), 'click', () => this._zoomBy(1.25));
    this._listen(this._ref('btn-zoom-out'), 'click', () => this._zoomBy(0.8));
    this._listen(this._ref('btn-fit'), 'click', () => this._fitToNodes());
    this._listen(this._ref('btn-rings'), 'click', (e) => {
      this.webState.showRings = !this.webState.showRings;
      e.currentTarget.classList.toggle('active', this.webState.showRings);
      this._renderGuides();
    });

    // GM Edit canvas tools
    if (game.user.isGM) {
      this._listen(this._ref('btn-add-node'), 'click', () => {
        const sel = this._getNode(this.webState.selectedNodeId);
        this._createNewNode({ parentId: sel ? sel.id : null });
      });
      this._listen(this.refs.btnLinkMode, 'click', () => this._toggleLinkMode());
      this._listen(this._ref('btn-auto-layout'), 'click', () => this._autoLayoutRadial());
      this._listen(this.refs.btnUndo, 'click', () => this._performUndo());
      this._listen(this.refs.btnRedo, 'click', () => this._performRedo());

      const fileInput = this._ref('file-import');
      this._listen(this._ref('btn-import'), 'click', () => fileInput?.click());
      this._listen(fileInput, 'change', (ev) => this._handleImportFile(ev));
    }

    this._listen(this._ref('hud-status-cancel'), 'click', () => this._toggleLinkMode(false));
    this._listen(this._ref('btn-export'), 'click', () => {
      this._downloadText('fivefold5e-skill-tree.json', JSON.stringify(this.webState.data, null, 2));
      ui.notifications.info(t('Notifications.Exported'));
    });

    // SVG pointer interactions
    this._listen(this.refs.svg, 'pointerdown', (ev) => {
      if (ev.button !== 0 || ev.target.closest('.ff5e-node')) return;
      this._activeDrag = {
        type: 'pan',
        startX: ev.clientX,
        startY: ev.clientY,
        origTx: this.webState.view.tx,
        origTy: this.webState.view.ty,
        moved: false,
      };
      this.refs.svg.classList.add('panning');
    });

    this._listen(this.refs.svg, 'dblclick', (ev) => {
      if (this.webState.mode !== 'edit' || !game.user.isGM) return;
      if (ev.target.closest('.ff5e-node')) return;
      const pt = this._screenToWorld(ev.clientX, ev.clientY);
      this._createNewNode({ x: Math.round(pt.x), y: Math.round(pt.y) });
    });

    this._listen(
      this.refs.svg,
      'wheel',
      (ev) => {
        ev.preventDefault();
        this._zoomBy(ev.deltaY < 0 ? 1.12 : 0.89, ev.clientX, ev.clientY);
      },
      { passive: false }
    );

    this._listen(window, 'pointermove', (ev) => this._onPointerMove(ev));
    this._listen(window, 'pointerup', () => this._onPointerUp());
    this._listen(window, 'keydown', (ev) => this._onKeyDown(ev));
  }

  // =========================================================================
  // GRAPH & WORLD PERSISTENCE HELPERS
  // =========================================================================
  _getNode(id) {
    return this.webState.data.nodes.find((n) => n.id === id) || null;
  }

  _getRoleInfo(roleId) {
    return this.webState.data.roles?.[roleId] || { id: roleId, name: roleId, color: '#8f6339' };
  }

  _getParents(nodeId) {
    return this.webState.data.edges.filter((e) => e.to === nodeId).map((e) => e.from);
  }

  _getChildren(nodeId) {
    return this.webState.data.edges.filter((e) => e.from === nodeId).map((e) => e.to);
  }

  _wouldCreateCycle(fromId, toId) {
    if (fromId === toId) return true;
    const seen = new Set([toId]);
    const q = [toId];
    while (q.length) {
      const cur = q.shift();
      for (const e of this.webState.data.edges) {
        if (e.from === cur) {
          if (e.to === fromId) return true;
          if (!seen.has(e.to)) {
            seen.add(e.to);
            q.push(e.to);
          }
        }
      }
    }
    return false;
  }

  _pushUndo() {
    this.webState.undoStack.push(
      structuredClone({ nodes: this.webState.data.nodes, edges: this.webState.data.edges })
    );
    if (this.webState.undoStack.length > 40) this.webState.undoStack.shift();
    this.webState.redoStack = [];
    this._updateUndoButtons();
  }

  _performUndo() {
    if (!this.webState.undoStack.length || !game.user.isGM) return;
    this.webState.redoStack.push(
      structuredClone({ nodes: this.webState.data.nodes, edges: this.webState.data.edges })
    );
    const prev = this.webState.undoStack.pop();
    this.webState.data.nodes = prev.nodes;
    this.webState.data.edges = prev.edges;
    this._pruneInvalidUnlocked();
    this._scheduleWorldSave();
    this._renderAll();
    ui.notifications.info(t('Notifications.Undo'));
  }

  _performRedo() {
    if (!this.webState.redoStack.length || !game.user.isGM) return;
    this.webState.undoStack.push(
      structuredClone({ nodes: this.webState.data.nodes, edges: this.webState.data.edges })
    );
    const next = this.webState.redoStack.pop();
    this.webState.data.nodes = next.nodes;
    this.webState.data.edges = next.edges;
    this._pruneInvalidUnlocked();
    this._scheduleWorldSave();
    this._renderAll();
    ui.notifications.info(t('Notifications.Redo'));
  }

  _scheduleWorldSave() {
    if (!game.user.isGM) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      saveWorldTreeData(this.webState.data);
    }, 250);
  }

  _pruneInvalidUnlocked() {
    const valid = new Set(this.webState.data.nodes.map((n) => n.id));
    for (const id of Array.from(this.webState.unlocked)) {
      if (!valid.has(id)) {
        this.webState.unlocked.delete(id);
        delete this.webState.choices[id];
      }
    }
    for (const id of Object.keys(this.webState.choices || {})) {
      if (!valid.has(id) || !this.webState.unlocked.has(id)) {
        delete this.webState.choices[id];
      }
    }
  }

  // =========================================================================
  // CHARACTER BUILDER, CHOICES & ACTOR SYNC LOGIC
  // =========================================================================
  _getNodeChoiceMeta(node) {
    const choices = Array.isArray(node?.choices) ? node.choices : [];
    const hasChoices = choices.length > 0;
    const isRepeatable = Boolean(node?.repeatable) && hasChoices;
    let maxAllowed = 1;
    if (hasChoices) {
      if (isRepeatable) {
        const cfgMax = Number(node.maxChoices) || 0;
        maxAllowed = cfgMax > 0 ? Math.min(cfgMax, choices.length) : choices.length;
      } else {
        maxAllowed = 1;
      }
    }
    return { hasChoices, choices, isRepeatable, maxAllowed };
  }

  _getSelectedChoiceIds(nodeId) {
    if (!this.webState.unlocked.has(nodeId)) return [];
    const list = this.webState.choices?.[nodeId];
    return Array.isArray(list) ? list : [];
  }

  _getLevel() {
    return this.actor ? getActorLevel(this.actor) : this.webState.sandboxLevel;
  }

  _getConMod() {
    return this.actor ? getActorConMod(this.actor) : this.webState.sandboxConMod;
  }

  _getTotalSP() {
    const start = Number(game.settings.get(MODULE_ID, 'startingPoints')) || 6;
    const perLv = Number(game.settings.get(MODULE_ID, 'pointsPerLevel')) || 3;
    return start + (this._getLevel() - 1) * perLv;
  }

  _getSpentSP() {
    let total = 0;
    for (const id of this.webState.unlocked) {
      const n = this._getNode(id);
      if (!n) continue;
      const baseCost = Number(n.cost) || 0;
      const selectedCount = this._getSelectedChoiceIds(id).length;
      const purchases = selectedCount > 0 ? selectedCount : 1;
      total += baseCost * purchases;
    }
    return total;
  }

  _getRemainingSP() {
    return this._getTotalSP() - this._getSpentSP();
  }

  _evaluateNodeStatus(node) {
    const meta = this._getNodeChoiceMeta(node);
    const selectedIds = this._getSelectedChoiceIds(node.id);
    const rem = this._getRemainingSP();

    if (this.webState.unlocked.has(node.id)) {
      const remainingChoices = meta.choices.filter((c) => !selectedIds.includes(c.id));
      const underCap = selectedIds.length < meta.maxAllowed;
      const canBuyMore =
        meta.isRepeatable && underCap && remainingChoices.length > 0 && node.cost <= rem;
      const buyMoreReasons = [];
      if (meta.isRepeatable) {
        if (!underCap || remainingChoices.length === 0) {
          buyMoreReasons.push(t('Notifications.NoChoicesRemaining', { name: node.name }));
        } else if (node.cost > rem) {
          buyMoreReasons.push(`${node.cost} SP (${rem} ${t('Labels.Remaining')})`);
        }
      }
      return {
        status: 'unlocked',
        reasons: buyMoreReasons,
        canBuyMore,
        selectedIds,
        maxAllowed: meta.maxAllowed,
        isRepeatable: meta.isRepeatable,
        hasChoices: meta.hasChoices,
      };
    }

    const reasons = [];
    const minLv = this.webState.data.meta.tierMinLevels[node.tier] ?? 1;
    if (this._getLevel() < minLv) {
      reasons.push(`Lv ${minLv}+ (Tier ${TIER_ROMAN[node.tier]})`);
    }
    const parents = this._getParents(node.id);
    if (parents.length) {
      if (node.prereqMode === 'any') {
        if (!parents.some((p) => this.webState.unlocked.has(p))) {
          reasons.push(
            `${t('Labels.RequiresAny')}: ${parents.map((p) => this._getNode(p)?.name || p).join(' / ')}`
          );
        }
      } else {
        const miss = parents.filter((p) => !this.webState.unlocked.has(p));
        if (miss.length) {
          reasons.push(
            `${t('Labels.Prerequisites')}: ${miss.map((p) => this._getNode(p)?.name || p).join(', ')}`
          );
        }
      }
    }
    if (node.cost > rem) {
      reasons.push(`${node.cost} SP (${rem} ${t('Labels.Remaining')})`);
    }
    return {
      status: reasons.length ? 'locked' : 'available',
      reasons,
      canBuyMore: false,
      selectedIds,
      maxAllowed: meta.maxAllowed,
      isRepeatable: meta.isRepeatable,
      hasChoices: meta.hasChoices,
    };
  }

  _getBlockingChildren(nodeId) {
    const blockers = [];
    for (const cid of this._getChildren(nodeId)) {
      if (!this.webState.unlocked.has(cid)) continue;
      const ch = this._getNode(cid);
      if (!ch) continue;
      if (ch.prereqMode === 'any') {
        const otherAlive = this._getParents(cid).some(
          (pid) => pid !== nodeId && this.webState.unlocked.has(pid)
        );
        if (!otherAlive) blockers.push(ch);
      } else {
        blockers.push(ch);
      }
    }
    return blockers;
  }

  async _persistBuildAndMaybeSync() {
    if (!this.actor) return;
    if (!this.actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(t('Notifications.NoPermission'));
      return;
    }
    const ids = Array.from(this.webState.unlocked);
    const choices = structuredClone(this.webState.choices || {});
    const autoSync = Boolean(game.settings.get(MODULE_ID, 'autoSync'));
    if (autoSync) {
      await syncActorFromSkillWeb(this.actor, this.webState.data, ids, { choices });
    } else {
      await saveActorUnlockedIds(this.actor, ids, choices);
    }
  }

  async _promptNodeChoice(node) {
    const meta = this._getNodeChoiceMeta(node);
    const alreadyIds = new Set(this._getSelectedChoiceIds(node.id));
    const availableChoices = meta.choices.filter((c) => !alreadyIds.has(c.id));

    if (!availableChoices.length || alreadyIds.size >= meta.maxAllowed) {
      ui.notifications.warn(t('Notifications.NoChoicesRemaining', { name: node.name }));
      return null;
    }

    const firstAvailableId = availableChoices[0].id;
    const hint = t('Labels.ChoicePromptHint', {
      cost: node.cost,
      count: alreadyIds.size,
      max: meta.maxAllowed,
    });

    const content = `
      <p class="ff5e-choice-hint">${esc(hint)}</p>
      <div class="ff5e-choice-list">
        ${meta.choices
          .map((ch) => {
            const isChosen = alreadyIds.has(ch.id);
            const checked = !isChosen && ch.id === firstAvailableId ? 'checked' : '';
            const disabled = isChosen ? 'disabled' : '';
            return `
              <label class="ff5e-choice-option${isChosen ? ' chosen' : ''}">
                <input type="radio" name="ff5eChoice" value="${esc(ch.id)}" ${checked} ${disabled} />
                <div style="flex:1;min-width:0;">
                  <div class="ff5e-choice-title-row">
                    <span>${esc(ch.name)}</span>
                    ${isChosen ? `<span class="ff5e-choice-badge">✓ ${esc(t('Labels.AlreadyChosen'))}</span>` : ''}
                  </div>
                  ${ch.description ? `<div class="ff5e-choice-desc">${esc(ch.description)}</div>` : ''}
                </div>
              </label>`;
          })
          .join('')}
      </div>
    `;

    const DialogV2 = foundry.applications?.api?.DialogV2;
    if (!DialogV2 || typeof DialogV2.wait !== 'function') {
      return firstAvailableId;
    }

    const chosenId = await DialogV2.wait({
      window: {
        title: t('Labels.ChoicePromptTitle', { name: node.name }),
        icon: 'fa-solid fa-list-check',
      },
      classes: ['ff5e-choice-dialog'],
      position: { width: 470 },
      content,
      rejectClose: false,
      buttons: [
        {
          action: 'confirm',
          label: `${t('Actions.ConfirmChoice')} (-${node.cost} SP)`,
          icon: 'fa-solid fa-check',
          default: true,
          callback: (_event, button) => {
            const checked = button.form?.querySelector('input[name="ff5eChoice"]:checked');
            return checked?.value || null;
          },
        },
        {
          action: 'cancel',
          label: t('Actions.Cancel'),
          icon: 'fa-solid fa-xmark',
          callback: () => null,
        },
      ],
    });

    if (!chosenId || typeof chosenId !== 'string') return null;
    if (alreadyIds.has(chosenId)) return null;
    return chosenId;
  }

  async _purchaseNodeChoice(node) {
    const chosenId = await this._promptNodeChoice(node);
    if (!chosenId) return;
    const choiceObj = (node.choices || []).find((c) => c.id === chosenId);
    const current = this._getSelectedChoiceIds(node.id).slice();
    if (!current.includes(chosenId)) current.push(chosenId);
    this.webState.choices[node.id] = current;
    this.webState.unlocked.add(node.id);
    await this._persistBuildAndMaybeSync();
    this._renderAll();
    ui.notifications.info(
      t('Notifications.UnlockedChoice', {
        name: node.name,
        choice: choiceObj?.name || chosenId,
        cost: node.cost,
      })
    );
  }

  async _refundNodeChoice(nodeId, choiceId) {
    const node = this._getNode(nodeId);
    if (!node) return;
    if (this.actor && !this.actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(t('Notifications.NoPermission'));
      return;
    }
    const canRefund = game.user.isGM || Boolean(game.settings.get(MODULE_ID, 'allowPlayerReset'));
    if (!canRefund) {
      ui.notifications.warn(t('Notifications.RefundDisabled'));
      return;
    }

    const current = this._getSelectedChoiceIds(nodeId).slice();
    if (!current.includes(choiceId)) return;

    // Removing the final choice of a node locks the node, so check blocking children first!
    if (current.length === 1) {
      const blockers = this._getBlockingChildren(nodeId);
      if (blockers.length) {
        ui.notifications.warn(
          `${t('Labels.RequiredBy')}: ${blockers.map((b) => b.name).join(', ')}`
        );
        this.webState.selectedNodeId = nodeId;
        this.webState.buildSubTab = 'node';
        this._renderAll();
        return;
      }
      delete this.webState.choices[nodeId];
      this.webState.unlocked.delete(nodeId);
    } else {
      this.webState.choices[nodeId] = current.filter((id) => id !== choiceId);
    }

    const choiceObj = (node.choices || []).find((c) => c.id === choiceId);
    await this._persistBuildAndMaybeSync();
    this._renderAll();
    ui.notifications.info(
      t('Notifications.RefundedChoice', {
        name: node.name,
        choice: choiceObj?.name || choiceId,
        cost: node.cost,
      })
    );
  }

  async _toggleBuildNode(nodeId, cascade = false, { forceRefund = false } = {}) {
    const node = this._getNode(nodeId);
    if (!node) return;
    if (this.actor && !this.actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(t('Notifications.NoPermission'));
      return;
    }

    const ev = this._evaluateNodeStatus(node);

    if (this.webState.unlocked.has(nodeId)) {
      // If repeatable choice node & user clicked on canvas (not explicit Refund button) -> open choice prompt for another option!
      if (!forceRefund && !cascade && ev.isRepeatable) {
        if (ev.canBuyMore) {
          await this._purchaseNodeChoice(node);
          return;
        }
        // Already maxed or insufficient SP: focus node details so user can inspect or refund individual choices
        if (ev.reasons.length) ui.notifications.warn(ev.reasons[0]);
        this.webState.selectedNodeId = nodeId;
        this.webState.buildSubTab = 'node';
        this._renderAll();
        return;
      }

      const canRefund = game.user.isGM || Boolean(game.settings.get(MODULE_ID, 'allowPlayerReset'));
      if (!canRefund) {
        ui.notifications.warn(t('Notifications.RefundDisabled'));
        return;
      }
      const blockers = this._getBlockingChildren(nodeId);
      if (blockers.length && !cascade) {
        ui.notifications.warn(
          `${t('Labels.RequiredBy')}: ${blockers.map((b) => b.name).join(', ')}`
        );
        this.webState.selectedNodeId = nodeId;
        this.webState.buildSubTab = 'node';
        this._renderAll();
        return;
      }
      if (cascade) {
        const toRemove = new Set([nodeId]);
        const q = [nodeId];
        while (q.length) {
          const cur = q.shift();
          for (const cid of this._getChildren(cur)) {
            if (!this.webState.unlocked.has(cid) || toRemove.has(cid)) continue;
            const ch = this._getNode(cid);
            if (
              ch?.prereqMode === 'any' &&
              this._getParents(cid).some((p) => !toRemove.has(p) && this.webState.unlocked.has(p))
            ) {
              continue;
            }
            toRemove.add(cid);
            q.push(cid);
          }
        }
        for (const id of toRemove) {
          this.webState.unlocked.delete(id);
          delete this.webState.choices[id];
        }
        await this._persistBuildAndMaybeSync();
        this._renderAll();
        ui.notifications.info(t('Notifications.RefundedBranch', { count: toRemove.size }));
      } else {
        const purchases = Math.max(1, this._getSelectedChoiceIds(nodeId).length);
        this.webState.unlocked.delete(nodeId);
        delete this.webState.choices[nodeId];
        await this._persistBuildAndMaybeSync();
        this._renderAll();
        ui.notifications.info(
          t('Notifications.Refunded', { name: node.name, cost: node.cost * purchases })
        );
      }
      return;
    }

    if (ev.status !== 'available') {
      ui.notifications.warn(ev.reasons[0]);
      this.webState.selectedNodeId = nodeId;
      this.webState.buildSubTab = 'node';
      this._renderAll();
      return;
    }

    // Choice node: open native DialogV2 prompt before unlocking!
    if (ev.hasChoices) {
      await this._purchaseNodeChoice(node);
      return;
    }

    this.webState.unlocked.add(nodeId);
    await this._persistBuildAndMaybeSync();
    this._renderAll();
    ui.notifications.info(t('Notifications.Unlocked', { name: node.name, cost: node.cost }));
  }

  _computeSummary() {
    let hitDie = this.webState.data.meta.baseHitDie || 6;
    let spellTier = 0;
    const saves = new Set();
    const skills = new Set();
    const proficiencies = new Set();
    const features = [];
    const feats = [];

    for (const id of this.webState.unlocked) {
      const n = this._getNode(id);
      if (!n) continue;
      if (n.grants?.hitDie > hitDie) hitDie = n.grants.hitDie;
      if (n.grants?.spellTier > spellTier) spellTier = n.grants.spellTier;
      (n.grants?.saves || []).forEach((s) => saves.add(s));
      (n.grants?.skills || []).forEach((s) => skills.add(s));
      (n.grants?.proficiencies || []).forEach((p) => proficiencies.add(p));

      const selectedIds = this._getSelectedChoiceIds(id);
      const choiceMap = new Map((n.choices || []).map((c) => [c.id, c]));

      const pushEntry = (displayName, summaryText) => {
        const item = { id: n.id, role: n.role, name: displayName, source5e: n.source5e, summary: summaryText };
        if (n.category === 'feat') feats.push(item);
        else if (['class_feature', 'subclass_feature', 'spellcasting'].includes(n.category)) {
          features.push(item);
        }
      };

      if (selectedIds.length > 0 && choiceMap.size > 0) {
        for (const cid of selectedIds) {
          const ch = choiceMap.get(cid);
          if (ch) pushEntry(`${n.name}: ${ch.name}`, ch.description || n.summary);
        }
      } else {
        pushEntry(n.name, n.summary);
      }
    }

    const lv = this._getLevel();
    const con = this._getConMod();
    const avgHp = Math.max(lv, hitDie + con + (lv - 1) * (Math.floor(hitDie / 2) + 1 + con));

    return {
      level: lv,
      conMod: con,
      profBonus: 2 + Math.floor((lv - 1) / 4),
      totalSP: this._getTotalSP(),
      spentSP: this._getSpentSP(),
      remainingSP: this._getRemainingSP(),
      hitDie,
      avgHp,
      spellTier,
      saves,
      skills: Array.from(skills).sort(),
      proficiencies: Array.from(proficiencies).sort(),
      features,
      feats,
    };
  }

  // =========================================================================
  // VIEWPORT PAN / ZOOM / FIT
  // =========================================================================
  _applyViewport() {
    this.refs.viewportG.setAttribute(
      'transform',
      `translate(${this.webState.view.tx}, ${this.webState.view.ty}) scale(${this.webState.view.scale})`
    );
    this.refs.zoomReadout.textContent = `${Math.round(this.webState.view.scale * 100)}%`;
  }

  _screenToWorld(cx, cy) {
    const rect = this.refs.svg.getBoundingClientRect();
    const vb = this.refs.svg.viewBox.baseVal;
    const sx = vb.x + ((cx - rect.left) / rect.width) * vb.width;
    const sy = vb.y + ((cy - rect.top) / rect.height) * vb.height;
    return {
      x: (sx - this.webState.view.tx) / this.webState.view.scale,
      y: (sy - this.webState.view.ty) / this.webState.view.scale,
    };
  }

  _fitToNodes(list = this.webState.data.nodes, pad = 280) {
    if (!list.length) {
      this.webState.view = { tx: 0, ty: 0, scale: 0.9 };
      this._applyViewport();
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of list) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const vb = this.refs.svg.viewBox.baseVal;
    const w = Math.max(400, maxX - minX + pad * 2);
    const h = Math.max(400, maxY - minY + pad * 2);
    const scale = Math.min(2.2, Math.max(0.35, Math.min(vb.width / w, vb.height / h)));
    this.webState.view = {
      scale,
      tx: -((minX + maxX) / 2) * scale,
      ty: -((minY + maxY) / 2) * scale,
    };
    this._applyViewport();
  }

  _panToNode(id, targetScale = 1.45) {
    const n = this._getNode(id);
    if (!n) return;
    this.webState.view.scale = Math.max(this.webState.view.scale, targetScale);
    this.webState.view.tx = -n.x * this.webState.view.scale;
    this.webState.view.ty = -n.y * this.webState.view.scale;
    this._applyViewport();
  }

  _zoomBy(factor, cx = null, cy = null) {
    const oldS = this.webState.view.scale;
    const newS = Math.max(0.28, Math.min(3.5, oldS * factor));
    if (cx !== null && cy !== null) {
      const rect = this.refs.svg.getBoundingClientRect();
      const vb = this.refs.svg.viewBox.baseVal;
      const sx = vb.x + ((cx - rect.left) / rect.width) * vb.width;
      const sy = vb.y + ((cy - rect.top) / rect.height) * vb.height;
      const wx = (sx - this.webState.view.tx) / oldS;
      const wy = (sy - this.webState.view.ty) / oldS;
      this.webState.view = { scale: newS, tx: sx - wx * newS, ty: sy - wy * newS };
    } else {
      this.webState.view.tx *= newS / oldS;
      this.webState.view.ty *= newS / oldS;
      this.webState.view.scale = newS;
    }
    this._applyViewport();
  }

  // =========================================================================
  // SVG RENDERING
  // =========================================================================
  _el(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  _isNodeMatching(n) {
    if (this.webState.filterRole !== 'all') {
      if (
        n.role !== this.webState.filterRole &&
        !(n.secondaryRoles || []).includes(this.webState.filterRole)
      ) {
        return false;
      }
    }
    if (this.webState.filterCategory !== 'all' && n.category !== this.webState.filterCategory) return false;
    if (this.webState.filterTier !== 'all' && String(n.tier) !== this.webState.filterTier) return false;
    const q = this.webState.searchQuery.trim().toLowerCase();
    if (q) {
      const hay = [
        n.name,
        n.source5e,
        n.summary,
        n.mechanics,
        ...(n.grants?.skills || []),
        ...(n.grants?.saves || []),
        ...(n.grants?.proficiencies || []),
        ...(n.grants?.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  _nodeRadius(n) {
    if (n.category === 'root') return 44;
    if (n.category === 'spellcasting' || n.category === 'feat') return 31;
    if (n.category === 'class_feature' || n.category === 'subclass_feature') return 29;
    if (n.category === 'hit_die') return 28;
    return 24;
  }

  _renderGuides() {
    this.refs.guidesLayer.innerHTML = '';
    if (!this.webState.showRings) return;
    TIER_RADII.forEach((r, idx) => {
      this._el('circle', { cx: 0, cy: 0, r, class: 'ff5e-tier-ring' }, this.refs.guidesLayer);
      const lbl = this._el(
        'text',
        { x: 0, y: -r - 12, class: 'ff5e-tier-label' },
        this.refs.guidesLayer
      );
      lbl.textContent = idx === 0 ? 'ROOTS' : `TIER ${TIER_ROMAN[idx]}`;
    });

    for (const rid of ['combat', 'devotion', 'magic', 'social', 'exploring']) {
      const role = this._getRoleInfo(rid);
      const rad = (role.angle * Math.PI) / 180;
      const txt = this._el(
        'text',
        {
          x: Math.cos(rad) * 1490,
          y: Math.sin(rad) * 1490,
          class: 'ff5e-sector-label',
          fill: role.color,
        },
        this.refs.guidesLayer
      );
      txt.textContent = t(`Roles.${rid}`).toUpperCase();
    }
  }

  _computeEdgePath(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const x1 = a.x + ux * (this._nodeRadius(a) + 4);
    const y1 = a.y + uy * (this._nodeRadius(a) + 4);
    const x2 = b.x - ux * (this._nodeRadius(b) + 9);
    const y2 = b.y - uy * (this._nodeRadius(b) + 9);
    const cf = d > 550 ? 0.14 : 0.06;
    const cx = (x1 + x2) / 2 - uy * d * cf;
    const cy = (y1 + y2) / 2 + ux * d * cf;
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  _renderEdges(matchSet) {
    this.refs.edgesLayer.innerHTML = '';
    const activeId = this.webState.hoveredNodeId || this.webState.selectedNodeId;
    const map = new Map(this.webState.data.nodes.map((n) => [n.id, n]));
    const defArrow = `url(#ff5e-arrow-default-${this._appUniqueId})`;
    const actArrow = `url(#ff5e-arrow-active-${this._appUniqueId})`;

    for (const edge of this.webState.data.edges) {
      const from = map.get(edge.from);
      const to = map.get(edge.to);
      if (!from || !to) continue;
      const bothMatch = matchSet.has(from.id) && matchSet.has(to.id);
      const isAct = activeId && (edge.from === activeId || edge.to === activeId);
      const isUnl =
        this.webState.mode === 'build' &&
        this.webState.unlocked.has(from.id) &&
        this.webState.unlocked.has(to.id);

      let cls = 'ff5e-edge';
      if (!bothMatch && !isAct) cls += ' dimmed';
      if (isAct) cls += ' highlighted';
      if (isUnl) cls += ' unlocked';
      if (this.webState.mode === 'edit' && game.user.isGM) cls += ' editable';

      const pathEl = this._el(
        'path',
        {
          d: this._computeEdgePath(from, to),
          class: cls,
          'marker-end': isAct || isUnl ? actArrow : defArrow,
        },
        this.refs.edgesLayer
      );

      if (isUnl || isAct) {
        const col = this._getRoleInfo(to.role).color;
        pathEl.style.stroke = col;
        pathEl.style.color = col;
      }

      if (this.webState.mode === 'edit' && game.user.isGM) {
        pathEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._pushUndo();
          this.webState.data.edges = this.webState.data.edges.filter((e) => e.id !== edge.id);
          this._scheduleWorldSave();
          this._renderAll();
          ui.notifications.info(t('Notifications.Unlinked', { from: from.name, to: to.name }));
        });
      }
    }
  }

  _polyPts(sides, r, rot = -90) {
    const out = [];
    for (let i = 0; i < sides; i++) {
      const a = ((rot + (i * 360) / sides) * Math.PI) / 180;
      out.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
    }
    return out.join(' ');
  }

  _glyphFor(n) {
    if (n.category === 'root') return n.name.slice(0, 2).toUpperCase();
    if (n.category === 'hit_die') return `d${n.grants?.hitDie || 8}`;
    if (n.category === 'save') return n.grants?.saves?.[0] || 'SV';
    if (n.category === 'spellcasting') return `S${TIER_ROMAN[n.grants?.spellTier || 1]}`;
    if (n.category === 'feat') return '★';
    if (n.category === 'subclass_feature') return '◆';
    if (n.category === 'class_feature') return '❖';
    if (n.category === 'proficiency') return '⚒';
    return '●';
  }

  _drawShape(g, n, fill, stroke, sw) {
    const r = this._nodeRadius(n);
    if (n.category === 'root') {
      this._el('polygon', { points: this._polyPts(8, r, 22.5), fill, stroke, 'stroke-width': sw + 1.5 }, g);
      this._el('polygon', { points: this._polyPts(8, r - 7, 22.5), fill: 'none', stroke, 'stroke-width': 1.2, 'stroke-opacity': 0.55 }, g);
    } else if (n.category === 'class_feature') {
      this._el('polygon', { points: this._polyPts(6, r, -90), fill, stroke, 'stroke-width': sw }, g);
    } else if (n.category === 'subclass_feature') {
      this._el('polygon', { points: this._polyPts(8, r, 22.5), fill, stroke, 'stroke-width': sw }, g);
    } else if (n.category === 'feat') {
      this._el('polygon', { points: this._polyPts(4, r + 2, -90), fill, stroke, 'stroke-width': sw }, g);
    } else if (n.category === 'spellcasting') {
      this._el('circle', { cx: 0, cy: 0, r, fill, stroke, 'stroke-width': sw }, g);
      this._el('circle', { cx: 0, cy: 0, r: r - 5.5, fill: 'none', stroke, 'stroke-width': 1.3, 'stroke-dasharray': '3 3' }, g);
    } else if (n.category === 'hit_die') {
      const d = `M 0 ${-r} L ${r * 0.88} ${-r * 0.55} L ${r * 0.78} ${r * 0.28} Q 0 ${r * 1.15} 0 ${r * 1.15} Q 0 ${r * 1.15} ${-r * 0.78} ${r * 0.28} L ${-r * 0.88} ${-r * 0.55} Z`;
      this._el('path', { d, fill, stroke, 'stroke-width': sw }, g);
    } else if (n.category === 'proficiency') {
      const s = r * 1.65;
      this._el('rect', { x: -s / 2, y: -s / 2, width: s, height: s, rx: 7, fill, stroke, 'stroke-width': sw }, g);
    } else if (n.category === 'save') {
      this._el('polygon', { points: this._polyPts(6, r + 1, 0), fill, stroke, 'stroke-width': sw }, g);
    } else {
      this._el('circle', { cx: 0, cy: 0, r, fill, stroke, 'stroke-width': sw }, g);
    }

    if (n.role === 'hybrid' && (n.secondaryRoles || []).length >= 2) {
      const ar = r + 5;
      this._el('path', { d: `M 0 ${-ar} A ${ar} ${ar} 0 0 0 0 ${ar}`, fill: 'none', stroke: this._getRoleInfo(n.secondaryRoles[0]).color, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      this._el('path', { d: `M 0 ${-ar} A ${ar} ${ar} 0 0 1 0 ${ar}`, fill: 'none', stroke: this._getRoleInfo(n.secondaryRoles[1]).color, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
    }
  }

  _renderNodes(matchSet) {
    this.refs.nodesLayer.innerHTML = '';
    for (const n of this.webState.data.nodes) {
      const role = this._getRoleInfo(n.role);
      const isSel = this.webState.selectedNodeId === n.id;
      const bEval = this.webState.mode === 'build' ? this._evaluateNodeStatus(n) : null;

      let fill = 'var(--ff5e-node-fill)';
      let stroke = role.color;
      let sw = isSel ? 4 : 2.3;
      let glyphCol = role.color;

      if (this.webState.mode === 'build') {
        if (bEval.status === 'unlocked') {
          fill = role.color;
          stroke = '#ffffff';
          sw = isSel ? 4 : 2.5;
          glyphCol = '#ffffff';
        } else if (bEval.status === 'locked') {
          fill = 'var(--ff5e-node-locked)';
          stroke = 'var(--ff5e-border-strong)';
          glyphCol = 'var(--ff5e-fg-muted)';
        }
      } else if (n.category === 'root') {
        fill = role.color;
        glyphCol = '#ffffff';
      }

      const g = this._el(
        'g',
        {
          class: `ff5e-node${matchSet.has(n.id) ? '' : ' dimmed'}`,
          transform: `translate(${n.x}, ${n.y})`,
        },
        this.refs.nodesLayer
      );

      if (isSel) {
        this._el('circle', { cx: 0, cy: 0, r: this._nodeRadius(n) + 10, fill: 'none', stroke: 'var(--ff5e-accent)', 'stroke-width': 2.8 }, g);
      }
      if (this.webState.mode === 'build' && (bEval.status === 'available' || bEval.canBuyMore)) {
        this._el('circle', { cx: 0, cy: 0, r: this._nodeRadius(n) + 8, class: 'ff5e-available-halo', stroke: role.color }, g);
      }
      if (this.webState.mode === 'edit' && this.webState.linkMode && this.webState.linkSourceId === n.id) {
        this._el('circle', { cx: 0, cy: 0, r: this._nodeRadius(n) + 12, fill: 'none', stroke: 'var(--ff5e-success)', 'stroke-width': 3.5, 'stroke-dasharray': '5 3' }, g);
      }

      this._drawShape(g, n, fill, stroke, sw);

      const gl = this._el('text', { x: 0, y: 0, class: 'ff5e-node-glyph', fill: glyphCol }, g);
      if (n.category === 'root') gl.setAttribute('font-size', '14');
      gl.textContent = this._glyphFor(n);

      const r = this._nodeRadius(n);
      const bx = r * 0.72;
      const by = -r * 0.72;
      const isUnl = this.webState.mode === 'build' && bEval.status === 'unlocked';
      const meta = this._getNodeChoiceMeta(n);
      let badgeLabel = isUnl ? '✓' : meta.isRepeatable ? `${n.cost}×` : `${n.cost}`;
      let wideBadge = false;
      if (isUnl && bEval.isRepeatable && bEval.maxAllowed > 1) {
        const cnt = bEval.selectedIds.length || 1;
        badgeLabel = cnt >= bEval.maxAllowed ? '✓' : `${cnt}/${bEval.maxAllowed}`;
        wideBadge = badgeLabel.length >= 3;
      } else if (!isUnl && meta.isRepeatable) {
        wideBadge = true;
      }

      if (wideBadge) {
        this._el('rect', {
          x: bx - 14,
          y: by - 9.5,
          width: 28,
          height: 19,
          rx: 9.5,
          fill: isUnl ? 'var(--ff5e-success)' : 'var(--ff5e-bg-elevated)',
          stroke: isUnl ? '#ffffff' : stroke,
          'stroke-width': 1.5,
        }, g);
      } else {
        this._el('circle', {
          cx: bx,
          cy: by,
          r: 9.5,
          fill: isUnl ? 'var(--ff5e-success)' : 'var(--ff5e-bg-elevated)',
          stroke: isUnl ? '#ffffff' : stroke,
          'stroke-width': 1.5,
        }, g);
      }
      const ct = this._el('text', { x: bx, y: by, class: 'ff5e-cost-text', fill: isUnl ? '#ffffff' : 'var(--ff5e-fg)' }, g);
      ct.textContent = badgeLabel;

      const lbl = this._el(
        'text',
        { x: 0, y: r + 16, class: `ff5e-node-label${n.category === 'root' ? ' root' : ''}` },
        g
      );
      lbl.textContent = n.name;

      g.addEventListener('mouseenter', () => {
        if (this.webState.hoveredNodeId !== n.id) {
          this.webState.hoveredNodeId = n.id;
          this._renderEdges(matchSet);
        }
      });
      g.addEventListener('mouseleave', () => {
        if (this.webState.hoveredNodeId === n.id) {
          this.webState.hoveredNodeId = null;
          this._renderEdges(matchSet);
        }
      });
      g.addEventListener('pointerdown', (ev) => this._onNodePointerDown(ev, n));
    }
  }

  _renderTempLink() {
    this.refs.tempLinkLayer.innerHTML = '';
    if (!this.webState.linkMode || !this.webState.linkSourceId) return;
    const src = this._getNode(this.webState.linkSourceId);
    if (!src) return;
    this._el('line', {
      x1: src.x,
      y1: src.y,
      x2: this.webState.cursorWorld.x,
      y2: this.webState.cursorWorld.y,
      stroke: 'var(--ff5e-accent)',
      'stroke-width': 2.8,
      'stroke-dasharray': '7 5',
      'pointer-events': 'none',
    }, this.refs.tempLinkLayer);
  }

  _renderCanvas() {
    const matchSet = new Set(
      this.webState.data.nodes.filter((n) => this._isNodeMatching(n)).map((n) => n.id)
    );
    this._renderGuides();
    this._renderEdges(matchSet);
    this._renderNodes(matchSet);
    this._renderTempLink();
    this.refs.treeCounts.textContent = `${this.webState.data.nodes.length} · ${this.webState.data.edges.length}`;
  }

  // =========================================================================
  // POINTER / KEYBOARD HANDLERS
  // =========================================================================
  _onNodePointerDown(ev, node) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (this.webState.mode === 'edit' && game.user.isGM && this.webState.linkMode) {
      this._handleLinkClick(node);
      return;
    }
    const w = this._screenToWorld(ev.clientX, ev.clientY);
    this._activeDrag = {
      type: this.webState.mode === 'edit' && game.user.isGM ? 'node' : 'click',
      node,
      startX: ev.clientX,
      startY: ev.clientY,
      offX: node.x - w.x,
      offY: node.y - w.y,
      moved: false,
      undoPushed: false,
    };
  }

  _handleLinkClick(node) {
    if (!this.webState.linkSourceId) {
      this.webState.linkSourceId = node.id;
      this._setStatusBanner(t('Notifications.LinkFromPrompt', { name: node.name }));
      this._renderCanvas();
      return;
    }
    if (this.webState.linkSourceId === node.id) {
      this.webState.linkSourceId = null;
      this._setStatusBanner(t('Notifications.LinkModePrompt'));
      this._renderCanvas();
      return;
    }
    if (this.webState.data.edges.some((e) => e.from === this.webState.linkSourceId && e.to === node.id)) {
      ui.notifications.warn(t('Notifications.LinkExists'));
      this.webState.linkSourceId = null;
      this._renderCanvas();
      return;
    }
    if (this._wouldCreateCycle(this.webState.linkSourceId, node.id)) {
      ui.notifications.warn(t('Notifications.CycleBlocked'));
      this.webState.linkSourceId = null;
      this._renderCanvas();
      return;
    }
    const src = this._getNode(this.webState.linkSourceId);
    this._pushUndo();
    this.webState.data.edges.push({
      id: `edge_${this.webState.linkSourceId}__${node.id}_${Date.now()}`,
      from: this.webState.linkSourceId,
      to: node.id,
    });
    this._scheduleWorldSave();
    ui.notifications.info(t('Notifications.Connected', { from: src.name, to: node.name }));
    this.webState.linkSourceId = null;
    this._setStatusBanner(t('Notifications.LinkModePrompt'));
    this._renderAll();
  }

  _onPointerMove(ev) {
    if (this.webState.linkMode && this.webState.linkSourceId) {
      this.webState.cursorWorld = this._screenToWorld(ev.clientX, ev.clientY);
      this._renderTempLink();
    }
    if (!this._activeDrag) return;
    const dx = ev.clientX - this._activeDrag.startX;
    const dy = ev.clientY - this._activeDrag.startY;
    if (!this._activeDrag.moved && Math.hypot(dx, dy) > 4) this._activeDrag.moved = true;
    if (!this._activeDrag.moved) return;

    if (this._activeDrag.type === 'pan') {
      const rect = this.refs.svg.getBoundingClientRect();
      const vb = this.refs.svg.viewBox.baseVal;
      this.webState.view.tx = this._activeDrag.origTx + (dx / rect.width) * vb.width;
      this.webState.view.ty = this._activeDrag.origTy + (dy / rect.height) * vb.height;
      this._applyViewport();
    } else if (this._activeDrag.type === 'node') {
      if (!this._activeDrag.undoPushed) {
        this._pushUndo();
        this._activeDrag.undoPushed = true;
      }
      const p = this._screenToWorld(ev.clientX, ev.clientY);
      this._activeDrag.node.x = Math.round(p.x + this._activeDrag.offX);
      this._activeDrag.node.y = Math.round(p.y + this._activeDrag.offY);
      this._renderCanvas();
    }
  }

  _onPointerUp() {
    if (!this._activeDrag) return;
    const d = this._activeDrag;
    this._activeDrag = null;
    this.refs.svg.classList.remove('panning');

    if (d.type === 'node' && d.moved) {
      this._scheduleWorldSave();
      this._renderInspector();
      return;
    }
    if ((d.type === 'node' || d.type === 'click') && !d.moved) {
      this.webState.selectedNodeId = d.node.id;
      if (this.webState.mode === 'build') {
        this._toggleBuildNode(d.node.id);
      } else {
        this._renderAll();
      }
    }
  }

  _onKeyDown(ev) {
    if (!this.element?.contains(document.activeElement) && document.activeElement !== document.body) {
      return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && this.webState.mode === 'edit') {
      ev.preventDefault();
      if (ev.shiftKey) this._performRedo();
      else this._performUndo();
    } else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'y' && this.webState.mode === 'edit') {
      ev.preventDefault();
      this._performRedo();
    } else if (ev.key === 'Escape' && this.webState.linkMode) {
      this._toggleLinkMode(false);
    }
  }

  // =========================================================================
  // HUD & DRAWER RENDERERS
  // =========================================================================
  _renderRolePills() {
    this.refs.rolePills.innerHTML = '';
    const mk = (label, active, dotColor, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ff5e-role-pill${active ? ' active' : ''}`;
      b.innerHTML = `${dotColor ? `<span class="ff5e-role-dot" style="background:${dotColor}"></span>` : ''}${esc(label)}`;
      b.addEventListener('click', onClick);
      this.refs.rolePills.appendChild(b);
    };

    mk(t('Roles.All'), this.webState.filterRole === 'all', null, () => {
      this.webState.filterRole = 'all';
      this._renderRolePills();
      this._renderCanvas();
      this._fitToNodes();
    });

    for (const rid of ALL_ROLES_ORDER) {
      const r = this._getRoleInfo(rid);
      mk(t(`Roles.${rid}`), this.webState.filterRole === rid, r.color, () => {
        this.webState.filterRole = this.webState.filterRole === rid ? 'all' : rid;
        this._renderRolePills();
        this._renderCanvas();
        if (this.webState.filterRole === 'all') this._fitToNodes();
        else {
          const subset = this.webState.data.nodes.filter(
            (n) => n.role === rid || (n.secondaryRoles || []).includes(rid)
          );
          this._fitToNodes(subset, 190);
        }
      });
    }
  }

  _setStatusBanner(msg = '') {
    this.refs.hudStatusText.textContent = msg;
    this.refs.hudStatus.classList.toggle('visible', Boolean(msg));
  }

  _toggleLinkMode(forceState = null) {
    if (!game.user.isGM) return;
    this.webState.linkMode = forceState !== null ? forceState : !this.webState.linkMode;
    this.webState.linkSourceId = null;
    this.refs.btnLinkMode?.classList.toggle('active', this.webState.linkMode);
    this.refs.svg.classList.toggle('linking', this.webState.linkMode);
    this._setStatusBanner(this.webState.linkMode ? t('Notifications.LinkModePrompt') : '');
    this._renderCanvas();
  }

  _updateUndoButtons() {
    if (this.refs.btnUndo) this.refs.btnUndo.disabled = this.webState.undoStack.length === 0;
    if (this.refs.btnRedo) this.refs.btnRedo.disabled = this.webState.redoStack.length === 0;
  }

  _setMode(mode) {
    if (mode === 'edit' && !game.user.isGM) {
      ui.notifications.warn(t('Labels.GmOnlyEdit'));
      mode = 'inspect';
    }
    this.webState.mode = mode;
    if (mode !== 'edit') this._toggleLinkMode(false);
    this.element.querySelectorAll('.ff5e-mode-btn').forEach((b) => {
      const act = b.dataset.mode === mode;
      b.classList.toggle('active', act);
      b.setAttribute('aria-selected', String(act));
    });
    if (this.refs.editTools) {
      this.refs.editTools.style.display = mode === 'edit' ? 'flex' : 'none';
    }
    this._renderAll();
  }

  _renderInspector() {
    this.refs.buildSubtabs.style.display = this.webState.mode === 'build' ? 'flex' : 'none';
    this.refs.buildSubtabs.querySelectorAll('.ff5e-subtab').forEach((b) => {
      b.classList.toggle('active', b.dataset.btab === this.webState.buildSubTab);
    });

    if (this.webState.mode === 'inspect') this._renderInspectPanel();
    else if (this.webState.mode === 'build') {
      if (this.webState.buildSubTab === 'sheet') this._renderBuildSheetPanel();
      else this._renderBuildNodePanel();
    } else {
      this._renderEditPanel();
    }
  }

  _renderDetailsCards(node, showBuild = false) {
    const role = this._getRoleInfo(node.role);
    const parents = this._getParents(node.id).map((id) => this._getNode(id)).filter(Boolean);
    const children = this._getChildren(node.id).map((id) => this._getNode(id)).filter(Boolean);
    const minLv = this.webState.data.meta.tierMinLevels[node.tier] ?? 1;
    const choiceMeta = this._getNodeChoiceMeta(node);
    const selectedChoiceIds = this._getSelectedChoiceIds(node.id);
    const choiceById = new Map(choiceMeta.choices.map((c) => [c.id, c]));

    const grants = [];
    if (node.grants?.hitDie) grants.push(`Hit Die d${node.grants.hitDie}`);
    if (node.grants?.spellTier) grants.push(SPELL_TIER_LABELS[node.grants.spellTier]);
    (node.grants?.saves || []).forEach((s) => grants.push(`${s} Save`));
    (node.grants?.skills || []).forEach((s) => grants.push(`Skill: ${s}`));
    (node.grants?.proficiencies || []).forEach((p) => grants.push(p));
    (node.grants?.tags || []).forEach((tg) => grants.push(tg));

    let buildHtml = '';
    if (showBuild) {
      const ev = this._evaluateNodeStatus(node);
      const blockers = ev.status === 'unlocked' ? this._getBlockingChildren(node.id) : [];
      if (ev.status === 'unlocked') {
        const purchases = Math.max(1, selectedChoiceIds.length);
        const totalCost = node.cost * purchases;
        const countTag = choiceMeta.hasChoices
          ? ` · ${selectedChoiceIds.length}/${choiceMeta.maxAllowed}`
          : '';
        buildHtml = `
          <div class="ff5e-callout unlocked">
            <strong>${t('Labels.Unlocked')}</strong>${countTag} · ${totalCost} SP
            ${blockers.length ? `<div style="margin-top:4px;opacity:0.8">${t('Labels.RequiredBy')}: ${blockers.map((b) => esc(b.name)).join(', ')}</div>` : ''}
            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
              ${
                ev.canBuyMore
                  ? `<button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-primary" data-act="add-another-choice">${t('Actions.AddAnotherOption')} (-${node.cost} SP)</button>`
                  : ''
              }
              ${
                blockers.length
                  ? `<button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-danger" data-act="refund-branch">${t('Actions.RefundBranch')} (${blockers.length + 1}+)</button>`
                  : `<button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-danger" data-act="refund-node">${t('Actions.Refund')} (+${totalCost} SP)</button>`
              }
            </div>
          </div>`;
      } else if (ev.status === 'available') {
        const actionLbl = choiceMeta.hasChoices ? t('Actions.ChooseOption') : t('Actions.Unlock');
        buildHtml = `
          <div class="ff5e-callout">
            <strong>${t('Labels.Available')}</strong> · ${node.cost} SP (${this._getRemainingSP()} ${t('Labels.Remaining')})
            <div style="margin-top:8px;">
              <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-primary" data-act="toggle-unlock">${actionLbl} (-${node.cost} SP)</button>
            </div>
          </div>`;
      } else {
        buildHtml = `
          <div class="ff5e-callout locked">
            <strong>${t('Labels.Locked')}</strong>
            <ul style="margin:5px 0 0 16px;padding:0;">
              ${ev.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}
            </ul>
          </div>`;
      }
    }

    let choicesCardHtml = '';
    if (choiceMeta.hasChoices) {
      if (showBuild && selectedChoiceIds.length > 0) {
        choicesCardHtml = `
          <div class="ff5e-card">
            <div class="ff5e-card-title">
              <span>${t('Labels.ChosenOptions')} (${selectedChoiceIds.length}/${choiceMeta.maxAllowed})</span>
              ${choiceMeta.isRepeatable ? `<span class="ff5e-badge">${t('Labels.Repeatable')}</span>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${selectedChoiceIds
                .map((cid) => {
                  const ch = choiceById.get(cid);
                  return `<div class="ff5e-chosen-row">
                    <div>
                      <strong>${esc(ch?.name || cid)}</strong>
                      ${ch?.description ? `<div style="font-size:11.5px;color:var(--ff5e-fg-secondary);margin-top:2px;">${esc(ch.description)}</div>` : ''}
                    </div>
                    <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-danger" data-refund-choice="${esc(cid)}" title="${t('Actions.Refund')}">&times;</button>
                  </div>`;
                })
                .join('')}
            </div>
          </div>`;
      } else {
        choicesCardHtml = `
          <div class="ff5e-card">
            <div class="ff5e-card-title">
              <span>${t('Labels.AvailableOptions')} (${choiceMeta.choices.length})</span>
              ${choiceMeta.isRepeatable ? `<span class="ff5e-badge">×${choiceMeta.maxAllowed}</span>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              ${choiceMeta.choices
                .map(
                  (ch) => `<div style="font-size:12px;line-height:1.4;">
                    <strong>${esc(ch.name)}</strong>${ch.description ? `<span style="color:var(--ff5e-fg-secondary);"> — ${esc(ch.description)}</span>` : ''}
                  </div>`
                )
                .join('')}
            </div>
          </div>`;
      }
    }

    return `
      <div class="ff5e-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span class="ff5e-badge" style="color:${role.color};border-color:${role.color}">${esc(t(`Roles.${node.role}`))}</span>
          <span class="ff5e-badge">Tier ${TIER_ROMAN[node.tier]} · Lv ${minLv}+ · ${node.cost} SP${choiceMeta.isRepeatable ? ' ×' : ''}</span>
        </div>
        <h3 class="ff5e-node-title">${esc(node.name)}</h3>
        <div class="ff5e-badge-row">
          <span class="ff5e-badge">${esc(t(`Categories.${node.category}`))}</span>
          <span class="ff5e-badge">${esc(node.source5e)}</span>
          ${(node.secondaryRoles || [])
            .map((sr) => `<span class="ff5e-badge" style="color:${this._getRoleInfo(sr).color};border-color:${this._getRoleInfo(sr).color}">${esc(t(`Roles.${sr}`))}</span>`)
            .join('')}
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:var(--ff5e-fg-secondary);line-height:1.45;">${esc(node.summary)}</p>
      </div>
      ${buildHtml}
      ${choicesCardHtml}
      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.RulesMechanics')}</div>
        <p style="margin:0;font-size:12.5px;line-height:1.5;">${esc(node.mechanics)}</p>
      </div>
      ${
        grants.length
          ? `<div class="ff5e-card">
              <div class="ff5e-card-title">${t('Labels.StructuredGrants')}</div>
              <div class="ff5e-badge-row" style="margin-top:0;">${grants.map((g) => `<span class="ff5e-badge">${esc(g)}</span>`).join('')}</div>
            </div>`
          : ''
      }
      ${(() => {
        const activeFx = [...(node.effects || [])];
        if (choiceMeta.hasChoices) {
          const srcChoices =
            showBuild && selectedChoiceIds.length > 0
              ? selectedChoiceIds.map((cid) => choiceById.get(cid)).filter(Boolean)
              : choiceMeta.choices;
          for (const ch of srcChoices) {
            for (const fx of ch.effects || []) {
              activeFx.push({ ...fx, _choiceName: ch.name });
            }
          }
        }
        if (!activeFx.length) return '';
        return `<div class="ff5e-card">
          <div class="ff5e-card-title">${t('Labels.PassiveEffects')} (${activeFx.length})</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${activeFx
              .map((fx) => {
                const prefix = fx._choiceName ? `<strong>${esc(fx._choiceName)}:</strong> ` : '';
                const summary = fx.label ? esc(fx.label) : `${esc(fx.type || 'add')} ${esc(fx.value)}`;
                return `<div style="font-size:11.5px;line-height:1.35;">
                  ${prefix}${summary}
                  <div style="font-family:ui-monospace,monospace;font-size:10.5px;color:var(--ff5e-fg-muted);">${esc(fx.key)} (${esc(fx.type || 'add')}: ${esc(fx.value)})</div>
                </div>`;
              })
              .join('')}
          </div>
        </div>`;
      })()}
      <div class="ff5e-card">
        <div class="ff5e-card-title">
          <span>${t('Labels.Prerequisites')} (${parents.length})</span>
          <span style="text-transform:none;font-weight:500;">${parents.length > 1 ? (node.prereqMode === 'any' ? t('Labels.RequiresAny') : t('Labels.RequiresAll')) : ''}</span>
        </div>
        ${
          parents.length
            ? `<div class="ff5e-badge-row" style="margin-top:0;">${parents
                .map((p) => `<button type="button" class="ff5e-chip" data-jump="${p.id}"><span class="ff5e-role-dot" style="background:${this._getRoleInfo(p.role).color}"></span>${esc(p.name)}</button>`)
                .join('')}</div>`
            : `<div style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.RootGateway')}</div>`
        }
      </div>
      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.Unlocks')} (${children.length})</div>
        ${
          children.length
            ? `<div class="ff5e-badge-row" style="margin-top:0;">${children
                .map((c) => `<button type="button" class="ff5e-chip" data-jump="${c.id}"><span class="ff5e-role-dot" style="background:${this._getRoleInfo(c.role).color}"></span>${esc(c.name)}</button>`)
                .join('')}</div>`
            : `<div style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.LeafNode')}</div>`
        }
      </div>
    `;
  }

  _wireJumps() {
    this.refs.inspector.querySelectorAll('[data-jump]').forEach((b) => {
      b.addEventListener('click', () => {
        this.webState.selectedNodeId = b.dataset.jump;
        this._panToNode(this.webState.selectedNodeId, Math.max(1.25, this.webState.view.scale));
        this._renderAll();
      });
    });
  }

  _renderInspectPanel() {
    const n = this._getNode(this.webState.selectedNodeId);
    if (!n) {
      this.refs.inspector.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ff5e-fg-muted);">${t('Labels.NoMatches')}</div>`;
      return;
    }
    this.refs.inspector.innerHTML = `
      ${this._renderDetailsCards(n)}
      <div style="display:flex;gap:8px;">
        <button type="button" class="ff5e-btn ff5e-btn-primary" style="flex:1" data-act="go-build">${t('Actions.TestBuild')}</button>
        ${game.user.isGM ? `<button type="button" class="ff5e-btn" style="flex:1" data-act="go-edit">${t('Actions.EditNode')}</button>` : ''}
      </div>
    `;
    this._wireJumps();
    this.refs.inspector.querySelector('[data-act="go-build"]')?.addEventListener('click', () => this._setMode('build'));
    this.refs.inspector.querySelector('[data-act="go-edit"]')?.addEventListener('click', () => this._setMode('edit'));
  }

  _renderBuildNodePanel() {
    const n = this._getNode(this.webState.selectedNodeId);
    if (!n) return;
    this.refs.inspector.innerHTML = this._renderDetailsCards(n, true);
    this._wireJumps();
    this.refs.inspector.querySelector('[data-act="toggle-unlock"]')?.addEventListener('click', () => this._toggleBuildNode(n.id, false));
    this.refs.inspector.querySelector('[data-act="add-another-choice"]')?.addEventListener('click', () => this._purchaseNodeChoice(n));
    this.refs.inspector.querySelector('[data-act="refund-node"]')?.addEventListener('click', () => this._toggleBuildNode(n.id, false, { forceRefund: true }));
    this.refs.inspector.querySelector('[data-act="refund-branch"]')?.addEventListener('click', () => this._toggleBuildNode(n.id, true, { forceRefund: true }));
    this.refs.inspector.querySelectorAll('[data-refund-choice]').forEach((btn) => {
      btn.addEventListener('click', () => this._refundNodeChoice(n.id, btn.dataset.refundChoice));
    });
  }

  _renderBuildSheetPanel() {
    const c = this._computeSummary();
    const pct = Math.min(100, Math.round((c.spentSP / Math.max(1, c.totalSP)) * 100));
    const autoSync = Boolean(game.settings.get(MODULE_ID, 'autoSync'));
    const ownedChars = game.actors.filter((a) => a.type === 'character' && (game.user.isGM || a.isOwner));

    this.refs.inspector.innerHTML = `
      <div class="ff5e-card">
        <div class="ff5e-card-title">
          <span>${t('Labels.LinkedActor')}</span>
          <span class="ff5e-badge">${autoSync ? t('Labels.AutoSyncOn') : t('Labels.AutoSyncOff')}</span>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <select class="ff5e-select" data-act="actor-select" style="flex:1">
            <option value="">${t('Labels.SandboxActor')}</option>
            ${ownedChars
              .map((a) => `<option value="${a.id}" ${this.actor?.id === a.id ? 'selected' : ''}>${esc(a.name)} (Lv ${getActorLevel(a)})</option>`)
              .join('')}
          </select>
          ${this.actor ? `<button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-primary" data-act="sync-now" title="${t('Actions.SyncActor')}"><i class="fa-solid fa-rotate"></i></button>` : ''}
        </div>

        ${
          this.actor
            ? `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
                <span>${t('Labels.Level')} <strong>${c.level}</strong> · ${t('Labels.ConMod')} <strong>${c.conMod >= 0 ? '+' : ''}${c.conMod}</strong></span>
                <span class="ff5e-badge">${t('Labels.ProfBonus')} +${c.profBonus}</span>
              </div>`
            : `<div class="ff5e-form-grid" style="margin-bottom:8px;">
                <div class="ff5e-field">
                  <label>${t('Labels.Level')} (${c.level})</label>
                  <input type="range" min="1" max="20" value="${c.level}" data-act="sb-level" />
                </div>
                <div class="ff5e-field">
                  <label>${t('Labels.ConMod')} (${c.conMod >= 0 ? '+' : ''}${c.conMod})</label>
                  <input type="range" min="-1" max="5" value="${c.conMod}" data-act="sb-con" />
                </div>
              </div>`
        }

        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;">
          <span>${t('Labels.SkillPoints')}: ${c.spentSP} / ${c.totalSP}</span>
          <span style="color:${c.remainingSP < 0 ? 'var(--ff5e-danger)' : 'var(--ff5e-success)'}">${c.remainingSP} ${t('Labels.Remaining')}</span>
        </div>
        <div class="ff5e-sp-track"><div class="ff5e-sp-fill" style="width:${pct}%"></div></div>

        <div style="display:flex;gap:6px;margin-top:9px;">
          <select class="ff5e-select" data-act="preset-select" style="flex:1">
            <option value="">${t('Labels.ChoosePreset')}</option>
            ${(this.webState.data.presets || []).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
          <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-danger" data-act="reset-build">${t('Actions.ResetBuild')}</button>
        </div>
      </div>

      <div class="ff5e-stat-grid">
        <div class="ff5e-stat-tile">
          <div style="font-size:10.5px;color:var(--ff5e-fg-muted);text-transform:uppercase;">${t('Labels.HitDieHp')}</div>
          <div style="font-family:ui-monospace,monospace;font-size:15px;font-weight:700;margin-top:2px;">d${c.hitDie} · ${c.avgHp} HP</div>
        </div>
        <div class="ff5e-stat-tile">
          <div style="font-size:10.5px;color:var(--ff5e-fg-muted);text-transform:uppercase;">${t('Labels.Spellcasting')}</div>
          <div style="font-family:ui-monospace,monospace;font-size:13px;font-weight:700;margin-top:4px;">${c.spellTier ? `Tier ${TIER_ROMAN[c.spellTier]}` : t('Labels.None')}</div>
        </div>
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.SavingThrows')}</div>
        <div class="ff5e-saves-grid">
          ${ALL_SAVES.map((s) => `<div class="ff5e-save-pill${c.saves.has(s) ? ' proficient' : ''}">${s}</div>`).join('')}
        </div>
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.Skills')} (${c.skills.length} / 18)</div>
        ${c.skills.length ? `<div class="ff5e-badge-row" style="margin-top:0;">${c.skills.map((s) => `<span class="ff5e-badge">${esc(s)}</span>`).join('')}</div>` : `<div style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.None')}</div>`}
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.Proficiencies')} (${c.proficiencies.length})</div>
        ${c.proficiencies.length ? `<div class="ff5e-badge-row" style="margin-top:0;">${c.proficiencies.map((p) => `<span class="ff5e-badge">${esc(p)}</span>`).join('')}</div>` : `<div style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.None')}</div>`}
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.UnlockedFeatures')} (${c.features.length + c.feats.length})</div>
        ${
          c.features.length + c.feats.length
            ? `<div class="ff5e-badge-row" style="margin-top:0;">${[...c.features, ...c.feats]
                .map((f) => `<button type="button" class="ff5e-chip" data-jump="${f.id}"><span class="ff5e-role-dot" style="background:${this._getRoleInfo(f.role).color}"></span>${esc(f.name)}</button>`)
                .join('')}</div>`
            : `<div style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.None')}</div>`
        }
      </div>

      <div style="display:flex;gap:6px;">
        ${this.actor ? `<button type="button" class="ff5e-btn ff5e-btn-primary" style="flex:1" data-act="sync-now">${t('Actions.SyncActor')}</button>` : ''}
        <button type="button" class="ff5e-btn" style="flex:1" data-act="export-md">${t('Actions.ExportSheet')}</button>
      </div>
    `;

    this._wireJumps();

    this.refs.inspector.querySelector('[data-act="actor-select"]')?.addEventListener('change', (ev) => {
      const aid = ev.target.value;
      this.actor = aid ? game.actors.get(aid) || null : null;
      this.webState.unlocked = new Set(this.actor ? getActorUnlockedIds(this.actor) : []);
      this.webState.choices = this.actor ? getActorNodeChoices(this.actor) : {};
      this._renderAll();
    });

    this.refs.inspector.querySelector('[data-act="sb-level"]')?.addEventListener('input', (ev) => {
      this.webState.sandboxLevel = Number(ev.target.value);
      this._renderAll();
    });
    this.refs.inspector.querySelector('[data-act="sb-con"]')?.addEventListener('input', (ev) => {
      this.webState.sandboxConMod = Number(ev.target.value);
      this._renderInspector();
    });

    this.refs.inspector.querySelectorAll('[data-act="sync-now"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!this.actor) {
          ui.notifications.warn(t('Notifications.SyncNoActor'));
          return;
        }
        await syncActorFromSkillWeb(this.actor, this.webState.data, Array.from(this.webState.unlocked), {
          choices: structuredClone(this.webState.choices || {}),
        });
        ui.notifications.info(
          t('Notifications.Synced', { count: this.webState.unlocked.size, actor: this.actor.name })
        );
      });
    });

    this.refs.inspector.querySelector('[data-act="preset-select"]')?.addEventListener('change', async (ev) => {
      const p = (this.webState.data.presets || []).find((x) => x.id === ev.target.value);
      if (!p) return;
      if (!this.actor) this.webState.sandboxLevel = p.level;
      this.webState.unlocked = new Set(p.unlocked.filter((id) => Boolean(this._getNode(id))));
      this.webState.choices = structuredClone(p.choices || {});
      await this._persistBuildAndMaybeSync();
      this._renderAll();
      ui.notifications.info(t('Notifications.PresetLoaded', { name: p.name }));
    });

    this.refs.inspector.querySelector('[data-act="reset-build"]')?.addEventListener('click', async () => {
      const canReset = game.user.isGM || Boolean(game.settings.get(MODULE_ID, 'allowPlayerReset'));
      if (!canReset) {
        ui.notifications.warn(t('Notifications.RefundDisabled'));
        return;
      }
      this.webState.unlocked.clear();
      this.webState.choices = {};
      await this._persistBuildAndMaybeSync();
      this._renderAll();
      ui.notifications.info(t('Notifications.BuildReset'));
    });

    this.refs.inspector.querySelector('[data-act="export-md"]')?.addEventListener('click', () => {
      const name = this.actor ? this.actor.name : `Sandbox Lv ${c.level}`;
      const md = [
        `# Fivefold 5e — ${name} (Level ${c.level})`,
        '',
        `- **Hit Die:** d${c.hitDie} (Avg HP: ${c.avgHp})`,
        `- **Proficiency Bonus:** +${c.profBonus}`,
        `- **Skill Points:** ${c.spentSP} / ${c.totalSP}`,
        `- **Spellcasting:** ${SPELL_TIER_LABELS[c.spellTier]}`,
        `- **Saves:** ${ALL_SAVES.filter((s) => c.saves.has(s)).join(', ') || 'None'}`,
        `- **Skills:** ${c.skills.join(', ') || 'None'}`,
        `- **Proficiencies:** ${c.proficiencies.join(', ') || 'None'}`,
        '',
        '## Features & Feats',
        ...[...c.features, ...c.feats].map((f) => `- **${f.name}** (*${f.source5e}*): ${f.summary}`),
      ].join('\n');
      this._downloadText(`fivefold5e-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`, md, 'text/markdown');
      ui.notifications.info(t('Notifications.ExportedSheet'));
    });
  }

  // =========================================================================
  // GM EDIT PANEL & GRAPH MUTATIONS
  // =========================================================================
  _createNewNode({ x, y, parentId = null } = {}) {
    if (!game.user.isGM) return;
    this._pushUndo();
    const parent = parentId ? this._getNode(parentId) : null;
    let nx = x;
    let ny = y;
    if (nx === undefined || ny === undefined) {
      if (parent) {
        const ang = Math.atan2(parent.y, parent.x) + 0.08;
        const r = Math.hypot(parent.x, parent.y) + 175;
        nx = Math.round(Math.cos(ang) * r);
        ny = Math.round(Math.sin(ang) * r);
      } else {
        nx = 0;
        ny = 0;
      }
    }
    const id = `custom_${Date.now().toString(36)}`;
    const tier = parent ? Math.min(4, parent.tier + 1) : 1;
    this.webState.data.nodes.push({
      id,
      name: 'New Feature',
      role: parent ? parent.role : 'combat',
      secondaryRoles: parent?.role === 'hybrid' ? ['combat', 'magic'] : [],
      category: 'class_feature',
      tier,
      cost: Math.max(1, tier),
      prereqMode: 'all',
      x: nx,
      y: ny,
      source5e: 'Homebrew / Custom',
      compendiumUuid: '',
      repeatable: false,
      maxChoices: 0,
      choices: [],
      effects: [],
      summary: 'Short summary of what this node grants.',
      mechanics: 'Full 5e mechanics and scaling.',
      grants: { hitDie: null, saves: [], skills: [], proficiencies: [], spellTier: 0, tags: [] },
    });
    if (parent) {
      this.webState.data.edges.push({ id: `edge_${parent.id}__${id}`, from: parent.id, to: id });
    }
    this.webState.selectedNodeId = id;
    this._scheduleWorldSave();
    this._renderAll();
    this._panToNode(id, Math.max(1.1, this.webState.view.scale));
    ui.notifications.info(
      parent ? t('Notifications.ChildCreated', { parent: parent.name }) : t('Notifications.NodeCreated')
    );
  }

  _renderEditPanel() {
    if (!game.user.isGM) {
      this.refs.inspector.innerHTML = `<div class="ff5e-card">${t('Labels.GmOnlyEdit')}</div>`;
      return;
    }
    const n = this._getNode(this.webState.selectedNodeId);
    if (!n) {
      this.refs.inspector.innerHTML = `
        <div class="ff5e-card">
          <p style="margin:0 0 8px;font-size:12px;">${t('Labels.EditHint')}</p>
          <div style="display:flex;gap:6px;">
            <button type="button" class="ff5e-btn ff5e-btn-primary" style="flex:1" data-act="add-root">${t('Actions.AddNode')}</button>
            <button type="button" class="ff5e-btn ff5e-btn-danger" data-act="reset-srd">${t('Actions.ResetSRD')}</button>
          </div>
        </div>`;
      this.refs.inspector.querySelector('[data-act="add-root"]')?.addEventListener('click', () => this._createNewNode({ x: 0, y: 0 }));
      this.refs.inspector.querySelector('[data-act="reset-srd"]')?.addEventListener('click', () => this._resetDefaultSRD());
      return;
    }

    const parents = this._getParents(n.id).map((id) => this._getNode(id)).filter(Boolean);
    const children = this._getChildren(n.id).map((id) => this._getNode(id)).filter(Boolean);
    const pSet = new Set(parents.map((p) => p.id));
    const cands = this.webState.data.nodes
      .filter((c) => c.id !== n.id && !pSet.has(c.id) && !this._wouldCreateCycle(c.id, n.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.refs.inspector.innerHTML = `
      <div class="ff5e-card">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-primary" style="flex:1" data-act="add-child">${t('Actions.AddChild')}</button>
          <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-danger" data-act="del-node">${t('Actions.Delete')}</button>
          <button type="button" class="ff5e-btn ff5e-btn-sm" data-act="reset-srd">${t('Actions.ResetSRD')}</button>
        </div>
        <div style="font-size:11px;color:var(--ff5e-fg-muted);margin-top:6px;">${t('Labels.EditHint')}</div>
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.NodeProperties')}</div>
        <div class="ff5e-form-grid">
          <div class="ff5e-field full">
            <label>${t('Labels.Name')}</label>
            <input class="ff5e-input" data-ed="name" value="${esc(n.name)}" />
          </div>
          <div class="ff5e-field">
            <label>${t('Labels.PrimaryRole')}</label>
            <select class="ff5e-select" data-ed="role">
              ${ALL_ROLES_ORDER.map((r) => `<option value="${r}" ${n.role === r ? 'selected' : ''}>${esc(t(`Roles.${r}`))}</option>`).join('')}
            </select>
          </div>
          <div class="ff5e-field">
            <label>${t('Labels.Category')}</label>
            <select class="ff5e-select" data-ed="category">
              ${Object.keys(this.webState.data.categories).map((c) => `<option value="${c}" ${n.category === c ? 'selected' : ''}>${esc(t(`Categories.${c}`))}</option>`).join('')}
            </select>
          </div>
          <div class="ff5e-field">
            <label>${t('Labels.Tier')}</label>
            <select class="ff5e-select" data-ed="tier">
              ${[0, 1, 2, 3, 4].map((ti) => `<option value="${ti}" ${n.tier === ti ? 'selected' : ''}>${esc(t(`Tiers.${ti}`))}</option>`).join('')}
            </select>
          </div>
          <div class="ff5e-field">
            <label>${t('Labels.SpCost')}</label>
            <input class="ff5e-input" type="number" min="0" max="20" data-ed="cost" value="${n.cost}" />
          </div>
          <div class="ff5e-field">
            <label>${t('Labels.PrereqMode')}</label>
            <select class="ff5e-select" data-ed="prereqMode">
              <option value="all" ${n.prereqMode !== 'any' ? 'selected' : ''}>${t('Labels.AllParents')}</option>
              <option value="any" ${n.prereqMode === 'any' ? 'selected' : ''}>${t('Labels.AnyParent')}</option>
            </select>
          </div>
          <div class="ff5e-field">
            <label>${t('Labels.Source5e')}</label>
            <input class="ff5e-input" data-ed="source5e" value="${esc(n.source5e)}" />
          </div>
          ${
            n.role === 'hybrid'
              ? `<div class="ff5e-field full">
                  <label>${t('Labels.HybridRoles')}</label>
                  <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${['combat', 'devotion', 'magic', 'social', 'exploring']
                      .map((r) => `<label class="ff5e-check-pill"><input type="checkbox" data-sr="${r}" ${(n.secondaryRoles || []).includes(r) ? 'checked' : ''} />${esc(t(`Roles.${r}`))}</label>`)
                      .join('')}
                  </div>
                </div>`
              : ''
          }
          <div class="ff5e-field full">
            <label>${t('Labels.CompendiumUuid')}</label>
            <input class="ff5e-input ff5e-dropzone" data-ed="compendiumUuid" value="${esc(n.compendiumUuid || '')}" placeholder="Compendium.dnd5e.classfeatures.Item.xxx" />
          </div>
          <div class="ff5e-field full">
            <label>${t('Labels.Summary')}</label>
            <input class="ff5e-input" data-ed="summary" value="${esc(n.summary)}" />
          </div>
          <div class="ff5e-field full">
            <label>${t('Labels.Mechanics')}</label>
            <textarea class="ff5e-textarea" data-ed="mechanics">${esc(n.mechanics)}</textarea>
          </div>
        </div>
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.StructuredGrants')}</div>
        <div class="ff5e-form-grid">
          <div class="ff5e-field">
            <label>${t('Labels.HitDieUpgrade')}</label>
            <select class="ff5e-select" data-grant="hitDie">
              <option value="" ${!n.grants?.hitDie ? 'selected' : ''}>${t('Labels.None')}</option>
              <option value="8" ${n.grants?.hitDie === 8 ? 'selected' : ''}>d8</option>
              <option value="10" ${n.grants?.hitDie === 10 ? 'selected' : ''}>d10</option>
              <option value="12" ${n.grants?.hitDie === 12 ? 'selected' : ''}>d12</option>
            </select>
          </div>
          <div class="ff5e-field">
            <label>${t('Labels.SpellTier')}</label>
            <select class="ff5e-select" data-grant="spellTier">
              ${SPELL_TIER_LABELS.map((l, i) => `<option value="${i}" ${(n.grants?.spellTier || 0) === i ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
          </div>
          <div class="ff5e-field full">
            <label>${t('Labels.SavingThrows')}</label>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">
              ${ALL_SAVES.map((s) => `<label class="ff5e-check-pill"><input type="checkbox" data-gs="${s}" ${(n.grants?.saves || []).includes(s) ? 'checked' : ''} />${s}</label>`).join('')}
            </div>
          </div>
          <div class="ff5e-field full">
            <label>${t('Labels.SkillsCsv')}</label>
            <input class="ff5e-input" data-grant="skills" value="${esc((n.grants?.skills || []).join(', '))}" />
          </div>
          <div class="ff5e-field full">
            <label>${t('Labels.ProfsCsv')}</label>
            <input class="ff5e-input" data-grant="proficiencies" value="${esc((n.grants?.proficiencies || []).join(', '))}" />
          </div>
          <div class="ff5e-field full">
            <label>${t('Labels.TagsCsv')}</label>
            <input class="ff5e-input" data-grant="tags" value="${esc((n.grants?.tags || []).join(', '))}" />
          </div>
        </div>
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">
          <span>${t('Labels.ChoicesSection')} (${(n.choices || []).length})</span>
          <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-primary" data-act="add-choice-opt">${t('Actions.AddChoice')}</button>
        </div>
        <div class="ff5e-form-grid" style="margin-bottom:8px;">
          <div class="ff5e-field full">
            <label class="ff5e-check-pill" style="justify-content:flex-start;">
              <input type="checkbox" data-ed-bool="repeatable" ${n.repeatable ? 'checked' : ''} />
              ${t('Labels.Repeatable')}
            </label>
          </div>
          <div class="ff5e-field full">
            <label>${t('Labels.MaxChoices')}</label>
            <input class="ff5e-input" type="number" min="0" max="50" data-ed="maxChoices" value="${Number(n.maxChoices) || 0}" />
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;">
          ${(n.choices || []).length
            ? (n.choices || [])
                .map(
                  (ch, idx) => `
                  <div class="ff5e-choice-item">
                    <div style="display:flex;gap:5px;align-items:center;">
                      <input class="ff5e-input" data-ch-idx="${idx}" data-ch-field="name" value="${esc(ch.name)}" placeholder="${t('Labels.ChoiceOptionName')}" style="flex:1;" />
                      <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-danger" data-del-choice="${idx}" title="${t('Actions.Delete')}">&times;</button>
                    </div>
                    <input class="ff5e-input" data-ch-idx="${idx}" data-ch-field="description" value="${esc(ch.description || '')}" placeholder="${t('Labels.ChoiceDescription')}" />
                    <input class="ff5e-input ff5e-dropzone" data-ch-idx="${idx}" data-ch-field="compendiumUuid" value="${esc(ch.compendiumUuid || '')}" placeholder="Compendium UUID (optional)" />
                  </div>`
                )
                .join('')
            : `<div style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.None')}</div>`}
        </div>
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">
          <span>${t('Labels.PassiveEffects')} (${(n.effects || []).length})</span>
          <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-primary" data-act="add-fx">${t('Actions.AddEffect')}</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;">
          ${(n.effects || []).length
            ? (n.effects || [])
                .map(
                  (fx, idx) => `
                  <div class="ff5e-choice-item">
                    <div style="display:flex;gap:5px;align-items:center;">
                      <input class="ff5e-input" data-fx-idx="${idx}" data-fx-field="key" value="${esc(fx.key || '')}" placeholder="system.rolls.attack.rwak.bonus" style="flex:1;font-family:ui-monospace,monospace;font-size:11px;" />
                      <button type="button" class="ff5e-btn ff5e-btn-sm ff5e-btn-danger" data-del-fx="${idx}" title="${t('Actions.Delete')}">&times;</button>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
                      <select class="ff5e-select" data-fx-idx="${idx}" data-fx-field="type">
                        ${['add', 'subtract', 'multiply', 'override', 'upgrade', 'downgrade']
                          .map((tp) => `<option value="${tp}" ${(fx.type || 'add') === tp ? 'selected' : ''}>${tp}</option>`)
                          .join('')}
                      </select>
                      <input class="ff5e-input" data-fx-idx="${idx}" data-fx-field="value" value="${esc(fx.value ?? '')}" placeholder="${t('Labels.EffectValue')}" />
                    </div>
                  </div>`
                )
                .join('')
            : `<div style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.None')}</div>`}
        </div>
      </div>

      <div class="ff5e-card">
        <div class="ff5e-card-title">${t('Labels.ParentLinks')} (${parents.length})</div>
        <div class="ff5e-badge-row" style="margin:0 0 8px;">
          ${parents.length ? parents.map((p) => `<span class="ff5e-chip"><span data-jump="${p.id}">${esc(p.name)}</span><span data-up="${p.id}" style="color:var(--ff5e-danger);font-weight:700;cursor:pointer;">&times;</span></span>`).join('') : `<span style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.None')}</span>`}
        </div>
        <div style="display:flex;gap:6px;">
          <select class="ff5e-select" data-act="ap-sel" style="flex:1">
            <option value="">${t('Labels.AddParentPlaceholder')}</option>
            ${cands.map((c) => `<option value="${c.id}">${esc(c.name)} (T${c.tier})</option>`).join('')}
          </select>
          <button type="button" class="ff5e-btn ff5e-btn-sm" data-act="ap-btn">${t('Actions.Add')}</button>
        </div>

        <div class="ff5e-card-title" style="margin-top:10px;">${t('Labels.ChildrenLinks')} (${children.length})</div>
        <div class="ff5e-badge-row" style="margin:0;">
          ${children.length ? children.map((c) => `<span class="ff5e-chip"><span data-jump="${c.id}">${esc(c.name)}</span><span data-uc="${c.id}" style="color:var(--ff5e-danger);font-weight:700;cursor:pointer;">&times;</span></span>`).join('') : `<span style="font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.None')}</span>`}
        </div>
      </div>
    `;

    this._wireJumps();
    const mut = (fn, rerender = false) => {
      this._pushUndo();
      fn();
      this._scheduleWorldSave();
      this._renderCanvas();
      if (rerender) this._renderInspector();
    };
    const csv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);

    const wireUuidDrop = (inputEl, onUuid) => {
      if (!inputEl) return;
      inputEl.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        inputEl.classList.add('drag-over');
      });
      inputEl.addEventListener('dragleave', () => inputEl.classList.remove('drag-over'));
      inputEl.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        inputEl.classList.remove('drag-over');
        try {
          const textEditorCls = foundry.applications?.ux?.TextEditor?.implementation;
          let payload = textEditorCls?.getDragEventData?.(ev);
          if (!payload) {
            const raw = ev.dataTransfer?.getData('text/plain');
            payload = raw ? JSON.parse(raw) : null;
          }
          if (payload?.uuid) {
            const resolveUuid = foundry.utils?.fromUuid ?? globalThis.fromUuid;
            const doc = typeof resolveUuid === 'function' ? await resolveUuid(payload.uuid) : null;
            onUuid(payload.uuid, doc);
            ui.notifications.info(t('Notifications.CompendiumLinked', { name: doc?.name || payload.uuid }));
          }
        } catch (_) {
          // ignore non-Foundry drops
        }
      });
    };

    this.refs.inspector.querySelector('[data-act="add-child"]')?.addEventListener('click', () => this._createNewNode({ parentId: n.id }));
    this.refs.inspector.querySelector('[data-act="del-node"]')?.addEventListener('click', () => {
      this._pushUndo();
      this.webState.data.nodes = this.webState.data.nodes.filter((x) => x.id !== n.id);
      this.webState.data.edges = this.webState.data.edges.filter((e) => e.from !== n.id && e.to !== n.id);
      this.webState.unlocked.delete(n.id);
      delete this.webState.choices[n.id];
      this.webState.selectedNodeId = this.webState.data.nodes[0]?.id || null;
      this._scheduleWorldSave();
      this._renderAll();
      ui.notifications.info(t('Notifications.NodeDeleted', { name: n.name }));
    });
    this.refs.inspector.querySelector('[data-act="reset-srd"]')?.addEventListener('click', () => this._resetDefaultSRD());

    const bindEd = (key, transform = (v) => v, rerender = false) => {
      this.refs.inspector.querySelector(`[data-ed="${key}"]`)?.addEventListener('change', (ev) => {
        mut(() => {
          n[key] = transform(ev.target.value);
          if (key === 'role' && n.role === 'hybrid' && (n.secondaryRoles || []).length < 2) {
            n.secondaryRoles = ['combat', 'magic'];
          }
        }, rerender);
      });
    };
    bindEd('name', (v) => v.trim() || 'Untitled');
    bindEd('role', (v) => v, true);
    bindEd('category');
    bindEd('tier', (v) => Number(v));
    bindEd('cost', (v) => Math.max(0, Number(v) || 0));
    bindEd('prereqMode');
    bindEd('source5e');
    bindEd('compendiumUuid', (v) => v.trim());
    bindEd('summary');
    bindEd('mechanics');
    bindEd('maxChoices', (v) => Math.max(0, Number(v) || 0));

    this.refs.inspector.querySelector('[data-ed-bool="repeatable"]')?.addEventListener('change', (ev) => {
      mut(() => {
        n.repeatable = Boolean(ev.target.checked);
      });
    });

    this.refs.inspector.querySelector('[data-act="add-choice-opt"]')?.addEventListener('click', () => {
      mut(() => {
        if (!Array.isArray(n.choices)) n.choices = [];
        n.choices.push({
          id: `opt_${Date.now().toString(36)}`,
          name: `Option ${n.choices.length + 1}`,
          description: '',
          compendiumUuid: '',
        });
      }, true);
    });

    this.refs.inspector.querySelectorAll('[data-del-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.delChoice);
        mut(() => {
          if (Array.isArray(n.choices)) n.choices.splice(idx, 1);
        }, true);
      });
    });

    this.refs.inspector.querySelectorAll('[data-ch-idx]').forEach((inp) => {
      const idx = Number(inp.dataset.chIdx);
      const field = inp.dataset.chField;
      inp.addEventListener('change', (ev) => {
        mut(() => {
          if (n.choices?.[idx]) n.choices[idx][field] = ev.target.value.trim();
        });
      });
      if (field === 'compendiumUuid') {
        wireUuidDrop(inp, (uuid, doc) => {
          mut(() => {
            if (n.choices?.[idx]) {
              n.choices[idx].compendiumUuid = uuid;
              if (doc?.name && /^Option \d+$/.test(n.choices[idx].name)) {
                n.choices[idx].name = doc.name;
              }
            }
          }, true);
        });
      }
    });

    this.refs.inspector.querySelector('[data-act="add-fx"]')?.addEventListener('click', () => {
      mut(() => {
        if (!Array.isArray(n.effects)) n.effects = [];
        n.effects.push({
          key: 'system.rolls.attack.rwak.bonus',
          type: 'add',
          phase: 'initial',
          value: '1',
          label: '',
        });
      }, true);
    });

    this.refs.inspector.querySelectorAll('[data-del-fx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.delFx);
        mut(() => {
          if (Array.isArray(n.effects)) n.effects.splice(idx, 1);
        }, true);
      });
    });

    this.refs.inspector.querySelectorAll('[data-fx-idx]').forEach((inp) => {
      const idx = Number(inp.dataset.fxIdx);
      const field = inp.dataset.fxField;
      inp.addEventListener('change', (ev) => {
        mut(() => {
          if (n.effects?.[idx]) n.effects[idx][field] = ev.target.value.trim();
        });
      });
    });

    // Drag & Drop Compendium Item support on Node UUID field (Foundry v14 UX API)
    wireUuidDrop(this.refs.inspector.querySelector('[data-ed="compendiumUuid"]'), (uuid) => {
      mut(() => {
        n.compendiumUuid = uuid;
      }, true);
    });

    this.refs.inspector.querySelectorAll('[data-sr]').forEach((cb) => {
      cb.addEventListener('change', () =>
        mut(() => {
          n.secondaryRoles = Array.from(this.refs.inspector.querySelectorAll('[data-sr]:checked')).map((x) => x.dataset.sr);
        })
      );
    });

    this.refs.inspector.querySelector('[data-grant="hitDie"]')?.addEventListener('change', (e) =>
      mut(() => { n.grants.hitDie = e.target.value ? Number(e.target.value) : null; })
    );
    this.refs.inspector.querySelector('[data-grant="spellTier"]')?.addEventListener('change', (e) =>
      mut(() => { n.grants.spellTier = Number(e.target.value) || 0; })
    );
    this.refs.inspector.querySelectorAll('[data-gs]').forEach((cb) => {
      cb.addEventListener('change', () =>
        mut(() => {
          n.grants.saves = Array.from(this.refs.inspector.querySelectorAll('[data-gs]:checked')).map((x) => x.dataset.gs);
        })
      );
    });
    this.refs.inspector.querySelector('[data-grant="skills"]')?.addEventListener('change', (e) =>
      mut(() => { n.grants.skills = csv(e.target.value); })
    );
    this.refs.inspector.querySelector('[data-grant="proficiencies"]')?.addEventListener('change', (e) =>
      mut(() => { n.grants.proficiencies = csv(e.target.value); })
    );
    this.refs.inspector.querySelector('[data-grant="tags"]')?.addEventListener('change', (e) =>
      mut(() => { n.grants.tags = csv(e.target.value); })
    );

    this.refs.inspector.querySelector('[data-act="ap-btn"]')?.addEventListener('click', () => {
      const pid = this.refs.inspector.querySelector('[data-act="ap-sel"]')?.value;
      if (!pid || this._wouldCreateCycle(pid, n.id)) return;
      mut(() => this.webState.data.edges.push({ id: `edge_${pid}__${n.id}_${Date.now()}`, from: pid, to: n.id }), true);
    });

    this.refs.inspector.querySelectorAll('[data-up]').forEach((b) => {
      b.addEventListener('click', () =>
        mut(() => {
          this.webState.data.edges = this.webState.data.edges.filter((e) => !(e.from === b.dataset.up && e.to === n.id));
        }, true)
      );
    });
    this.refs.inspector.querySelectorAll('[data-uc]').forEach((b) => {
      b.addEventListener('click', () =>
        mut(() => {
          this.webState.data.edges = this.webState.data.edges.filter((e) => !(e.from === n.id && e.to === b.dataset.uc));
        }, true)
      );
    });
  }

  async _resetDefaultSRD() {
    if (!game.user.isGM) return;
    this._pushUndo();
    this.webState.data = await loadDefaultTree();
    this.webState.selectedNodeId = 'combat_root';
    this._pruneInvalidUnlocked();
    await saveWorldTreeData(this.webState.data);
    this._renderAll();
    this._fitToNodes();
    ui.notifications.info(t('Notifications.RestoredSRD'));
  }

  _autoLayoutRadial() {
    if (!game.user.isGM) return;
    this._pushUndo();
    const groups = new Map(ALL_ROLES_ORDER.map((r) => [r, [[], [], [], [], []]]));
    for (const n of this.webState.data.nodes) {
      (groups.get(n.role) || groups.get('hybrid'))[Math.max(0, Math.min(4, Number(n.tier) || 0))].push(n);
    }
    const baseA = { combat: -90, devotion: -18, magic: 54, social: 126, exploring: 198 };
    const seamA = {
      'combat+devotion': -54,
      'devotion+magic': 18,
      'magic+social': 90,
      'exploring+social': 162,
      'combat+exploring': -126,
    };

    for (const [rid, tiers] of groups.entries()) {
      if (rid === 'hybrid') continue;
      tiers.forEach((list, tier) => {
        if (!list.length) return;
        const span = Math.min(48, Math.max(10, (list.length - 1) * 9.5));
        list.forEach((n, i) => {
          const off = list.length === 1 ? 0 : -span / 2 + (i / (list.length - 1)) * span;
          const rad = ((baseA[rid] + off) * Math.PI) / 180;
          n.x = Math.round(Math.cos(rad) * TIER_RADII[tier]);
          n.y = Math.round(Math.sin(rad) * TIER_RADII[tier]);
        });
      });
    }

    this.webState.data.nodes
      .filter((n) => n.role === 'hybrid')
      .forEach((n, i) => {
        const s = seamA[(n.secondaryRoles || []).slice(0, 2).sort().join('+')];
        const r = s !== undefined ? Math.max(600, TIER_RADII[n.tier] - 40) : 95 + (i % 3) * 45;
        const rad = ((s !== undefined ? s : i * 120) * Math.PI) / 180;
        n.x = Math.round(Math.cos(rad) * r);
        n.y = Math.round(Math.sin(rad) * r);
      });

    for (let k = 0; k < 100; k++) {
      let mv = false;
      for (let i = 0; i < this.webState.data.nodes.length; i++) {
        for (let j = i + 1; j < this.webState.data.nodes.length; j++) {
          const a = this.webState.data.nodes[i];
          const b = this.webState.data.nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.1;
          if (d < 132) {
            const p = (132 - d) * 0.5;
            if (a.category !== 'root') {
              a.x -= (dx / d) * p;
              a.y -= (dy / d) * p;
            }
            if (b.category !== 'root') {
              b.x += (dx / d) * p;
              b.y += (dy / d) * p;
            }
            mv = true;
          }
        }
      }
      if (!mv) break;
    }
    for (const n of this.webState.data.nodes) {
      n.x = Math.round(n.x);
      n.y = Math.round(n.y);
    }

    this._scheduleWorldSave();
    this._renderAll();
    this._fitToNodes();
    ui.notifications.info(t('Notifications.AutoLayoutDone'));
  }

  _handleImportFile(ev) {
    const file = ev.target.files?.[0];
    if (!file || !game.user.isGM) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error('JSON must contain "nodes" and "edges" arrays.');
        }
        const defaults = await loadDefaultTree();
        this._pushUndo();
        this.webState.data = { ...defaults, ...parsed };
        this.webState.selectedNodeId = this.webState.data.nodes[0]?.id || null;
        this._pruneInvalidUnlocked();
        await saveWorldTreeData(this.webState.data);
        this._renderAll();
        this._fitToNodes();
        ui.notifications.info(
          t('Notifications.Imported', {
            nodes: this.webState.data.nodes.length,
            edges: this.webState.data.edges.length,
          })
        );
      } catch (err) {
        ui.notifications.error(t('Notifications.ImportFailed', { error: err.message }));
      }
      ev.target.value = '';
    };
    reader.readAsText(file);
  }

  _renderSearchDropdown() {
    const q = this.webState.searchQuery.trim();
    this.refs.searchClear.classList.toggle('visible', q.length > 0);
    if (!q) {
      this.refs.searchResults.classList.remove('open');
      return;
    }
    const hits = this.webState.data.nodes.filter((n) => this._isNodeMatching(n)).slice(0, 12);
    this.refs.searchResults.innerHTML = hits.length
      ? hits
          .map((n) => {
            const role = this._getRoleInfo(n.role);
            return `<button type="button" class="ff5e-search-item" data-pick="${n.id}">
              <span style="display:flex;align-items:center;gap:6px;font-weight:600;">
                <span class="ff5e-role-dot" style="background:${role.color}"></span>${esc(n.name)}
              </span>
              <span style="font-family:ui-monospace,monospace;font-size:11px;opacity:0.75;">T${n.tier} · ${n.cost}SP</span>
            </button>`;
          })
          .join('')
      : `<div style="padding:8px;font-size:12px;color:var(--ff5e-fg-muted);">${t('Labels.NoMatches')}</div>`;
    this.refs.searchResults.classList.add('open');
    this.refs.searchResults.querySelectorAll('[data-pick]').forEach((b) => {
      b.addEventListener('click', () => {
        this.webState.selectedNodeId = b.dataset.pick;
        this.refs.searchResults.classList.remove('open');
        this._panToNode(this.webState.selectedNodeId, 1.55);
        this._renderAll();
      });
    });
  }

  _downloadText(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  _renderAll() {
    this._renderRolePills();
    this._renderCanvas();
    this._renderInspector();
    this._updateUndoButtons();
  }
}
