import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point3, Segment } from '../core';
import { formatNumber } from '../core';

export type View = 'xy' | 'xz' | 'iso';

interface Props {
  segments: Segment[];
  totalLines: number;
  selected: number | null;
  face: string;
  faces: { key: string; name: string }[];
  onFace: (key: string) => void;
  onSelect: (line: number) => void;
}

const project = (view: View, p: Point3): [number, number] =>
  view === 'xy' ? [p.x, p.y] : view === 'xz' ? [p.x, p.z] : [(p.x - p.y) * 0.866, (p.x + p.y) * 0.5 + p.z * 1.2];

/** Visualiseur Canvas 2D : vues XY, XZ, iso. Molette pour zoomer, glisser pour déplacer, double-clic pour recadrer. */
export function Toolpath({ segments, totalLines, selected, face, faces, onFace, onSelect }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>('xy');
  const [limit, setLimit] = useState(Infinity);
  const [zoom, setZoom] = useState({ k: 1, dx: 0, dy: 0 });
  const [coord, setCoord] = useState('Touchez une ligne ou un trait');
  const xf = useRef<{ sc: number; ox: number; oy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => { setLimit(Infinity); }, [totalLines]);
  useEffect(() => {
    // La molette zoome le dessin au lieu de faire défiler la page
    const cv = canvas.current;
    const stop = (e: WheelEvent) => e.preventDefault();
    cv?.addEventListener('wheel', stop, { passive: false });
    return () => cv?.removeEventListener('wheel', stop);
  }, []);
  useEffect(() => { setZoom({ k: 1, dx: 0, dy: 0 }); }, [view, face, segments]);

  const visible = useCallback((s: Segment) => s.line <= limit && (!face || s.face === face), [limit, face]);

  const draw = useCallback(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const c = (n: string) => css.getPropertyValue(n).trim();
    ctx.fillStyle = c('--panel');
    ctx.fillRect(0, 0, W, H);
    const shown = segments.filter((s) => !face || s.face === face);
    if (!shown.length) { xf.current = null; return; }

    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of shown) for (const p of s.points) {
      const [u, v] = project(view, p);
      if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v;
    }
    const pad = 48;
    const sc = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1)) * zoom.k;
    const ox = (W - (x1 - x0) * sc) / 2 - x0 * sc + zoom.dx;
    const oy = (H + (y1 - y0) * sc) / 2 + y0 * sc + zoom.dy;
    xf.current = { sc, ox, oy };
    const T = (p: Point3): [number, number] => { const [u, v] = project(view, p); return [ox + u * sc, oy - v * sc]; };

    if (view !== 'iso') {
      const step = [1, 5, 10, 50, 100, 500, 1000].find((s) => s * sc > 14) ?? 1000;
      ctx.strokeStyle = c('--grid'); ctx.lineWidth = 1; ctx.beginPath();
      for (let g = Math.floor((0 - ox) / sc / step) * step; g * sc + ox <= W; g += step) { const X = ox + g * sc; ctx.moveTo(X, 0); ctx.lineTo(X, H); }
      for (let g = Math.floor((oy - H) / sc / step) * step; oy - g * sc >= 0; g += step) { const Y = oy - g * sc; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
      ctx.stroke();
      ctx.strokeStyle = c('--muted'); ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
      ctx.fillStyle = c('--muted'); ctx.font = `12px ${c('--f-mono')}`;
      ctx.fillText(view === 'xy' ? 'Y' : 'Z', ox + 6, 52); ctx.fillText('X', W - 16, oy - 6);
      ctx.fillText(`grille ${step} mm`, 12, H - 12);
    }

    const stroke = (kind: Segment['kind']) => {
      if (kind === 'rapid') { ctx.setLineDash([5, 4]); ctx.strokeStyle = c('--rapid'); ctx.lineWidth = 1.5; }
      else { ctx.setLineDash([]); ctx.strokeStyle = c(kind === 'probe' ? '--cat-pr' : '--cut'); ctx.lineWidth = kind === 'probe' ? 3 : 2.2; }
    };
    // Regroupe les traits par type pour limiter les appels stroke() sur les gros programmes
    for (const kind of ['rapid', 'cut', 'probe'] as const) {
      stroke(kind);
      ctx.beginPath();
      for (const s of shown) {
        if (s.kind !== kind || !visible(s)) continue;
        s.points.forEach((p, k) => { const [X, Y] = T(p); if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (selected != null) {
      for (const s of shown) {
        if (s.line !== selected) continue;
        ctx.beginPath();
        s.points.forEach((p, k) => { const [X, Y] = T(p); if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
        ctx.strokeStyle = c('--sel'); ctx.lineWidth = 5; ctx.stroke();
        const [X, Y] = T(s.to);
        ctx.fillStyle = c('--sel'); ctx.beginPath(); ctx.arc(X, Y, 5, 0, 7); ctx.fill();
      }
    }
    if (limit !== Infinity) {
      const last = shown.filter(visible).at(-1);
      if (last) {
        const [X, Y] = T(last.to);
        ctx.strokeStyle = c('--fg'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, 7, 0, 7); ctx.stroke();
        setCoord(`X${formatNumber(last.to.x, 3)} Y${formatNumber(last.to.y, 3)} Z${formatNumber(last.to.z, 3)}`);
      }
    }
  }, [segments, face, view, zoom, selected, limit, visible]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const redraw = () => draw();
    window.addEventListener('resize', redraw);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', redraw);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { window.removeEventListener('resize', redraw); mq.removeEventListener('change', redraw); mo.disconnect(); };
  }, [draw]);

  useEffect(() => {
    if (selected == null) return;
    const s = segments.find((x) => x.line === selected);
    if (s) setCoord(`L${s.line} · X${formatNumber(s.to.x, 3)} Y${formatNumber(s.to.y, 3)} Z${formatNumber(s.to.z, 3)}${s.kind === 'rapid' ? ' · G0' : ` · F${s.feed ?? '—'}`}`);
  }, [selected, segments]);

  const pick = (mx: number, my: number) => {
    const t = xf.current;
    if (!t) return;
    let best: Segment | null = null, bd = 14;
    for (const s of segments) {
      if (!visible(s)) continue;
      for (let k = 1; k < s.points.length; k++) {
        const [a, b] = project(view, s.points[k - 1]), [c2, d] = project(view, s.points[k]);
        const ax = t.ox + a * t.sc, ay = t.oy - b * t.sc, bx = t.ox + c2 * t.sc, by = t.oy - d * t.sc;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / L));
        const dd = Math.hypot(mx - (ax + u * dx), my - (ay + u * dy));
        if (dd < bd) { bd = dd; best = s; }
      }
    }
    if (best) onSelect(best.line);
  };

  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const shownMax = Number.isFinite(limit) ? limit : totalLines;
  return (
    <section className="panel viewerpanel">
      <div className="ph">
        <h2>Trajectoire d'outil</h2>
        <div className="seg" role="group" aria-label="Vue">
          {([['xy', 'Dessus XY'], ['xz', 'Face XZ'], ['iso', 'Iso 3D']] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="viewer">
        <canvas
          ref={canvas}
          aria-label="Visualisation de la trajectoire"
          onWheel={(e) => {
            const [mx, my] = local(e);
            const f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
            const cx = e.currentTarget.clientWidth / 2, cy = e.currentTarget.clientHeight / 2;
            // Zoom centré sur le curseur : le point sous la souris reste fixe
            setZoom((z) => ({ k: z.k * f, dx: mx - cx - (mx - cx - z.dx) * f, dy: my - cy - (my - cy - z.dy) * f }));
          }}
          onPointerDown={(e) => { const [x, y] = local(e); drag.current = { x, y, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const [x, y] = local(e);
            if (!d.moved && Math.hypot(x - d.x, y - d.y) < 4) return;
            d.moved = true;
            e.currentTarget.classList.add('grab');
            setZoom((z) => ({ ...z, dx: z.dx + x - d.x, dy: z.dy + y - d.y }));
            d.x = x; d.y = y;
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            e.currentTarget.classList.remove('grab');
            if (d && !d.moved) { const [x, y] = local(e); pick(x, y); }
          }}
          onDoubleClick={() => setZoom({ k: 1, dx: 0, dy: 0 })}
        />
        <div className="legend"><span><i />Coupe</span><span><i className="r" />Rapide G0</span><span><i className="p" />Palpage</span><span><i className="s" />Sélection</span></div>
        <div className="coord">{coord}</div>
      </div>
      <div className="scrub">
        <label htmlFor="scrub">Simulation</label>
        <input id="scrub" type="range" min={0} max={totalLines} value={shownMax}
          onChange={(e) => { const v = +e.target.value; setLimit(v >= totalLines ? Infinity : v); }} />
        <output>Ligne {shownMax} / {totalLines}</output>
        <label htmlFor="faceSel">Face</label>
        <select id="faceSel" value={face} onChange={(e) => onFace(e.target.value)}>
          <option value="">Toutes</option>
          {faces.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
        </select>
      </div>
    </section>
  );
}
