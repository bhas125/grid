import { useEffect, useRef, type MutableRefObject } from "react";
import { COUNTY_XY } from "@/lib/county-xy";
import type { WxCell, WxKind } from "@/data/types";
import { clusterWx, hashName } from "@/lib/wx-sky";
import type { Project } from "@/lib/geo";

type ViewBox = { x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };

type Puff = {
  x: number;
  y: number;
  r: number;
  phase: number;
  kind: WxKind;
  stretch: number;
};

const DENSITY: Record<Exclude<WxKind, "clear">, { step: number; cap: number; r: number }> = {
  few: { step: 4, cap: 6, r: 22 },
  partly: { step: 3, cap: 10, r: 26 },
  cloudy: { step: 2, cap: 12, r: 32 },
  fog: { step: 3, cap: 8, r: 34 },
  rain: { step: 2, cap: 10, r: 30 },
  storm: { step: 1, cap: 12, r: 38 },
};

const FILL: Record<Exclude<WxKind, "clear">, string> = {
  few: "rgba(214,232,246,0.045)",
  partly: "rgba(210,228,244,0.06)",
  cloudy: "rgba(196,216,234,0.085)",
  fog: "rgba(188,206,220,0.065)",
  rain: "rgba(168,190,212,0.10)",
  storm: "rgba(118,136,158,0.13)",
};

let cellsMem: WxCell[] | null = null;
let inflight: Promise<WxCell[]> | null = null;

function loadCells() {
  if (cellsMem) return Promise.resolve(cellsMem);
  if (inflight) return inflight;
  inflight = fetch("/api/wx-map")
    .then((r) => r.json())
    .then((d: { counties?: WxCell[] }) => {
      cellsMem = Array.isArray(d.counties) ? d.counties : [];
      return cellsMem;
    })
    .catch(() => {
      cellsMem = [];
      return cellsMem;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function wxHint(name: string) {
  const cell = cellsMem?.find((c) => c.name === name);
  if (!cell || cell.kind === "clear") return null;
  return cell.label;
}

function viewScale(size: Size, view: ViewBox) {
  const s = Math.min(size.w / view.w, size.h / view.h);
  return { s, ox: (size.w - view.w * s) / 2, oy: (size.h - view.h * s) / 2 };
}

function buildPuffs(cells: WxCell[], project: Project): Puff[] {
  const clusters = clusterWx(cells);
  const out: Puff[] = [];
  for (const c of clusters) {
    const spec = DENSITY[c.kind as Exclude<WxKind, "clear">];
    const picks = c.names.slice().sort((a, b) => hashName(a) - hashName(b));
    const n = Math.min(spec.cap, Math.max(3, Math.ceil(picks.length / spec.step)));
    for (let i = 0; i < n; i++) {
      const name = picks[Math.floor((i * picks.length) / n)];
      const xy = COUNTY_XY[name];
      if (!xy) continue;
      const h = hashName(`${name}:${c.kind}:${i}`);
      const jitterX = ((h & 255) / 255 - 0.5) * 18;
      const jitterY = (((h >> 8) & 255) / 255 - 0.5) * 12;
      const p = project(xy[1], xy[0]);
      out.push({
        x: p.x + jitterX * 0.2,
        y: p.y + jitterY * 0.2,
        r: spec.r + ((h >> 16) & 13),
        phase: (h % 1000) / 159,
        kind: c.kind,
        stretch: c.kind === "few" || c.kind === "partly" ? 0.36 : 0.54,
      });
    }
  }
  return out.slice(0, 36);
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stretch: number, wispy: boolean) {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * stretch, 0, 0, Math.PI * 2);
  ctx.ellipse(x - r * 0.52, y + r * 0.08, r * 0.62, r * stretch * 0.85, 0, 0, Math.PI * 2);
  if (!wispy) ctx.ellipse(x + r * 0.48, y + r * 0.06, r * 0.58, r * stretch * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function WxSky({
  project,
  viewRef,
  sizeRef,
}: {
  project: Project;
  viewRef: MutableRefObject<ViewBox>;
  sizeRef: MutableRefObject<Size>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const puffsRef = useRef<Puff[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    void loadCells().then((cells) => {
      if (live) puffsRef.current = buildPuffs(cells, project);
    });
    return () => {
      live = false;
    };
  }, [project]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const puffs = puffsRef.current;
      const size = sizeRef.current;
      const view = viewRef.current;
      if (!size.w || !size.h) return;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const pw = Math.max(1, Math.round(size.w * dpr));
      const ph = Math.max(1, Math.round(size.h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (!puffs.length) return;
      const { s, ox, oy } = viewScale(size, view);
      const t = reduced ? 0 : now / 1000;
      const pad = 80;
      for (const p of puffs) {
        const driftX = reduced ? 0 : Math.sin(t * 0.13 + p.phase) * 16;
        const driftY = reduced ? 0 : Math.cos(t * 0.09 + p.phase * 1.3) * 7;
        const sx = (p.x - view.x) * s + ox + driftX;
        const sy = (p.y - view.y) * s + oy + driftY;
        const r = Math.min(84, Math.max(24, p.r * (0.72 + s * 0.22)));
        if (sx < -pad || sy < -pad || sx > size.w + pad || sy > size.h + pad) continue;
        ctx.fillStyle = FILL[p.kind as Exclude<WxKind, "clear">];
        cloud(ctx, sx, sy, r, p.stretch, p.kind === "few" || p.kind === "partly");
        if (p.kind === "rain" || p.kind === "storm") {
          ctx.strokeStyle = p.kind === "storm" ? "rgba(170,190,210,0.08)" : "rgba(180,200,220,0.055)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          const n = p.kind === "storm" ? 7 : 4;
          for (let i = 0; i < n; i++) {
            const u = (t * (p.kind === "storm" ? 55 : 40) + p.phase * 40 + i * 11) % (r * 2.4);
            const rx = sx - r + ((i * 17 + p.phase * 9) % (r * 1.8));
            const ry = sy - r * 0.6 + u;
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx + 4, ry + 9);
          }
          ctx.stroke();
        }
        if (p.kind === "storm" && !reduced && Math.sin(t * 1.8 + p.phase) > 0.94) {
          ctx.fillStyle = "rgba(230,240,255,0.025)";
          ctx.fillRect(sx - r * 1.4, sy - r, r * 2.8, r * 2);
        }
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden" && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (document.visibilityState === "visible" && !rafRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [sizeRef, viewRef]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[2] h-full w-full bg-transparent" aria-hidden />;
}
