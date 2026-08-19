import type { GeoFeature } from "@/data/types";

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };
export type Project = (lon: number, lat: number) => { x: number; y: number };

export const MAP_W = 1000;
export const MAP_H = 360;
export const FULL_VIEW = { x: 0, y: 0, w: MAP_W, h: MAP_H };

type Ring = number[][];

function eachRing(geom: GeoFeature["geometry"], fn: (ring: Ring) => void) {
  if (geom.type === "Polygon") {
    (geom.coordinates as number[][][]).forEach(fn);
  } else {
    (geom.coordinates as number[][][][]).forEach((poly) => poly.forEach(fn));
  }
}

export function boundsOf(features: GeoFeature[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const f of features) {
    eachRing(f.geometry, (ring) => {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    });
  }
  return { minX, minY, maxX, maxY };
}

export function featureBounds(f: GeoFeature, project: Project): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  eachRing(f.geometry, (ring) => {
    for (const [lon, lat] of ring) {
      const p = project(lon, lat);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  });
  return { minX, minY, maxX, maxY };
}

export function centroid(f: GeoFeature) {
  let lon = 0,
    lat = 0,
    n = 0;
  const ring =
    f.geometry.type === "Polygon"
      ? (f.geometry.coordinates as number[][][])[0]
      : (f.geometry.coordinates as number[][][][])[0]?.[0];
  if (ring) {
    for (const [x, y] of ring) {
      lon += x;
      lat += y;
      n += 1;
    }
  }
  return { lon: n ? lon / n : -86.5, lat: n ? lat / n : 35.8 };
}

export function makeProject(features: GeoFeature[], w: number, h: number): Project {
  const b = boundsOf(features);
  const i = b.maxX - b.minX || 1;
  const a = b.maxY - b.minY || 1;
  const s = Math.min((w - 20) / i, (h - 20) / a);
  const l = (w - i * s) / 2;
  const d = (h - a * s) / 2;
  return (lon, lat) => ({ x: l + (lon - b.minX) * s, y: d + (b.maxY - lat) * s });
}

export function pathFromGeom(geom: GeoFeature["geometry"], project: Project) {
  const ringPath = (ring: Ring) =>
    ring
      .map(([lon, lat], i) => {
        const { x, y } = project(lon, lat);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ") + " Z";
  if (geom.type === "Polygon") {
    return (geom.coordinates as number[][][]).map(ringPath).join(" ");
  }
  return (geom.coordinates as number[][][][]).map((poly) => poly.map(ringPath).join(" ")).join(" ");
}

export function pathFromPts(pts: [number, number][], project: Project) {
  return pts
    .map(([lon, lat], i) => {
      const { x, y } = project(lon, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export function lonLatIn(b: BBox, lon: number, lat: number, pad = 0.08) {
  return lon >= b.minX - pad && lon <= b.maxX + pad && lat >= b.minY - pad && lat <= b.maxY + pad;
}
