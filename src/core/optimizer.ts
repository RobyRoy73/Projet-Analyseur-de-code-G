import { isHSS, isMill } from './tooling';
import type { ParseResult, Settings, ToolStat } from './types';

export type MaterialKey = 'alu' | 'acier' | 'inox' | 'bois' | 'mdf' | 'plast';
export type Priority = 'temps' | 'fini' | 'outil';

export interface Answers {
  machine: 'routeur' | 'vmc' | 'conv';
  spindleMax: number;
  feedMax: number;
  material: MaterialKey;
  toolMaterial: 'carbure' | 'hss';
  toolChanger: 'manuel' | 'auto';
  coolant: 'air' | 'brouillard' | 'liquide' | 'aucun';
  priority: Priority;
  quantity: number;
}

export const DEFAULT_ANSWERS: Answers = {
  machine: 'routeur', spindleMax: 24000, feedMax: 3000, material: 'alu', toolMaterial: 'carbure',
  toolChanger: 'manuel', coolant: 'air', priority: 'temps', quantity: 10,
};

/** Vitesse rapide typique par type de machine (mm/min), proposée quand on change la réponse Q1. */
export const MACHINE_RAPID: Record<Answers['machine'], number> = { routeur: 5000, vmc: 24000, conv: 2500 };
/** Durée typique d'un changement d'outil (s) selon Q6. */
export const TOOL_CHANGE_SECONDS: Record<Answers['toolChanger'], number> = { manuel: 45, auto: 8 };

export interface Material {
  label: string;
  /** Avance par dent recommandée ≈ k × diamètre (mm/dent), outil carbure */
  chipK: number;
  /** Vitesse de coupe (m/min) [min, max] en carbure et en HSS */
  vc: { carbure: [number, number]; hss: [number, number] };
  /** Profondeur de passe max en rainurage, en fraction du diamètre */
  apRatio: number;
  /** Avance par tour de perçage ≈ k × diamètre (mm/tour) */
  drillK: number;
  /** Matière qui colle à l'arête (copeaux soudés) */
  sticky: boolean;
}

/**
 * Valeurs de départ prudentes, à ajuster selon les recommandations du fabricant d'outils.
 * Elles servent à repérer les écarts importants, pas à remplacer un calcul de coupe.
 */
export const MATERIALS: Record<MaterialKey, Material> = {
  alu: { label: "l'aluminium", chipK: 0.008, vc: { carbure: [200, 600], hss: [60, 120] }, apRatio: 0.5, drillK: 0.02, sticky: true },
  acier: { label: "l'acier doux", chipK: 0.005, vc: { carbure: [80, 150], hss: [20, 35] }, apRatio: 0.25, drillK: 0.012, sticky: false },
  inox: { label: "l'inox", chipK: 0.004, vc: { carbure: [50, 100], hss: [10, 20] }, apRatio: 0.2, drillK: 0.008, sticky: false },
  bois: { label: 'le bois franc', chipK: 0.02, vc: { carbure: [300, 1500], hss: [150, 500] }, apRatio: 1, drillK: 0.03, sticky: false },
  mdf: { label: 'le MDF', chipK: 0.025, vc: { carbure: [400, 1500], hss: [200, 600] }, apRatio: 1, drillK: 0.03, sticky: false },
  plast: { label: 'le plastique', chipK: 0.015, vc: { carbure: [150, 500], hss: [50, 150] }, apRatio: 0.5, drillK: 0.02, sticky: true },
};

export type SuggestionCategory = 'securite' | 'correction' | 'temps' | 'outil' | 'qualite';

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  question: string;
  answer: string;
  /** Gain de temps estimé, en minutes */
  gain: number;
  lines: number[];
  /** Gain par pièce sur une série : ne s'additionne pas aux autres */
  seriesOnly?: boolean;
}

export const CATEGORY_LABEL: Record<SuggestionCategory, string> = {
  securite: 'SÉCURITÉ', correction: 'CORRECTION', temps: 'TEMPS', outil: 'OUTIL', qualite: 'FINI',
};

