import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANSWERS, optimize, totalGain } from '../optimizer';
import { parseGCode } from '../parser';
import { DEFAULT_SETTINGS } from '../settings';
import { toolGeometry, toolType } from '../tooling';

const text = readFileSync(resolve(__dirname, '../../../samples/plaque-support-2-faces.txt'), 'utf8');
const r = parseGCode(text);
const ids = (answers = DEFAULT_ANSWERS) => optimize(r, answers, DEFAULT_SETTINGS).map((s) => s.id);

describe('optimize', () => {
  it('place sécurité et corrections en premier', () => {
    const s = optimize(r, DEFAULT_ANSWERS, DEFAULT_SETTINGS);
    expect(s[0].category).toBe('securite');
    const firstTime = s.findIndex((x) => x.category === 'temps');
    expect(s.slice(0, firstTime).every((x) => x.category === 'securite' || x.category === 'correction')).toBe(true);
  });

  it('propose de garder T1 monté entre la face A et la face B', () => {
    const s = optimize(r, DEFAULT_ANSWERS, DEFAULT_SETTINGS).find((x) => x.id.startsWith('keep-'));
    expect(s?.question).toMatch(/T1 commence Face B/);
    expect(s?.gain).toBeCloseTo((45 + 3) / 60);
  });

  it('propose l’interpolation hélicoïdale du trou Ø8 avec la fraise Ø6', () => {
    expect(ids()).toContain('helix-T3');
  });

  it('ne propose pas de réduire les passes dans l’aluminium mais oui dans le bois', () => {
    expect(ids()).not.toContain('ap-T1');
    expect(ids({ ...DEFAULT_ANSWERS, material: 'bois' })).toContain('ap-T1');
  });

  it('respecte la priorité « durée de vie des outils »', () => {
    const list = ids({ ...DEFAULT_ANSWERS, priority: 'outil' });
    expect(list.some((id) => id.startsWith('vc-'))).toBe(false);
  });

  it('signale une broche au-dessus du maximum', () => {
    expect(ids({ ...DEFAULT_ANSWERS, spindleMax: 10000 })).toEqual(expect.arrayContaining(['smax-T1', 'smax-T2']));
  });

  it('n’additionne pas les gains de série', () => {
    const s = optimize(r, DEFAULT_ANSWERS, DEFAULT_SETTINGS);
    const series = s.find((x) => x.seriesOnly)!;
    expect(series).toBeTruthy();
    const sum = s.filter((x) => !x.seriesOnly).reduce((a, x) => a + x.gain, 0);
    expect(totalGain(s, r.totalTime)).toBeCloseTo(Math.min(sum, r.totalTime));
  });
});

describe('tooling', () => {
  it.each([
    ['FRAISE 6 MM 2 DENTS', 'Fraise'],
    ['FORET 8 MM HSS', 'Foret'],
    ['PALPEUR 3D', 'Palpeur'],
    ['TARAUD M8 X 1.25', 'Taraud'],
    ['FRAISE BOULE 4 MM', 'Fraise boule'],
    ['V-BIT 90 DEG', 'Graveur'],
    ['1/4 IN END MILL 3FL', 'Fraise'],
  ])('%s → %s', (desc, type) => expect(toolType(desc)).toBe(type));

  it('lit les diamètres en mm et en pouces', () => {
    expect(toolGeometry('FRAISE 6,35 MM 3 DENTS')).toEqual({ diameter: 6.35, flutes: 3 });
    expect(toolGeometry('1/4" END MILL 3FL').diameter).toBeCloseTo(6.35);
  });
});
