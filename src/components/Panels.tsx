import type { Alert, MachineSettings, ParseResult } from '../core';
import { CATEGORIES, formatNumber as fmtN, formatTime as fmtT, percent as pct } from '../core';

export function Kpis({ r, gain }: { r: ParseResult; gain: number }) {
  const errs = r.alerts.filter((a) => a.severity === 'err').length;
  const warns = r.alerts.length - errs;
  const items: [string, string | number, string, string?][] = [
    ['Durée totale', fmtT(r.totalTime), ''],
    ['Part de coupe', fmtN(pct(r.categories.cut.time, r.totalTime), 0), '%'],
    ['Distance de coupe', fmtN(r.categories.cut.distance / 1000, 2), 'm'],
    ['Outils', r.tools.length, ''],
    ['Gain potentiel', fmtT(gain), ''],
    ['Erreurs', errs, warns ? `+ ${warns} avert.` : '', errs ? 'alert' : ''],
  ];
  return (
    <section className="kpis" aria-label="Résumé">
      {items.map(([k, v, u, c]) => (
        <div key={k} className={`kpi ${c ?? ''}`}><span className="k">{k}</span><span className="v">{v}{u && <small>{u}</small>}</span></div>
      ))}
    </section>
  );
}

export function Alerts({ alerts, onSelect }: { alerts: Alert[]; onSelect: (l: number) => void }) {
  const errs = alerts.filter((a) => a.severity === 'err').length;
  return (
    <section className="panel">
      <div className="ph"><h2>Alertes</h2>
        <div className="counts"><span className="e">{errs} erreur{errs > 1 ? 's' : ''}</span><span className="w">{alerts.length - errs} avert.</span></div>
      </div>
      <ul className="alerts">
        {alerts.length === 0 && <li className="empty">Aucune alerte.</li>}
        {alerts.map((a, i) => (
          <li key={i} className={a.severity} tabIndex={0} onClick={() => onSelect(a.line)} onKeyDown={(e) => e.key === 'Enter' && onSelect(a.line)}>
            <span className="pill">{a.severity === 'err' ? 'ERREUR' : 'AVERT.'}</span>
            <span className="msg">{a.message}</span>
            <span className="ln">Ligne {a.line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ToolsTable({ r }: { r: ParseResult }) {
  return (
    <section className="panel">
      <div className="ph"><h2>Outils</h2><span className="meta">temps total par outil</span></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Outil</th><th>Broche</th><th>Avance</th><th>Temps</th></tr></thead>
          <tbody>
            {r.tools.map((t) => (
              <tr key={t.number}>
                <td className="tool">T{t.number}<span className="desc">{t.type}{t.description ? ` · ${t.description}` : ''}</span></td>
                <td>{t.spindle ? fmtN(t.spindle, 0) : '—'}<span className="desc">tr/min</span></td>
                <td>{t.feedMax ? (t.feedMin === t.feedMax ? fmtN(t.feedMin, 0) : `${fmtN(t.feedMin, 0)}–${fmtN(t.feedMax, 0)}`) : '—'}<span className="desc">mm/min</span></td>
                <td>{fmtT(t.totalTime)}<span className="desc">coupe {fmtT(t.cutTime)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function BoundsPanel({ r, machine }: { r: ParseResult; machine: MachineSettings }) {
  const b = r.bounds;
  return (
    <section className="panel">
      <div className="ph"><h2>Limites de la pièce</h2><span className="meta">mm</span></div>
      {!b ? <p className="empty">Aucun mouvement.</p> : (
        <div className="bounds">
          <span /><span className="h">Min</span><span className="h">Max</span><span className="h">Étendue</span>
          {(['x', 'y', 'z'] as const).map((a) => (
            <Row key={a} a={a} min={b.min[a]} max={b.max[a]} lo={machine[a][0]} hi={machine[a][1]} />
          ))}
        </div>
      )}
    </section>
  );
}
function Row({ a, min, max, lo, hi }: { a: string; min: number; max: number; lo: number; hi: number }) {
  return (
    <>
      <span className="ax">{a.toUpperCase()}</span>
      <span className={min < lo ? 'over' : ''}>{fmtN(min, 2)}</span>
      <span className={max > hi ? 'over' : ''}>{fmtN(max, 2)}</span>
      <span>{fmtN(max - min, 2)}</span>
    </>
  );
}

export function CategoryTimes({ r, children }: { r: ParseResult; children?: React.ReactNode }) {
  const T = r.totalTime, C = r.categories;
  return (
    <section className="panel">
      <div className="ph"><h2>Temps par catégorie</h2><span className="meta">{fmtT(T)}</span></div>
      <div className="stack" aria-hidden="true">
        {CATEGORIES.filter((c) => C[c.key].time > 0).map((c) => (
          <span key={c.key} style={{ width: `${pct(C[c.key].time, T)}%`, background: c.color }} title={c.label} />
        ))}
      </div>
      <div className="stackcap"><span>0</span><span>{fmtT(T)}</span></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Catégorie</th><th>Nb</th><th>Temps</th><th>Part</th></tr></thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const v = C[c.key], p = pct(v.time, T);
              return (
                <tr key={c.key}>
                  <td><span className="sw" style={{ background: c.color }} /><span className="cat">{c.label}</span>
                    <span className="desc" style={{ display: 'inline', marginLeft: 6 }}>{c.codes}</span>
                    {v.distance > 0 && <span className="desc">{fmtN(v.distance, 0)} mm parcourus</span>}</td>
                  <td>{v.count}</td>
                  <td>{fmtT(v.time)}</td>
                  <td><div className="minibar"><div className="tr"><b style={{ width: `${p}%`, background: c.color }} /></div><span className="pct">{fmtN(p, 1)} %</span></div></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td>Total</td><td /><td>{fmtT(T)}</td><td><span className="pct">100 %</span></td></tr></tfoot>
        </table>
      </div>
      {children}
    </section>
  );
}

export function ToolTypeTimes({ r }: { r: ParseResult }) {
  const maxT = Math.max(...r.toolTypes.map((y) => y.time), 1e-9);
  return (
    <section className="panel">
      <div className="ph"><h2>Temps par type d'outil</h2><span className="meta">détecté depuis les commentaires</span></div>
      <div className="typebars">
        {r.toolTypes.map((y) => (
          <div className="tb" key={y.type}>
            <span className="name">{y.type}<small>{y.tools.length ? y.tools.map((t) => 'T' + t).join(', ') : '—'}</small></span>
            <div className="bar" style={{ width: `${pct(y.time, maxT)}%` }}>
              {CATEGORIES.filter((c) => y.byCategory[c.key]).map((c) => (
                <span key={c.key} style={{ width: `${pct(y.byCategory[c.key] ?? 0, y.time)}%`, background: c.color }} title={c.label} />
              ))}
            </div>
            <span className="val">{fmtT(y.time)} · {fmtN(pct(y.time, r.totalTime), 0)} %</span>
          </div>
        ))}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Type</th><th>Coupe</th><th>Rapide</th><th>Chang.</th><th>Autres</th><th>Total</th></tr></thead>
          <tbody>
            {r.toolTypes.map((y) => {
              const b = y.byCategory, other = (b.spindle ?? 0) + (b.dwell ?? 0) + (b.probe ?? 0);
              return (
                <tr key={y.type}><td className="cat">{y.type}</td><td>{fmtT(b.cut ?? 0)}</td><td>{fmtT(b.rapid ?? 0)}</td>
                  <td>{fmtT(b.toolChange ?? 0)}</td><td>{fmtT(other)}</td><td><b>{fmtT(y.time)}</b></td></tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">Le type vient du commentaire d'outil, par exemple « (T3 FORET 8 MM) ».</p>
    </section>
  );
}

export function FaceCards({ r, active, onFace }: { r: ParseResult; active: string; onFace: (k: string) => void }) {
  const T = r.totalTime;
  const types = Object.fromEntries(r.tools.map((t) => [t.number, t.type]));
  return (
    <section className="panel">
      <div className="ph"><h2>Temps et outils par face</h2><span className="meta">{r.faces.length} face{r.faces.length > 1 ? 's' : ''} · {fmtT(T)}</span></div>
      <div className="facegrid">
        {r.faces.map((f) => {
          const order = f.toolOrder.filter((t, i, a) => a.indexOf(t) === i);
          const mx = Math.max(...order.map((t) => f.toolTimes[t] ?? 0), 1e-9);
          return (
            <article key={f.key} className={`fcard${active === f.key ? ' on' : ''}`}>
              <div className="fhead"><h3>{f.name}{f.description && <small>{f.description}</small>}</h3><span className="ln">L{f.fromLine}–{f.toLine}</span></div>
              <div className="fbig"><b>{fmtT(f.totalTime)}</b><span>{fmtN(pct(f.totalTime, T), 0)} % du programme</span></div>
              <div className="fstack" title="Répartition par catégorie">
                {CATEGORIES.filter((c) => f.byCategory[c.key]).map((c) => (
                  <span key={c.key} style={{ width: `${pct(f.byCategory[c.key] ?? 0, f.totalTime)}%`, background: c.color }} title={`${c.label} ${fmtT(f.byCategory[c.key] ?? 0)}`} />
                ))}
              </div>
              <div className="ftools">
                {order.map((t) => (
                  <div className="ftool" key={t}><span className="id">T{t}</span>
                    <span className="nm">{types[t] ?? ''}<i style={{ width: `${pct(f.toolTimes[t] ?? 0, mx)}%` }} /></span>
                    <span className="tm">{fmtT(f.toolTimes[t] ?? 0)}</span></div>
                ))}
              </div>
              <div className="ffoot"><span>Coupe <b>{fmtT(f.byCategory.cut ?? 0)}</b></span><span>Chang. <b>{f.toolChanges}</b></span>
                <span>{fmtN(f.cutDistance, 0)} mm</span>
                <button type="button" onClick={() => onFace(active === f.key ? '' : f.key)}>{active === f.key ? 'Tout afficher' : 'Voir'}</button></div>
            </article>
          );
        })}
      </div>
      <p className="note">Les faces viennent des commentaires « (FACE A …) », « (CÔTÉ …) » ou « (PHASE …) ». Sans ces commentaires, chaque origine pièce (G54 à G59) ou indexation A/B devient une face.</p>
    </section>
  );
}
