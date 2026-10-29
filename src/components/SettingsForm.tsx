import type { Dialect, Settings } from '../core';
import { DIALECT_LABEL } from '../core';

/** Réglages machine (course, rapide, contrôleur), repliables. */
export function MachineSettingsForm({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const m = settings.machine;
  const setAxis = (a: 'x' | 'y' | 'z', i: 0 | 1, v: number) => {
    const range: [number, number] = [...m[a]];
    range[i] = v;
    onChange({ ...settings, machine: { ...m, [a]: range } });
  };
  return (
    <details className="settings">
      <summary>Réglages machine <span className="meta">{DIALECT_LABEL[m.dialect]} · X {m.x[1] - m.x[0]} · Y {m.y[1] - m.y[0]} · Z {m.z[1] - m.z[0]} mm · rapide {m.rapid} mm/min</span></summary>
      <form className="setgrid" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="sDialect">Contrôleur
          <select id="sDialect" value={m.dialect} onChange={(e) => onChange({ ...settings, machine: { ...m, dialect: e.target.value as Dialect } })}>
            {(Object.keys(DIALECT_LABEL) as Dialect[]).map((d) => <option key={d} value={d}>{DIALECT_LABEL[d]}</option>)}
          </select>
        </label>
        {(['x', 'y', 'z'] as const).map((a) => (
          <fieldset key={a}>
            <legend>Course {a.toUpperCase()} (mm)</legend>
            <input id={`s${a}0`} aria-label={`${a} min`} type="number" value={m[a][0]} onChange={(e) => setAxis(a, 0, +e.target.value)} />
            <input id={`s${a}1`} aria-label={`${a} max`} type="number" value={m[a][1]} onChange={(e) => setAxis(a, 1, +e.target.value)} />
          </fieldset>
        ))}
        <label htmlFor="sRapid">Rapide (mm/min)
          <input id="sRapid" type="number" min={100} step={100} value={m.rapid}
            onChange={(e) => onChange({ ...settings, machine: { ...m, rapid: Math.max(1, +e.target.value || 1) } })} />
        </label>
      </form>
    </details>
  );
}

/** Hypothèses de temps fixes (changement d'outil, broche, arrêts). */
export function TimeSettingsForm({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const t = settings.times;
  const field = (id: string, label: string, k: keyof Settings['times'], step: number) => (
    <label htmlFor={id}>{label}
      <input id={id} type="number" min={0} step={step} value={t[k]}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) onChange({ ...settings, times: { ...t, [k]: v } }); }} />
    </label>
  );
  return (
    <form className="hyp" onSubmit={(e) => e.preventDefault()}>
      <span className="t">Hypothèses de temps (modifiables)</span>
      {field('pTc', "Changement d'outil (s)", 'toolChange', 1)}
      {field('pSp', 'Démarrage broche (s)', 'spindleStart', 0.5)}
      {field('pStop', 'Arrêt M0/M1 (s)', 'operatorStop', 5)}
    </form>
  );
}
