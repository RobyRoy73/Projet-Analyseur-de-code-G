import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_ANSWERS, DEFAULT_SETTINGS, DIALECT_LABEL, MACHINE_RAPID, TOOL_CHANGE_SECONDS,
  facesCsv, htmlReport, optimize, parseGCode, toolsCsv, totalGain,
  type Answers, type Settings,
} from './core';
import { CodeView } from './components/CodeView';
import { Toolpath } from './components/Toolpath';
import { Alerts, BoundsPanel, CategoryTimes, FaceCards, Kpis, ToolTypeTimes, ToolsTable } from './components/Panels';
import { Optimizer } from './components/Optimizer';
import { MachineSettingsForm, TimeSettingsForm } from './components/SettingsForm';
import { downloadText, usePersistentState } from './hooks/usePersistentState';
import sample1 from '../samples/plaque-support-2-faces.txt?raw';
import sample2 from '../samples/sans-commentaires-g54-g55.txt?raw';
import sample3 from '../samples/fanuc-cycle-percage.txt?raw';
import sample4 from '../samples/test-boitier-400-lignes.txt?raw';

const SAMPLES = [
  { name: 'plaque-support-2-faces.txt', text: sample1, label: 'Exemple : plaque 2 faces (GRBL)' },
  { name: 'sans-commentaires-g54-g55.txt', text: sample2, label: 'Exemple : 2 origines G54/G55' },
  { name: 'fanuc-cycle-percage.txt', text: sample3, label: 'Exemple : cycles de perçage (Fanuc)' },
  { name: 'test-boitier-400-lignes.txt', text: sample4, label: 'Test : boîtier 400 lignes, 5 erreurs' },
];
const ACCEPT = '.txt,.nc,.gcode,.ngc,.tap,.cnc,.eia,.iso';
const baseName = (f: string) => f.replace(/\.[^.]+$/, '');

