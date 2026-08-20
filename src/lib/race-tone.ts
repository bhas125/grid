import type { RaceLayers, ZipRace } from "@/data/types";

export type ZipTone = {
  tone: "white" | "mix" | "black" | "none";
  fill: string;
  opacity: number;
  score: number;
  whitePct: number;
  brownPct: number;
};

const WHITE: [number, number, number] = [244, 244, 242];
const GRAY: [number, number, number] = [132, 136, 142];
const BLACK: [number, number, number] = [10, 11, 13];

function mixRgb(a: [number, number, number], b: [number, number, number], t: number) {
  const u = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * u)},${Math.round(a[1] + (b[1] - a[1]) * u)},${Math.round(a[2] + (b[2] - a[2]) * u)})`;
}

function shaped(score: number) {
  const s = Math.min(1, Math.max(0, score));
  const d = (s - 0.5) * 2;
  const a = Math.sign(d) * Math.pow(Math.abs(d), 0.58);
  return 0.5 + a / 2;
}

export function grayFill(score: number) {
  const s = shaped(score);
  return s >= 0.5 ? mixRgb(GRAY, WHITE, (s - 0.5) / 0.5) : mixRgb(BLACK, GRAY, s / 0.5);
}

function band(score: number): ZipTone["tone"] {
  if (score >= 0.62) return "white";
  if (score <= 0.38) return "black";
  return "mix";
}

export function zipTone(z: ZipRace, layers: RaceLayers): ZipTone {
  const t = z.t || 0;
  const empty: ZipTone = {
    tone: "none",
    fill: grayFill(0.5),
    opacity: 0.1,
    score: 0.5,
    whitePct: 0,
    brownPct: 0,
  };
  if (!t) return empty;
  const white = layers.w ? z.w : 0;
  const brown = (layers.b ? z.b : 0) + (layers.h ? z.h : 0);
  const whitePct = white / t;
  const brownPct = brown / t;
  const hasW = layers.w;
  const hasBr = layers.b || layers.h;
  let score = 0.5;
  if (hasW && hasBr) {
    const both = white + brown;
    score = both > 0 ? white / both : 0.5;
  } else if (hasW) {
    score = 0.5 + 0.5 * whitePct;
  } else if (hasBr) {
    score = 0.5 - 0.5 * brownPct;
  } else {
    return empty;
  }
  return {
    tone: band(score),
    fill: grayFill(score),
    opacity: 0.88,
    score,
    whitePct,
    brownPct,
  };
}