const r50 = (v: number) => Math.round(v / 50) * 50;
const r500 = (v: number) => Math.round(v / 500) * 500;
const n = (v: number, d = 0) => v.toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Produit les suggestions d'optimisation, triées par catégorie puis par gain décroissant. */
export function optimize(r: ParseResult, a: Answers, s: Settings): Suggestion[] {
  const out: Suggestion[] = [];
  const M = MATERIALS[a.material];
  const tcMin = s.times.toolChange / 60;
  const spinMin = s.times.spindleStart / 60;
  const add = (id: string, category: SuggestionCategory, question: string, answer: string, gain = 0, lines: number[] = [], seriesOnly = false) =>
    out.push({ id, category, question, answer, gain: Math.max(0, gain), lines: [...new Set(lines)], seriesOnly });

  for (const t of r.tools) toolSuggestions(t, r, a, M, add, tcMin, spinMin);

  // Dégagements trop hauts
  const cutZ = r.segments.filter((x) => x.kind === 'cut').map((x) => x.to.z).filter((z) => z <= 0);
  const top = cutZ.length ? Math.max(0, ...cutZ) : 0;
  const safe = top + 5;
  const high = r.retracts.filter((x) => x.z > safe + 0.5 && x.fromZ <= safe);
  if (high.length) {
    const extra = high.reduce((sum, x) => sum + (x.z - safe) * 2, 0);
    add('retract', 'temps', `Les dégagements montent à Z${n(high[0].z, 1)}. Faut-il remonter si haut ?`,
      `Non, sauf si une bride ou l'étau dépasse : Z${n(safe)} suffit au-dessus de la pièce. Gain sur ${high.length} montées et redescentes.`,
      extra / s.machine.rapid, high.map((x) => x.line));
  }

  // Approches en avance lente dans le vide
  if (r.airPlunges.length) {
    const gain = r.airPlunges.reduce((sum, x) => sum + x.height / x.feed - x.height / s.machine.rapid, 0);
    const mm = r.airPlunges.reduce((sum, x) => sum + x.height, 0);
    add('air', 'temps', `La ligne ${r.airPlunges[0].line} descend en avance lente dans le vide. Peut-on approcher en rapide ?`,
      `Oui : un G0 jusqu'à Z2, puis la plongée en G1. ${n(mm)} mm se font actuellement à F${n(r.airPlunges[0].feed)}.`,
      gain, r.airPlunges.map((x) => x.line));
  }

  // Regroupement d'outils à l'intérieur d'une face
  for (const f of r.faces) {
    const count: Record<number, number> = {};
    f.toolOrder.forEach((t) => (count[t] = (count[t] ?? 0) + 1));
    const repeated = Object.entries(count).filter(([, c]) => c > 1);
    if (repeated.length) {
      const extra = repeated.reduce((sum, [, c]) => sum + c - 1, 0);
      add(`regroup-${f.key}`, 'temps', `Sur ${f.name}, ${repeated.map(([t]) => 'T' + t).join(', ')} revien${repeated.length > 1 ? 'nent' : 't'} plusieurs fois. Peut-on regrouper ?`,
        `Oui si l'ordre d'usinage le permet : une seule opération par outil évite ${extra} changement${extra > 1 ? 's' : ''} sur cette face.`,
        extra * (tcMin + spinMin), [f.fromLine]);
    }
  }

  // Garder l'outil monté entre deux faces
  for (let i = 1; i < r.faces.length; i++) {
    const prev = r.faces[i - 1], next = r.faces[i];
    const last = prev.toolOrder[prev.toolOrder.length - 1], first = next.toolOrder[0];
    if (first !== undefined && last !== first && prev.toolOrder.includes(first)) {
      add(`keep-${next.key}`, 'temps', `T${first} commence ${next.name} mais n'est pas le dernier outil de ${prev.name}. Peut-on le garder monté au retournement ?`,
        `Oui si l'ordre le permet : finir ${prev.name} avec T${first} (au lieu de T${last}) puis enchaîner ${next.name} sans changer d'outil.`,
        tcMin + spinMin, [prev.toLine, next.fromLine]);
    }
  }

  // Face dominée par les changements d'outil
  if (r.faces.length > 1) {
    for (const f of r.faces) {
      const share = f.totalTime ? (f.byCategory.toolChange ?? 0) / f.totalTime : 0;
      if (f.toolChanges >= 3 && share > 0.35) {
        add(`tcshare-${f.key}`, 'temps', `${f.name} passe ${n(share * 100)} % de son temps en changements d'outil. Peut-on utiliser moins d'outils sur cette face ?`,
          `Probablement : vérifier si une même fraise peut faire l'ébauche et la finition, ou si un trou peut être fait par la fraise déjà montée.`, 0, [f.fromLine]);
      }
    }
  }

  // Arrêts M0
  for (const stop of r.stops.filter((x) => x.code === 0)) {
    add(`m0-${stop.line}`, 'temps', `L'arrêt M0 ligne ${stop.line} est-il nécessaire à chaque pièce ?`,
      `Si c'est un contrôle ponctuel, le remplacer par M1 (arrêt optionnel) : l'opérateur ne l'active que lorsqu'il veut vérifier. Garder M0 s'il sert à retourner la pièce.`,
      s.times.operatorStop / 60, [stop.line]);
  }

  // Palpage sur une série
  if (r.probeLines.length && a.quantity > 1) {
    const probe = r.tools.find((t) => t.type === 'Palpeur');
    add('probe', 'temps', `Le palpage est-il nécessaire sur chacune des ${a.quantity} pièces ?`,
      `Avec une butée et un étau fixes, palper la première pièce suffit souvent. Garder le palpage pour les pièces brutes de dimensions variables.`,
      probe ? probe.totalTime : r.categories.probe.time, r.probeLines);
  }

  // Changements manuels sur une série
  if (a.toolChanger === 'manuel' && r.categories.toolChange.count >= 3 && a.quantity > 1) {
    add('series', 'temps', `${r.categories.toolChange.count} changements manuels par pièce. Faut-il usiner pièce par pièce ?`,
      `Pour une série de ${a.quantity}, fixer plusieurs pièces et passer chaque outil sur toutes divise le nombre de changements. Gain estimé par pièce, non cumulable avec les autres.`,
      r.categories.toolChange.time * (1 - 1 / Math.min(a.quantity, 4)), [], true);
  }

  // Arrosage
  if (!r.hasCoolant && a.coolant !== 'aucun') {
    add('coolant', 'outil', `Aucun M7 ou M8 trouvé. L'arrosage est-il activé ?`,
      `Ajouter M8 (ou M7) après le démarrage broche${M.sticky ? ` : dans ${M.label}, l'air ou le brouillard évite que les copeaux se soudent sur l'outil` : ''}.`);
  }
  if (a.coolant === 'aucun' && M.sticky) {
    add('nocoolant', 'outil', `Peut-on usiner ${M.label} sans arrosage ?`,
      `Oui, mais en réduisant la vitesse de coupe : les copeaux collent à l'arête. Un simple soufflage d'air améliore beaucoup le résultat.`);
  }

  // Alertes reprises sous forme de questions
  for (const al of r.alerts) {
    if (/hérité/.test(al.message)) add(`f-${al.line}`, 'correction', `Ligne ${al.line} : l'avance F est-elle la bonne ?`, `Non, elle vient de l'outil précédent. Écrire un F explicite sur le premier mouvement de chaque outil.`, 0, [al.line]);
    else if (/Avance F absente/.test(al.message)) add(`nof-${al.line}`, 'correction', `Ligne ${al.line} : à quelle avance ce mouvement va-t-il se faire ?`, `Aucune avance n'est définie : le contrôleur refusera le mouvement ou utilisera une valeur imprévue. Ajouter un F.`, 0, [al.line]);
    else if (/Plongée en rapide/.test(al.message)) add(`g0z-${al.line}`, 'securite', `Ligne ${al.line} : le G0 sous Z0 est-il voulu ?`, `Probablement pas. Descendre en G0 jusqu'à Z2, puis entrer dans la matière en G1.`, 0, [al.line]);
    else if (/rapide XY/.test(al.message)) add(`g0xy-${al.line}`, 'securite', `Ligne ${al.line} : l'outil se déplace-t-il en rapide dans la matière ?`, `Oui : remonter au-dessus de la pièce avant tout déplacement G0 en XY.`, 0, [al.line]);
    else if (/hors de la course/.test(al.message)) add(`bounds-${al.line}`, 'securite', `Ligne ${al.line} : la machine peut-elle atteindre cette position ?`, `Non. ${al.message}. Vérifier l'origine pièce (G54…) ou le post-processeur.`, 0, [al.line]);
    else if (/inconnu/.test(al.message)) add(`code-${al.line}`, 'correction', `Ligne ${al.line} : le contrôleur reconnaît-il ce code ?`, `Non. ${al.message}. Le retirer ou choisir le bon post-processeur.`, 0, [al.line]);
    else if (/Arc invalide/.test(al.message)) add(`arc-${al.line}`, 'correction', `Ligne ${al.line} : cet arc est-il correct ?`, `Non. ${al.message}. Vérifier I/J (ou R) et la tolérance d'arc du post-processeur.`, 0, [al.line]);
  }

  const order: Record<SuggestionCategory, number> = { securite: 0, correction: 1, temps: 2, outil: 3, qualite: 4 };
  // Identifiants uniques (plusieurs alertes peuvent porter sur la même ligne)
  const seen = new Map<string, number>();
  for (const sg of out) {
    const k = seen.get(sg.id) ?? 0;
    seen.set(sg.id, k + 1);
    if (k) sg.id = `${sg.id}-${k + 1}`;
  }
  return out.sort((x, y) => order[x.category] - order[y.category] || y.gain - x.gain);
}

