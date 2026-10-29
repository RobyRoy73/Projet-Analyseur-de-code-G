import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Alert } from '../core';
import { escapeHtml } from '../core';

const ROW = 20;
const PAD = 6;

/** Coloration syntaxique d'une ligne de code G (renvoie du HTML échappé). */
export function highlight(line: string): string {
  return escapeHtml(line).replace(
    /(\([^)]*\)|;.*$)|([GM])(\d+\.?\d*)|([XYZIJKRAB])([-+]?\d*\.?\d+)|([FS])(\d*\.?\d+)|(T)(\d+)|([NPQHDO])([-+]?\d*\.?\d+)/gi,
    (m, c, g, _gn, a, _an, f, _fn, t) =>
      c ? `<span class="tc">${c}</span>`
        : g ? `<span class="${g.toUpperCase() === 'G' ? 'tg' : 'tm'}">${m}</span>`
        : a ? `<span class="ta">${m}</span>`
        : f ? `<span class="tf">${m}</span>`
        : t ? `<span class="tt">${m}</span>`
        : `<span class="tx">${m}</span>`,
  );
}

interface Props {
  lines: string[];
  alerts: Alert[];
  selected: number | null;
  /** Incrémenté quand la sélection vient d'ailleurs et que la ligne doit défiler en vue */
  scrollKey: number;
  onSelect: (line: number) => void;
}

/** Liste virtualisée : seules les lignes visibles sont rendues, ce qui supporte des programmes de 100 000 lignes. */
function CodeViewInner({ lines, alerts, selected, scrollKey, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(560);

  const flags = useMemo(() => {
    const m = new Map<number, 'err' | 'warn'>();
    alerts.forEach((a) => { if (m.get(a.line) !== 'err') m.set(a.line, a.severity); });
    return m;
  }, [alerts]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (el && selected) el.scrollTop = Math.max(0, (selected - 1) * ROW - el.clientHeight / 2);
  }, [scrollKey]);

  const first = Math.max(0, Math.floor((scroll - PAD) / ROW) - 10);
  const last = Math.min(lines.length, Math.ceil((scroll + height) / ROW) + 10);
  const rows: React.ReactNode[] = [];
  for (let i = first; i < last; i++) {
    const n = i + 1;
    rows.push(
      <div
        key={n}
        className={`codeline${selected === n ? ' sel' : ''}`}
        style={{ top: PAD + i * ROW }}
        role="listitem"
        tabIndex={0}
        onClick={() => onSelect(n)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n); } }}
      >
        <span className="n">{n}</span>
        <span className={`flag ${flags.get(n) ?? ''}`} />
        <span dangerouslySetInnerHTML={{ __html: highlight(lines[i]) || ' ' }} />
      </div>,
    );
  }

  return (
    <div className="code" ref={box} role="list" aria-label="Programme" onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
      <div className="spacer" style={{ height: lines.length * ROW + PAD * 2 }}>{rows}</div>
    </div>
  );
}

export const CodeView = memo(CodeViewInner);
