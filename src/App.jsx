import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseBuilding, validateBuilding, computeRoute, hazardsFromState } from './lib/graph.js';
import { exportSvgAsPng } from './lib/exportPng.js';
import { makeT } from './i18n.js';
import MapView from './components/MapView.jsx';
import RoutePanel from './components/RoutePanel.jsx';
import HazardPanel from './components/HazardPanel.jsx';

const SAVE_KEY = 'smart-escape:progress:v1';
const PREF_KEY = 'smart-escape:prefs:v1';

// Browser storage can throw (private mode, blocked site data) — never let it break the app.
const store = {
  get(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  },
  del(k) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

const cloneState = (s) => ({
  blockedNodes: [...s.blockedNodes],
  blockedEdges: [...s.blockedEdges],
  closedExits: [...s.closedExits],
});

function initialPrefs() {
  const p = store.get(PREF_KEY) || {};
  const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    lang: p.lang === 'bn' ? 'bn' : 'en',
    theme: p.theme === 'dark' || p.theme === 'light' ? p.theme : systemDark ? 'dark' : 'light',
  };
}

function restoreProgress() {
  const saved = store.get(SAVE_KEY);
  if (!saved || !saved.raw) return null;
  const v = validateBuilding(saved.raw);
  if (!v.ok) return null;
  const b = v.building;
  const nodeIds = new Set(b.nodes.map((n) => n.id));
  const edgeIds = new Set(b.edges.map((e) => e.id));
  const s = saved.state || {};
  const ok = (arr, set) => Array.isArray(arr) && arr.every((id) => set.has(id));
  const state =
    ok(s.blockedNodes, nodeIds) && ok(s.blockedEdges, edgeIds) && ok(s.closedExits, nodeIds)
      ? cloneState(s)
      : cloneState(b.initialState);
  const start = b.nodes.some((n) => n.id === saved.start && n.type !== 'exit') ? saved.start : null;
  return { raw: saved.raw, fileName: saved.fileName || 'building.json', building: b, state, start };
}

