import { CATEGORIES } from './settings';
import { CATEGORY_LABEL, totalGain, type Suggestion } from './optimizer';
import { escapeHtml, formatNumber, formatTime, percent } from './format';
import type { ParseResult } from './types';

const sec = (minutes: number) => (minutes * 60).toFixed(1);

/** Échappe une cellule CSV (séparateur « ; » pour Excel en français). */
function cell(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (cells: (string | number)[]) => cells.map(cell).join(';');

/** Base de données des outils : une ligne par outil, prête pour Excel ou une base SQL. */
export function toolsCsv(r: ParseResult, program = ''): string {
  const head = ['programme', 'outil', 'type', 'description', 'diametre_mm', 'dents', 'broche_tr_min', 'avance_min_mm_min',
    'avance_max_mm_min', 'distance_coupe_mm', 'temps_coupe_s', 'temps_rapide_s', 'temps_changement_s', 'temps_total_s', 'faces'];
  const lines = r.tools.map((t) => row([
    program, `T${t.number}`, t.type, t.description, t.diameter ?? '', t.flutes, t.spindle, t.feedMin, t.feedMax,
    t.cutDistance.toFixed(1), sec(t.cutTime), sec(t.byCategory.rapid ?? 0), sec(t.byCategory.toolChange ?? 0), sec(t.totalTime),
    r.faces.filter((f) => f.toolTimes[t.number]).map((f) => f.name).join(' | '),
  ]));
  return '﻿' + [row(head), ...lines].join('\r\n');
}

/** Temps par face et par catégorie. */
export function facesCsv(r: ParseResult, program = ''): string {
  const head = ['programme', 'face', 'description', 'lignes', 'outils', 'changements_outil', 'distance_coupe_mm',
    ...CATEGORIES.map((c) => `temps_${c.key}_s`), 'temps_total_s'];
  const lines = r.faces.map((f) => row([
    program, f.name, f.description, `${f.fromLine}-${f.toLine}`, f.toolOrder.map((t) => 'T' + t).join(' '),
    f.toolChanges, f.cutDistance.toFixed(1), ...CATEGORIES.map((c) => sec(f.byCategory[c.key] ?? 0)), sec(f.totalTime),
  ]));
  return '﻿' + [row(head), ...lines].join('\r\n');
}

/** Rapport HTML autonome (s'ouvre dans n'importe quel navigateur, s'imprime en PDF). */
export function htmlReport(r: ParseResult, suggestions: Suggestion[], program: string): string {
  const T = r.totalTime;
  const gain = totalGain(suggestions, T);
  const tr = (cells: string[]) => `<tr>${cells.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`;
  const th = (cells: string[]) => `<tr>${cells.map((c, i) => `<th${i ? ' class="n"' : ''}>${c}</th>`).join('')}</tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport — ${escapeHtml(program)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;color:#141a21}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #1f5fbf;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:6px 8px;border-bottom:1px solid #d3d9e0;text-align:left}
.n{text-align:right}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5b6672}
.k{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0}.k div{font-size:12px;color:#5b6672}.k b{display:block;font-size:22px;color:#141a21}
.s{border:1px solid #d3d9e0;border-radius:6px;padding:10px 12px;margin:8px 0}.s small{font-weight:600;color:#1f5fbf}
.err{color:#b42318}.warn{color:#a86500}@media print{h2{break-after:avoid}.s{break-inside:avoid}}</style></head><body>
<h1>Rapport d'analyse : ${escapeHtml(program)}</h1><div style="color:#5b6672">Généré le ${new Date().toLocaleString('fr-CA')}</div>
<div class="k"><div><b>${formatTime(T)}</b>Durée estimée</div><div><b>${formatNumber(percent(r.categories.cut.time, T), 0)} %</b>Part de coupe</div>
<div><b>${r.tools.length}</b>Outils</div><div><b>${r.categories.toolChange.count}</b>Changements d'outil</div>
<div><b>${r.alerts.filter((a) => a.severity === 'err').length}</b>Erreurs</div><div><b>${formatTime(gain)}</b>Gain potentiel</div></div>
<h2>Temps par catégorie</h2><table>${th(['Catégorie', 'Nb', 'Temps', 'Part'])}${CATEGORIES.map((c) => tr([c.label, String(r.categories[c.key].count), formatTime(r.categories[c.key].time), formatNumber(percent(r.categories[c.key].time, T), 1) + ' %'])).join('')}</table>
<h2>Outils</h2><table>${th(['Outil', 'Type', 'Broche', 'Avance', 'Coupe', 'Temps'])}${r.tools.map((t) => tr([`T${t.number} ${escapeHtml(t.description)}`, t.type, formatNumber(t.spindle, 0), t.feedMax ? `${formatNumber(t.feedMin, 0)}–${formatNumber(t.feedMax, 0)}` : '—', formatNumber(t.cutDistance, 0) + ' mm', formatTime(t.totalTime)])).join('')}</table>
<h2>Temps par type d'outil</h2><table>${th(['Type', 'Outils', 'Temps', 'Part'])}${r.toolTypes.map((y) => tr([y.type, y.tools.map((t) => 'T' + t).join(', '), formatTime(y.time), formatNumber(percent(y.time, T), 1) + ' %'])).join('')}</table>
<h2>Faces</h2><table>${th(['Face', 'Lignes', 'Outils', 'Chang.', 'Coupe', 'Total'])}${r.faces.map((f) => tr([`${escapeHtml(f.name)} ${escapeHtml(f.description)}`, `${f.fromLine}–${f.toLine}`, f.toolOrder.map((t) => 'T' + t).join(' → '), String(f.toolChanges), formatTime(f.byCategory.cut ?? 0), formatTime(f.totalTime)])).join('')}</table>
<h2>Alertes</h2>${r.alerts.length ? `<table>${th(['Ligne', 'Message'])}${r.alerts.map((a) => `<tr><td>${a.line}</td><td class="${a.severity}">${escapeHtml(a.message)}</td></tr>`).join('')}</table>` : '<p>Aucune alerte.</p>'}
<h2>Suggestions d'optimisation</h2>${suggestions.map((s) => `<div class="s"><small>${CATEGORY_LABEL[s.category]}${s.gain >= 1 / 60 ? ` · −${formatTime(s.gain)}${s.seriesOnly ? ' par pièce' : ''}` : ''}</small><div><b>Q :</b> ${escapeHtml(s.question)}</div><div><b>R :</b> ${escapeHtml(s.answer)}</div>${s.lines.length ? `<div style="color:#5b6672;font-size:12px">Lignes ${s.lines.join(', ')}</div>` : ''}</div>`).join('')}
<p style="color:#5b6672;font-size:12px;margin-top:24px">Temps estimés sans accélérations machine. Les vitesses proposées sont des points de départ à valider avec les données du fabricant d'outils.</p>
</body></html>`;
}
