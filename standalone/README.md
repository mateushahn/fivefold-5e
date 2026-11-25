# Fivefold 5e — Role-Rooted RPG Skill Web Studio

A classless D&D 5e-based RPG system where class features, subclass features, skills, saving throws, proficiencies, hit dice, spellcasting tiers, and feats live in a unified **Directed Acyclic Graph (DAG)** branching from five Role Roots: **Combat**, **Devotion**, **Magic**, **Social**, and **Exploring** — plus cross-root **Hybrid** convergence nodes.

## Project Structure

- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) — Core RPG ruleset, tier-gated Skill Point economy, spellcasting progression, and JSON schema.
- [data/skill-tree.json](data/skill-tree.json) — Complete validated 115-node, 153-link D&D 5e SRD skill web (all 18 skills, all 6 saves, `d8`/`d10`/`d12` hit dice, Tier I–IV spellcasting, iconic class/subclass features, feats, and 14 hybrid nodes).
- [scripts/generate_tree.mjs](scripts/generate_tree.mjs) — Deterministic generator & automated validator (DAG acyclicity, root reachability, 5e coverage, spatial collision relaxation, and preset validation).
- [index.html](index.html), [styles.css](styles.css), [app.js](app.js) — Zero-dependency interactive **Visualizer + Editor + Character Builder** web studio.
- [src/defaultTree.js](src/defaultTree.js) — Embedded JS bundle of `data/skill-tree.json` so `index.html` opens cleanly directly from disk or any static server.

## Interactive Studio Features

1. **Inspect Mode** — Pan, zoom, search, filter by role/category/tier, jump along parent/child links, and read full 5e rules & structured grants.
2. **Build Character Mode** — Set Level (`1–20`) and CON modifier, spend tier-gated Skill Points, unlock/refund nodes live on the canvas, load starter Level-5 presets (*Oathbound Paladin*, *Eldritch Spellblade*, *Shadow Assassin*, *Lore Bard*), and export a Markdown character sheet.
3. **Edit Web Mode** — Drag nodes directly on the canvas, double-click to add nodes, add children, connect/disconnect edges with automatic DAG cycle protection, edit every property and structured grant, run radial auto-layout, undo/redo (`Ctrl+Z` / `Ctrl+Y`), and import/export portable JSON.

## Regenerating & Validating the Dataset

```bash
node scripts/generate_tree.mjs
```
