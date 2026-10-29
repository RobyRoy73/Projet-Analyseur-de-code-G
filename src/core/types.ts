/** Types partagés par tout le cœur d'analyse. Toutes les longueurs sont en mm, les temps en minutes. */

export type Dialect = 'grbl' | 'fanuc' | 'linuxcnc';

export interface MachineSettings {
  /** Course machine, en mm, par axe [min, max] */
  x: [number, number];
  y: [number, number];
  z: [number, number];
  /** Vitesse des déplacements rapides G0, en mm/min */
  rapid: number;
  dialect: Dialect;
}

export interface TimeSettings {
  /** Durée d'un changement d'outil M6, en secondes */
  toolChange: number;
  /** Durée d'un démarrage de broche M3/M4, en secondes */
  spindleStart: number;
  /** Durée estimée d'un arrêt opérateur M0/M1, en secondes */
  operatorStop: number;
}

export interface Settings {
  machine: MachineSettings;
  times: TimeSettings;
}

export type CategoryKey = 'cut' | 'rapid' | 'toolChange' | 'spindle' | 'dwell' | 'probe';
export type MoveKind = 'cut' | 'rapid' | 'probe';
export type Severity = 'err' | 'warn';

export interface Point3 { x: number; y: number; z: number }

export interface Segment {
  line: number;
  kind: MoveKind;
  /** G-code de mouvement : 0, 1, 2, 3 ou 38 (palpage) */
  motion: number;
  /** Points de la trajectoire (2 pour une droite, plus pour un arc) */
  points: Point3[];
  from: Point3;
  to: Point3;
  feed: number | null;
  tool: number;
  face: string;
  length: number;
  /** Temps du mouvement en minutes */
  time: number;
}

export interface Alert { severity: Severity; line: number; message: string }

export interface CategoryStat { time: number; count: number; distance: number }
export type CategoryTimes = Record<CategoryKey, CategoryStat>;

export type ToolType =
  | 'Fraise' | 'Fraise boule' | 'Surfaceuse' | 'Graveur' | 'Foret' | 'Taraud' | 'Palpeur' | 'Non classé';

export interface PlungeInfo { line: number; feed: number; fromZ: number; toZ: number }

export interface ToolStat {
  number: number;
  description: string;
  type: ToolType;
  diameter: number | null;
  flutes: number;
  /** Vitesse de broche la plus utilisée, tr/min */
  spindle: number;
  feedMin: number;
  feedMax: number;
  /** Avance maximale des mouvements de coupe avec déplacement XY */
  feedXY: number;
  cutDistance: number;
  cutTime: number;
  xyTime: number;
  totalTime: number;
  byCategory: Partial<Record<CategoryKey, number>>;
  /** Niveaux Z de coupe (sous Z0) par face */
  zLevelsByFace: Record<string, number[]>;
  xyLines: number[];
  plunges: PlungeInfo[];
  arcsCW: number;
  arcsCCW: number;
  spindleCCW: boolean;
}

export interface ToolTypeStat {
  type: ToolType | 'Sans outil';
  tools: number[];
  time: number;
  cutDistance: number;
  byCategory: Partial<Record<CategoryKey, number>>;
}

export interface FaceStat {
  key: string;
  name: string;
  description: string;
  fromLine: number;
  toLine: number;
  totalTime: number;
  byCategory: Partial<Record<CategoryKey, number>>;
  /** Temps par numéro d'outil, en minutes */
  toolTimes: Record<number, number>;
  /** Ordre d'apparition des outils sur la face (répétitions conservées si non consécutives) */
  toolOrder: number[];
  cutDistance: number;
  toolChanges: number;
}

export interface Bounds { min: Point3; max: Point3 }

export interface ParseResult {
  lines: string[];
  segments: Segment[];
  alerts: Alert[];
  tools: ToolStat[];
  toolTypes: ToolTypeStat[];
  faces: FaceStat[];
  categories: CategoryTimes;
  totalTime: number;
  bounds: Bounds | null;
  /** Unité du fichier source (les résultats sont toujours en mm) */
  sourceUnit: 'mm' | 'po';
  /** Séquence des outils dans le programme */
  toolSequence: number[];
  retracts: { line: number; z: number; fromZ: number }[];
  airPlunges: { line: number; feed: number; height: number; tool: number }[];
  stops: { line: number; code: number }[];
  probeLines: number[];
  hasCoolant: boolean;
  hasProgramEnd: boolean;
}
