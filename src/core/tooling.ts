import type { ToolType } from './types';

/**
 * Détermine le type d'outil à partir du commentaire de description,
 * par exemple « (T3 FORET 8 MM HSS) ». L'ordre des tests compte : un « foret à chanfreiner »
 * est classé comme graveur/chanfrein seulement s'il ne contient pas « FORET ».
 */
export function toolType(description: string): ToolType {
  const d = description.toUpperCase();
  if (/PALP|PROBE|SONDE/.test(d)) return 'Palpeur';
  if (/TARAUD|\bTAP\b/.test(d)) return 'Taraud';
  if (/FORET|DRILL|PERC/.test(d)) return 'Foret';
  if (/GRAV|V-?BIT|CHANFR/.test(d)) return 'Graveur';
  if (/BOULE|BALL/.test(d)) return 'Fraise boule';
  if (/SURFA|FACE ?MILL/.test(d)) return 'Surfaceuse';
  if (/FRAISE|MILL|\bEND\b|\bFR\b/.test(d)) return 'Fraise';
  return 'Non classé';
}

/** Lit le diamètre (mm ou po) et le nombre de dents dans la description. */
export function toolGeometry(description: string): { diameter: number | null; flutes: number } {
  const d = description.toUpperCase().replace(',', '.');
  let diameter: number | null = null;
  const mm = d.match(/(?:Ø|D|DIA\.?)?\s*(\d+(?:\.\d+)?)\s*MM/);
  if (mm) diameter = parseFloat(mm[1]);
  else {
    const inch = d.match(/(\d+)\/(\d+)\s*(?:PO|IN|")/) ?? d.match(/(\d+(?:\.\d+)?)\s*(?:PO|IN|")/);
    if (inch) diameter = inch[2] ? (parseFloat(inch[1]) / parseFloat(inch[2])) * 25.4 : parseFloat(inch[1]) * 25.4;
  }
  const fl = d.match(/(\d+)\s*(?:DENTS?|FL\b|FLUTES?|LÈVRES|LEVRES)/);
  return { diameter, flutes: fl ? parseInt(fl[1], 10) : 2 };
}

export const isMill = (t: ToolType) => t === 'Fraise' || t === 'Fraise boule' || t === 'Graveur' || t === 'Surfaceuse';

/** Les outils HSS sont repérés dans la description ; sinon le choix du questionnaire s'applique. */
export function isHSS(description: string, defaultHSS: boolean): boolean {
  if (/HSS|ACIER RAPIDE|COBALT|HSCO/i.test(description)) return true;
  if (/CARB/i.test(description)) return false;
  return defaultHSS;
}
