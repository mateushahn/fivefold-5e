(() => {
  'use strict';

  const STORAGE_KEY = 'fivefold5e_skill_web_v1';
  const BUILD_KEY = 'fivefold5e_character_build_v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ALL_ROLES_ORDER = ['combat', 'devotion', 'magic', 'social', 'exploring', 'hybrid'];
  const ALL_SAVES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const SPELL_TIER_LABELS = [
    'None',
    'Tier I (1st–2nd Slots)',
    'Tier II (3rd–5th Slots)',
    'Tier III (6th–7th Slots)',
    'Tier IV — Archmage (8th–9th)',
  ];
  const TIER_ROMAN = ['0', 'I', 'II', 'III', 'IV'];
  const TIER_RADII = [260, 560, 860, 1130, 1360];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================================
  // APPLICATION STATE
  // =========================================================================
  const state = {
    data: loadSavedTree(),
    mode: 'inspect', // 'inspect' | 'build' | 'edit'
    buildSubTab: 'sheet', // 'sheet' | 'node'
    selectedNodeId: 'combat_root',
    hoveredNodeId: null,
    filterRole: 'all',
    filterCategory: 'all',
    filterTier: 'all',
    searchQuery: '',
    showRings: true,
    theme: localStorage.getItem('fivefold5e_theme') || 'light',

    // Viewport transform (world -> screen via translate(tx, ty) scale(scale))
    view: { tx: 0, ty: 0, scale: 0.34 },

    // Character builder state
    build: loadSavedBuild(),

    // Editor state
    linkMode: false,
    linkSourceId: null,
    cursorWorld: { x: 0, y: 0 },
    undoStack: [],
    redoStack: [],
  };

  function loadSavedTree() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          return parsed;
        }
      }
    } catch (_) {
      // ignore corrupted storage
    }
    return deepClone(window.FIVEFOLD_DEFAULT_TREE);
  }

  function saveTree() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch (_) {
      // ignore quota errors
    }
  }

  function loadSavedBuild() {
    try {
      const raw = localStorage.getItem(BUILD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.level === 'number' && Array.isArray(parsed.unlocked)) {
          return {
            level: Math.max(1, Math.min(20, parsed.level)),
            conMod: typeof parsed.conMod === 'number' ? parsed.conMod : 2,
            unlocked: new Set(parsed.unlocked),
          };
        }
      }
    } catch (_) {
      // ignore
    }
    return {
      level: 5,
      conMod: 2,
      unlocked: new Set(),
    };
  }

  function saveBuild() {
    try {
      localStorage.setItem(
        BUILD_KEY,
        JSON.stringify({
          level: state.build.level,
          conMod: state.build.conMod,
          unlocked: Array.from(state.build.unlocked),
        })
      );
    } catch (_) {
      // ignore
    }
  }

  // =========================================================================
  // GRAPH HELPERS & DAG UTILITIES
  // =========================================================================
  function getNode(id) {
    return state.data.nodes.find((n) => n.id === id) || null;
  }

  function getRoleInfo(roleId) {
    return state.data.roles[roleId] || { id: roleId, name: roleId, color: '#8f6339' };
  }

  function getParents(nodeId) {
    return state.data.edges.filter((e) => e.to === nodeId).map((e) => e.from);
  }

  function getChildren(nodeId) {
    return state.data.edges.filter((e) => e.from === nodeId).map((e) => e.to);
  }

  function wouldCreateCycle(fromId, toId) {
    if (fromId === toId) return true;
    // Check if fromId is reachable starting from toId
    const visited = new Set([toId]);
    const queue = [toId];
    while (queue.length) {
      const curr = queue.shift();
      for (const e of state.data.edges) {
        if (e.from === curr) {
          if (e.to === fromId) return true;
          if (!visited.has(e.to)) {
            visited.add(e.to);
            queue.push(e.to);
          }
        }
      }
    }
    return false;
  }

  function pushUndo() {
    state.undoStack.push(deepClone({ nodes: state.data.nodes, edges: state.data.edges }));
    if (state.undoStack.length > 40) state.undoStack.shift();
    state.redoStack = [];
    updateUndoButtons();
  }

  function performUndo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(deepClone({ nodes: state.data.nodes, edges: state.data.edges }));
    const prev = state.undoStack.pop();
    state.data.nodes = prev.nodes;
    state.data.edges = prev.edges;
    pruneInvalidBuildNodes();
    saveTree();
    renderAll();
    updateUndoButtons();
    showToast('Undid last change');
  }

  function performRedo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(deepClone({ nodes: state.data.nodes, edges: state.data.edges }));
    const next = state.redoStack.pop();
    state.data.nodes = next.nodes;
    state.data.edges = next.edges;
    pruneInvalidBuildNodes();
    saveTree();
    renderAll();
    updateUndoButtons();
    showToast('Redid change');
  }

  function pruneInvalidBuildNodes() {
    const ids = new Set(state.data.nodes.map((n) => n.id));
    for (const id of Array.from(state.build.unlocked)) {
      if (!ids.has(id)) state.build.unlocked.delete(id);
    }
  }

  // =========================================================================
  // CHARACTER BUILDER ENGINE
  // =========================================================================
  function getTotalSP(level = state.build.level) {
    const meta = state.data.meta;
    return meta.startingPoints + (level - 1) * meta.pointsPerLevel;
  }

  function getSpentSP() {
    let spent = 0;
    for (const id of state.build.unlocked) {
      const n = getNode(id);
      if (n) spent += Number(n.cost) || 0;
    }
    return spent;
  }

  function getRemainingSP() {
    return getTotalSP() - getSpentSP();
  }

  function getProfBonus(level = state.build.level) {
    return 2 + Math.floor((level - 1) / 4);
  }

  function evaluateNodeBuildStatus(node) {
    const unlocked = state.build.unlocked.has(node.id);
    if (unlocked) return { status: 'unlocked', reasons: [] };

    const reasons = [];
    const minLevel = state.data.meta.tierMinLevels[node.tier] ?? 1;
    if (state.build.level < minLevel) {
      reasons.push(`Requires Level ${minLevel} (Tier ${TIER_ROMAN[node.tier]})`);
    }

    const parents = getParents(node.id);
    if (parents.length > 0) {
      if (node.prereqMode === 'any') {
        const anyMet = parents.some((pid) => state.build.unlocked.has(pid));
        if (!anyMet) {
          const names = parents.map((pid) => getNode(pid)?.name || pid).join(' or ');
          reasons.push(`Requires any parent: ${names}`);
        }
      } else {
        const missing = parents.filter((pid) => !state.build.unlocked.has(pid));
        if (missing.length > 0) {
          const names = missing.map((pid) => getNode(pid)?.name || pid).join(', ');
          reasons.push(`Missing prerequisite: ${names}`);
        }
      }
    }

    const rem = getRemainingSP();
    if (node.cost > rem) {
      reasons.push(`Needs ${node.cost} SP (${rem} remaining)`);
    }

    return {
      status: reasons.length === 0 ? 'available' : 'locked',
      reasons,
    };
  }

  function getBlockingUnlockedChildren(nodeId) {
    const children = getChildren(nodeId);
    const blockers = [];
    for (const cid of children) {
      if (!state.build.unlocked.has(cid)) continue;
      const child = getNode(cid);
      if (!child) continue;
      if (child.prereqMode === 'any') {
        const otherUnlocked = getParents(cid).some(
          (pid) => pid !== nodeId && state.build.unlocked.has(pid)
        );
        if (!otherUnlocked) blockers.push(child);
      } else {
        blockers.push(child);
      }
    }
    return blockers;
  }

  function toggleBuildNode(nodeId, cascadeRefund = false) {
    const node = getNode(nodeId);
    if (!node) return;
    if (state.build.unlocked.has(nodeId)) {
      const blockers = getBlockingUnlockedChildren(nodeId);
      if (blockers.length > 0 && !cascadeRefund) {
        showToast(
          `Blocked by unlocked child: ${blockers.map((b) => b.name).join(', ')}. Use "Refund Branch" in panel.`
        );
        state.selectedNodeId = nodeId;
        state.buildSubTab = 'node';
        renderAll();
        return;
      }
      if (cascadeRefund) {
        // BFS downstream unlocked dependents
        const toRemove = new Set([nodeId]);
        const queue = [nodeId];
        while (queue.length) {
          const curr = queue.shift();
          for (const cid of getChildren(curr)) {
            if (!state.build.unlocked.has(cid) || toRemove.has(cid)) continue;
            const child = getNode(cid);
            if (!child) continue;
            if (child.prereqMode === 'any') {
              const otherAlive = getParents(cid).some(
                (pid) => !toRemove.has(pid) && state.build.unlocked.has(pid)
              );
              if (otherAlive) continue;
            }
            toRemove.add(cid);
            queue.push(cid);
          }
        }
        for (const id of toRemove) state.build.unlocked.delete(id);
        showToast(`Refunded ${toRemove.size} node(s)`);
      } else {
        state.build.unlocked.delete(nodeId);
        showToast(`Refunded ${node.name} (+${node.cost} SP)`);
      }
      saveBuild();
      renderAll();
      return;
    }

    const evalRes = evaluateNodeBuildStatus(node);
    if (evalRes.status !== 'available') {
      showToast(evalRes.reasons[0]);
      state.selectedNodeId = nodeId;
      state.buildSubTab = 'node';
      renderAll();
      return;
    }

    state.build.unlocked.add(nodeId);
    saveBuild();
    renderAll();
    showToast(`Unlocked ${node.name} (-${node.cost} SP)`);
  }

  function computeCharacterSummary() {
    let hitDie = state.data.meta.baseHitDie || 6;
    let spellTier = 0;
    const saves = new Set();
    const skills = new Set();
    const proficiencies = new Set();
    const features = [];
    const feats = [];
    const roots = [];

    for (const id of state.build.unlocked) {
      const n = getNode(id);
      if (!n) continue;
      if (n.grants?.hitDie && n.grants.hitDie > hitDie) hitDie = n.grants.hitDie;
      if (n.grants?.spellTier && n.grants.spellTier > spellTier) spellTier = n.grants.spellTier;
      for (const s of n.grants?.saves || []) saves.add(s);
      for (const sk of n.grants?.skills || []) skills.add(sk);
      for (const p of n.grants?.proficiencies || []) proficiencies.add(p);
      if (n.category === 'root') roots.push(n);
      else if (n.category === 'feat') feats.push(n);
      else if (n.category === 'class_feature' || n.category === 'subclass_feature' || n.category === 'spellcasting') {
        features.push(n);
      }
    }

    const lv = state.build.level;
    const con = state.build.conMod;
    const avgPerLv = Math.floor(hitDie / 2) + 1;
    const avgHp = Math.max(lv, hitDie + con + (lv - 1) * (avgPerLv + con));

    return {
      level: lv,
      conMod: con,
      profBonus: getProfBonus(lv),
      totalSP: getTotalSP(lv),
      spentSP: getSpentSP(),
      remainingSP: getRemainingSP(),
      hitDie,
      avgHp,
      spellTier,
      saves,
      skills: Array.from(skills).sort(),
      proficiencies: Array.from(proficiencies).sort(),
      roots,
      features,
      feats,
    };
  }

  function exportCharacterMarkdown() {
    const c = computeCharacterSummary();
    const lines = [
      `# Fivefold 5e Character Build (Level ${c.level})`,
      '',
      `- **Hit Die:** d${c.hitDie} (Avg HP w/ CON ${c.conMod >= 0 ? '+' : ''}${c.conMod}: **${c.avgHp}**)`,
      `- **Proficiency Bonus:** +${c.profBonus}`,
      `- **Skill Points:** ${c.spentSP} / ${c.totalSP} SP (${c.remainingSP} remaining)`,
      `- **Spellcasting:** ${SPELL_TIER_LABELS[c.spellTier]}`,
      `- **Role Roots:** ${c.roots.map((r) => r.name).join(', ') || 'None'}`,
      `- **Saving Throws:** ${ALL_SAVES.filter((s) => c.saves.has(s)).join(', ') || 'None'}`,
      `- **Skills (${c.skills.length}):** ${c.skills.join(', ') || 'None'}`,
      `- **Proficiencies:** ${c.proficiencies.join(', ') || 'None'}`,
      '',
      '## Features & Spellcasting',
      ...c.features.map((f) => `- **${f.name}** (*${f.source5e}*): ${f.summary}`),
      '',
      '## Feats',
      ...(c.feats.length ? c.feats.map((f) => `- **${f.name}** (*${f.source5e}*): ${f.summary}`) : ['- None']),
      '',
    ];
    downloadText(`fivefold5e-lv${c.level}-character.md`, lines.join('\n'), 'text/markdown');
    showToast('Exported Character Sheet Markdown');
  }

  // =========================================================================
  // DOM ELEMENTS
  // =========================================================================
  const svg = document.getElementById('tree-svg');
  const viewportG = document.getElementById('viewport-group');
  const guidesLayer = document.getElementById('guides-layer');
  const edgesLayer = document.getElementById('edges-layer');
  const tempLinkLayer = document.getElementById('temp-link-layer');
  const nodesLayer = document.getElementById('nodes-layer');
  const inspectorContent = document.getElementById('inspector-content');
  const buildSubtabs = document.getElementById('build-subtabs');
  const rolePillsEl = document.getElementById('role-pills');
  const treeCountsEl = document.getElementById('tree-counts');
  const zoomReadoutEl = document.getElementById('zoom-readout');
  const editCanvasToolsEl = document.getElementById('edit-canvas-tools');
  const hudStatusEl = document.getElementById('hud-status');
  const hudStatusTextEl = document.getElementById('hud-status-text');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const searchResults = document.getElementById('search-results');

  // =========================================================================
  // VIEWPORT PAN / ZOOM / FIT
  // =========================================================================
  function applyViewport() {
    viewportG.setAttribute(
      'transform',
      `translate(${state.view.tx}, ${state.view.ty}) scale(${state.view.scale})`
    );
    zoomReadoutEl.textContent = `${Math.round(state.view.scale * 100)}%`;
  }

  function screenToWorld(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const svgX = vb.x + ((clientX - rect.left) / rect.width) * vb.width;
    const svgY = vb.y + ((clientY - rect.top) / rect.height) * vb.height;
    return {
      x: (svgX - state.view.tx) / state.view.scale,
      y: (svgY - state.view.ty) / state.view.scale,
    };
  }

  function fitToNodes(nodeList = state.data.nodes, pad = 280) {
    if (!nodeList.length) {
      state.view = { tx: 0, ty: 0, scale: 0.9 };
      applyViewport();
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodeList) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const vb = svg.viewBox.baseVal;
    const w = Math.max(400, maxX - minX + pad * 2);
    const h = Math.max(400, maxY - minY + pad * 2);
    const scale = Math.min(2.2, Math.max(0.35, Math.min(vb.width / w, vb.height / h)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    state.view.scale = scale;
    state.view.tx = -cx * scale;
    state.view.ty = -cy * scale;
    applyViewport();
  }

  function panToNode(nodeId, targetScale = 1.45) {
    const node = getNode(nodeId);
    if (!node) return;
    state.view.scale = Math.max(state.view.scale, targetScale);
    state.view.tx = -node.x * state.view.scale;
    state.view.ty = -node.y * state.view.scale;
    applyViewport();
  }

  function zoomBy(factor, anchorClientX = null, anchorClientY = null) {
    const oldScale = state.view.scale;
    const newScale = Math.max(0.28, Math.min(3.5, oldScale * factor));
    if (anchorClientX !== null && anchorClientY !== null) {
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const sx = vb.x + ((anchorClientX - rect.left) / rect.width) * vb.width;
      const sy = vb.y + ((anchorClientY - rect.top) / rect.height) * vb.height;
      const wx = (sx - state.view.tx) / oldScale;
      const wy = (sy - state.view.ty) / oldScale;
      state.view.scale = newScale;
      state.view.tx = sx - wx * newScale;
      state.view.ty = sy - wy * newScale;
    } else {
      state.view.tx *= newScale / oldScale;
      state.view.ty *= newScale / oldScale;
      state.view.scale = newScale;
    }
    applyViewport();
  }

  // =========================================================================
  // SVG RENDERING
  // =========================================================================
  function el(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function isNodeMatchingFilters(node) {
    if (state.filterRole !== 'all') {
      const matchRole =
        node.role === state.filterRole ||
        (node.secondaryRoles && node.secondaryRoles.includes(state.filterRole));
      if (!matchRole) return false;
    }
    if (state.filterCategory !== 'all' && node.category !== state.filterCategory) return false;
    if (state.filterTier !== 'all' && String(node.tier) !== state.filterTier) return false;
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.trim().toLowerCase();
      const hay = [
        node.name,
        node.source5e,
        node.summary,
        node.mechanics,
        ...(node.grants?.skills || []),
        ...(node.grants?.saves || []),
        ...(node.grants?.proficiencies || []),
        ...(node.grants?.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function renderGuides() {
    guidesLayer.innerHTML = '';
    if (!state.showRings) return;

    TIER_RADII.forEach((r, idx) => {
      el('circle', { cx: 0, cy: 0, r, class: 'tier-ring' }, guidesLayer);
      const lbl = el('text', { x: 0, y: -r - 12, class: 'tier-ring-label' }, guidesLayer);
      lbl.textContent = idx === 0 ? 'ROOTS' : `TIER ${TIER_ROMAN[idx]}`;
    });

    // Role sector outer titles
    const sectorRoles = ['combat', 'devotion', 'magic', 'social', 'exploring'];
    for (const rid of sectorRoles) {
      const role = getRoleInfo(rid);
      const rad = (role.angle * Math.PI) / 180;
      const rx = Math.cos(rad) * 1490;
      const ry = Math.sin(rad) * 1490;
      const txt = el(
        'text',
        { x: rx, y: ry, class: 'sector-label', fill: role.color },
        guidesLayer
      );
      txt.textContent = role.name.toUpperCase();
    }
  }

  function nodeRadius(node) {
    if (node.category === 'root') return 44;
    if (node.category === 'spellcasting' || node.category === 'feat') return 31;
    if (node.category === 'class_feature' || node.category === 'subclass_feature') return 29;
    if (node.category === 'hit_die') return 28;
    return 24;
  }

  function computeEdgePath(fromNode, toNode) {
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const rStart = nodeRadius(fromNode) + 4;
    const rEnd = nodeRadius(toNode) + 9;
    const x1 = fromNode.x + ux * rStart;
    const y1 = fromNode.y + uy * rStart;
    const x2 = toNode.x - ux * rEnd;
    const y2 = toNode.y - uy * rEnd;

    // Gentle curvature for visual clarity (stronger curve for long inner-chord hybrid edges)
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const curveFactor = dist > 550 ? 0.14 : 0.06;
    const cx = mx - uy * dist * curveFactor;
    const cy = my + ux * dist * curveFactor;
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  function renderEdges(matchSet) {
    edgesLayer.innerHTML = '';
    const activeId = state.hoveredNodeId || state.selectedNodeId;
    const nodeMap = new Map(state.data.nodes.map((n) => [n.id, n]));

    for (const edge of state.data.edges) {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) continue;

      const d = computeEdgePath(from, to);
      const bothMatch = matchSet.has(from.id) && matchSet.has(to.id);
      const isConnectedToActive = activeId && (edge.from === activeId || edge.to === activeId);
      const isBuildUnlocked =
        state.mode === 'build' &&
        state.build.unlocked.has(from.id) &&
        state.build.unlocked.has(to.id);

      let cls = 'edge-path';
      if (!bothMatch && !isConnectedToActive) cls += ' dimmed';
      if (isConnectedToActive) cls += ' highlighted';
      if (isBuildUnlocked) cls += ' unlocked';
      if (state.mode === 'edit') cls += ' editable';

      const targetRole = getRoleInfo(to.role);
      const pathEl = el(
        'path',
        {
          d,
          class: cls,
          'data-edge-id': edge.id,
          'marker-end':
            isConnectedToActive || isBuildUnlocked
              ? 'url(#arrow-active)'
              : 'url(#arrow-default)',
        },
        edgesLayer
      );

      if (isBuildUnlocked || isConnectedToActive) {
        pathEl.style.stroke = targetRole.color;
        pathEl.style.color = targetRole.color;
      }

      if (state.mode === 'edit') {
        pathEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          pushUndo();
          state.data.edges = state.data.edges.filter((e) => e.id !== edge.id);
          saveTree();
          renderAll();
          showToast(`Removed link: ${from.name} → ${to.name}`);
        });
      }
    }
  }

  function buildPolygonPoints(sides, r, rotDeg = -90) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = ((rotDeg + (i * 360) / sides) * Math.PI) / 180;
      pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
    }
    return pts.join(' ');
  }

  function getNodeGlyph(node) {
    if (node.category === 'root') return node.name.slice(0, 2).toUpperCase();
    if (node.category === 'hit_die') return `d${node.grants?.hitDie || 8}`;
    if (node.category === 'save') return node.grants?.saves?.[0] || 'SV';
    if (node.category === 'spellcasting') return `S${TIER_ROMAN[node.grants?.spellTier || 1]}`;
    if (node.category === 'feat') return '★';
    if (node.category === 'subclass_feature') return '◆';
    if (node.category === 'class_feature') return '❖';
    if (node.category === 'proficiency') return '⚒';
    if (node.category === 'skill') return '●';
    return '•';
  }

  function renderNodeShape(g, node, fill, stroke, strokeWidth) {
    const r = nodeRadius(node);
    const cat = node.category;
    if (cat === 'root') {
      el('polygon', {
        points: buildPolygonPoints(8, r, 22.5),
        fill,
        stroke,
        'stroke-width': strokeWidth + 1.5,
        class: 'node-shape',
      }, g);
      el('polygon', {
        points: buildPolygonPoints(8, r - 7, 22.5),
        fill: 'none',
        stroke,
        'stroke-width': 1.2,
        'stroke-opacity': 0.55,
      }, g);
    } else if (cat === 'class_feature') {
      el('polygon', {
        points: buildPolygonPoints(6, r, -90),
        fill,
        stroke,
        'stroke-width': strokeWidth,
        class: 'node-shape',
      }, g);
    } else if (cat === 'subclass_feature') {
      el('polygon', {
        points: buildPolygonPoints(8, r, 22.5),
        fill,
        stroke,
        'stroke-width': strokeWidth,
        class: 'node-shape',
      }, g);
    } else if (cat === 'feat') {
      el('polygon', {
        points: buildPolygonPoints(4, r + 2, -90),
        fill,
        stroke,
        'stroke-width': strokeWidth,
        class: 'node-shape',
      }, g);
    } else if (cat === 'spellcasting') {
      el('circle', { cx: 0, cy: 0, r, fill, stroke, 'stroke-width': strokeWidth, class: 'node-shape' }, g);
      el('circle', { cx: 0, cy: 0, r: r - 5.5, fill: 'none', stroke, 'stroke-width': 1.3, 'stroke-dasharray': '3 3' }, g);
    } else if (cat === 'hit_die') {
      // Heraldic shield path
      const s = r;
      const d = `M 0 ${-s} L ${s * 0.88} ${-s * 0.55} L ${s * 0.78} ${s * 0.28} Q 0 ${s * 1.15} 0 ${s * 1.15} Q 0 ${s * 1.15} ${-s * 0.78} ${s * 0.28} L ${-s * 0.88} ${-s * 0.55} Z`;
      el('path', { d, fill, stroke, 'stroke-width': strokeWidth, class: 'node-shape' }, g);
    } else if (cat === 'proficiency') {
      const s = r * 1.65;
      el('rect', {
        x: -s / 2,
        y: -s / 2,
        width: s,
        height: s,
        rx: 7,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        class: 'node-shape',
      }, g);
    } else if (cat === 'save') {
      el('polygon', {
        points: buildPolygonPoints(6, r + 1, 0),
        fill,
        stroke,
        'stroke-width': strokeWidth,
        class: 'node-shape',
      }, g);
    } else {
      el('circle', { cx: 0, cy: 0, r, fill, stroke, 'stroke-width': strokeWidth, class: 'node-shape' }, g);
    }

    // Hybrid dual-role outer split arc indicator
    if (node.role === 'hybrid' && node.secondaryRoles && node.secondaryRoles.length >= 2) {
      const c1 = getRoleInfo(node.secondaryRoles[0]).color;
      const c2 = getRoleInfo(node.secondaryRoles[1]).color;
      const ar = r + 5;
      el('path', {
        d: `M 0 ${-ar} A ${ar} ${ar} 0 0 0 0 ${ar}`,
        fill: 'none',
        stroke: c1,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }, g);
      el('path', {
        d: `M 0 ${-ar} A ${ar} ${ar} 0 0 1 0 ${ar}`,
        fill: 'none',
        stroke: c2,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }, g);
    }
  }

  function renderNodes(matchSet) {
    nodesLayer.innerHTML = '';

    for (const node of state.data.nodes) {
      const role = getRoleInfo(node.role);
      const isSelected = state.selectedNodeId === node.id;
      const matches = matchSet.has(node.id);
      const buildEval = state.mode === 'build' ? evaluateNodeBuildStatus(node) : null;

      let fill = 'var(--node-fill)';
      let stroke = role.color;
      let strokeWidth = isSelected ? 4 : 2.3;
      let glyphColor = role.color;

      if (state.mode === 'build') {
        if (buildEval.status === 'unlocked') {
          fill = role.color;
          stroke = '#ffffff';
          strokeWidth = isSelected ? 4 : 2.5;
          glyphColor = '#ffffff';
        } else if (buildEval.status === 'locked') {
          fill = 'var(--node-locked-fill)';
          stroke = 'var(--border-strong)';
          glyphColor = 'var(--text-muted)';
        }
      } else if (node.category === 'root') {
        fill = role.color;
        glyphColor = '#ffffff';
      }

      const g = el(
        'g',
        {
          class: `node-group${matches ? '' : ' dimmed'}`,
          transform: `translate(${node.x}, ${node.y})`,
          'data-node-id': node.id,
        },
        nodesLayer
      );

      // Selection ring
      if (isSelected) {
        el('circle', {
          cx: 0,
          cy: 0,
          r: nodeRadius(node) + 10,
          fill: 'none',
          stroke: 'var(--accent-primary)',
          'stroke-width': 2.8,
        }, g);
      }

      // Build Mode available halo
      if (state.mode === 'build' && buildEval.status === 'available') {
        el('circle', {
          cx: 0,
          cy: 0,
          r: nodeRadius(node) + 8,
          class: 'available-halo',
          stroke: role.color,
        }, g);
      }

      // Edit Link Mode source highlight
      if (state.mode === 'edit' && state.linkMode && state.linkSourceId === node.id) {
        el('circle', {
          cx: 0,
          cy: 0,
          r: nodeRadius(node) + 12,
          fill: 'none',
          stroke: 'var(--success)',
          'stroke-width': 3.5,
          'stroke-dasharray': '5 3',
        }, g);
      }

      renderNodeShape(g, node, fill, stroke, strokeWidth);

      // Inner glyph
      const glyph = el('text', { x: 0, y: 0, class: 'node-glyph', fill: glyphColor }, g);
      if (node.category === 'root') glyph.setAttribute('font-size', '14');
      glyph.textContent = getNodeGlyph(node);

      // Cost badge (top-right pip)
      const r = nodeRadius(node);
      const bx = r * 0.72;
      const by = -r * 0.72;
      el('circle', {
        cx: bx,
        cy: by,
        r: 9.5,
        fill: state.mode === 'build' && buildEval.status === 'unlocked' ? 'var(--success)' : 'var(--bg-elevated)',
        stroke: state.mode === 'build' && buildEval.status === 'unlocked' ? '#ffffff' : stroke,
        'stroke-width': 1.5,
      }, g);
      const costText = el('text', {
        x: bx,
        y: by,
        class: 'node-cost-badge',
        fill: state.mode === 'build' && buildEval.status === 'unlocked' ? '#ffffff' : 'var(--text-primary)',
      }, g);
      costText.textContent =
        state.mode === 'build' && buildEval.status === 'unlocked' ? '✓' : `${node.cost}`;

      // Node Label below shape
      const lbl = el(
        'text',
        {
          x: 0,
          y: r + 16,
          class: `node-label${node.category === 'root' ? ' root-label' : ''}`,
        },
        g
      );
      lbl.textContent = node.name;

      // Interactions
      g.addEventListener('mouseenter', () => {
        if (state.hoveredNodeId !== node.id) {
          state.hoveredNodeId = node.id;
          renderEdges(matchSet);
        }
      });
      g.addEventListener('mouseleave', () => {
        if (state.hoveredNodeId === node.id) {
          state.hoveredNodeId = null;
          renderEdges(matchSet);
        }
      });

      g.addEventListener('pointerdown', (ev) => handleNodePointerDown(ev, node));
    }
  }

  function renderTempLink() {
    tempLinkLayer.innerHTML = '';
    if (!state.linkMode || !state.linkSourceId) return;
    const src = getNode(state.linkSourceId);
    if (!src) return;
    el('line', {
      x1: src.x,
      y1: src.y,
      x2: state.cursorWorld.x,
      y2: state.cursorWorld.y,
      stroke: 'var(--accent-primary)',
      'stroke-width': 2.8,
      'stroke-dasharray': '7 5',
      'pointer-events': 'none',
    }, tempLinkLayer);
  }

  function renderCanvas() {
    const matchSet = new Set(state.data.nodes.filter(isNodeMatchingFilters).map((n) => n.id));
    renderGuides();
    renderEdges(matchSet);
    renderNodes(matchSet);
    renderTempLink();
    treeCountsEl.textContent = `${state.data.nodes.length} nodes · ${state.data.edges.length} links`;
  }

  // =========================================================================
  // POINTER INTERACTIONS (PAN, ZOOM, NODE DRAG, LINK EDGE, CLICK)
  // =========================================================================
  let activeDrag = null;

  function handleNodePointerDown(ev, node) {
    if (ev.button !== 0) return;
    ev.stopPropagation();

    if (state.mode === 'edit' && state.linkMode) {
      handleLinkClick(node);
      return;
    }

    const startWorld = screenToWorld(ev.clientX, ev.clientY);
    activeDrag = {
      type: state.mode === 'edit' ? 'node' : 'click_only',
      node,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      origX: node.x,
      origY: node.y,
      offsetX: node.x - startWorld.x,
      offsetY: node.y - startWorld.y,
      moved: false,
      undoPushed: false,
    };
  }

  function handleLinkClick(node) {
    if (!state.linkSourceId) {
      state.linkSourceId = node.id;
      updateStatusBanner(`Linking from "${node.name}" — click a target child node`);
      renderCanvas();
      return;
    }
    if (state.linkSourceId === node.id) {
      state.linkSourceId = null;
      updateStatusBanner('Link Mode: click a parent node, then click a child node');
      renderCanvas();
      return;
    }
    const exists = state.data.edges.some((e) => e.from === state.linkSourceId && e.to === node.id);
    if (exists) {
      showToast('That prerequisite link already exists.');
      state.linkSourceId = null;
      renderCanvas();
      return;
    }
    if (wouldCreateCycle(state.linkSourceId, node.id)) {
      showToast('Blocked: creating that link would form a cycle (DAG required).');
      state.linkSourceId = null;
      renderCanvas();
      return;
    }
    const src = getNode(state.linkSourceId);
    pushUndo();
    state.data.edges.push({
      id: `edge_${state.linkSourceId}__${node.id}_${Date.now()}`,
      from: state.linkSourceId,
      to: node.id,
    });
    saveTree();
    showToast(`Connected ${src.name} → ${node.name}`);
    state.linkSourceId = null;
    updateStatusBanner('Link Mode: click a parent node, then click a child node');
    renderAll();
  }

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (ev.target.closest('.node-group')) return;
    activeDrag = {
      type: 'pan',
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      origTx: state.view.tx,
      origTy: state.view.ty,
      moved: false,
    };
    svg.classList.add('panning');
  });

  svg.addEventListener('dblclick', (ev) => {
    if (state.mode !== 'edit') return;
    if (ev.target.closest('.node-group')) return;
    const pt = screenToWorld(ev.clientX, ev.clientY);
    createNewNode({ x: Math.round(pt.x), y: Math.round(pt.y) });
  });

  window.addEventListener('pointermove', (ev) => {
    if (state.linkMode && state.linkSourceId) {
      state.cursorWorld = screenToWorld(ev.clientX, ev.clientY);
      renderTempLink();
    }
    if (!activeDrag) return;
    const dx = ev.clientX - activeDrag.startClientX;
    const dy = ev.clientY - activeDrag.startClientY;
    if (!activeDrag.moved && Math.hypot(dx, dy) > 4) {
      activeDrag.moved = true;
    }
    if (!activeDrag.moved) return;

    if (activeDrag.type === 'pan') {
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      state.view.tx = activeDrag.origTx + (dx / rect.width) * vb.width;
      state.view.ty = activeDrag.origTy + (dy / rect.height) * vb.height;
      applyViewport();
    } else if (activeDrag.type === 'node') {
      if (!activeDrag.undoPushed) {
        pushUndo();
        activeDrag.undoPushed = true;
      }
      const pt = screenToWorld(ev.clientX, ev.clientY);
      activeDrag.node.x = Math.round(pt.x + activeDrag.offsetX);
      activeDrag.node.y = Math.round(pt.y + activeDrag.offsetY);
      renderCanvas();
    }
  });

  window.addEventListener('pointerup', () => {
    if (!activeDrag) return;
    const drag = activeDrag;
    activeDrag = null;
    svg.classList.remove('panning');

    if (drag.type === 'node' && drag.moved) {
      saveTree();
      renderInspector();
      return;
    }

    if ((drag.type === 'node' || drag.type === 'click_only') && !drag.moved) {
      const clickedId = drag.node.id;
      if (state.mode === 'build') {
        state.selectedNodeId = clickedId;
        toggleBuildNode(clickedId);
      } else {
        state.selectedNodeId = clickedId;
        renderAll();
      }
    }
  });

  svg.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.12 : 0.89;
      zoomBy(factor, ev.clientX, ev.clientY);
    },
    { passive: false }
  );

  // =========================================================================
  // ROLE PILLS & HUD
  // =========================================================================
  function renderRolePills() {
    rolePillsEl.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = `role-pill${state.filterRole === 'all' ? ' active' : ''}`;
    allBtn.textContent = 'All Roots';
    allBtn.addEventListener('click', () => {
      state.filterRole = 'all';
      renderRolePills();
      renderCanvas();
      fitToNodes();
    });
    rolePillsEl.appendChild(allBtn);

    for (const rid of ALL_ROLES_ORDER) {
      const role = getRoleInfo(rid);
      const btn = document.createElement('button');
      btn.className = `role-pill${state.filterRole === rid ? ' active' : ''}`;
      btn.innerHTML = `<span class="role-dot" style="background:${role.color}"></span>${escapeHtml(role.name)}`;
      btn.addEventListener('click', () => {
        state.filterRole = state.filterRole === rid ? 'all' : rid;
        renderRolePills();
        renderCanvas();
        if (state.filterRole === 'all') {
          fitToNodes();
        } else {
          const subset = state.data.nodes.filter(
            (n) => n.role === rid || (n.secondaryRoles && n.secondaryRoles.includes(rid))
          );
          fitToNodes(subset, 190);
        }
      });
      rolePillsEl.appendChild(btn);
    }
  }

  function updateStatusBanner(msg = '') {
    if (!msg) {
      hudStatusEl.classList.remove('visible');
      return;
    }
    hudStatusTextEl.textContent = msg;
    hudStatusEl.classList.add('visible');
  }

  function updateUndoButtons() {
    document.getElementById('btn-undo').disabled = state.undoStack.length === 0;
    document.getElementById('btn-redo').disabled = state.redoStack.length === 0;
  }

  // =========================================================================
  // RIGHT DRAWER RENDERER (INSPECT / BUILD / EDIT)
  // =========================================================================
  function renderInspector() {
    buildSubtabs.style.display = state.mode === 'build' ? 'flex' : 'none';
    buildSubtabs.querySelectorAll('.sub-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.btab === state.buildSubTab);
    });

    if (state.mode === 'inspect') {
      renderInspectPanel();
    } else if (state.mode === 'build') {
      if (state.buildSubTab === 'sheet') renderBuildSheetPanel();
      else renderBuildNodePanel();
    } else {
      renderEditPanel();
    }
  }

  function renderNodeDetailsCards(node, { showBuildStatus = false } = {}) {
    const role = getRoleInfo(node.role);
    const cat = state.data.categories[node.category] || { label: node.category };
    const parents = getParents(node.id).map(getNode).filter(Boolean);
    const children = getChildren(node.id).map(getNode).filter(Boolean);
    const minLevel = state.data.meta.tierMinLevels[node.tier] ?? 1;

    const grantChips = [];
    if (node.grants?.hitDie) grantChips.push(`Hit Die d${node.grants.hitDie}`);
    if (node.grants?.spellTier) grantChips.push(SPELL_TIER_LABELS[node.grants.spellTier]);
    for (const s of node.grants?.saves || []) grantChips.push(`${s} Save`);
    for (const sk of node.grants?.skills || []) grantChips.push(`Skill: ${sk}`);
    for (const p of node.grants?.proficiencies || []) grantChips.push(p);
    for (const t of node.grants?.tags || []) grantChips.push(t);

    let buildBannerHtml = '';
    if (showBuildStatus) {
      const evalRes = evaluateNodeBuildStatus(node);
      const blockers = evalRes.status === 'unlocked' ? getBlockingUnlockedChildren(node.id) : [];
      if (evalRes.status === 'unlocked') {
        buildBannerHtml = `
          <div class="status-callout unlocked">
            <strong>Unlocked</strong> · Spent ${node.cost} SP
            ${blockers.length ? `<div style="margin-top:4px;color:var(--text-secondary)">Required by: ${blockers.map((b) => escapeHtml(b.name)).join(', ')}</div>` : ''}
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
              ${
                blockers.length
                  ? `<button id="btn-refund-cascade" class="btn btn-sm btn-danger">Refund Branch (${blockers.length + 1}+ nodes)</button>`
                  : `<button id="btn-toggle-unlock" class="btn btn-sm btn-danger">Refund Node (+${node.cost} SP)</button>`
              }
            </div>
          </div>`;
      } else if (evalRes.status === 'available') {
        buildBannerHtml = `
          <div class="status-callout">
            <strong>Available to Unlock</strong> · Cost: ${node.cost} SP (${getRemainingSP()} SP remaining)
            <div style="margin-top:8px;">
              <button id="btn-toggle-unlock" class="btn btn-sm btn-primary">Unlock ${escapeHtml(node.name)} (-${node.cost} SP)</button>
            </div>
          </div>`;
      } else {
        buildBannerHtml = `
          <div class="status-callout locked">
            <strong>Locked</strong>
            <ul style="margin:5px 0 0 16px;padding:0;">
              ${evalRes.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>`;
      }
    }

    return `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span class="badge" style="border-color:${role.color};color:${role.color};background:${role.softBg || 'transparent'}">
            ${escapeHtml(role.name)}
          </span>
          <span class="badge badge-mono">Tier ${TIER_ROMAN[node.tier]} · Lv ${minLevel}+ · ${node.cost} SP</span>
        </div>
        <h2 class="node-header-title" style="margin-top:8px;">${escapeHtml(node.name)}</h2>
        <div class="badge-row">
          <span class="badge">${escapeHtml(cat.label)}</span>
          <span class="badge">${escapeHtml(node.source5e)}</span>
          ${(node.secondaryRoles || [])
            .map((sr) => {
              const info = getRoleInfo(sr);
              return `<span class="badge" style="color:${info.color};border-color:${info.color}">${escapeHtml(info.name)}</span>`;
            })
            .join('')}
        </div>
        <p class="summary-text">${escapeHtml(node.summary)}</p>
      </div>

      ${buildBannerHtml}

      <div class="card">
        <div class="card-title">5e Rules & Mechanics</div>
        <p class="mechanics-text">${escapeHtml(node.mechanics)}</p>
      </div>

      ${
        grantChips.length
          ? `<div class="card">
              <div class="card-title">Structured Grants</div>
              <div class="badge-row" style="margin-top:0;">
                ${grantChips.map((g) => `<span class="badge">${escapeHtml(g)}</span>`).join('')}
              </div>
            </div>`
          : ''
      }

      <div class="card">
        <div class="card-title">
          <span>Prerequisites (${parents.length})</span>
          <span style="font-weight:500;text-transform:none;">${
            parents.length > 1 ? (node.prereqMode === 'any' ? 'Requires ANY' : 'Requires ALL') : ''
          }</span>
        </div>
        ${
          parents.length
            ? `<div class="link-chip-list">
                ${parents
                  .map((p) => {
                    const pr = getRoleInfo(p.role);
                    return `<button class="link-chip" data-jump-node="${p.id}">
                      <span class="role-dot" style="background:${pr.color}"></span>${escapeHtml(p.name)}
                    </button>`;
                  })
                  .join('')}
              </div>`
            : `<div style="font-size:12.5px;color:var(--text-muted)">Root Gateway (no parent prerequisites)</div>`
        }
      </div>

      <div class="card">
        <div class="card-title">Unlocks (${children.length})</div>
        ${
          children.length
            ? `<div class="link-chip-list">
                ${children
                  .map((c) => {
                    const cr = getRoleInfo(c.role);
                    return `<button class="link-chip" data-jump-node="${c.id}">
                      <span class="role-dot" style="background:${cr.color}"></span>${escapeHtml(c.name)}
                    </button>`;
                  })
                  .join('')}
              </div>`
            : `<div style="font-size:12.5px;color:var(--text-muted)">Leaf / Capstone Node</div>`
        }
      </div>
    `;
  }

  function wireJumpButtons() {
    inspectorContent.querySelectorAll('[data-jump-node]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.jumpNode;
        state.selectedNodeId = id;
        panToNode(id, Math.max(1.25, state.view.scale));
        renderAll();
      });
    });
  }

  function renderInspectPanel() {
    const node = getNode(state.selectedNodeId);
    if (!node) {
      inspectorContent.innerHTML = `<div class="empty-state">Select any node on the skill web to inspect its 5e rules, grants, and connections.</div>`;
      return;
    }

    inspectorContent.innerHTML = `
      ${renderNodeDetailsCards(node)}
      <div style="display:flex;gap:8px;">
        <button id="quick-to-build" class="btn btn-primary" style="flex:1">Test in Build Mode</button>
        <button id="quick-to-edit" class="btn" style="flex:1">Edit Node</button>
      </div>
    `;
    wireJumpButtons();
    document.getElementById('quick-to-build').addEventListener('click', () => setMode('build'));
    document.getElementById('quick-to-edit').addEventListener('click', () => setMode('edit'));
  }

  function renderBuildNodePanel() {
    const node = getNode(state.selectedNodeId);
    if (!node) {
      inspectorContent.innerHTML = `<div class="empty-state">Click any node on the canvas to unlock it or view its requirements.</div>`;
      return;
    }
    inspectorContent.innerHTML = renderNodeDetailsCards(node, { showBuildStatus: true });
    wireJumpButtons();
    const toggleBtn = document.getElementById('btn-toggle-unlock');
    if (toggleBtn) toggleBtn.addEventListener('click', () => toggleBuildNode(node.id, false));
    const cascadeBtn = document.getElementById('btn-refund-cascade');
    if (cascadeBtn) cascadeBtn.addEventListener('click', () => toggleBuildNode(node.id, true));
  }

  function renderBuildSheetPanel() {
    const c = computeCharacterSummary();
    const pct = Math.min(100, Math.round((c.spentSP / Math.max(1, c.totalSP)) * 100));

    inspectorContent.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>Character Level & Budget</span>
          <span class="badge badge-mono">Prof +${c.profBonus}</span>
        </div>

        <div class="form-grid" style="margin-bottom:10px;">
          <div class="form-field">
            <label for="build-level">Level (${c.level})</label>
            <input id="build-level" type="range" min="1" max="20" value="${c.level}" style="accent-color:var(--accent-primary)" />
          </div>
          <div class="form-field">
            <label for="build-con">CON Mod (${c.conMod >= 0 ? '+' : ''}${c.conMod})</label>
            <input id="build-con" type="range" min="-1" max="5" value="${c.conMod}" style="accent-color:var(--accent-primary)" />
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;">
          <span>Skill Points: ${c.spentSP} / ${c.totalSP} SP</span>
          <span style="color:${c.remainingSP < 0 ? 'var(--danger)' : 'var(--success)'}">${c.remainingSP} remaining</span>
        </div>
        <div class="sp-bar-track">
          <div class="sp-bar-fill" style="width:${pct}%"></div>
        </div>

        <div class="form-field" style="margin-top:10px;">
          <label for="preset-select">Load Starter Preset</label>
          <div style="display:flex;gap:6px;">
            <select id="preset-select" class="form-select" style="flex:1;">
              <option value="">— Choose Archetype Preset —</option>
              ${(state.data.presets || [])
                .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
                .join('')}
            </select>
            <button id="btn-reset-build" class="btn btn-sm btn-danger">Reset</button>
          </div>
        </div>
      </div>

      <div class="builder-header-grid">
        <div class="stat-tile">
          <div class="stat-label">Hit Die / Avg HP</div>
          <div class="stat-value">d${c.hitDie} · ${c.avgHp} HP</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">Spellcasting</div>
          <div class="stat-value" style="font-size:13px;margin-top:5px;">${
            c.spellTier === 0 ? 'None' : `Tier ${TIER_ROMAN[c.spellTier]}`
          }</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Saving Throw Proficiencies</div>
        <div class="saves-grid">
          ${ALL_SAVES.map(
            (s) => `<div class="save-pill${c.saves.has(s) ? ' proficient' : ''}">${s}</div>`
          ).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Skills (${c.skills.length} / 18)</div>
        ${
          c.skills.length
            ? `<div class="badge-row" style="margin-top:0;">${c.skills
                .map((s) => `<span class="badge">${escapeHtml(s)}</span>`)
                .join('')}</div>`
            : `<div style="font-size:12.5px;color:var(--text-muted)">Click Skill nodes on the canvas to unlock.</div>`
        }
      </div>

      <div class="card">
        <div class="card-title">Proficiencies (${c.proficiencies.length})</div>
        ${
          c.proficiencies.length
            ? `<div class="badge-row" style="margin-top:0;">${c.proficiencies
                .map((p) => `<span class="badge">${escapeHtml(p)}</span>`)
                .join('')}</div>`
            : `<div style="font-size:12.5px;color:var(--text-muted)">No weapon, armor, or tool proficiencies yet.</div>`
        }
      </div>

      <div class="card">
        <div class="card-title">Unlocked Features & Feats (${c.features.length + c.feats.length})</div>
        ${
          c.features.length + c.feats.length
            ? `<div class="link-chip-list">
                ${[...c.features, ...c.feats]
                  .map((f) => {
                    const fr = getRoleInfo(f.role);
                    return `<button class="link-chip" data-jump-node="${f.id}">
                      <span class="role-dot" style="background:${fr.color}"></span>${escapeHtml(f.name)}
                    </button>`;
                  })
                  .join('')}
              </div>`
            : `<div style="font-size:12.5px;color:var(--text-muted)">Start by clicking any Role Root (Combat, Devotion, Magic, Social, or Exploring) on the canvas!</div>`
        }
      </div>

      <button id="btn-export-sheet" class="btn btn-primary">Export Character Sheet (.md)</button>
    `;

    wireJumpButtons();

    document.getElementById('build-level').addEventListener('input', (ev) => {
      state.build.level = Number(ev.target.value);
      saveBuild();
      renderAll();
    });

    document.getElementById('build-con').addEventListener('input', (ev) => {
      state.build.conMod = Number(ev.target.value);
      saveBuild();
      renderInspector();
    });

    document.getElementById('preset-select').addEventListener('change', (ev) => {
      const pid = ev.target.value;
      if (!pid) return;
      const preset = (state.data.presets || []).find((p) => p.id === pid);
      if (!preset) return;
      state.build.level = preset.level;
      state.build.unlocked = new Set(preset.unlocked.filter((id) => Boolean(getNode(id))));
      saveBuild();
      renderAll();
      showToast(`Loaded preset: ${preset.name}`);
    });

    document.getElementById('btn-reset-build').addEventListener('click', () => {
      state.build.unlocked.clear();
      saveBuild();
      renderAll();
      showToast('Character build reset');
    });

    document.getElementById('btn-export-sheet').addEventListener('click', exportCharacterMarkdown);
  }

  // =========================================================================
  // EDIT MODE PANEL & MUTATIONS
  // =========================================================================
  function createNewNode({ x, y, parentId = null, role = null, tier = null } = {}) {
    pushUndo();
    const parent = parentId ? getNode(parentId) : null;
    const newRole = role || (parent ? parent.role : 'combat');
    const newTier = tier !== null ? tier : parent ? Math.min(4, parent.tier + 1) : 1;

    let nx = x;
    let ny = y;
    if (nx === undefined || ny === undefined) {
      if (parent) {
        const ang = Math.atan2(parent.y, parent.x);
        const r = Math.hypot(parent.x, parent.y) + 175;
        nx = Math.round(Math.cos(ang + 0.08) * r);
        ny = Math.round(Math.sin(ang + 0.08) * r);
      } else {
        nx = 0;
        ny = 0;
      }
    }

    const id = `custom_${Date.now().toString(36)}`;
    const newNode = {
      id,
      name: 'New Feature',
      role: newRole,
      secondaryRoles: newRole === 'hybrid' ? ['combat', 'magic'] : [],
      category: 'class_feature',
      tier: newTier,
      cost: Math.max(1, newTier),
      prereqMode: 'all',
      x: nx,
      y: ny,
      source5e: 'Homebrew / Custom',
      summary: 'Short summary of what this node grants.',
      mechanics: 'Describe the full 5e rules, action cost, and scaling here.',
      grants: {
        hitDie: null,
        saves: [],
        skills: [],
        proficiencies: [],
        spellTier: 0,
        tags: [],
      },
    };

    state.data.nodes.push(newNode);
    if (parent) {
      state.data.edges.push({
        id: `edge_${parent.id}__${id}`,
        from: parent.id,
        to: id,
      });
    }
    state.selectedNodeId = id;
    saveTree();
    renderAll();
    panToNode(id, Math.max(1.1, state.view.scale));
    showToast(parent ? `Added child node under ${parent.name}` : 'Created new node');
  }

  function deleteNode(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;
    pushUndo();
    state.data.nodes = state.data.nodes.filter((n) => n.id !== nodeId);
    state.data.edges = state.data.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    state.build.unlocked.delete(nodeId);
    state.selectedNodeId = state.data.nodes[0]?.id || null;
    saveTree();
    saveBuild();
    renderAll();
    showToast(`Deleted "${node.name}"`);
  }

  function autoLayoutRadial() {
    pushUndo();
    const roleGroups = new Map();
    for (const r of ALL_ROLES_ORDER) roleGroups.set(r, [[], [], [], [], []]);

    for (const n of state.data.nodes) {
      const grp = roleGroups.get(n.role) || roleGroups.get('hybrid');
      const t = Math.max(0, Math.min(4, Number(n.tier) || 0));
      grp[t].push(n);
    }

    const baseAngles = { combat: -90, devotion: -18, magic: 54, social: 126, exploring: 198 };
    const seamAngles = {
      'combat+devotion': -54,
      'devotion+magic': 18,
      'magic+social': 90,
      'exploring+social': 162,
      'combat+exploring': -126,
    };

    for (const [rid, tiers] of roleGroups.entries()) {
      if (rid === 'hybrid') continue;
      const center = baseAngles[rid];
      tiers.forEach((list, tier) => {
        if (!list.length) return;
        const r = TIER_RADII[tier];
        const span = Math.min(48, Math.max(10, (list.length - 1) * 9.5));
        list.forEach((n, idx) => {
          const offset = list.length === 1 ? 0 : -span / 2 + (idx / (list.length - 1)) * span;
          const rad = ((center + offset) * Math.PI) / 180;
          n.x = Math.round(Math.cos(rad) * r);
          n.y = Math.round(Math.sin(rad) * r);
        });
      });
    }

    // Place hybrids along their seam angles
    const hybridNodes = state.data.nodes.filter((n) => n.role === 'hybrid');
    hybridNodes.forEach((n, idx) => {
      const key = (n.secondaryRoles || []).slice(0, 2).sort().join('+');
      const seam = seamAngles[key];
      const r = seam !== undefined ? Math.max(600, TIER_RADII[n.tier] - 40) : 90 + (idx % 3) * 50;
      const ang = ((seam !== undefined ? seam : idx * 120) * Math.PI) / 180;
      n.x = Math.round(Math.cos(ang) * r);
      n.y = Math.round(Math.sin(ang) * r);
    });

    // Collision relaxation
    const MIN_DIST = 132;
    for (let iter = 0; iter < 100; iter++) {
      let moved = false;
      for (let i = 0; i < state.data.nodes.length; i++) {
        for (let j = i + 1; j < state.data.nodes.length; j++) {
          const a = state.data.nodes[i];
          const b = state.data.nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.1;
          if (d < MIN_DIST) {
            const push = (MIN_DIST - d) * 0.5;
            if (a.category !== 'root') {
              a.x -= (dx / d) * push;
              a.y -= (dy / d) * push;
            }
            if (b.category !== 'root') {
              b.x += (dx / d) * push;
              b.y += (dy / d) * push;
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    for (const n of state.data.nodes) {
      n.x = Math.round(n.x);
      n.y = Math.round(n.y);
    }

    saveTree();
    renderAll();
    fitToNodes();
    showToast('Re-computed radial skill web layout');
  }

  function renderEditPanel() {
    const node = getNode(state.selectedNodeId);
    if (!node) {
      inspectorContent.innerHTML = `
        <div class="card">
          <div class="card-title">Web Editor</div>
          <p class="summary-text">Click any node to edit it, drag nodes to reposition, double-click empty canvas to create a new node, or click an edge to delete it.</p>
          <div style="margin-top:10px;display:flex;gap:8px;">
            <button id="edit-add-standalone" class="btn btn-primary" style="flex:1">+ Add Node</button>
            <button id="edit-reset-default" class="btn btn-danger">Reset Default</button>
          </div>
        </div>
      `;
      document.getElementById('edit-add-standalone').addEventListener('click', () => createNewNode({ x: 0, y: 0 }));
      document.getElementById('edit-reset-default').addEventListener('click', resetDefaultTree);
      return;
    }

    const parents = getParents(node.id).map(getNode).filter(Boolean);
    const children = getChildren(node.id).map(getNode).filter(Boolean);
    const parentIdSet = new Set(parents.map((p) => p.id));
    const validParentCandidates = state.data.nodes
      .filter((cand) => cand.id !== node.id && !parentIdSet.has(cand.id) && !wouldCreateCycle(cand.id, node.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const categoryOpts = Object.values(state.data.categories)
      .map((c) => `<option value="${c.id}" ${node.category === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`)
      .join('');

    const roleOpts = ALL_ROLES_ORDER.map((rid) => {
      const r = getRoleInfo(rid);
      return `<option value="${rid}" ${node.role === rid ? 'selected' : ''}>${escapeHtml(r.name)}</option>`;
    }).join('');

    inspectorContent.innerHTML = `
      <div class="card" style="padding:10px 12px;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button id="edit-add-child" class="btn btn-sm btn-primary" style="flex:1">+ Add Child</button>
          <button id="edit-delete-node" class="btn btn-sm btn-danger">Delete Node</button>
          <button id="edit-reset-default" class="btn btn-sm" title="Restore original 115-node SRD web">Reset SRD</button>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">
          Tip: Drag nodes on canvas · Double-click canvas to add · Click any edge to unlink.
        </div>
      </div>

      <div class="card">
        <div class="card-title">Node Properties</div>
        <div class="form-grid">
          <div class="form-field full">
            <label for="ed-name">Name</label>
            <input id="ed-name" class="form-input" value="${escapeHtml(node.name)}" />
          </div>

          <div class="form-field">
            <label for="ed-role">Primary Role</label>
            <select id="ed-role" class="form-select">${roleOpts}</select>
          </div>

          <div class="form-field">
            <label for="ed-category">Category</label>
            <select id="ed-category" class="form-select">${categoryOpts}</select>
          </div>

          <div class="form-field">
            <label for="ed-tier">Tier (0–4)</label>
            <select id="ed-tier" class="form-select">
              <option value="0" ${node.tier === 0 ? 'selected' : ''}>Tier 0 (Root)</option>
              <option value="1" ${node.tier === 1 ? 'selected' : ''}>Tier I (Lv 1+)</option>
              <option value="2" ${node.tier === 2 ? 'selected' : ''}>Tier II (Lv 5+)</option>
              <option value="3" ${node.tier === 3 ? 'selected' : ''}>Tier III (Lv 11+)</option>
              <option value="4" ${node.tier === 4 ? 'selected' : ''}>Tier IV (Lv 17+)</option>
            </select>
          </div>

          <div class="form-field">
            <label for="ed-cost">SP Cost</label>
            <input id="ed-cost" class="form-input" type="number" min="0" max="20" value="${node.cost}" />
          </div>

          <div class="form-field">
            <label for="ed-prereq-mode">Prereq Mode</label>
            <select id="ed-prereq-mode" class="form-select">
              <option value="all" ${node.prereqMode !== 'any' ? 'selected' : ''}>ALL parents</option>
              <option value="any" ${node.prereqMode === 'any' ? 'selected' : ''}>ANY parent</option>
            </select>
          </div>

          <div class="form-field">
            <label for="ed-source">5e Source</label>
            <input id="ed-source" class="form-input" value="${escapeHtml(node.source5e)}" />
          </div>

          ${
            node.role === 'hybrid'
              ? `<div class="form-field full">
                  <label>Hybrid Linked Roles</label>
                  <div class="check-row">
                    ${['combat', 'devotion', 'magic', 'social', 'exploring']
                      .map((rid) => {
                        const checked = (node.secondaryRoles || []).includes(rid);
                        return `<label class="check-pill">
                          <input type="checkbox" data-sec-role="${rid}" ${checked ? 'checked' : ''} />
                          ${escapeHtml(getRoleInfo(rid).name)}
                        </label>`;
                      })
                      .join('')}
                  </div>
                </div>`
              : ''
          }

          <div class="form-field full">
            <label for="ed-summary">Short Summary</label>
            <input id="ed-summary" class="form-input" value="${escapeHtml(node.summary)}" />
          </div>

          <div class="form-field full">
            <label for="ed-mechanics">5e Mechanics</label>
            <textarea id="ed-mechanics" class="form-textarea">${escapeHtml(node.mechanics)}</textarea>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Structured Grants</div>
        <div class="form-grid">
          <div class="form-field">
            <label for="ed-hd">Hit Die Upgrade</label>
            <select id="ed-hd" class="form-select">
              <option value="" ${!node.grants?.hitDie ? 'selected' : ''}>None</option>
              <option value="8" ${node.grants?.hitDie === 8 ? 'selected' : ''}>d8</option>
              <option value="10" ${node.grants?.hitDie === 10 ? 'selected' : ''}>d10</option>
              <option value="12" ${node.grants?.hitDie === 12 ? 'selected' : ''}>d12</option>
            </select>
          </div>

          <div class="form-field">
            <label for="ed-spell">Spellcasting Tier</label>
            <select id="ed-spell" class="form-select">
              ${SPELL_TIER_LABELS.map(
                (lbl, i) => `<option value="${i}" ${(node.grants?.spellTier || 0) === i ? 'selected' : ''}>${escapeHtml(lbl)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="form-field full">
            <label>Saving Throws</label>
            <div class="check-row">
              ${ALL_SAVES.map((s) => {
                const checked = (node.grants?.saves || []).includes(s);
                return `<label class="check-pill"><input type="checkbox" data-grant-save="${s}" ${checked ? 'checked' : ''} />${s}</label>`;
              }).join('')}
            </div>
          </div>

          <div class="form-field full">
            <label for="ed-skills">Skills (comma-separated)</label>
            <input id="ed-skills" class="form-input" value="${escapeHtml((node.grants?.skills || []).join(', '))}" placeholder="e.g., Stealth, Perception" />
          </div>

          <div class="form-field full">
            <label for="ed-profs">Proficiencies (comma-separated)</label>
            <input id="ed-profs" class="form-input" value="${escapeHtml((node.grants?.proficiencies || []).join(', '))}" placeholder="e.g., Heavy Armor, Shields" />
          </div>

          <div class="form-field full">
            <label for="ed-tags">Tags (comma-separated)</label>
            <input id="ed-tags" class="form-input" value="${escapeHtml((node.grants?.tags || []).join(', '))}" placeholder="e.g., Action Economy, Capstone" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Parent Connections (${parents.length})</div>
        <div class="link-chip-list" style="margin-bottom:8px;">
          ${
            parents.length
              ? parents
                  .map(
                    (p) => `<span class="link-chip">
                      <span data-jump-node="${p.id}">${escapeHtml(p.name)}</span>
                      <span class="link-chip-remove" data-unlink-parent="${p.id}" title="Remove prerequisite">&times;</span>
                    </span>`
                  )
                  .join('')
              : `<span style="font-size:12px;color:var(--text-muted)">No parent prerequisites</span>`
          }
        </div>
        <div style="display:flex;gap:6px;">
          <select id="ed-add-parent-select" class="form-select" style="flex:1;">
            <option value="">+ Add parent prerequisite...</option>
            ${validParentCandidates.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (T${c.tier})</option>`).join('')}
          </select>
          <button id="ed-add-parent-btn" class="btn btn-sm">Add</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Children (${children.length}) & Position</div>
        <div class="link-chip-list" style="margin-bottom:10px;">
          ${
            children.length
              ? children
                  .map(
                    (c) => `<span class="link-chip">
                      <span data-jump-node="${c.id}">${escapeHtml(c.name)}</span>
                      <span class="link-chip-remove" data-unlink-child="${c.id}" title="Unlink child">&times;</span>
                    </span>`
                  )
                  .join('')
              : `<span style="font-size:12px;color:var(--text-muted)">No child nodes</span>`
          }
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="ed-x">Canvas X</label>
            <input id="ed-x" class="form-input" type="number" value="${node.x}" />
          </div>
          <div class="form-field">
            <label for="ed-y">Canvas Y</label>
            <input id="ed-y" class="form-input" type="number" value="${node.y}" />
          </div>
        </div>
      </div>
    `;

    wireJumpButtons();

    function mutateNode(fn, rerenderInspector = false) {
      pushUndo();
      fn();
      saveTree();
      renderCanvas();
      if (rerenderInspector) renderInspector();
    }

    document.getElementById('edit-add-child').addEventListener('click', () =>
      createNewNode({ parentId: node.id })
    );
    document.getElementById('edit-delete-node').addEventListener('click', () => deleteNode(node.id));
    document.getElementById('edit-reset-default').addEventListener('click', resetDefaultTree);

    document.getElementById('ed-name').addEventListener('change', (ev) =>
      mutateNode(() => { node.name = ev.target.value.trim() || 'Untitled'; })
    );
    document.getElementById('ed-role').addEventListener('change', (ev) =>
      mutateNode(() => {
        node.role = ev.target.value;
        if (node.role === 'hybrid' && (!node.secondaryRoles || node.secondaryRoles.length < 2)) {
          node.secondaryRoles = ['combat', 'magic'];
        }
      }, true)
    );
    document.getElementById('ed-category').addEventListener('change', (ev) =>
      mutateNode(() => { node.category = ev.target.value; })
    );
    document.getElementById('ed-tier').addEventListener('change', (ev) =>
      mutateNode(() => { node.tier = Number(ev.target.value); })
    );
    document.getElementById('ed-cost').addEventListener('change', (ev) =>
      mutateNode(() => { node.cost = Math.max(0, Number(ev.target.value) || 0); })
    );
    document.getElementById('ed-prereq-mode').addEventListener('change', (ev) =>
      mutateNode(() => { node.prereqMode = ev.target.value; })
    );
    document.getElementById('ed-source').addEventListener('change', (ev) =>
      mutateNode(() => { node.source5e = ev.target.value; })
    );
    document.getElementById('ed-summary').addEventListener('change', (ev) =>
      mutateNode(() => { node.summary = ev.target.value; })
    );
    document.getElementById('ed-mechanics').addEventListener('change', (ev) =>
      mutateNode(() => { node.mechanics = ev.target.value; })
    );

    inspectorContent.querySelectorAll('[data-sec-role]').forEach((cb) => {
      cb.addEventListener('change', () =>
        mutateNode(() => {
          const checked = Array.from(inspectorContent.querySelectorAll('[data-sec-role]:checked')).map(
            (el) => el.dataset.secRole
          );
          node.secondaryRoles = checked;
        })
      );
    });

    document.getElementById('ed-hd').addEventListener('change', (ev) =>
      mutateNode(() => {
        node.grants.hitDie = ev.target.value ? Number(ev.target.value) : null;
      })
    );
    document.getElementById('ed-spell').addEventListener('change', (ev) =>
      mutateNode(() => {
        node.grants.spellTier = Number(ev.target.value) || 0;
      })
    );

    inspectorContent.querySelectorAll('[data-grant-save]').forEach((cb) => {
      cb.addEventListener('change', () =>
        mutateNode(() => {
          node.grants.saves = Array.from(
            inspectorContent.querySelectorAll('[data-grant-save]:checked')
          ).map((el) => el.dataset.grantSave);
        })
      );
    });

    const parseCsv = (val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    document.getElementById('ed-skills').addEventListener('change', (ev) =>
      mutateNode(() => { node.grants.skills = parseCsv(ev.target.value); })
    );
    document.getElementById('ed-profs').addEventListener('change', (ev) =>
      mutateNode(() => { node.grants.proficiencies = parseCsv(ev.target.value); })
    );
    document.getElementById('ed-tags').addEventListener('change', (ev) =>
      mutateNode(() => { node.grants.tags = parseCsv(ev.target.value); })
    );

    document.getElementById('ed-x').addEventListener('change', (ev) =>
      mutateNode(() => { node.x = Number(ev.target.value) || 0; })
    );
    document.getElementById('ed-y').addEventListener('change', (ev) =>
      mutateNode(() => { node.y = Number(ev.target.value) || 0; })
    );

    document.getElementById('ed-add-parent-btn').addEventListener('click', () => {
      const sel = document.getElementById('ed-add-parent-select');
      const pid = sel.value;
      if (!pid) return;
      if (wouldCreateCycle(pid, node.id)) {
        showToast('Blocked: would create a cycle.');
        return;
      }
      mutateNode(() => {
        state.data.edges.push({ id: `edge_${pid}__${node.id}_${Date.now()}`, from: pid, to: node.id });
      }, true);
      showToast('Added prerequisite link');
    });

    inspectorContent.querySelectorAll('[data-unlink-parent]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const pid = btn.dataset.unlinkParent;
        mutateNode(() => {
          state.data.edges = state.data.edges.filter((e) => !(e.from === pid && e.to === node.id));
        }, true);
        showToast('Removed parent link');
      });
    });

    inspectorContent.querySelectorAll('[data-unlink-child]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const cid = btn.dataset.unlinkChild;
        mutateNode(() => {
          state.data.edges = state.data.edges.filter((e) => !(e.from === node.id && e.to === cid));
        }, true);
        showToast('Removed child link');
      });
    });
  }

  function resetDefaultTree() {
    pushUndo();
    state.data = deepClone(window.FIVEFOLD_DEFAULT_TREE);
    state.selectedNodeId = 'combat_root';
    pruneInvalidBuildNodes();
    saveTree();
    renderAll();
    fitToNodes();
    showToast('Restored default Fivefold 5e skill web');
  }

  // =========================================================================
  // SEARCH, IMPORT/EXPORT, THEME & MODE SWITCHING
  // =========================================================================
  function setMode(mode) {
    state.mode = mode;
    if (mode !== 'edit') {
      state.linkMode = false;
      state.linkSourceId = null;
      svg.classList.remove('linking');
      updateStatusBanner('');
    }
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    editCanvasToolsEl.style.display = mode === 'edit' ? 'flex' : 'none';
    document.getElementById('btn-link-mode').classList.toggle('btn-active', state.linkMode);
    renderAll();
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fivefold5e_theme', theme);
    document.getElementById('btn-theme').textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  function downloadText(filename, content, mime = 'application/json') {
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

  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visible'), 2600);
  }

  function renderSearchDropdown() {
    const q = state.searchQuery.trim().toLowerCase();
    searchClear.classList.toggle('visible', q.length > 0);
    if (!q) {
      searchResults.classList.remove('open');
      searchResults.innerHTML = '';
      return;
    }
    const matches = state.data.nodes.filter(isNodeMatchingFilters).slice(0, 12);
    if (!matches.length) {
      searchResults.innerHTML = `<div style="padding:10px;font-size:12.5px;color:var(--text-muted)">No matching nodes</div>`;
      searchResults.classList.add('open');
      return;
    }
    searchResults.innerHTML = matches
      .map((n) => {
        const role = getRoleInfo(n.role);
        return `<button class="search-item" data-pick-node="${n.id}">
          <span style="display:flex;align-items:center;gap:7px;">
            <span class="role-dot" style="background:${role.color}"></span>
            <span style="font-weight:600;font-size:12.5px;">${escapeHtml(n.name)}</span>
          </span>
          <span class="badge badge-mono" style="font-size:10.5px;">T${n.tier} · ${n.cost} SP</span>
        </button>`;
      })
      .join('');
    searchResults.classList.add('open');
    searchResults.querySelectorAll('[data-pick-node]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pickNode;
        state.selectedNodeId = id;
        searchResults.classList.remove('open');
        panToNode(id, 1.55);
        renderAll();
      });
    });
  }

  function renderAll() {
    renderRolePills();
    renderCanvas();
    renderInspector();
    updateUndoButtons();
  }

  // =========================================================================
  // EVENT WIRING
  // =========================================================================
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  buildSubtabs.querySelectorAll('.sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.buildSubTab = btn.dataset.btab;
      renderInspector();
    });
  });

  document.getElementById('filter-category').addEventListener('change', (ev) => {
    state.filterCategory = ev.target.value;
    renderCanvas();
  });

  document.getElementById('filter-tier').addEventListener('change', (ev) => {
    state.filterTier = ev.target.value;
    renderCanvas();
  });

  searchInput.addEventListener('input', (ev) => {
    state.searchQuery = ev.target.value;
    renderCanvas();
    renderSearchDropdown();
  });

  searchClear.addEventListener('click', () => {
    state.searchQuery = '';
    searchInput.value = '';
    renderCanvas();
    renderSearchDropdown();
  });

  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.search-wrap')) searchResults.classList.remove('open');
  });

  document.getElementById('btn-zoom-in').addEventListener('click', () => zoomBy(1.25));
  document.getElementById('btn-zoom-out').addEventListener('click', () => zoomBy(0.8));
  document.getElementById('btn-fit').addEventListener('click', () => fitToNodes());

  document.getElementById('btn-rings').addEventListener('click', (ev) => {
    state.showRings = !state.showRings;
    ev.currentTarget.classList.toggle('btn-active', state.showRings);
    renderGuides();
  });

  document.getElementById('btn-add-node').addEventListener('click', () => {
    const sel = getNode(state.selectedNodeId);
    createNewNode({ parentId: sel ? sel.id : null });
  });

  document.getElementById('btn-link-mode').addEventListener('click', (ev) => {
    state.linkMode = !state.linkMode;
    state.linkSourceId = null;
    ev.currentTarget.classList.toggle('btn-active', state.linkMode);
    svg.classList.toggle('linking', state.linkMode);
    updateStatusBanner(state.linkMode ? 'Link Mode: click a parent node, then click a child node' : '');
    renderCanvas();
  });

  document.getElementById('hud-status-cancel').addEventListener('click', () => {
    state.linkMode = false;
    state.linkSourceId = null;
    document.getElementById('btn-link-mode').classList.remove('btn-active');
    svg.classList.remove('linking');
    updateStatusBanner('');
    renderCanvas();
  });

  document.getElementById('btn-auto-layout').addEventListener('click', autoLayoutRadial);
  document.getElementById('btn-undo').addEventListener('click', performUndo);
  document.getElementById('btn-redo').addEventListener('click', performRedo);

  document.getElementById('btn-export').addEventListener('click', () => {
    downloadText('fivefold5e-skill-tree.json', JSON.stringify(state.data, null, 2));
    showToast('Exported Skill Web JSON');
  });

  const fileImport = document.getElementById('file-import');
  document.getElementById('btn-import').addEventListener('click', () => fileImport.click());
  fileImport.addEventListener('change', (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error('JSON must include "nodes" and "edges" arrays.');
        }
        pushUndo();
        state.data = {
          ...deepClone(window.FIVEFOLD_DEFAULT_TREE),
          ...parsed,
        };
        state.selectedNodeId = state.data.nodes[0]?.id || null;
        pruneInvalidBuildNodes();
        saveTree();
        renderAll();
        fitToNodes();
        showToast(`Imported ${state.data.nodes.length} nodes & ${state.data.edges.length} links`);
      } catch (err) {
        showToast(`Import failed: ${err.message}`);
      }
      fileImport.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-theme').addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (ev) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) performRedo();
      else performUndo();
    } else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      performRedo();
    } else if (ev.key === 'Escape' && state.linkMode) {
      state.linkMode = false;
      state.linkSourceId = null;
      document.getElementById('btn-link-mode').classList.remove('btn-active');
      svg.classList.remove('linking');
      updateStatusBanner('');
      renderCanvas();
    }
  });

  // Boot
  applyTheme(state.theme);
  renderAll();
  fitToNodes();
})();