export default function App() {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [loaded, setLoaded] = useState(restoreProgress); // { raw, fileName, building, state, start }
  const [mode, setMode] = useState('start');
  const [importError, setImportError] = useState(null); // { name, errors }
  const [announce, setAnnounce] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const svgRef = useRef(null);
  const t = useMemo(() => makeT(prefs.lang), [prefs.lang]);

  // Apply theme/lang to <html> and persist prefs.
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.lang = prefs.lang;
    document.title = `${t('appTitle')} — ${t('appSubtitle')}`;
    store.set(PREF_KEY, prefs);
  }, [prefs, t]);

  // Persist progress (bonus: saving progress).
  useEffect(() => {
    if (loaded) store.set(SAVE_KEY, { raw: loaded.raw, fileName: loaded.fileName, state: loaded.state, start: loaded.start });
  }, [loaded]);

  const building = loaded?.building;
  const hazards = useMemo(() => (loaded ? hazardsFromState(loaded.state) : null), [loaded]);

  // Recomputed on every render where inputs change: start or hazard change -> instant update.
  const route = useMemo(
    () => (building ? computeRoute(building, hazards, loaded.start) : null),
    [building, hazards, loaded?.start],
  );

  const say = (key, params) => setAnnounce({ key, params, n: Date.now() });

  // ---------- import ----------
  const acceptText = useCallback((text, fileName) => {
    let raw;
    try { raw = JSON.parse(text); } catch { /* parseBuilding reports it */ }
    const v = parseBuilding(text);
    if (!v.ok) {
      setImportError({ name: fileName, errors: v.errors });
      return;
    }
    setImportError(null);
    setLoaded({ raw, fileName, building: v.building, state: cloneState(v.building.initialState), start: null });
    setMode('start');
    say('aLoaded', { name: v.building.name });
  }, []);

  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => acceptText(String(reader.result), file.name);
    reader.onerror = () => setImportError({ name: file.name, errors: [{ key: 'readFail', params: {} }] });
    reader.readAsText(file);
  };

  const loadSample = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}building.json`);
      if (!res.ok) throw new Error(res.status);
      acceptText(await res.text(), 'building.json');
    } catch {
      setImportError({ name: 'building.json', errors: [{ key: 'sampleFail', params: {} }] });
    }
  };

  // ---------- interactions ----------
  const update = (fn) => setLoaded((prev) => (prev ? fn(prev) : prev));

  const toggleIn = (arr, id) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const toggleNodeHazard = (id) => {
    const node = building.nodes.find((n) => n.id === id);
    if (node.type === 'exit') {
      const closing = !hazards.closedExits.has(id);
      update((p) => ({ ...p, state: { ...p.state, closedExits: toggleIn(p.state.closedExits, id) } }));
      say(closing ? 'aClosed' : 'aReopened', { id });
    } else {
      const blocking = !hazards.blockedNodes.has(id);
      update((p) => ({ ...p, state: { ...p.state, blockedNodes: toggleIn(p.state.blockedNodes, id) } }));
      say(blocking ? 'aBlocked' : 'aUnblocked', { id });
    }
  };

  const toggleEdge = (id) => {
    const blocking = !hazards.blockedEdges.has(id);
    update((p) => ({ ...p, state: { ...p.state, blockedEdges: toggleIn(p.state.blockedEdges, id) } }));
    say(blocking ? 'aBlocked' : 'aUnblocked', { id });
  };

  const setStart = (id) => {
    const node = building.nodes.find((n) => n.id === id);
    if (node.type === 'exit') return say('aExitNotStart');
    if (hazards.blockedNodes.has(id)) return say('aBlockedNotStart', { id });
    update((p) => ({ ...p, start: id }));
    say('aStart', { id });
  };

  const onNodeClick = (id) => (mode === 'start' ? setStart(id) : toggleNodeHazard(id));
  const onEdgeClick = (id) => (mode === 'hazard' ? toggleEdge(id) : null);

  const reset = () => {
    update((p) => ({ ...p, state: cloneState(p.building.initialState) }));
    say('aReset');
  };

  const clearSaved = () => {
    store.del(SAVE_KEY);
    setLoaded(null);
    setImportError(null);
  };

  const exportPng = () => {
    if (svgRef.current) {
      const safe = building.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'map';
      exportSvgAsPng(svgRef.current, `smart-escape_${safe}.png`).catch(() => {});
    }
  };

  // ---------- drag & drop ----------
  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); setDragging(true); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files?.[0]); },
  };

  const nextTheme = prefs.theme === 'dark' ? 'light' : 'dark';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="3" y="3" width="26" height="26" rx="7" />
            <path d="M10 22 L16 10 L22 22" />
            <circle cx="16" cy="10" r="2.6" />
          </svg>
          <div>
            <h1>{t('appTitle')}</h1>
            <p className="sub">{t('appSubtitle')}</p>
          </div>
        </div>
        <div className="top-actions">
          <button
            className="btn ghost"
            onClick={() => setPrefs((p) => ({ ...p, lang: p.lang === 'en' ? 'bn' : 'en' }))}
            aria-label={t('switchLangAria')}
            lang={prefs.lang === 'en' ? 'bn' : 'en'}
          >
            <span aria-hidden="true">⇄</span> {t('switchLang')}
          </button>
          <button
            className="btn ghost"
            onClick={() => setPrefs((p) => ({ ...p, theme: nextTheme }))}
            aria-label={nextTheme === 'dark' ? t('themeToDark') : t('themeToLight')}
          >
            <span aria-hidden="true">{nextTheme === 'dark' ? '☾' : '☀'}</span>{' '}
            {nextTheme === 'dark' ? t('themeToDark') : t('themeToLight')}
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button className="btn primary" onClick={() => fileRef.current?.click()}>{t('importJson')}</button>
        <button className="btn" onClick={loadSample}>{t('loadSample')}</button>
        <button className="btn" onClick={reset} disabled={!loaded} title={t('resetTitle')}>{t('reset')}</button>
        <button className="btn" onClick={exportPng} disabled={!loaded}>{t('exportPng')}</button>
        {loaded && (
          <span className="file-meta">
            <strong>{building.name}</strong>
            <span className="muted"> · {loaded.fileName} · {t('stats', { n: building.nodes.length, m: building.edges.length })}</span>
          </span>
        )}
      </div>

      {importError && (
        <div className="alert error" role="alert">
          <div className="alert-head">
            <strong>{t('importRejected', { name: importError.name })}</strong>
            <button className="btn small ghost" onClick={() => setImportError(null)}>{t('dismiss')}</button>
          </div>
          <ul>
            {importError.errors.slice(0, 12).map((e, i) => <li key={i}>{t.err(e)}</li>)}
            {importError.errors.length > 12 && <li>… +{t.num(importError.errors.length - 12)}</li>}
          </ul>
          {loaded && <p className="muted">{t('keptPrevious')}</p>}
        </div>
      )}

      <main className="layout">
        <section className={`map-card${dragging ? ' dragging' : ''}`} {...dropProps}>
          {loaded ? (
            <>
              <div className="mode-bar">
                <span className="mode-label">{t('modeLabel')}</span>
                <div className="segmented" role="radiogroup" aria-label={t('modeLabel')}>
                  {['start', 'hazard'].map((m) => (
                    <button
                      key={m}
                      role="radio"
                      aria-checked={mode === m}
                      className={mode === m ? 'active' : ''}
                      onClick={() => setMode(m)}
                    >
                      {m === 'start' ? t('modeStart') : t('modeHazard')}
                    </button>
                  ))}
                </div>
              </div>
              <p className="instr">{mode === 'start' ? t('instrStart') : t('instrHazard')}</p>
              <div className="map-wrap">
                <MapView
                  ref={svgRef}
                  building={building}
                  hazards={hazards}
                  startId={loaded.start}
                  route={route}
                  t={t}
                  mode={mode}
                  onNodeClick={onNodeClick}
                  onEdgeClick={onEdgeClick}
                />
              </div>
              <Legend t={t} />
            </>
          ) : (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">⤓</div>
              <h2>{t('emptyTitle')}</h2>
              <p>{t('emptyBody')}</p>
              <div className="empty-actions">
                <button className="btn primary" onClick={() => fileRef.current?.click()}>{t('importJson')}</button>
                <button className="btn" onClick={loadSample}>{t('loadSample')}</button>
              </div>
            </div>
          )}
          {dragging && <div className="drop-overlay">{t('dropHere')}</div>}
        </section>

        {loaded && (
          <aside className="side">
            <RoutePanel route={route} building={building} startId={loaded.start} t={t} />
            <HazardPanel
              building={building}
              hazards={hazards}
              startId={loaded.start}
              t={t}
              onSetStart={setStart}
              onToggleNode={toggleNodeHazard}
              onToggleEdge={toggleEdge}
            />
          </aside>
        )}
      </main>

      <footer className="foot">
        <span>{t('disclaimer')}</span>
        <span className="foot-right">
          {loaded && <span className="muted">{t('savedNote')} </span>}
          {loaded && <button className="link" onClick={clearSaved}>{t('clearSaved')}</button>}
          <span className="muted"> · {t('footer')}</span>
        </span>
      </footer>

      <div className="sr-only" aria-live="polite">{announce ? t(announce.key, announce.params) : ''}</div>
    </div>
  );
}

function Legend({ t }) {
  const items = [
    ['room', t('lgRoom')], ['junction', t('lgJunction')], ['exit', t('lgExit')], ['closed', t('lgClosedExit')],
    ['blocked', t('lgBlocked')], ['bedge', t('lgBlockedEdge')], ['route', t('lgRoute')], ['start', t('lgStart')],
  ];
  return (
    <div className="legend" aria-label={t('legend')}>
      {items.map(([k, label]) => (
        <span key={k} className="lg-item">
          <svg viewBox="-14 -14 28 28" className={`lg lg-${k}`} aria-hidden="true">
            {k === 'junction' && <rect className="shape" x="-9" y="-9" width="18" height="18" rx="4" />}
            {(k === 'room' || k === 'blocked' || k === 'start') && <circle className="shape" r="9" />}
            {(k === 'exit' || k === 'closed') && (<><circle className="shape" r="9" /><circle className="exit-ring" r="5.5" /></>)}
            {(k === 'blocked' || k === 'closed') && <path className="node-x" d="M-6,-6L6,6M6,-6L-6,6" />}
            {k === 'start' && <circle className="start-ring" r="12.5" />}
            {k === 'bedge' && <line className="edge-line" x1="-13" y1="0" x2="13" y2="0" />}
            {k === 'route' && <line className="route-sample" x1="-13" y1="0" x2="13" y2="0" />}
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
