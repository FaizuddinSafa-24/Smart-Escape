import { useState } from 'react';

// Keyboard/list alternative to clicking the map. Every map action is available here too.
export default function HazardPanel({ building, hazards, startId, t, onSetStart, onToggleNode, onToggleEdge }) {
  const [tab, setTab] = useState('locations');
  const locations = building.nodes.filter((n) => n.type !== 'exit');
  const exits = building.nodes.filter((n) => n.type === 'exit');

  const tabs = [
    ['locations', t('locations'), locations.length],
    ['exits', t('exits'), exits.length],
    ['corridors', t('corridors'), building.edges.length],
  ];

  return (
    <section className="card hazard-card">
      <div className="tabs" role="tablist">
        {tabs.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label} <span className="count">{t.num(n)}</span>
          </button>
        ))}
      </div>

      <ul className="rows" role="tabpanel">
        {tab === 'locations' &&
          locations.map((n) => {
            const blocked = hazards.blockedNodes.has(n.id);
            const isStart = startId === n.id;
            return (
              <li key={n.id} className={`row${blocked ? ' is-blocked' : ''}`}>
                <span className={`dot t-${n.type}`} aria-hidden="true" />
                <span className="row-main">
                  <strong>{n.id}</strong> <span className="muted">{n.label}</span>
                  <span className="muted small"> · {t('type_' + n.type)}</span>
                </span>
                {blocked && <span className="tag bad">{t('blocked')}</span>}
                <button
                  className={`btn small${isStart ? ' on' : ''}`}
                  onClick={() => onSetStart(n.id)}
                  disabled={blocked && !isStart}
                  aria-pressed={isStart}
                >
                  {isStart ? t('isStart') : t('setStart')}
                </button>
                <button className={`btn small ${blocked ? '' : 'danger'}`} onClick={() => onToggleNode(n.id)} aria-pressed={blocked}>
                  {blocked ? t('unblock') : t('block')}
                </button>
              </li>
            );
          })}

        {tab === 'exits' &&
          exits.map((n) => {
            const closed = hazards.closedExits.has(n.id);
            return (
              <li key={n.id} className={`row${closed ? ' is-blocked' : ''}`}>
                <span className="dot t-exit" aria-hidden="true" />
                <span className="row-main">
                  <strong>{n.id}</strong> <span className="muted">{n.label}</span>
                </span>
                {closed && <span className="tag bad">{t('closed')}</span>}
                <button className={`btn small ${closed ? '' : 'danger'}`} onClick={() => onToggleNode(n.id)} aria-pressed={closed}>
                  {closed ? t('reopen') : t('close')}
                </button>
              </li>
            );
          })}

        {tab === 'corridors' &&
          building.edges.map((e) => {
            const blocked = hazards.blockedEdges.has(e.id);
            return (
              <li key={e.id} className={`row${blocked ? ' is-blocked' : ''}`}>
                <span className="dot edge" aria-hidden="true" />
                <span className="row-main">
                  <strong>{e.id}</strong> <span className="mono">{e.from} – {e.to}</span>
                  <span className="muted small"> · {t('cost')} {t.num(e.cost)}</span>
                </span>
                {blocked && <span className="tag bad">{t('blocked')}</span>}
                <button className={`btn small ${blocked ? '' : 'danger'}`} onClick={() => onToggleEdge(e.id)} aria-pressed={blocked}>
                  {blocked ? t('unblock') : t('block')}
                </button>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
