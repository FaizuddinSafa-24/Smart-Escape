// Run: npm test   (plain Node, no test framework needed)
import { readFileSync } from 'node:fs';
import { parseBuilding, validateBuilding, computeRoute } from '../src/lib/graph.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + ' ' + extra); }
};
const H = (bn = [], be = [], ce = []) => ({ blockedNodes: new Set(bn), blockedEdges: new Set(be), closedExits: new Set(ce) });
const route = (b, h, s) => computeRoute(b, h, s);
const seq = (r) => (r.path || []).join('-');

const sample = parseBuilding(readFileSync(new URL('../public/building.json', import.meta.url), 'utf8'));
check('sample validates', sample.ok, JSON.stringify(sample.errors));
const B = sample.building;

console.log('Official sample checks');
let r = route(B, H(), 'R1');
check('Baseline R1 -> R1-C1-C2-E1 cost 7', seq(r) === 'R1-C1-C2-E1' && r.cost === 7, seq(r) + ' ' + r.cost);
r = route(B, H(['C2']), 'R1');
check('Block C2 -> R1-C1-C3-C4-E2 cost 11', seq(r) === 'R1-C1-C3-C4-E2' && r.cost === 11, seq(r) + ' ' + r.cost);
r = route(B, H([], [], ['E1', 'E2']), 'R1');
check('Close E1,E2 -> No route', r.status === 'noRoute', r.status);
r = route(B, H(), 'R2');
check('R2 -> R2-C3-C4-E2 cost 7', seq(r) === 'R2-C3-C4-E2' && r.cost === 7, seq(r) + ' ' + r.cost);
r = route(B, H(['R1']), 'R1');
check('Block start R1 -> Starting location blocked', r.status === 'startBlocked', r.status);

console.log('Tie-breaking');
const tie = (edges, extraNodes = []) => validateBuilding({
  building: 'T',
  nodes: [
    { id: 'S', label: 'S', type: 'room', x: 0, y: 0 },
    { id: 'A', label: 'A', type: 'junction', x: 1, y: 0 },
    { id: 'B', label: 'B', type: 'junction', x: 1, y: 1 },
    { id: 'EX', label: 'X', type: 'exit', x: 2, y: 0 },
    { id: 'EA', label: 'Y', type: 'exit', x: 2, y: 1 },
    ...extraNodes,
  ],
  edges,
  initial_state: { blocked_nodes: [], blocked_edges: [], closed_exits: [] },
}).building;
let T = tie([
  { id: '1', from: 'S', to: 'A', cost: 1 }, { id: '2', from: 'A', to: 'EX', cost: 1 },
  { id: '3', from: 'S', to: 'B', cost: 1 }, { id: '4', from: 'B', to: 'EA', cost: 1 },
]);
r = route(T, H(), 'S');
check('equal cost exits -> smallest exit ID (EA)', r.exit === 'EA' && seq(r) === 'S-B-EA', seq(r));
T = tie([
  { id: '1', from: 'S', to: 'B', cost: 1 }, { id: '2', from: 'B', to: 'EX', cost: 1 },
  { id: '3', from: 'S', to: 'A', cost: 1 }, { id: '4', from: 'A', to: 'EX', cost: 1 },
]);
r = route(T, H(), 'S');
check('equal paths same exit -> smallest sequence S-A-EX', seq(r) === 'S-A-EX', seq(r));
// lexicographic is about the sequence, not hop count: S-A-B-EX (cost 3) vs S-EX direct cost 3
T = tie([
  { id: '1', from: 'S', to: 'A', cost: 1 }, { id: '2', from: 'A', to: 'B', cost: 1 },
  { id: '3', from: 'B', to: 'EX', cost: 1 }, { id: '4', from: 'S', to: 'EX', cost: 3 },
]);
r = route(T, H(), 'S');
check('S-A-B-EX beats S-EX lexicographically ("A"<"EX")', seq(r) === 'S-A-B-EX', seq(r));
check('cost not hop count: cost 3', r.cost === 3);

console.log('Hazard semantics');
r = route(B, H([], ['e2']), 'R1');
check('blocked corridor C1-C2 reroutes, C2 still reachable concept', r.status === 'ok' && !r.edges.includes('e2'), seq(r));
r = route(B, H([], [], ['E1']), 'R1');
check('closed E1 -> goes to E2', r.exit === 'E2', seq(r));
// closed exit as intermediate: S - EX - B? build graph where only path to EA passes through closed EX
T = tie([{ id: '1', from: 'S', to: 'EX', cost: 1 }, { id: '2', from: 'EX', to: 'EA', cost: 1 }]);
r = route(T, H([], [], ['EX']), 'S');
check('closed exit cannot be crossed', r.status === 'noRoute', r.status + ' ' + seq(r));
check('disconnected graph is valid input', tie([{ id: '1', from: 'S', to: 'A', cost: 1 }]) !== undefined);
r = route(tie([{ id: '1', from: 'S', to: 'A', cost: 1 }]), H(), 'S');
check('disconnected -> No route', r.status === 'noRoute');

console.log('Validation rejects');
const base = () => JSON.parse(readFileSync(new URL('../public/building.json', import.meta.url), 'utf8'));
const rejects = (name, mut, key) => {
  const d = base(); mut(d);
  const v = validateBuilding(d);
  check(name, !v.ok && v.errors.some((e) => e.key === key), JSON.stringify(v.errors));
};
check('bad JSON', parseBuilding('{oops').errors[0].key === 'notJson');
rejects('empty building name', (d) => { d.building = '  '; }, 'buildingName');
rejects('duplicate node id', (d) => { d.nodes[1].id = 'R1'; }, 'nodeIdDup');
rejects('bad node type', (d) => { d.nodes[0].type = 'stairs'; }, 'nodeType');
rejects('non-numeric coord', (d) => { d.nodes[0].x = '10'; }, 'nodeCoord');
rejects('edge to unknown node', (d) => { d.edges[0].to = 'ZZ'; }, 'edgeEndpoint');
rejects('self loop', (d) => { d.edges[0].to = 'R1'; }, 'selfLoop');
rejects('repeated pair (reversed)', (d) => { d.edges.push({ id: 'x', from: 'C1', to: 'R1', cost: 1 }); }, 'dupPair');
rejects('zero cost', (d) => { d.edges[0].cost = 0; }, 'edgeCost');
rejects('float cost', (d) => { d.edges[0].cost = 1.5; }, 'edgeCost');
rejects('string cost', (d) => { d.edges[0].cost = '2'; }, 'edgeCost');
rejects('duplicate edge id', (d) => { d.edges[1].id = 'e1'; }, 'edgeIdDup');
rejects('blocked node is exit', (d) => { d.initial_state.blocked_nodes = ['E1']; }, 'stateBlockedExit');
rejects('closed exit is room', (d) => { d.initial_state.closed_exits = ['R1']; }, 'stateClosedNotExit');
rejects('unknown blocked edge', (d) => { d.initial_state.blocked_edges = ['nope']; }, 'stateUnknownEdge');
rejects('missing initial_state', (d) => { delete d.initial_state; }, 'stateMissing');
rejects('no exits', (d) => { d.nodes = d.nodes.filter((n) => n.type !== 'exit'); d.edges = [d.edges[0]]; }, 'needExit');
rejects('too many nodes', (d) => { for (let i = 0; i < 60; i++) d.nodes.push({ id: 'N' + i, label: 'n', type: 'room', x: 0, y: 0 }); }, 'nodesCount');
rejects('case-sensitive IDs: r1 != R1', (d) => { d.edges[0].from = 'r1'; }, 'edgeEndpoint');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
