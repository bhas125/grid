import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import countiesJson from "@/data/counties.json";
import roadsJson from "@/data/roads.json";
import sitesJson from "@/data/sites.json";
import { popWeight } from "@/data/intel";
import type {
  Alert,
  AlprPoint,
  County,
  CrimeIncident,
  GeoFeature,
  Layers,
  Precinct,
  Race,
  Road,
  Site,
} from "@/data/types";
import {
  FULL_VIEW,
  MAP_H,
  MAP_W,
  centroid,
  easeOutCubic,
  featureBounds,
  lonLatIn,
  makeProject,
  pathFromGeom,
  pathFromPts,
  type BBox,
} from "@/lib/geo";
import { cn } from "@/lib/utils";

const COUNTIES = countiesJson as County[];
const ROADS = roadsJson as Road[];
const SITES = sitesJson as Site[];
const BY_FIPS = new Map(COUNTIES.map((c) => [c.fips, c]));

const TIP_W = 224;
const TIP_GAP = 28;
const ZOOM_IN = 1 / 1.55;
const ZOOM_OUT = 1.55;
const MAX_ZOOM = 10;

type ViewBox = { x: number; y: number; w: number; h: number };

type Tip = {
  title: string;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
};

function tipStyle(t: Tip) {
  const h = 36 + t.lines.length * 16;
  const leftSide = t.x >= t.w * 0.5;
  const topHalf = t.y < t.h * 0.45;
  return {
    left: leftSide
      ? Math.max(8, t.x - TIP_W - TIP_GAP)
      : Math.min(t.x + TIP_GAP, t.w - TIP_W - 8),
    top: topHalf ? Math.min(t.y + TIP_GAP, t.h - h - 8) : Math.max(8, t.y - h - TIP_GAP),
    width: TIP_W,
  };
}

function fillColor(pop: number, selected: boolean, dim: boolean, alert: boolean) {
  if (dim) return "#03050c";
  const w = popWeight(pop);
  if (alert) {
    return `color-mix(in oklab, var(--color-watch) ${Math.round((0.28 + w * 0.25) * 100)}%, #020308)`;
  }
  if (selected) {
    return `color-mix(in oklab, var(--color-grid) ${Math.round((0.22 + w * 0.35) * 100)}%, #020308)`;
  }
  const a = 0.06 + w * 0.28;
  return `color-mix(in oklab, var(--color-grid) ${Math.round(a * 100)}%, #020308)`;
}

function crimeStack(type: string) {
  if (type === "Homicide") return 3;
  if (type === "Shooting") return 2;
  if (type.toLowerCase().includes("shooting") || type.toLowerCase().includes("aggravated")) return 1;
  return 0;
}

function crimeFill(type: string) {
  if (type === "Homicide") return "var(--color-hot)";
  if (type === "Armed robbery") return "var(--color-steel)";
  return "var(--color-watch)";
}

function crimeRadius(type: string, viewW: number, countyView: boolean) {
  const hom = type === "Homicide";
  if (!countyView) return hom ? 4.2 : 3.1;
  return (hom ? 0.017 : 0.012) * viewW;
}

function fmtCrimeDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(m) - 1];
  if (!month || !d) return iso;
  return `${month} ${Number(d)} ${y}`;
}

function crimeZip(c: CrimeIncident) {
  if (c.zip) return c.zip;
  const m = (c.address || "").match(/\b(3[7-8]\d{3})\b/);
  return m?.[1] ?? "";
}

function crimeTipLines(c: CrimeIncident) {
  const lines: string[] = [];
  const when = fmtCrimeDate(c.date);
  if (when) lines.push(when);
  lines.push(c.address || `${c.city}, ${c.county} County`);
  const zip = crimeZip(c);
  if (zip) lines.push(`ZIP ${zip}`);
  return lines;
}


function roadsInView(view: BBox | null) {
  if (!view) return ROADS;
  return ROADS.filter((r) => r.pts.some(([lon, lat]) => lonLatIn(view, lon, lat)));
}

