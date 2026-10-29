import { DEFAULT_SETTINGS, DWELL_P_IN_MS, KNOWN_G, KNOWN_M } from './settings';
import { toolGeometry, toolType } from './tooling';
import type {
  Alert, CategoryKey, CategoryTimes, FaceStat, MoveKind, ParseResult, Point3, Segment, Settings, Severity,
  ToolStat, ToolTypeStat,
} from './types';

/** Commentaires qui ouvrent une nouvelle face : (FACE A - DESSUS), (CÔTÉ 2), (PHASE 1), (SETUP B)… */
export const FACE_RE = /^(FACE|C[OÔ]T[EÉ]|SETUP|MONTAGE|PHASE)\b\s*([A-Z0-9]*)\s*[-:]?\s*(.*)$/i;
const COMMENT_RE = /\(([^)]*)\)|;(.*)$/g;
const WORD_RE = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

interface Word { letter: string; value: number }

/** Extrait les commentaires d'une ligne. */
export function comments(line: string): string[] {
  return [...line.matchAll(COMMENT_RE)].map((m) => (m[1] ?? m[2] ?? '').trim());
}

/** Découpe une ligne en mots (lettre + nombre), sans les commentaires ni les numéros de bloc N. */
export function words(line: string): Word[] {
  const code = line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').toUpperCase();
  return [...code.matchAll(WORD_RE)]
    .map((m) => ({ letter: m[1], value: parseFloat(m[2]) }))
    .filter((w) => w.letter !== 'N');
}

const emptyCategories = (): CategoryTimes => ({
  cut: { time: 0, count: 0, distance: 0 },
  rapid: { time: 0, count: 0, distance: 0 },
  toolChange: { time: 0, count: 0, distance: 0 },
  spindle: { time: 0, count: 0, distance: 0 },
  dwell: { time: 0, count: 0, distance: 0 },
  probe: { time: 0, count: 0, distance: 0 },
});

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Analyse un programme de code G.
 * Fonction pure : même texte + mêmes réglages = même résultat. Aucune dépendance au navigateur.
 */
