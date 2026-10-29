import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGCode } from '../parser';
import { DEFAULT_SETTINGS } from '../settings';
import type { Settings } from '../types';

const sample = (name: string) => readFileSync(resolve(__dirname, '../../../samples', name), 'utf8');
const sec = (minutes: number) => Math.round(minutes * 600) / 10;
const withDialect = (dialect: Settings['machine']['dialect']): Settings => ({
  ...DEFAULT_SETTINGS, machine: { ...DEFAULT_SETTINGS.machine, dialect },
});

describe('parseGCode : mouvements et temps', () => {
  it('calcule le temps de coupe à partir de la distance et de l’avance', () => {
    const r = parseGCode('G21 G90\nG1 X100 F1000\nM30');
    expect(r.categories.cut.distance).toBeCloseTo(100);
    expect(sec(r.categories.cut.time)).toBe(6);
  });

  it('utilise la vitesse rapide des réglages pour G0', () => {
    const r = parseGCode('G0 X500\nM30');
    expect(sec(r.categories.rapid.time)).toBe(6); // 500 mm à 5000 mm/min
  });

  it('convertit les pouces en mm (G20)', () => {
    const r = parseGCode('G20 G90\nG1 X1 F10\nM30');
    expect(r.sourceUnit).toBe('po');
    expect(r.categories.cut.distance).toBeCloseTo(25.4);
    expect(sec(r.categories.cut.time)).toBe(6);
  });

  it('gère le mode incrémental G91', () => {
    const r = parseGCode('G91\nG1 X10 F100\nX10\nM30');
    expect(r.segments.at(-1)?.to.x).toBeCloseTo(20);
  });

  it('mesure un quart de cercle G3 avec I/J', () => {
    const r = parseGCode('G0 X10 Y0\nG3 X0 Y10 I-10 J0 F600\nM30');
    expect(r.categories.cut.distance).toBeCloseTo((Math.PI * 10) / 2, 3);
    expect(r.alerts.filter((a) => /Arc/.test(a.message))).toHaveLength(0);
  });

  it('mesure un demi-cercle G2 défini par R', () => {
    const r = parseGCode('G0 X0 Y0\nG2 X20 Y0 R10 F600\nM30');
    expect(r.categories.cut.distance).toBeCloseTo(Math.PI * 10, 2);
  });

  it('signale un arc dont les rayons ne correspondent pas', () => {
    const r = parseGCode('G0 X0 Y0\nG2 X20 Y0 I5 J0 F600\nM30');
    expect(r.alerts.some((a) => /Arc invalide/.test(a.message))).toBe(true);
  });
});

describe('parseGCode : catégories de temps', () => {
  it('compte changements d’outil, démarrages de broche, temporisations et arrêts', () => {
    const r = parseGCode('T1 M6\nS1000 M3\nG4 P2\nM0\nM5\nT2 M6\nM3\nM30');
    expect(r.categories.toolChange.count).toBe(2);
    expect(sec(r.categories.toolChange.time)).toBe(90);
    expect(r.categories.spindle.count).toBe(2);
    expect(sec(r.categories.dwell.time)).toBe(32); // 2 s + 30 s
  });

  it('interprète G4 P en millisecondes pour Fanuc', () => {
    const r = parseGCode('G4 P500\nM30', withDialect('fanuc'));
    expect(sec(r.categories.dwell.time)).toBe(0.5);
  });

  it('impute le palpage G38.2 à sa propre catégorie', () => {
    const r = parseGCode('T99 M6\nG0 Z10\nG38.2 Z0 F100\nM30');
    expect(r.categories.probe.distance).toBeCloseTo(10);
    expect(r.probeLines).toEqual([3]);
  });

  it('la somme des catégories égale la somme par outil et par face', () => {
    const r = parseGCode(sample('plaque-support-2-faces.txt'));
    const byTool = r.tools.reduce((s, t) => s + t.totalTime, 0) + (r.toolTypes.find((y) => y.type === 'Sans outil')?.time ?? 0);
    const byFace = r.faces.reduce((s, f) => s + f.totalTime, 0);
    expect(byTool).toBeCloseTo(r.totalTime, 6);
    expect(byFace).toBeCloseTo(r.totalTime, 6);
  });
});

