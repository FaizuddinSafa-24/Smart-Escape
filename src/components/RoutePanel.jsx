export default function RoutePanel({ route, building, startId, t }) {
  const label = (id) => building.nodes.find((n) => n.id === id)?.label ?? id;
  const status = route?.status;

  let body;
  if (status === 'ok') {
    body = (
      <div className="route-ok" key={route.path.join('>')}>
        <div className="stats">
          <div className="stat">
            <span className="stat-k">{t('exit')}</span>
            <span className="stat-v">{route.exit}</span>
            <span className="stat-s">{label(route.exit)}</span>
          </div>
          <div className="stat">
            <span className="stat-k">{t('totalCost')}</span>
            <span className="stat-v">{t.num(route.cost)}</span>
          </div>
          <div className="stat">
            <span className="stat-k">{t('corridorsUsed')}</span>
            <span className="stat-v">{t.num(route.edges.length)}</span>
          </div>
        </div>
        <div className="seq-k">{t('sequence')}</div>
        <ol className="seq" aria-label={t('sequence')}>
          {route.path.map((id, i) => (
            <li key={id} style={{ animationDelay: `${i * 45}ms` }} className={i === 0 ? 'first' : i === route.path.length - 1 ? 'last' : ''}>
              <span className="chip" title={label(id)}>{id}</span>
            </li>
          ))}
        </ol>
        <p className="seq-text">{route.path.join(' → ')}</p>
        {route.alternatives.length > 0 && (
          <details className="alts">
            <summary>{t('altTitle')} ({t.num(route.alternatives.length)})</summary>
            <ul>
              {route.alternatives.map((a) => (
                <li key={a.exit}>
                  <strong>{a.exit}</strong> · {t('cost')} {t.num(a.cost)}
                  <div className="muted mono">{a.path.join(' → ')}</div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  } else if (status === 'noRoute') {
    body = (
      <div className="status bad" role="status" key="nr">
        <strong>{t('noRoute')}</strong>
        <span>{t('noRouteHelp')}</span>
      </div>
    );
  } else if (status === 'startBlocked') {
    body = (
      <div className="status warn" role="status" key="sb">
        <strong>{t('startBlocked')}</strong>
        <span>{t('startBlockedHelp')}</span>
      </div>
    );
  } else if (status === 'invalidStart') {
    body = <div className="status info" key="is">{t('invalidStart')}</div>;
  } else {
    body = <div className="status info" key="ns">{t('noStart')}</div>;
  }

  return (
    <section className="card route-card" aria-live="polite">
      <div className="card-head">
        <h2>{t('routeTitle')}</h2>
        {startId && (
          <span className="pill">
            {t('start')}: <strong>{startId}</strong>
          </span>
        )}
      </div>
      {body}
      <p className="tie-note muted">{t('tieNote')}</p>
    </section>
  );
}
