import type { CategoryKey, Dialect, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  machine: { x: [0, 800], y: [0, 600], z: [-100, 100], rapid: 5000, dialect: 'grbl' },
  times: { toolChange: 45, spindleStart: 3, operatorStop: 30 },
};

export const CATEGORIES: { key: CategoryKey; label: string; codes: string; color: string }[] = [
  { key: 'cut', label: 'Coupe', codes: 'G1 G2 G3', color: 'var(--cut)' },
  { key: 'rapid', label: 'Déplacement rapide', codes: 'G0', color: 'var(--rapid)' },
  { key: 'toolChange', label: "Changement d'outil", codes: 'M6', color: 'var(--cat-tc)' },
  { key: 'spindle', label: 'Démarrage broche', codes: 'M3 M4', color: 'var(--cat-sp)' },
  { key: 'dwell', label: 'Arrêt et temporisation', codes: 'G4 M0 M1', color: 'var(--cat-dw)' },
  { key: 'probe', label: 'Palpage', codes: 'G38.x', color: 'var(--cat-pr)' },
];

const COMMON_G = [0, 1, 2, 3, 4, 10, 17, 18, 19, 20, 21, 28, 30, 40, 41, 42, 43, 49, 53, 54, 55, 56, 57, 58, 59, 80, 90, 91, 92, 93, 94];

/** Codes G reconnus par contrôleur. Les codes absents génèrent une erreur « code inconnu ». */
export const KNOWN_G: Record<Dialect, Set<number>> = {
  grbl: new Set([...COMMON_G, 38.2, 38.3, 38.4, 38.5, 43.1, 61, 64, 92.1]),
  fanuc: new Set([...COMMON_G, 15, 16, 31, 52, 61, 64, 65, 68, 69, 73, 74, 76, 81, 82, 83, 84, 85, 86, 87, 88, 89, 98, 99]),
  linuxcnc: new Set([...COMMON_G, 5, 5.1, 5.2, 7, 8, 33, 33.1, 38.2, 38.3, 38.4, 38.5, 43.1, 43.2, 61, 61.1, 64, 73, 76, 81, 82, 83, 84, 85, 86, 87, 88, 89, 92.1, 92.2, 92.3, 95, 96, 97, 98, 99]),
};

export const KNOWN_M: Record<Dialect, Set<number>> = {
  grbl: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 30, 56]),
  fanuc: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 19, 29, 30, 98, 99]),
  linuxcnc: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 30, 48, 49, 50, 51, 52, 53, 60, 61, 62, 63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199]),
};

export const DIALECT_LABEL: Record<Dialect, string> = { grbl: 'GRBL', fanuc: 'Fanuc', linuxcnc: 'LinuxCNC' };

/** Unité du paramètre P de G4 : secondes (GRBL, LinuxCNC) ou millisecondes (Fanuc) */
export const DWELL_P_IN_MS: Record<Dialect, boolean> = { grbl: false, fanuc: true, linuxcnc: false };