export function parseGCode(text: string, settings: Settings = DEFAULT_SETTINGS): ParseResult {
  const { machine, times } = settings;
  const lines = text.replace(/\r/g, '').split('\n');
  const knownG = KNOWN_G[machine.dialect];
  const knownM = KNOWN_M[machine.dialect];

  const st = {
    x: 0, y: 0, z: 0,
    motion: null as number | null,
    feed: null as number | null,
    spindle: 0,
    tool: 0,
    absolute: true,
    scale: 1, // 25.4 en pouces
    feedSetForTool: false,
    spindleOn: false,
    plane: 17,
    cycle: null as number | null,
    cycleR: 0,
    cycleZ: 0,
    cycleQ: 0,
    cycleP: 0,
    returnInitial: true,
  };
  let sourceUnit: 'mm' | 'po' = 'mm';

  const segments: Segment[] = [];
  const alerts: Alert[] = [];
  const toolMap = new Map<number, ToolStat>();
  const toolDesc: Record<number, string> = {};
  const categories = emptyCategories();
  const toolSequence: number[] = [];
  const retracts: ParseResult['retracts'] = [];
  const airPlunges: ParseResult['airPlunges'] = [];
  const stops: ParseResult['stops'] = [];
  const probeLines: number[] = [];
  let hasCoolant = false;
  let hasProgramEnd = false;
  let planeWarned = false;
  const min: Point3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Point3 = { x: -Infinity, y: -Infinity, z: -Infinity };

  const alert = (severity: Severity, line: number, message: string) => alerts.push({ severity, line, message });

  const tool = (n: number): ToolStat => {
    let t = toolMap.get(n);
    if (!t) {
      t = {
        number: n, description: '', type: 'Non classé', diameter: null, flutes: 2, spindle: 0,
        feedMin: Infinity, feedMax: 0, feedXY: 0, cutDistance: 0, cutTime: 0, xyTime: 0, totalTime: 0,
        byCategory: {}, zLevelsByFace: {}, xyLines: [], plunges: [], arcsCW: 0, arcsCCW: 0, spindleCCW: false,
      };
      toolMap.set(n, t);
    }
    return t;
  };

  // ----- Faces -----
  const explicitFaces = lines.some((l) => comments(l).some((c) => FACE_RE.test(c)));
  const faces: FaceStat[] = [];
  let face: FaceStat | null = null;
  let offset = 'G54';
  let rotary = '';
  const openFace = (key: string, name: string, description: string, line: number) => {
    if (face && face.key === key) return;
    face = faces.find((f) => f.key === key) ?? null;
    if (!face) {
      face = { key, name, description, fromLine: line, toLine: line, totalTime: 0, byCategory: {}, toolTimes: {}, toolOrder: [], cutDistance: 0, toolChanges: 0 };
      faces.push(face);
    }
  };
  const currentFace = (): FaceStat => {
    if (!face) openFace(explicitFaces ? '_prep' : 'G54', explicitFaces ? 'Préparation' : 'G54', explicitFaces ? 'Avant la première face' : 'Origine pièce', 1);
    return face as unknown as FaceStat;
  };

  /** Impute un temps (min) à une catégorie, à l'outil courant et à la face courante. */
  const charge = (k: CategoryKey, minutes: number, distance = 0) => {
    const c = categories[k];
    c.time += minutes; c.count++; c.distance += distance;
    const t = tool(st.tool);
    t.totalTime += minutes;
    t.byCategory[k] = (t.byCategory[k] ?? 0) + minutes;
    const f = currentFace();
    f.byCategory[k] = (f.byCategory[k] ?? 0) + minutes;
    f.totalTime += minutes;
    if (st.tool) {
      f.toolTimes[st.tool] = (f.toolTimes[st.tool] ?? 0) + minutes;
      if (f.toolOrder[f.toolOrder.length - 1] !== st.tool) f.toolOrder.push(st.tool);
    }
    if (k === 'cut') f.cutDistance += distance;
    if (k === 'toolChange') f.toolChanges++;
  };

  /**
   * Les coordonnées sont relatives à l'origine pièce (G54…), dont la position dans la machine est inconnue.
   * On vérifie donc l'étendue parcourue sur chaque axe par rapport à la course : une seule alerte par axe,
   * à la première ligne où l'étendue dépasse la course.
   */
  const reach = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] } as Record<'x' | 'y' | 'z', [number, number]>;
  const overflowed = new Set<string>();
  const checkBounds = (line: number, p: Point3) => {
    (['x', 'y', 'z'] as const).forEach((a) => {
      const r = reach[a];
      r[0] = Math.min(r[0], p[a]); r[1] = Math.max(r[1], p[a]);
      const span = machine[a][1] - machine[a][0];
      if (!overflowed.has(a) && r[1] - r[0] > span + 1e-6) {
        overflowed.add(a);
        alert('err', line, `Étendue en ${a.toUpperCase()} de ${round3(r[1] - r[0])} mm : dépasse la course machine de ${round3(span)} mm (${a.toUpperCase()}${round3(p[a])})`);
      }
    });
  };

  /** Ajoute un mouvement linéaire ou circulaire et met à jour les statistiques. */
  const move = (line: number, motion: number, to: Point3, arc?: { i?: number; j?: number; r?: number }) => {
    const from: Point3 = { x: st.x, y: st.y, z: st.z };
    if (from.x === to.x && from.y === to.y && from.z === to.z) return;
    let points: Point3[] = [from, to];
    let length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);

    if ((motion === 2 || motion === 3) && arc) {
      if (st.plane !== 17) {
        if (!planeWarned) alert('warn', line, `Arc dans le plan G${st.plane} : affiché en ligne droite, temps approximatif`);
        planeWarned = true;
      } else {
        let cx: number, cy: number;
        if (arc.r !== undefined) {
          const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
          const r = Math.abs(arc.r);
          if (d > 2 * r + 1e-4) {
            alert('err', line, `Arc invalide : rayon R${round3(r)} trop petit pour une corde de ${round3(d)} mm`);
            cx = (from.x + to.x) / 2; cy = (from.y + to.y) / 2;
          } else {
            const h = Math.sqrt(Math.max(0, r * r - (d / 2) ** 2));
            let sign = motion === 2 ? 1 : -1;
            if (arc.r < 0) sign = -sign;
            cx = (from.x + to.x) / 2 + (sign * h * dy) / d;
            cy = (from.y + to.y) / 2 - (sign * h * dx) / d;
          }
        } else {
          cx = from.x + (arc.i ?? 0); cy = from.y + (arc.j ?? 0);
        }
        const r1 = Math.hypot(from.x - cx, from.y - cy);
        const r2 = Math.hypot(to.x - cx, to.y - cy);
        if (Math.abs(r1 - r2) > 0.01) alert('err', line, `Arc invalide : rayon de départ ${round3(r1)} ≠ rayon d'arrivée ${round3(r2)}`);
        const a1 = Math.atan2(from.y - cy, from.x - cx);
        const a2 = Math.atan2(to.y - cy, to.x - cx);
        let sweep = a2 - a1;
        const full = from.x === to.x && from.y === to.y;
        if (motion === 3 && (sweep <= 0 || full)) sweep += 2 * Math.PI;
        if (motion === 2 && (sweep >= 0 || full)) sweep -= 2 * Math.PI;
        const n = Math.max(8, Math.ceil(Math.abs(sweep) * 16));
        points = [];
        for (let k = 0; k <= n; k++) {
          const a = a1 + (sweep * k) / n;
          points.push({ x: cx + r1 * Math.cos(a), y: cy + r1 * Math.sin(a), z: from.z + ((to.z - from.z) * k) / n });
        }
        length = Math.hypot(Math.abs(sweep) * r1, to.z - from.z);
      }
    }

    const kind: MoveKind = motion === 0 ? 'rapid' : motion === 38 ? 'probe' : 'cut';
    let time: number;
    if (kind === 'rapid') {
      if (to.z < 0 && to.z < from.z) alert('err', line, `Plongée en rapide G0 sous Z0 (Z${round3(to.z)})`);
      else if (from.z < 0 && (to.x !== from.x || to.y !== from.y)) alert('err', line, `Déplacement rapide XY avec l'outil dans la matière (Z${round3(from.z)})`);
      time = length / machine.rapid;
      charge('rapid', time, length);
      if (to.x === from.x && to.y === from.y && to.z > from.z) retracts.push({ line, z: to.z, fromZ: from.z });
    } else {
      if (st.feed == null) alert('err', line, 'Avance F absente : aucune valeur définie');
      else if (!st.feedSetForTool && st.tool) {
        alert('warn', line, `Pas de F après changement d'outil T${st.tool} : F${round3(st.feed)} hérité`);
        st.feedSetForTool = true;
      }
      const feed = st.feed ?? 1;
      time = length / feed;
      charge(kind, time, length);
      if (kind === 'probe') probeLines.push(line);
      else {
        const t = tool(st.tool);
        t.cutDistance += length; t.cutTime += time;
        t.feedMin = Math.min(t.feedMin, feed); t.feedMax = Math.max(t.feedMax, feed);
        if (st.spindleOn && st.spindle) t.spindle = st.spindle;
        const xy = to.x !== from.x || to.y !== from.y;
        if (xy) {
          t.xyTime += time; t.feedXY = Math.max(t.feedXY, feed); t.xyLines.push(line);
          if (to.z < 0) {
            const k = currentFace().key;
            const lv = (t.zLevelsByFace[k] ??= []);
            const z = round3(to.z);
            if (!lv.includes(z)) lv.push(z);
          }
          if (motion === 2) t.arcsCW++;
          if (motion === 3) t.arcsCCW++;
        } else if (to.z < from.z) {
          t.plunges.push({ line, feed, fromZ: from.z, toZ: to.z });
          if (from.z > 2) airPlunges.push({ line, feed, height: from.z - Math.max(2, to.z), tool: st.tool });
        }
      }
    }
    checkBounds(line, from);
    checkBounds(line, to);
    points.forEach((p) => (['x', 'y', 'z'] as const).forEach((a) => { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }));
    segments.push({ line, kind, motion, points, from, to, feed: st.feed, tool: st.tool, face: currentFace().key, length, time });
    st.x = to.x; st.y = to.y; st.z = to.z;
  };

  lines.forEach((raw, i) => {
    const line = i + 1;

    for (const c of comments(raw)) {
      const t = c.match(/^T(\d+)\s*[-:=]?\s*(.*)$/i);
      if (t) toolDesc[+t[1]] = t[2].trim();
      const f = explicitFaces ? c.match(FACE_RE) : null;
      if (f) {
        const id = (f[2] || '').toUpperCase();
        const head = f[1].toUpperCase();
        const label = /^C/.test(head) ? 'Côté' : head === 'FACE' ? 'Face' : head.charAt(0) + head.slice(1).toLowerCase();
        openFace(`c:${id}:${f[3]}`, `${label} ${id}`.trim(), f[3].trim(), line);
      }
    }

    const ws = words(raw);
    if (!ws.length) return;
    const w: Record<string, number> = {};
    const gs: number[] = [];
    const ms: number[] = [];
    for (const { letter, value } of ws) {
      if (letter === 'G') gs.push(value);
      else if (letter === 'M') ms.push(value);
      else w[letter] = value;
    }

    if (!explicitFaces) {
      gs.forEach((g) => { if (g >= 54 && g <= 59) offset = `G${g}`; });
      const motionOnLine = gs.some((g) => g === 0 || g === 1);
      if (motionOnLine || !gs.length) {
        if ('A' in w) rotary = ` A${w.A}`;
        if ('B' in w) rotary = ` B${w.B}`;
      }
      const key = offset + rotary;
      if (!face || face.key !== key) openFace(key, key, rotary ? 'Indexation 4e axe' : 'Origine pièce', line);
    }
    currentFace().toLine = line;

    // Ordre : unités, S/T/F, puis codes G, puis codes M, puis mouvement
    if (gs.includes(20)) { st.scale = 25.4; sourceUnit = 'po'; }
    if (gs.includes(21)) { st.scale = 1; sourceUnit = 'mm'; }
    if ('S' in w) st.spindle = w.S;
    if ('T' in w) {
      st.tool = w.T; st.feedSetForTool = false;
      tool(st.tool);
      if (toolSequence[toolSequence.length - 1] !== st.tool) toolSequence.push(st.tool);
    }
    if ('F' in w) { st.feed = w.F * st.scale; st.feedSetForTool = true; }

    let dwell = false;
    for (const g of gs) {
      if (!knownG.has(g)) alert('err', line, `Code G${g} inconnu pour ce contrôleur`);
      if (g === 90) st.absolute = true;
      if (g === 91) st.absolute = false;
      if (g === 17 || g === 18 || g === 19) st.plane = g;
      if (g === 0 || g === 1 || g === 2 || g === 3) { st.motion = g; st.cycle = null; }
      if (g >= 38 && g < 39) { st.motion = 38; st.cycle = null; }
      if (g === 4) dwell = true;
      if (g === 80) st.cycle = null;
      if (g === 98) st.returnInitial = true;
      if (g === 99) st.returnInitial = false;
      if ([73, 81, 82, 83, 84, 85, 86, 89].includes(g)) st.cycle = g;
    }

    if (dwell) {
      const p = w.P ?? 0;
      const seconds = 'X' in w && machine.dialect === 'fanuc' ? w.X : DWELL_P_IN_MS[machine.dialect] ? p / 1000 : p;
      charge('dwell', seconds / 60);
    }

    for (const m of ms) {
      if (!knownM.has(m)) alert('err', line, `Code M${m} inconnu pour ce contrôleur`);
      if (m === 30 || m === 2) hasProgramEnd = true;
      if (m === 6) charge('toolChange', times.toolChange / 60);
      if ((m === 3 || m === 4) && !st.spindleOn) { st.spindleOn = true; charge('spindle', times.spindleStart / 60); }
      if (m === 4 && st.tool) tool(st.tool).spindleCCW = true;
      if (m === 5) st.spindleOn = false;
      if (m === 0 || m === 1) { charge('dwell', times.operatorStop / 60); stops.push({ line, code: m }); }
      if (m === 7 || m === 8) hasCoolant = true;
    }

    if (dwell) return;
    const hasAxis = 'X' in w || 'Y' in w || 'Z' in w;
    const target = (): Point3 => {
      const p: Point3 = { x: st.x, y: st.y, z: st.z };
      (['x', 'y', 'z'] as const).forEach((a) => {
        const L = a.toUpperCase();
        if (L in w) p[a] = st.absolute ? w[L] * st.scale : p[a] + w[L] * st.scale;
      });
      return p;
    };

    // Cycles de perçage (G81, G82, G83, G73…) : rapide en XY, rapide à R, avance à Z, retour
    if (st.cycle !== null) {
      if ('R' in w) st.cycleR = w.R * st.scale;
      if ('Z' in w) st.cycleZ = w.Z * st.scale;
      if (!('X' in w || 'Y' in w || gs.some((g) => g >= 73 && g <= 89))) return;
      const initialZ = st.z;
      const xy = target();
      move(line, 0, { x: xy.x, y: xy.y, z: initialZ });
      if (st.cycleR < initialZ) move(line, 0, { x: xy.x, y: xy.y, z: st.cycleR });
      const prevMotion = st.motion;
      move(line, 1, { x: xy.x, y: xy.y, z: st.cycleZ });
      if (st.cycle === 82 && 'P' in w) charge('dwell', (DWELL_P_IN_MS[machine.dialect] ? w.P / 1000 : w.P) / 60);
      move(line, 0, { x: xy.x, y: xy.y, z: st.returnInitial ? Math.max(initialZ, st.cycleR) : st.cycleR });
      st.motion = prevMotion;
      return;
    }

    if (!hasAxis || st.motion === null) return;
    const to = target();
    if (st.motion === 2 || st.motion === 3) {
      move(line, st.motion, to, 'R' in w ? { r: w.R * st.scale } : { i: (w.I ?? 0) * st.scale, j: (w.J ?? 0) * st.scale });
    } else {
      move(line, st.motion, to);
    }
  });

  // Une face sans aucune coupe (préparation, changement d'outil avant l'indexation…) est fusionnée dans la suivante.
  for (let i = faces.length - 2; i >= 0; i--) {
    const f = faces[i], next = faces[i + 1];
    if (f.cutDistance > 0 || f.toLine > next.fromLine) continue;
    for (const [k, v] of Object.entries(f.byCategory)) next.byCategory[k as CategoryKey] = (next.byCategory[k as CategoryKey] ?? 0) + (v ?? 0);
    for (const [t, v] of Object.entries(f.toolTimes)) next.toolTimes[+t] = (next.toolTimes[+t] ?? 0) + v;
    next.toolOrder = [...f.toolOrder, ...next.toolOrder].filter((t, j, a) => j === 0 || a[j - 1] !== t);
    next.totalTime += f.totalTime;
    next.toolChanges += f.toolChanges;
    next.fromLine = f.fromLine;
    segments.forEach((s) => { if (s.face === f.key) s.face = next.key; });
    for (const t of toolMap.values()) {
      const lv = t.zLevelsByFace[f.key];
      if (lv) { t.zLevelsByFace[next.key] = [...new Set([...(t.zLevelsByFace[next.key] ?? []), ...lv])]; delete t.zLevelsByFace[f.key]; }
    }
    faces.splice(i, 1);
  }

  if (!hasProgramEnd) alert('warn', lines.length, 'Fin de programme M30 ou M2 absente');
  alerts.sort((a, b) => a.line - b.line);

  const total = Object.values(categories).reduce((s, c) => s + c.time, 0);
  const noTool = toolMap.get(0);
  toolMap.delete(0);
  const tools = [...toolMap.values()]
    .map((t) => {
      const description = toolDesc[t.number] ?? '';
      const g = toolGeometry(description);
      return { ...t, description, type: toolType(description), diameter: g.diameter, flutes: g.flutes, feedMin: t.feedMin === Infinity ? 0 : t.feedMin };
    })
    .sort((a, b) => a.number - b.number);

  const typeMap = new Map<string, ToolTypeStat>();
  for (const t of tools) {
    const y = typeMap.get(t.type) ?? { type: t.type, tools: [], time: 0, cutDistance: 0, byCategory: {} };
    y.tools.push(t.number); y.time += t.totalTime; y.cutDistance += t.cutDistance;
    for (const [k, v] of Object.entries(t.byCategory)) y.byCategory[k as CategoryKey] = (y.byCategory[k as CategoryKey] ?? 0) + (v ?? 0);
    typeMap.set(t.type, y);
  }
  if (noTool && noTool.totalTime > 0) {
    typeMap.set('Sans outil', { type: 'Sans outil', tools: [], time: noTool.totalTime, cutDistance: noTool.cutDistance, byCategory: { ...noTool.byCategory } });
  }

  return {
    lines,
    segments,
    alerts,
    tools,
    toolTypes: [...typeMap.values()].sort((a, b) => b.time - a.time),
    faces: faces.filter((f) => f.totalTime > 0 || f.toolOrder.length > 0),
    categories,
    totalTime: total,
    bounds: segments.length ? { min, max } : null,
    sourceUnit,
    toolSequence,
    retracts,
    airPlunges,
    stops,
    probeLines,
    hasCoolant,
    hasProgramEnd,
  };
}