function toolSuggestions(
  t: ToolStat, r: ParseResult, a: Answers, M: Material,
  add: (id: string, c: Suggestion['category'], q: string, ans: string, gain?: number, lines?: number[]) => void,
  tcMin: number, spinMin: number,
) {
  const T = `T${t.number}`;
  const hss = isHSS(t.description, a.toolMaterial === 'hss');
  const vc = M.vc[hss ? 'hss' : 'carbure'];
  const D = t.diameter;
  const Z = t.flutes;
  const L = [...t.xyLines.slice(0, 1), ...t.plunges.slice(0, 1).map((p) => p.line)];

  if (t.spindle > a.spindleMax) {
    add(`smax-${T}`, 'securite', `${T} tourne à ${n(t.spindle)} tr/min. La broche le permet-elle ?`,
      `Non : la broche est limitée à ${n(a.spindleMax)} tr/min. Réduire S et l'avance dans le même rapport.`, 0, L);
  }
  if (!D || !t.spindle) return;
  const Vc = (Math.PI * D * t.spindle) / 1000;

  if (isMill(t.type) && t.feedXY) {
    const fzRec = M.chipK * D * (hss ? 0.7 : 1);
    const fz = t.feedXY / (t.spindle * Z);
    const sTarget = Math.min(a.spindleMax, r500((0.6 * vc[1] * 1000) / (Math.PI * D)));
    const tooSlow = Vc < vc[0] || (a.priority === 'temps' && Vc < 0.6 * vc[1]);
    if (a.priority !== 'outil' && tooSlow && sTarget > t.spindle * 1.1) {
      const nf = Math.min(a.feedMax, r50(fzRec * Z * sTarget));
      add(`vc-${T}`, 'temps', `${T} (Ø${n(D, 1)}) coupe à ${n(Vc)} m/min. Peut-on aller plus vite dans ${M.label} ?`,
        `Oui : ${hss ? 'en HSS' : 'en carbure'}, ${M.label} accepte ${vc[0]} à ${vc[1]} m/min. Passer à S${sTarget} et F${nf} (${n(fzRec, 3)} mm/dent).`,
        nf > t.feedXY ? t.xyTime * (1 - t.feedXY / nf) : 0, L);
    } else if (fz < 0.7 * fzRec) {
      const nf = Math.min(a.feedMax, r50(fzRec * Z * t.spindle));
      add(`fz-${T}`, 'outil', `${T} enlève ${n(fz, 3)} mm/dent. Est-ce suffisant ?`,
        `Non : sous ${n(0.7 * fzRec, 3)} mm/dent l'outil frotte et chauffe au lieu de couper. Viser F${nf} pour ${n(fzRec, 3)} mm/dent.`,
        nf > t.feedXY ? t.xyTime * (1 - t.feedXY / nf) : 0, L);
    } else if (fz > 1.4 * fzRec) {
      add(`fzhi-${T}`, 'outil', `${T} enlève ${n(fz, 3)} mm/dent. N'est-ce pas trop ?`,
        `Oui : au-dessus de ${n(1.4 * fzRec, 3)} mm/dent dans ${M.label}, risque de bris. Réduire F à ${r50(fzRec * Z * t.spindle)}.`, 0, L);
    }
    if (Vc > vc[1] * 1.1) {
      add(`vchi-${T}`, 'outil', `${T} coupe à ${n(Vc)} m/min. L'outil va-t-il tenir ?`,
        `Probablement pas : c'est au-dessus de ${vc[1]} m/min pour ${M.label}. ${M.sticky ? "Risque de copeaux soudés sur l'arête." : "Usure rapide de l'arête."}`, 0, L);
    }

    // Profondeur de passe, face par face
    const sets = Object.values(t.zLevelsByFace).map((z) => [...z].sort((x, y) => y - x));
    const allLevels = sets.reduce((sum, z) => sum + z.length, 0);
    const levels = sets.sort((x, y) => y.length - x.length)[0] ?? [];
    if (levels.length > 1 && a.priority !== 'outil') {
      const depth = -levels[levels.length - 1];
      const apMax = M.apRatio * D * (hss ? 0.7 : 1);
      const needed = Math.ceil(depth / apMax - 1e-9);
      if (needed < levels.length) {
        add(`ap-${T}`, 'temps', `${T} fait ${levels.length} passes de ${n(depth / levels.length, 1)} mm. Peut-on en faire moins ?`,
          `Oui : dans ${M.label}, une fraise Ø${n(D, 1)} accepte environ ${n(apMax, 1)} mm par passe en rainurage. ${needed} passe${needed > 1 ? 's suffisent' : ' suffit'} pour ${n(depth, 1)} mm.`,
          t.xyTime * (levels.length / allLevels) * (1 - needed / levels.length), t.xyLines.slice(0, 2));
      }
    }

    // Plongée verticale
    const deep = t.plunges.filter((p) => p.toZ < 0);
    if (deep.length && t.type !== 'Graveur') {
      add(`plunge-${T}`, a.priority === 'outil' ? 'outil' : 'qualite', `${T} plonge à la verticale ${deep.length} fois. Faut-il le faire ?`,
        `Mieux vaut une rampe de 2 à 3° ou une entrée en hélice : la fraise coupe avec ses arêtes de côté plutôt que du bout, ce qui réduit l'usure et le risque de bris.`,
        0, deep.slice(0, 3).map((p) => p.line));
    }

    // Sens de coupe
    if (t.arcsCCW > t.arcsCW && !t.spindleCCW && t.arcsCCW >= 2) {
      add(`climb-${T}`, 'qualite', `Le contour de ${T} tourne en sens antihoraire (G3). Usine-t-il en avalant ?`,
        `Si c'est un contour extérieur avec broche M3, non : c'est du fraisage en opposition. Inverser le sens (G2) donne en général un meilleur fini${M.sticky ? ` et moins de collage dans ${M.label}` : ''}.`,
        0, t.xyLines.slice(0, 2));
    }
  }

  if (t.type === 'Foret') {
    const perRev = t.feedMax / t.spindle;
    const rec = M.drillK * D * (hss ? 0.7 : 1);
    const holes = t.plunges.map((p) => p.line);
    if (perRev < 0.7 * rec) {
      const nf = Math.min(a.feedMax, r50(rec * t.spindle));
      add(`drill-${T}`, 'temps', `Le foret ${T} (Ø${n(D, 1)}) avance à ${n(perRev, 3)} mm/tour. Peut-on percer plus vite ?`,
        `Oui : viser environ ${n(rec, 3)} mm/tour, soit F${nf} à S${n(t.spindle)}.`, t.cutTime * (1 - t.feedMax / nf), holes);
    }
    const mill = r.tools
      .filter((m) => isMill(m.type) && m.diameter && m.diameter < D)
      .sort((x, y) => (y.diameter ?? 0) - (x.diameter ?? 0))[0];
    if (mill && t.plunges.length <= 4) {
      add(`helix-${T}`, 'temps', `Le trou Ø${n(D, 1)} peut-il être fait par T${mill.number} (Ø${n(mill.diameter ?? 0, 1)}) en interpolation hélicoïdale ?`,
        `Oui si la tolérance le permet : on élimine le changement d'outil et le démarrage de broche de ${T}. Le gain net tient compte d'environ 10 s d'hélice.`,
        tcMin + spinMin - 10 / 60, holes);
    }
  }
}

/** Somme des gains cumulables, plafonnée au temps total. */
export function totalGain(list: Suggestion[], total: number): number {
  return Math.min(total, list.filter((x) => !x.seriesOnly).reduce((s, x) => s + x.gain, 0));
}
