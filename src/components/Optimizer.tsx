import type { Answers, Suggestion } from '../core';
import { CATEGORY_LABEL, formatTime as fmtT, percent } from '../core';

interface Props {
  answers: Answers;
  onAnswers: (a: Answers) => void;
  suggestions: Suggestion[];
  gain: number;
  total: number;
  onSelect: (line: number) => void;
}

type Opt<K extends keyof Answers> = [Answers[K], string][];
const MACHINES: Opt<'machine'> = [['routeur', 'Routeur CNC (GRBL)'], ['vmc', "Centre d'usinage vertical"], ['conv', 'Fraiseuse manuelle convertie']];
const MATERIALS: Opt<'material'> = [['alu', 'Aluminium 6061'], ['acier', 'Acier doux'], ['inox', 'Inox 304'], ['bois', 'Bois franc (érable, merisier)'], ['mdf', 'MDF ou contreplaqué'], ['plast', 'Plastique (HDPE, acrylique)']];
const TOOLMATS: Opt<'toolMaterial'> = [['carbure', 'Carbure'], ['hss', 'Acier rapide (HSS)']];
const CHANGERS: Opt<'toolChanger'> = [['manuel', 'Manuel'], ['auto', 'Changeur automatique']];
const COOLANTS: Opt<'coolant'> = [['air', "Soufflage d'air"], ['brouillard', 'Brouillard'], ['liquide', 'Liquide'], ['aucun', 'Aucun']];
const PRIORITIES: Opt<'priority'> = [['temps', 'Réduire le temps de cycle'], ['fini', 'Meilleur fini de surface'], ['outil', 'Durée de vie des outils']];

export function Optimizer({ answers, onAnswers, suggestions, gain, total, onSelect }: Props) {
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => onAnswers({ ...answers, [k]: v });
  const select = <K extends keyof Answers>(id: string, num: string, label: string, k: K, opts: Opt<K>) => (
    <label className="q" htmlFor={id}><span><em>{num}</em>{label}</span>
      <select id={id} value={String(answers[k])} onChange={(e) => set(k, e.target.value as Answers[K])}>
        {opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </label>
  );
  const number = <K extends 'spindleMax' | 'feedMax' | 'quantity'>(id: string, num: string, label: string, k: K, step: number) => (
    <label className="q" htmlFor={id}><span><em>{num}</em>{label}</span>
      <input id={id} type="number" min={1} step={step} value={answers[k]}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) set(k, v as Answers[K]); }} />
    </label>
  );

  return (
    <section className="panel opt">
      <div className="ph"><h2>Optimisation du programme</h2>
        <span className="optsum">{suggestions.length} suggestions · gain potentiel {fmtT(gain)} ({percent(gain, total).toFixed(0)} %)</span></div>
      <div className="body">
        <form className="quiz" onSubmit={(e) => e.preventDefault()}>
          {select('qMach', 'Q1', 'Quelle machine est utilisée ?', 'machine', MACHINES)}
          <div className="row">
            {number('qSmax', 'Q2', 'Broche max (tr/min)', 'spindleMax', 1000)}
            {number('qFmax', 'Q3', 'Avance max (mm/min)', 'feedMax', 100)}
          </div>
          {select('qMat', 'Q4', 'Quelle matière est usinée ?', 'material', MATERIALS)}
          {select('qTool', 'Q5', 'Outils en quel matériau ?', 'toolMaterial', TOOLMATS)}
          {select('qTc', 'Q6', "Changement d'outil", 'toolChanger', CHANGERS)}
          {select('qCool', 'Q7', 'Arrosage disponible', 'coolant', COOLANTS)}
          {select('qPrio', 'Q8', 'Priorité', 'priority', PRIORITIES)}
          {number('qQty', 'Q9', 'Pièces par série', 'quantity', 1)}
        </form>
        <ol className="sugg">
          {suggestions.length === 0 && <li className="sg">Aucune amélioration détectée.</li>}
          {suggestions.map((s) => (
            <li className="sg" key={s.id}>
              <div className="top"><span className={`chip ${s.category}`}>{CATEGORY_LABEL[s.category]}</span>
                {s.gain >= 1 / 60 && <span className="gain">−{fmtT(s.gain)}{s.seriesOnly ? ' / pièce' : ''}</span>}</div>
              <div className="qq"><b>Q</b>{s.question}</div>
              <div className="rr"><b>R</b>{s.answer}</div>
              {s.lines.length > 0 && (
                <div className="lns">{s.lines.slice(0, 6).map((l) => (
                  <button key={l} type="button" onClick={() => onSelect(l)}>Ligne {l}</button>
                ))}</div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