export default function App() {
  const [file, setFile] = useState({ name: SAMPLES[0].name, text: SAMPLES[0].text });
  const [settings, setSettings] = usePersistentState<Settings>('gcode.settings', DEFAULT_SETTINGS);
  const [answers, setAnswers] = usePersistentState<Answers>('gcode.answers', DEFAULT_ANSWERS);
  const [selected, setSelected] = useState<number | null>(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [face, setFace] = useState('');
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState('');

  // Les réglages tapés au clavier ne relancent l'analyse qu'une fois la saisie stabilisée
  const deferredSettings = useDeferredValue(settings);
  const result = useMemo(() => parseGCode(file.text, deferredSettings), [file.text, deferredSettings]);
  const suggestions = useMemo(() => optimize(result, answers, deferredSettings), [result, answers, deferredSettings]);
  const gain = totalGain(suggestions, result.totalTime);

  useEffect(() => { if (face && !result.faces.some((f) => f.key === face)) setFace(''); }, [result, face]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); }, [toast]);

  const load = useCallback((name: string, text: string) => {
    setFile({ name, text }); setSelected(null); setFace('');
  }, []);
  const readFile = useCallback((f?: File | null) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { setToast('Fichier trop volumineux (plus de 50 Mo).'); return; }
    const reader = new FileReader();
    reader.onload = () => load(f.name, String(reader.result));
    reader.onerror = () => setToast(`Impossible de lire ${f.name}.`);
    reader.readAsText(f);
  }, [load]);

  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer?.files[0]); };
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => { document.removeEventListener('dragover', over); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', drop); };
  }, [readFile]);

  const selectLine = useCallback((line: number) => { setSelected(line); setScrollKey((k) => k + 1); }, []);
  const selectFromCode = useCallback((line: number) => setSelected(line), []);
  const selectFromList = useCallback((line: number) => {
    selectLine(line);
    document.querySelector('.viewerpanel')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selectLine]);

  // Q1 et Q6 mettent aussi à jour les hypothèses de temps
  const changeAnswers = (a: Answers) => {
    if (a.machine !== answers.machine) setSettings((s) => ({ ...s, machine: { ...s.machine, rapid: MACHINE_RAPID[a.machine] } }));
    if (a.toolChanger !== answers.toolChanger) setSettings((s) => ({ ...s, times: { ...s.times, toolChange: TOOL_CHANGE_SECONDS[a.toolChanger] } }));
    setAnswers(a);
  };

  const exportName = baseName(file.name);
  const exportCsv = (kind: 'outils' | 'faces') => {
    downloadText(`${exportName}-${kind}.csv`, kind === 'outils' ? toolsCsv(result, file.name) : facesCsv(result, file.name), 'text/csv');
    setToast(`Fichier ${exportName}-${kind}.csv téléchargé.`);
  };
  const exportReport = () => {
    downloadText(`${exportName}-rapport.html`, htmlReport(result, suggestions, file.name), 'text/html');
    setToast(`Rapport ${exportName}-rapport.html téléchargé.`);
  };

  return (
    <div className="wrap">
      <header>
        <div className="brand">
          <h1>Analyseur Code G</h1>
          <div className="sub">{DIALECT_LABEL[settings.machine.dialect]} · {result.lines.length} lignes · {result.sourceUnit === 'po' ? 'fichier en pouces, converti en mm' : 'mm'}</div>
        </div>
        <div className="actions">
          <span className="file">{file.name}</span>
          <select className="sample" aria-label="Charger un exemple" value=""
            onChange={(e) => { const s = SAMPLES.find((x) => x.name === e.target.value); if (s) load(s.name, s.text); }}>
            <option value="">Charger un exemple…</option>
            {SAMPLES.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
          </select>
          <label className="btn primary" htmlFor="fileInput">Ouvrir un fichier</label>
          <input id="fileInput" type="file" accept={ACCEPT} hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </header>

      <div className={`drop${dragging ? ' over' : ''}`}>
        <span>Glissez un fichier <b>.txt</b>, <b>.nc</b> ou <b>.gcode</b> n'importe où sur la page. Le fichier reste sur votre appareil.</span>
        <div className="actions">
          <button className="btn small" type="button" onClick={() => exportCsv('outils')}>CSV outils</button>
          <button className="btn small" type="button" onClick={() => exportCsv('faces')}>CSV faces</button>
          <button className="btn small" type="button" onClick={exportReport}>Rapport HTML</button>
        </div>
      </div>

      <MachineSettingsForm settings={settings} onChange={setSettings} />
      <Kpis r={result} gain={gain} />

      <div className="main">
        <section className="panel">
          <div className="ph"><h2>Programme</h2><span className="meta">{result.segments.length} déplacements</span></div>
          <CodeView lines={result.lines} alerts={result.alerts} selected={selected} scrollKey={scrollKey} onSelect={selectFromCode} />
        </section>
        <Toolpath segments={result.segments} totalLines={result.lines.length} selected={selected} face={face}
          faces={result.faces} onFace={setFace} onSelect={selectLine} />
        <aside className="side">
          <Alerts alerts={result.alerts} onSelect={selectFromList} />
          <ToolsTable r={result} />
          <BoundsPanel r={result} machine={settings.machine} />
        </aside>
      </div>

      <div className="times">
        <CategoryTimes r={result}><TimeSettingsForm settings={settings} onChange={setSettings} /></CategoryTimes>
        <ToolTypeTimes r={result} />
      </div>

      <FaceCards r={result} active={face} onFace={(k) => { setFace(k); if (k) document.querySelector('.viewerpanel')?.scrollIntoView({ block: 'center' }); }} />

      <Optimizer answers={answers} onAnswers={changeAnswers} suggestions={suggestions} gain={gain} total={result.totalTime} onSelect={selectFromList} />

      <div className="foot">
        <span>Temps estimés sans accélérations machine. Les vitesses proposées sont des points de départ à valider avec le fabricant d'outils.</span>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
