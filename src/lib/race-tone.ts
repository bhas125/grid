import type { RaceLayers, ZipRace } from "@/data/types";

export type ZipTone = {
  tone: "white" | "brown" | "none";
  opacity: number;
  whitePct: number;
  brownPct: number;
  delta: number;
};

function opacityFor(intensity: number) {
  const i = Math.min(1, Math.max(0, intensity));
  if (i < 0.04) return 0.02;
  return 0.04 + Math.pow(i, 1.32) * 0.6;
}

export function zipTone(z: ZipRace, layers: RaceLayers): ZipTone {
  const t = z.t || 0;
  const empty: ZipTone = { tone: "none", opacity: 0.03, whitePct: 0, brownPct: 0, delta: 0 };
  if (!t) return empty;
  const white = layers.w ? z.w : 0;
  const brown = (layers.b ? z.b : 0) + (layers.h ? z.h : 0);
  const whitePct = white / t;
  const brownPct = brown / t;
  const hasW = layers.w;
  const hasBr = layers.b || layers.h;
  if (hasW && hasBr) {
    const delta = whitePct - brownPct;
    return {
      tone: Math.abs(delta) < 0.03 ? "none" : delta > 0 ? "white" : "brown",
      opacity: opacityFor(Math.abs(delta)),
      whitePct,
      brownPct,
      delta,
    };
  }
  if (hasW) {
    return {
      tone: "white",
      opacity: opacityFor(whitePct),
      whitePct,
      brownPct,
      delta: whitePct,
    };
  }
  if (hasBr) {
    return {
      tone: "brown",
      opacity: opacityFor(brownPct),
      whitePct,
      brownPct,
      delta: -brownPct,
    };
  }
  return empty;
}
