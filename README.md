# Smart Escape — Interactive Evacuation Route Simulator

**Name:** Faizuddin Safa · **ID :** `<CMU11PHA>`
**Live site (HTTPS):** `<https://faizuddinsafa-24.github.io/Smart-Escape/>`

Frontend-only **React** app that loads a *building.json*, draws the building graph, and finds the
lowest-cost route from a chosen start to an open exit. Every start/hazard change recalculates
instantly. **Bangla / English UI, light / dark theme**.

> Educational simulation only — not a certified evacuation planning tool.

## How to run

```bash
npm install
npm run dev       # local dev server
npm test          # routing + validation tests (plain Node, 34 checks)
npm run build     # production build -> dist/
npm run preview   # serve the production build
```

Deploy: push to `main` → `.github/workflows/deploy.yml` builds and publishes to GitHub Pages
(Settings → Pages → Source: **GitHub Actions**). `vite.config.js` uses `base: './'`, so `dist/`
also works on Netlify / Vercel / Cloudflare Pages unchanged.

## Main features (mandatory tasks)

- **Import & map** — import via file picker or drag-and-drop. Full schema validation; malformed or
  inconsistent files are rejected with a specific, translated error list (bad JSON, empty name,
  2–60 nodes, 1–150 edges, unique IDs, valid types, numeric x/y, endpoints exist, no self-loops,
  no repeated node pairs (either direction), positive integer costs, initial-state IDs exist and
  match their category, ≥1 room/junction and ≥1 exit). Disconnected graphs are accepted.
  Nodes drawn at supplied coordinates (uniformly scaled), distinct shapes per type, labels and
  corridor costs always visible.
- **Select & calculate** — click a room/junction (or use the side list). Route shows node
  sequence, exit and total cost.
- **Change conditions** — "Toggle hazards" mode: click room/junction to block, exit to close,
  corridor (line or cost tag) to block. Same actions available in the side panel lists.
- **Update & reset** — route is derived state, recalculated on every change. Reset restores the
  file's original `initial_state`.
- **Failure cases** — `No route available` and `Starting location blocked`.
- **Two languages** — every label, button, status, error and instruction in English and Bangla
  (Bangla numerals in Bangla mode). Dataset labels/IDs unchanged.
- **Animations** — route draw-in (0.5s), node pop/scale on select/hover, colour transitions on
  hazard toggles, sequence chips fade in. Respects `prefers-reduced-motion`.

### Routing rules (src/lib/graph.js)

1. Remove blocked nodes (and all their incident edges), blocked edges, and closed exits (they can't
   be destinations *or* intermediates).
2. Dijkstra from the start → cost to every open exit. Cost = sum of edge costs only.
3. Pick min cost; tie → lexicographically smallest exit ID (plain code-unit comparison, so `E10` < `E2`).
4. For that exit, the lexicographically smallest node-ID sequence among all min-cost paths:
   Dijkstra from the exit, then walk greedily from the start, always taking the smallest neighbour
   ID that stays on a shortest path. Valid because all candidate sequences share the same first
   element and costs are positive (no cycles).

## Bonus features

- Light / dark mode (remembers choice, defaults to system setting).
- Other reachable exits (alternative routes with cost + path).
- PNG export of the current map.
- Progress saved in `localStorage` (building, hazards, start) — survives reload; "Clear saved".
- Keyboard + screen-reader support: every node/corridor is focusable; list-based controls; live
  announcements.
- Responsive down to phone width.

## Known problems

- `public/building.json` is a **reconstructed** sample (the official file is given at T+0). Its
  costs were chosen to reproduce all five expected results in the problem statement.
- Duplicate IDs *inside* an initial-state array are accepted and de-duplicated, not rejected.
- Nodes with identical/very close coordinates will overlap — coordinates are drawn as supplied.
- Bangla font loads from Google Fonts; offline it falls back to the system Bengali font.

## Screenshots

- `screenshots/01-baseline-R1.png` — baseline R1 → C1 → C2 → E1, cost 7
- `screenshots/02-reroute-C2-blocked.png` — C2 blocked → R1 → C1 → C3 → C4 → E2, cost 11
- `screenshots/03-bangla-dark.png` — Bangla + dark mode

## AI tools used

`<Claude Opus 5.5>`

## Most useful prompt

`<Act as the ruthless mentor. Be brutally honest. No AI hallucination. no seo fluff. only raw truth. Your task is to build a frontend web app. Build it using only React. Here is the project statement, and build it properly. Make sure the user can switch to dark to light mode. Also, the Bangla-to-English and vice versa buttons need to be added. Details, ruleset, and the project statement are attached. Build the app following the rules. Go.>`