describe('parseGCode : alertes', () => {
  it('détecte les erreurs de l’exemple', () => {
    const r = parseGCode(sample('plaque-support-2-faces.txt'));
    const msgs = r.alerts.map((a) => a.message).join('\n');
    expect(msgs).toMatch(/Plongée en rapide G0 sous Z0/);
    expect(msgs).toMatch(/Étendue en X de 820 mm : dépasse la course machine de 800 mm/);
    expect(msgs).toMatch(/Code G65 inconnu/);
    expect(msgs).toMatch(/F1200 hérité/);
  });

  it('signale une avance absente et une fin de programme manquante', () => {
    const r = parseGCode('G1 X10');
    expect(r.alerts.map((a) => a.message)).toEqual(
      expect.arrayContaining(['Avance F absente : aucune valeur définie', 'Fin de programme M30 ou M2 absente']),
    );
  });

  it('accepte des coordonnées négatives tant que l’étendue tient dans la course', () => {
    const r = parseGCode('G0 X-15 Y-10\nG1 X100 F1000\nM30');
    expect(r.alerts.some((a) => /course/.test(a.message))).toBe(false);
  });

  it('ne signale le dépassement de course qu’une fois par axe', () => {
    const r = parseGCode('G0 X0\nG0 X900\nG0 X950\nM30');
    expect(r.alerts.filter((a) => /course/.test(a.message))).toHaveLength(1);
  });

  it('signale un rapide XY dans la matière', () => {
    const r = parseGCode('G1 Z-2 F100\nG0 X10\nM30');
    expect(r.alerts.some((a) => /rapide XY/.test(a.message))).toBe(true);
  });
});

describe('parseGCode : programme de test de 400 lignes', () => {
  it('trouve exactement les 5 erreurs volontaires', () => {
    const r = parseGCode(sample('test-boitier-400-lignes.txt'));
    expect(r.alerts.map((a) => a.line)).toEqual([178, 233, 379, 394, 395]);
    expect(r.faces.map((f) => f.name)).toEqual(['Face A', 'Face B']);
    expect(r.tools.map((t) => t.type)).toEqual(['Fraise', 'Fraise', 'Foret', 'Surfaceuse', 'Graveur', 'Palpeur']);
  });
});

describe('parseGCode : outils', () => {
  it('lit type, diamètre et dents dans les commentaires', () => {
    const r = parseGCode(sample('plaque-support-2-faces.txt'));
    const t1 = r.tools.find((t) => t.number === 1)!;
    expect(t1.type).toBe('Fraise');
    expect(t1.diameter).toBe(6);
    expect(t1.flutes).toBe(2);
    expect(t1.spindle).toBe(12000);
    expect(r.tools.find((t) => t.number === 3)?.type).toBe('Foret');
    expect(r.tools.find((t) => t.number === 99)?.type).toBe('Palpeur');
  });
});

describe('parseGCode : faces', () => {
  it('découpe par commentaires (FACE …)', () => {
    const r = parseGCode(sample('plaque-support-2-faces.txt'));
    expect(r.faces.map((f) => f.name)).toEqual(['Face A', 'Face B']);
    expect(r.faces[0].toolOrder).toEqual([99, 1, 3]);
    expect(r.faces[1].toolOrder).toEqual([1, 2]);
    expect(r.faces[0].description).toBe('DESSUS');
  });

  it('découpe par origine pièce sans commentaires', () => {
    const r = parseGCode(sample('sans-commentaires-g54-g55.txt'));
    expect(r.faces.map((f) => f.key)).toEqual(['G54', 'G55']);
  });

  it('découpe par indexation 4e axe', () => {
    const r = parseGCode('T1 M6\nG0 A0\nG1 X10 F100\nG0 A90\nG1 X20\nM30');
    expect(r.faces.map((f) => f.key)).toEqual(['G54 A0', 'G54 A90']);
  });
});

describe('parseGCode : cycles de perçage', () => {
  it('simule G83 sur trois trous', () => {
    const r = parseGCode(sample('fanuc-cycle-percage.txt'), withDialect('fanuc'));
    const t5 = r.tools.find((t) => t.number === 5)!;
    expect(t5.cutDistance).toBeCloseTo(3 * 20, 3); // de R2 à Z-18
    expect(r.alerts.filter((a) => a.severity === 'err')).toHaveLength(0);
  });

  it('signale G83 comme inconnu pour GRBL', () => {
    const r = parseGCode(sample('fanuc-cycle-percage.txt'));
    expect(r.alerts.some((a) => /G83 inconnu/.test(a.message))).toBe(true);
  });
});