function countyFit(feat: GeoFeature, project: (lon: number, lat: number) => { x: number; y: number }): ViewBox {
  const b = featureBounds(feat, project);
  const i = Math.max(b.maxX - b.minX, 8);
  const a = Math.max(b.maxY - b.minY, 8);
  const pad = Math.max(i, a) * 0.16;
  return { x: b.minX - pad, y: b.minY - pad, w: i + pad * 2, h: a + pad * 2 };
}

function clampView(next: ViewBox, fit: ViewBox): ViewBox {
  const minW = fit.w / MAX_ZOOM;
  const minH = fit.h / MAX_ZOOM;
  const w = Math.min(fit.w, Math.max(minW, next.w));
  const h = Math.min(fit.h, Math.max(minH, next.h));
  const x = Math.min(fit.x + fit.w - w, Math.max(fit.x, next.x));
  const y = Math.min(fit.y + fit.h - h, Math.max(fit.y, next.y));
  return { x, y, w, h };
}

function viewScale(box: DOMRect, view: ViewBox) {
  const s = Math.min(box.width / view.w, box.height / view.h);
  return {
    s,
    ox: (box.width - view.w * s) / 2,
    oy: (box.height - view.h * s) / 2,
  };
}

export function TnMap({
  geo,
  selected,
  onSelect,
  onPickPrecinct,
  pickedId,
  layers,
  alerts,
  crime,
  showCrime,
}: {
  geo: GeoFeature[] | null;
  selected: County | null;
  onSelect: (c: County) => void;
  onPickPrecinct: (p: Precinct, races?: Race[]) => void;
  pickedId: string | null;
  layers: Layers;
  alerts: Alert[];
  crime: CrimeIncident[];
  showCrime: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [alpr, setAlpr] = useState<AlprPoint[]>([]);
  const [precincts, setPrecincts] = useState<Precinct[]>([]);
  const [races, setRaces] = useState<Record<string, Race[]>>({});
  const [view, setView] = useState(FULL_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitRef = useRef<ViewBox>(FULL_VIEW);
  const raf = useRef<number | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const project = useMemo(() => (geo ? makeProject(geo, MAP_W, MAP_H) : null), [geo]);

  useEffect(() => {
    fetch("/alpr-tn.json")
      .then((r) => r.json())
      .then((d: AlprPoint[]) => setAlpr(d))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selected) {
      setPrecincts([]);
      setRaces({});
      return;
    }
    let live = true;
    fetch(`/precincts/${selected.fips}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Precinct[]) => {
        if (live) setPrecincts(d);
      })
      .catch(() => {
        if (live) setPrecincts([]);
      });
    fetch(`/precincts/${selected.fips}-races.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, Race[]>) => {
        if (live) setRaces(d);
      })
      .catch(() => {
        if (live) setRaces({});
      });
    return () => {
      live = false;
    };
  }, [selected]);

  const paths = useMemo(() => {
    if (!geo || !project) return [];
    return geo.map((f) => ({
      fips: f.properties.fips,
      feature: f,
      d: pathFromGeom(f.geometry, project),
    }));
  }, [geo, project]);

  function showTip(e: React.MouseEvent, title: string, lines: string[]) {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    setTip({
      title,
      lines,
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      w: box.width,
      h: box.height,
    });
  }

  function animateTo(next: ViewBox) {
    if (raf.current) cancelAnimationFrame(raf.current);
    const from = viewRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = easeOutCubic(Math.min(1, (now - start) / 420));
      setView({
        x: from.x + (next.x - from.x) * t,
        y: from.y + (next.y - from.y) * t,
        w: from.w + (next.w - from.w) * t,
        h: from.h + (next.h - from.h) * t,
      });
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    if (!project || !geo) return;
    if (!selected) {
      fitRef.current = FULL_VIEW;
      animateTo(FULL_VIEW);
      return;
    }
    const feat = geo.find((f) => f.properties.fips === selected.fips);
    if (!feat) return;
    const fit = countyFit(feat, project);
    fitRef.current = fit;
    animateTo(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, project, geo]);

  function applyView(next: ViewBox, animate = true) {
    const clamped = selected ? clampView(next, fitRef.current) : next;
    if (animate) animateTo(clamped);
    else setView(clamped);
  }

  function zoomBy(factor: number, cx?: number, cy?: number) {
    if (!selected) return;
    const cur = viewRef.current;
    const fit = fitRef.current;
    const px = cx ?? cur.x + cur.w / 2;
    const py = cy ?? cur.y + cur.h / 2;
    const rx = (px - cur.x) / cur.w;
    const ry = (py - cur.y) / cur.h;
    applyView({
      w: cur.w * factor,
      h: cur.h * factor,
      x: px - cur.w * factor * rx,
      y: py - cur.h * factor * ry,
    });
    void fit;
  }

  function clientToView(clientX: number, clientY: number) {
    const box = root.current?.getBoundingClientRect();
    if (!box) return null;
    const cur = viewRef.current;
    const { s, ox, oy } = viewScale(box, cur);
    return {
      x: cur.x + (clientX - box.left - ox) / s,
      y: cur.y + (clientY - box.top - oy) / s,
      s,
    };
  }

  useEffect(() => {
    const el = root.current;
    if (!el || !selected) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pt = clientToView(e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? ZOOM_OUT : ZOOM_IN;
      zoomBy(factor, pt?.x, pt?.y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [selected]);

  const zoomed = !!selected;
  const zoomRatio = zoomed ? fitRef.current.w / view.w : 1;
  const canIn = zoomed && zoomRatio < MAX_ZOOM - 0.05;
  const canOut = zoomed && zoomRatio > 1.05;

  const alertsByCounty = useMemo(() => {
    const m = new Map<string, Alert[]>();
    for (const a of alerts) {
      for (const name of a.counties) {
        const list = m.get(name) ?? [];
        list.push(a);
        m.set(name, list);
      }
    }
    return m;
  }, [alerts]);

  const visibleRoads = useMemo(() => {
    if (!project) return [];
    if (!selected) return ROADS;
    const feat = paths.find((p) => p.fips === selected.fips);
    if (!feat) return [];
    const raw = feat.feature.geometry;
    const ring =
      raw.type === "Polygon"
        ? (raw.coordinates as number[][][])[0]
        : (raw.coordinates as number[][][][])[0]?.[0];
    if (!ring) return [];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [lon, lat] of ring) {
      if (lon < minX) minX = lon;
      if (lat < minY) minY = lat;
      if (lon > maxX) maxX = lon;
      if (lat > maxY) maxY = lat;
    }
    return roadsInView({ minX, minY, maxX, maxY });
  }, [project, selected, paths]);

  const sitePts = useMemo(() => {
    if (!project) return [];
    return SITES.filter((s) => !selected || s.county === selected.name).map((s) => ({
      ...s,
      ...project(s.lon, s.lat),
    }));
  }, [project, selected]);

  const alprPts = useMemo(() => {
    if (!project) return [];
    let pts = alpr;
    if (selected) {
      const feat = paths.find((p) => p.fips === selected.fips);
      if (feat) {
        const geom = feat.feature.geometry;
        const rings =
          geom.type === "Polygon"
            ? (geom.coordinates as number[][][])
            : (geom.coordinates as number[][][][]).flat();
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const ring of rings) {
          for (const [lon, lat] of ring) {
            if (lon < minX) minX = lon;
            if (lat < minY) minY = lat;
            if (lon > maxX) maxX = lon;
            if (lat > maxY) maxY = lat;
          }
        }
        pts = alpr.filter((p) => p.lon >= minX && p.lon <= maxX && p.lat >= minY && p.lat <= maxY);
      }
    }
    return pts.map((p) => ({ ...p, ...project(p.lon, p.lat) }));
  }, [project, alpr, selected, paths]);

  const crimePts = useMemo(() => {
    if (!project || !showCrime) return [];
    const rows = selected ? crime.filter((c) => c.county === selected.name) : crime;
    const ranked = [...rows].sort((a, b) => crimeStack(a.type) - crimeStack(b.type));
    return ranked.map((c) => ({ ...c, ...project(c.lon, c.lat) }));
  }, [project, crime, selected, showCrime]);

  function interactiveTarget(el: EventTarget | null) {
    if (!(el instanceof Element)) return false;
    return Boolean(
      el.closest("button") ||
        el.closest("a") ||
        el.tagName === "circle" ||
        el.closest("[data-precinct]") ||
        el.closest("[data-crime]"),
    );
  }

  return (
    <div
      ref={root}
      className="absolute inset-0"
      onPointerDown={(e) => {
        if (!selected || interactiveTarget(e.target)) return;
        if (e.button !== 0) return;
        pan.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
        setPanning(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!pan.current) return;
        const box = root.current?.getBoundingClientRect();
        if (!box) return;
        const { s } = viewScale(box, viewRef.current);
        applyView(
          {
            ...viewRef.current,
            x: pan.current.vx - (e.clientX - pan.current.x) / s,
            y: pan.current.vy - (e.clientY - pan.current.y) / s,
          },
          false,
        );
      }}
      onPointerUp={() => {
        pan.current = null;
        setPanning(false);
      }}
      onPointerCancel={() => {
        pan.current = null;
        setPanning(false);
      }}
    >
      {!paths.length || !project ? (
        <div className="absolute inset-0 animate-pulse bg-elevated/40" />
      ) : (
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={cn(
            "absolute inset-0 h-full w-full",
            selected ? (panning ? "cursor-grabbing" : "cursor-grab") : undefined,
          )}
          role="img"
          aria-label="Tennessee grid map"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="line-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="1.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="line-glow-hot" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="precinct-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="0.7" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="tn-mesh" width="14" height="14" patternUnits="userSpaceOnUse">
              <path
                d="M 14 0 L 0 0 0 14"
                fill="none"
                stroke="var(--color-grid)"
                strokeWidth="0.35"
                opacity="0.55"
              />
            </pattern>
            <clipPath id="tn-clip">
              {paths.map((p) => (
                <path key={p.fips} d={p.d} />
              ))}
            </clipPath>
          </defs>
          {paths.map((p) => {
            const county = BY_FIPS.get(p.fips);
            const isSel = selected?.fips === p.fips;
            const dim = zoomed && !isSel;
            const hits = county ? (alertsByCounty.get(county.name) ?? []) : [];
            const wx = !!(layers.weather && hits.length && !dim);
            return (
              <path
                key={p.fips}
                d={p.d}
                data-name={county?.name}
                fill={fillColor(county?.pop ?? 8000, isSel, dim, wx)}
                stroke={isSel ? "var(--color-fg)" : dim ? "transparent" : "var(--color-grid)"}
                strokeWidth={isSel ? (zoomed ? 0.85 : 1.35) : zoomed ? 0 : 0.55}
                filter={dim ? undefined : isSel ? "url(#line-glow-hot)" : "url(#line-glow)"}
                className={dim ? "pointer-events-none" : zoomed ? undefined : "cursor-pointer"}
                pointerEvents={dim ? "none" : "auto"}
                onMouseEnter={(e) => {
                  if (zoomed || !county) return;
                  showTip(e, county.name, [
                    `${county.pop.toLocaleString()} people · ${county.seat}`,
                    ...hits.map((a) => `${a.event} · ${a.severity}`),
                  ]);
                }}
                onMouseMove={(e) => {
                  if (zoomed || !county) return;
                  showTip(e, county.name, [
                    `${county.pop.toLocaleString()} people · ${county.seat}`,
                    ...hits.map((a) => `${a.event} · ${a.severity}`),
                  ]);
                }}
                onMouseLeave={() => setTip(null)}
                onClick={() => {
                  if (!zoomed && county) onSelect(county);
                }}
              />
            );
          })}
          {zoomed ? null : (
            <g clipPath="url(#tn-clip)" pointerEvents="none">
              <g className="mesh-drift">
                <rect x="-40" y="-40" width="1080" height="440" fill="url(#tn-mesh)" opacity="0.7" />
              </g>
            </g>
          )}
          {zoomed && layers.p24 && project
            ? precincts.map((pr) => {
                const tot = pr.t || 1;
                const other = Math.max(0, pr.t - pr.d - pr.r);
                const picked = pickedId === pr.id;
                const lines = [
                  "2024 President",
                  `Trump ${pr.r.toLocaleString()} (${Math.round((pr.r / tot) * 100)}%)`,
                  `Harris ${pr.d.toLocaleString()} (${Math.round((pr.d / tot) * 100)}%)`,
                  other
                    ? `Other ${other.toLocaleString()} (${Math.round((other / tot) * 100)}%)`
                    : "Other —",
                  `${pr.t.toLocaleString()} ballots · click for full tally`,
                ];
                return (
                  <path
                    key={pr.id}
                    d={pathFromGeom(pr.g, project)}
                    data-precinct={pr.id}
                    fill={
                      picked
                        ? "color-mix(in oklab, var(--color-hot) 38%, #020308)"
                        : "color-mix(in oklab, var(--color-hot) 16%, #020308)"
                    }
                    stroke={picked ? "var(--color-fg)" : "#ff6b6b"}
                    strokeWidth={picked ? 0.35 : 0.22}
                    filter="url(#precinct-glow)"
                    className="cursor-pointer"
                    opacity={pickedId && !picked ? 0.4 : 1}
                    onMouseEnter={(e) => showTip(e, pr.name, lines)}
                    onMouseMove={(e) => showTip(e, pr.name, lines)}
                    onMouseLeave={() => setTip(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (layers.p24) onPickPrecinct(pr, races[pr.id]);
                    }}
                  />
                );
              })
            : null}
          {layers.interstates || layers.roads
            ? visibleRoads
                .filter((r) => (r.kind === "interstate" ? layers.interstates : layers.roads))
                .map((r) => {
                  const interstate = r.kind === "interstate";
                  return (
                    <g key={r.id}>
                      <path
                        d={pathFromPts(r.pts, project)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={zoomed ? 1.6 : 3}
                        className="cursor-pointer"
                        onMouseEnter={(e) =>
                          showTip(e, r.id, [
                            interstate ? "Interstate" : "US / state route",
                            "Corridor trace — not live traffic",
                          ])
                        }
                        onMouseMove={(e) =>
                          showTip(e, r.id, [
                            interstate ? "Interstate" : "US / state route",
                            "Corridor trace — not live traffic",
                          ])
                        }
                        onMouseLeave={() => setTip(null)}
                      />
                      <path
                        d={pathFromPts(r.pts, project)}
                        fill="none"
                        stroke={interstate ? "var(--color-flow)" : "var(--color-steel)"}
                        strokeWidth={zoomed ? (interstate ? 0.28 : 0.16) : interstate ? 0.38 : 0.22}
                        className={interstate ? "traffic-flow" : "road-flow"}
                        opacity={interstate ? 0.85 : 0.5}
                        pointerEvents="none"
                      />
                    </g>
                  );
                })
            : null}
          {layers.flock
            ? alprPts.map((p) => (
                <circle
                  key={p.id}
                  cx={p.x}
                  cy={p.y}
                  r={zoomed ? 0.45 : 0.7}
                  fill="var(--color-watch)"
                  opacity="0.9"
                  pointerEvents={zoomed ? "auto" : "none"}
                  className={zoomed ? "cursor-pointer" : undefined}
                  onMouseEnter={(e) =>
                    showTip(e, p.op, [
                      "ALPR · DeFlock / OSM",
                      p.dir ? `Facing ${p.dir}°` : "Direction unlisted",
                      `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,
                    ])
                  }
                  onMouseMove={(e) =>
                    showTip(e, p.op, [
                      "ALPR · DeFlock / OSM",
                      p.dir ? `Facing ${p.dir}°` : "Direction unlisted",
                      `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,
                    ])
                  }
                  onMouseLeave={() => setTip(null)}
                />
              ))
            : null}
          {layers.sites
            ? sitePts.map((s) => (
                <g
                  key={s.name}
                  className="cursor-pointer"
                  onMouseEnter={(e) =>
                    showTip(e, s.name, [
                      `${s.kind} data center`,
                      `${s.county} County`,
                      `${s.lat.toFixed(2)}N ${Math.abs(s.lon).toFixed(2)}W`,
                    ])
                  }
                  onMouseMove={(e) =>
                    showTip(e, s.name, [
                      `${s.kind} data center`,
                      `${s.county} County`,
                      `${s.lat.toFixed(2)}N ${Math.abs(s.lon).toFixed(2)}W`,
                    ])
                  }
                  onMouseLeave={() => setTip(null)}
                >
                  <rect
                    x={s.x - (zoomed ? 0.7 : 2.2)}
                    y={s.y - (zoomed ? 0.7 : 2.2)}
                    width={zoomed ? 1.4 : 4.4}
                    height={zoomed ? 1.4 : 4.4}
                    fill="var(--color-hot)"
                    filter="url(#line-glow-hot)"
                  />
                </g>
              ))
            : null}
          {showCrime
            ? crimePts.map((c) => {
                const r = crimeRadius(c.type, view.w, zoomed);
                const lines = crimeTipLines(c);
                return (
                  <g
                    key={c.id}
                    data-crime={c.id}
                    className="cursor-pointer"
                    onMouseEnter={(e) => showTip(e, c.type, lines)}
                    onMouseMove={(e) => showTip(e, c.type, lines)}
                    onMouseLeave={() => setTip(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!zoomed) {
                        const next = COUNTIES.find((row) => row.name === c.county);
                        if (next) onSelect(next);
                      }
                    }}
                  >
                    <circle cx={c.x} cy={c.y} r={r * 1.7} fill="transparent" />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={r}
                      fill={crimeFill(c.type)}
                      opacity={c.type === "Homicide" ? 0.95 : 0.78}
                      filter={c.type === "Homicide" ? "url(#line-glow-hot)" : undefined}
                    />
                  </g>
                );
              })
            : null}
        </svg>
      )}
      {zoomed ? (
        <div className="absolute bottom-2 left-2 z-10 flex flex-col border border-line bg-elevated/95">
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_IN)}
            disabled={!canIn}
            aria-label="Zoom in"
            className="grid size-11 place-items-center text-grid hover:bg-grid/15 disabled:text-faint disabled:hover:bg-transparent"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_OUT)}
            disabled={!canOut}
            aria-label="Zoom out"
            className="grid size-11 place-items-center border-t border-line text-grid hover:bg-grid/15 disabled:text-faint disabled:hover:bg-transparent"
          >
            <Minus className="size-4" />
          </button>
        </div>
      ) : null}
      {zoomed && layers.p26 ? (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 w-[min(92%,22rem)] -translate-x-1/2 text-center font-mono text-xs tracking-wide text-muted">
          2026 precinct GIS is not published. Nov 3 general has not been run. Aug 6 was local races
          only.
        </div>
      ) : null}
      {showCrime ? (
        <div className="pointer-events-none absolute top-2 left-2 z-10 border border-line bg-elevated/90 px-2 py-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-muted uppercase">
            <span className="size-1.5 shrink-0 bg-hot" />
            Homicide
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-muted uppercase">
            <span className="size-1.5 shrink-0 bg-watch" />
            Shooting
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-muted uppercase">
            <span className="size-1.5 shrink-0 bg-steel" />
            Armed rob
          </div>
        </div>
      ) : null}
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 w-56 border border-line bg-elevated/95 px-3 py-2 shadow-glow"
          style={tipStyle(tip)}
        >
          <div className="text-sm font-medium">{tip.title}</div>
          {tip.lines.map((line) => (
            <div key={line} className="mt-0.5 font-mono text-xs tracking-wide text-muted">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
