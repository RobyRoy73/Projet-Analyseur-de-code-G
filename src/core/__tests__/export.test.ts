import { describe, expect, it } from 'vitest';
import { facesCsv, htmlReport, toolsCsv } from '../export';
import { DEFAULT_ANSWERS, optimize } from '../optimizer';
import { parseGCode } from '../parser';
import { DEFAULT_SETTINGS } from '../settings';

const r = parseGCode('(T1 FRAISE 6 MM; "test")\n(FACE A)\nT1 M6\nS10000 M3\nG1 X100 F1000\nM30');

describe('exports', () => {
  it('produit un CSV outils avec séparateur « ; » et BOM pour Excel', () => {
    const csv = toolsCsv(r, 'essai.txt');
    expect(csv.startsWith('﻿')).toBe(true);
    const [head, line] = csv.slice(1).split('\r\n');
    expect(head.split(';')[1]).toBe('outil');
    expect(line).toContain('T1');
    expect(line).toContain('"FRAISE 6 MM; ""test"""');
  });

  it('produit un CSV par face', () => {
    const csv = facesCsv(r, 'essai.txt');
    expect(csv).toContain('Face A');
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('échappe le HTML du rapport', () => {
    const bad = parseGCode('(T1 <script>)\nT1 M6\nG1 X1 F10\nM30');
    const html = htmlReport(bad, optimize(bad, DEFAULT_ANSWERS, DEFAULT_SETTINGS), 'x<y>.txt');
    expect(html).not.toContain('<script>)');
    expect(html).toContain('&lt;script&gt;');
  });
});
