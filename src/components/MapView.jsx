import { forwardRef, useMemo } from 'react';

const W = 1000;
const PAD = 70;
const R = 22; // node radius in viewBox units

// Fit supplied coordinates into the viewBox with uniform scale (keeps the building's shape).
function useLayout(nodes) {
  return useMemo(() => {
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rx = maxX - minX, ry = maxY - minY;
    const H = rx > 0 && ry > 0 ? Math.min(900, Math.max(380, ((W - 2 * PAD) * ry) / rx + 2 * PAD)) : 380;
    const sx = rx > 0 ? (W - 2 * PAD) / rx : Infinity;
    const sy = ry > 0 ? (H - 2 * PAD) / ry : Infinity;
    let s = Math.min(sx, sy);
    if (!Number.isFinite(s)) s = 1;
    const ox = (W - rx * s) / 2 - minX * s;
    const oy = (H - ry * s) / 2 - minY * s;
    const pos = new Map(nodes.map((n) => [n.id, { x: n.x * s + ox, y: n.y * s + oy }]));
    return { H, pos };
  }, [nodes]);
}

const MapView = forwardRef(function MapView(
  { building, hazards, startId, route, t, onNodeClick, onEdgeClick, mode },
  svgRef,
) {
  const { H, pos } = useLayout(building.nodes);
  const onRoute = route?.status === 'ok';
  const routeNodes = new Set(onRoute ? route.path : []);
  const routeEdges = new Set(onRoute ? route.edges : []);
  const routeD = onRoute
    ? route.path.map((id, i) => `${i ? 'L' : 'M'}${pos.get(id).x.toFixed(1)},${pos.get(id).y.toFixed(1)}`).join(' ')
    : '';

  const keyActivate = (fn) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  return (
    <svg
      ref={svgRef}
      className={`map mode-${mode}`}
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label={t('mapAria')}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="map-bg" x="0" y="0" width={W} height={H} />

      {/* corridors */}
      <g className="edges">
        {building.edges.map((e) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          const blocked =
            hazards.blockedEdges.has(e.id) || hazards.blockedNodes.has(e.from) || hazards.blockedNodes.has(e.to);
          const explicit = hazards.blockedEdges.has(e.id);
          const label = `${e.id}: ${e.from}–${e.to}, ${t('cost')} ${t.num(e.cost)}${explicit ? `, ${t('blocked')}` : ''}`;
          return (
            <g
              key={e.id}
              className={`edge${explicit ? ' is-blocked' : ''}${blocked && !explicit ? ' is-dead' : ''}${routeEdges.has(e.id) ? ' on-route' : ''}`}
              onClick={() => onEdgeClick(e.id)}
              onKeyDown={keyActivate(() => onEdgeClick(e.id))}
              tabIndex={mode === 'hazard' ? 0 : -1}
              role="button"
              aria-pressed={explicit}
              aria-label={label}
            >
              <title>{label}</title>
              <line className="edge-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <line className="edge-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            </g>
          );
        })}
      </g>

      {/* animated route overlay — keyed so it redraws on every change */}
      {onRoute && (
        <path key={routeD} className="route-line" d={routeD} pathLength="1" />
      )}

      {/* cost tags above the route so costs stay readable on the highlighted path */}
      <g className="edge-tags">
        {building.edges.map((e) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          const explicit = hazards.blockedEdges.has(e.id);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const txt = t.num(e.cost);
          const tw = 14 + txt.length * 11;
          return (
            <g
              key={e.id}
              className={`edge${explicit ? ' is-blocked' : ''}${routeEdges.has(e.id) ? ' on-route' : ''}`}
              transform={`translate(${mx},${my})`}
              onClick={() => onEdgeClick(e.id)}
              aria-hidden="true"
            >
              <g className="edge-tag">
                <rect x={-tw / 2} y={-12} width={tw} height={24} rx={12} />
                <text textAnchor="middle" dominantBaseline="central">{txt}</text>
                {explicit && (
                  <g className="edge-x" transform={`translate(${tw / 2 + 10},0)`}>
                    <circle r={9} />
                    <path d="M-4,-4L4,4M4,-4L-4,4" />
                  </g>
                )}
              </g>
            </g>
          );
        })}
      </g>

      {/* locations */}
      <g className="nodes">
        {building.nodes.map((n) => {
          const p = pos.get(n.id);
          const isExit = n.type === 'exit';
          const blocked = hazards.blockedNodes.has(n.id);
          const closed = isExit && hazards.closedExits.has(n.id);
          const isStart = n.id === startId;
          const cls = [
            'node',
            `t-${n.type}`,
            blocked && 'is-blocked',
            closed && 'is-closed',
            isStart && 'is-start',
            routeNodes.has(n.id) && 'on-route',
            onRoute && route.exit === n.id && 'is-target',
          ].filter(Boolean).join(' ');
          const state = blocked ? `, ${t('blocked')}` : closed ? `, ${t('closed')}` : '';
          const aria = `${n.id} ${n.label}, ${t('type_' + n.type)}${state}${isStart ? `, ${t('isStart')}` : ''}`;
          return (
            <g
              key={n.id}
              className={cls}
              transform={`translate(${p.x},${p.y})`}
              onClick={() => onNodeClick(n.id)}
              onKeyDown={keyActivate(() => onNodeClick(n.id))}
              tabIndex={0}
              role="button"
              aria-label={aria}
            >
              <title>{aria}</title>
              <g className="node-body">
                {isStart && <circle className="start-ring" r={R + 9} />}
                {n.type === 'junction' ? (
                  <rect className="shape" x={-R + 2} y={-R + 2} width={2 * R - 4} height={2 * R - 4} rx={8} />
                ) : (
                  <circle className="shape" r={R} />
                )}
                {isExit && <circle className="exit-ring" r={R - 5} />}
                <text className="node-id" textAnchor="middle" dominantBaseline="central">
                  {n.id.length > 4 ? n.id.slice(0, 4) + '…' : n.id}
                </text>
                {(blocked || closed) && (
                  <path className="node-x" d={`M${-R * 0.75},${-R * 0.75}L${R * 0.75},${R * 0.75}M${R * 0.75},${-R * 0.75}L${-R * 0.75},${R * 0.75}`} />
                )}
              </g>
              <text className="node-label" y={R + 28} textAnchor="middle">{n.label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
});

export default MapView;
