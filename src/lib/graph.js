// Pure graph logic: validation + deterministic lowest-cost routing.
// No React, no DOM — so it can be unit-tested with plain Node.

export const LIMITS = { minNodes: 2, maxNodes: 60, minEdges: 1, maxEdges: 150 };
const NODE_TYPES = ['room', 'junction', 'exit'];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a parsed building.json object.
 * Returns { ok: true, building } or { ok: false, errors: [{ key, params }] }.
 * Error keys are translated in i18n.js (errors.*).
 */
export function validateBuilding(data) {
  const errors = [];
  const err = (key, params = {}) => errors.push({ key, params });

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    err('notObject');
    return { ok: false, errors };
  }

  if (!isNonEmptyString(data.building)) err('buildingName');

  // ---- nodes ----
  const nodeById = new Map();
  if (!Array.isArray(data.nodes)) {
    err('nodesArray');
  } else {
    const n = data.nodes.length;
    if (n < LIMITS.minNodes || n > LIMITS.maxNodes) {
      err('nodesCount', { min: LIMITS.minNodes, max: LIMITS.maxNodes, count: n });
    }
    data.nodes.forEach((node, i) => {
      const at = i + 1;
      if (node === null || typeof node !== 'object' || Array.isArray(node)) {
        err('nodeNotObject', { at });
        return;
      }
      const okId = isNonEmptyString(node.id);
      if (!okId) err('nodeId', { at });
      else if (nodeById.has(node.id)) err('nodeIdDup', { id: node.id });
      const ref = okId ? node.id : `#${at}`;
      if (!isNonEmptyString(node.label)) err('nodeLabel', { id: ref });
      if (!NODE_TYPES.includes(node.type)) err('nodeType', { id: ref, type: String(node.type) });
      if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y)) err('nodeCoord', { id: ref });
      if (okId && !nodeById.has(node.id)) nodeById.set(node.id, node);
    });
    const types = [...nodeById.values()].map((nd) => nd.type);
    if (!types.some((t) => t === 'room' || t === 'junction')) err('needRoomOrJunction');
    if (!types.includes('exit')) err('needExit');
  }

  // ---- edges ----
  const edgeIds = new Set();
  if (!Array.isArray(data.edges)) {
    err('edgesArray');
  } else {
    const m = data.edges.length;
    if (m < LIMITS.minEdges || m > LIMITS.maxEdges) {
      err('edgesCount', { min: LIMITS.minEdges, max: LIMITS.maxEdges, count: m });
    }
    const pairs = new Map(); // "a|b" (sorted) -> edge id
    data.edges.forEach((edge, i) => {
      const at = i + 1;
      if (edge === null || typeof edge !== 'object' || Array.isArray(edge)) {
        err('edgeNotObject', { at });
        return;
      }
      const okId = isNonEmptyString(edge.id);
      if (!okId) err('edgeId', { at });
      else if (edgeIds.has(edge.id)) err('edgeIdDup', { id: edge.id });
      else edgeIds.add(edge.id);
      const ref = okId ? edge.id : `#${at}`;

      let endsOk = true;
      for (const end of ['from', 'to']) {
        if (typeof edge[end] !== 'string' || !nodeById.has(edge[end])) {
          err('edgeEndpoint', { id: ref, end, ref: String(edge[end]) });
          endsOk = false;
        }
      }
      if (endsOk) {
        if (edge.from === edge.to) {
          err('selfLoop', { id: ref });
        } else {
          const key = [edge.from, edge.to].sort().join('|');
          if (pairs.has(key)) err('dupPair', { id: ref, other: pairs.get(key) });
          else pairs.set(key, ref);
        }
      }
      if (!(Number.isInteger(edge.cost) && edge.cost > 0)) err('edgeCost', { id: ref });
    });
  }

  // ---- initial_state ----
  const st = data.initial_state;
  if (st === null || typeof st !== 'object' || Array.isArray(st)) {
    err('stateMissing');
  } else {
    for (const field of ['blocked_nodes', 'blocked_edges', 'closed_exits']) {
      if (!Array.isArray(st[field])) {
        err('stateArray', { field });
        continue;
      }
      for (const id of st[field]) {
        if (typeof id !== 'string') {
          err('stateIdType', { field });
          continue;
        }
        if (field === 'blocked_edges') {
          if (!edgeIds.has(id)) err('stateUnknownEdge', { id });
          continue;
        }
        const node = nodeById.get(id);
        if (!node) err('stateUnknownNode', { field, id });
        else if (field === 'blocked_nodes' && node.type === 'exit') err('stateBlockedExit', { id });
        else if (field === 'closed_exits' && node.type !== 'exit') err('stateClosedNotExit', { id });
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    building: {
      name: data.building.trim(),
      nodes: data.nodes.map(({ id, label, type, x, y }) => ({ id, label, type, x, y })),
      edges: data.edges.map(({ id, from, to, cost }) => ({ id, from, to, cost })),
      initialState: {
        blockedNodes: [...new Set(st.blocked_nodes)],
        blockedEdges: [...new Set(st.blocked_edges)],
        closedExits: [...new Set(st.closed_exits)],
      },
    },
  };
}

/** Parse raw text then validate. */
export function parseBuilding(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ key: 'notJson', params: { msg: e.message } }] };
  }
  return validateBuilding(data);
}

// Plain code-unit string comparison: "lexicographic" per spec. NOT localeCompare
// (locale collation can reorder e.g. case/digits differently between browsers).
const lexLess = (a, b) => a < b;

function buildAdjacency(building, hazards) {
  const nodeById = new Map(building.nodes.map((n) => [n.id, n]));
  const usableNode = (id) => {
    const n = nodeById.get(id);
    if (!n) return false;
    if (hazards.blockedNodes.has(id)) return false;
    if (n.type === 'exit' && hazards.closedExits.has(id)) return false;
    return true;
  };
  const adj = new Map(building.nodes.map((n) => [n.id, []]));
  for (const e of building.edges) {
    if (hazards.blockedEdges.has(e.id)) continue;
    if (!usableNode(e.from) || !usableNode(e.to)) continue; // removes incident edges
    adj.get(e.from).push({ to: e.to, cost: e.cost, edgeId: e.id });
    adj.get(e.to).push({ to: e.from, cost: e.cost, edgeId: e.id });
  }
  return { adj, nodeById, usableNode };
}

// O(V^2) Dijkstra — V <= 60, so this is instant and has no heap bugs.
function dijkstra(adj, source) {
  const dist = new Map();
  const done = new Set();
  for (const id of adj.keys()) dist.set(id, Infinity);
  dist.set(source, 0);
  for (;;) {
    let u = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null) break;
    done.add(u);
    for (const { to, cost } of adj.get(u)) {
      if (best + cost < dist.get(to)) dist.set(to, best + cost);
    }
  }
  return dist;
}

/**
 * Lexicographically smallest node-ID sequence among all minimum-cost paths
 * start -> exit. distToExit[v] is the shortest distance from v to the exit;
 * a neighbour v is on some shortest path iff distToExit[u] = w(u,v) + distToExit[v].
 * Every candidate path begins with `start`, so picking the smallest valid next
 * ID at each step yields the lexicographically smallest full sequence.
 * Positive integer costs guarantee strict decrease -> no cycles.
 */
function lexSmallestShortestPath(adj, start, exit) {
  const distToExit = dijkstra(adj, exit);
  const path = [start];
  const edges = [];
  let u = start;
  while (u !== exit) {
    let pick = null;
    for (const nb of adj.get(u)) {
      if (distToExit.get(u) === nb.cost + distToExit.get(nb.to)) {
        if (pick === null || lexLess(nb.to, pick.to)) pick = nb;
      }
    }
    if (pick === null) return null; // should be unreachable if exit is reachable
    path.push(pick.to);
    edges.push(pick.edgeId);
    u = pick.to;
  }
  return { path, edges };
}

/**
 * Compute the evacuation route.
 * hazards: { blockedNodes:Set, blockedEdges:Set, closedExits:Set }
 * Returns { status: 'noStart' | 'invalidStart' | 'startBlocked' | 'noRoute' | 'ok', ... }
 */
export function computeRoute(building, hazards, startId) {
  if (!startId) return { status: 'noStart' };
  const { adj, nodeById } = buildAdjacency(building, hazards);
  const start = nodeById.get(startId);
  if (!start || start.type === 'exit') return { status: 'invalidStart' };
  if (hazards.blockedNodes.has(startId)) return { status: 'startBlocked' };

  const dist = dijkstra(adj, startId);
  const reachable = building.nodes
    .filter((n) => n.type === 'exit' && !hazards.closedExits.has(n.id) && dist.get(n.id) < Infinity)
    .map((n) => ({ exit: n.id, cost: dist.get(n.id) }))
    // min cost, then lexicographically smallest exit ID
    .sort((a, b) => a.cost - b.cost || (lexLess(a.exit, b.exit) ? -1 : a.exit === b.exit ? 0 : 1));

  if (reachable.length === 0) return { status: 'noRoute' };

  const routes = reachable.map(({ exit, cost }) => ({
    exit,
    cost,
    ...lexSmallestShortestPath(adj, startId, exit),
  }));
  const [best, ...alternatives] = routes;
  return { status: 'ok', ...best, alternatives };
}

export function hazardsFromState(s) {
  return {
    blockedNodes: new Set(s.blockedNodes),
    blockedEdges: new Set(s.blockedEdges),
    closedExits: new Set(s.closedExits),
  };
}
