import { createFileRoute } from "@tanstack/react-router";
import { COUNTY_XY } from "@/lib/county-xy";
import { nwsKind } from "@/lib/wx-sky";
import type { WxCell, WxKind } from "@/data/types";

const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";

const STATIONS = [
  { id: "KMEM", lat: 35.042, lon: -89.977 },
  { id: "KMKL", lat: 35.6, lon: -88.916 },
  { id: "KCKV", lat: 36.622, lon: -87.415 },
  { id: "KBNA", lat: 36.125, lon: -86.678 },
  { id: "KLUG", lat: 35.507, lon: -86.804 },
  { id: "KCSV", lat: 35.951, lon: -85.085 },
  { id: "KCHA", lat: 35.035, lon: -85.204 },
  { id: "KOQT", lat: 36.021, lon: -84.233 },
  { id: "KTYS", lat: 35.811, lon: -83.994 },
  { id: "KTRI", lat: 36.475, lon: -82.407 },
] as const;

type StationWx = { lat: number; lon: number; kind: WxKind; label: string };

let memo: { at: number; body: { counties: WxCell[] } } | null = null;
const TTL = 12 * 60_000;

async function readStation(id: string): Promise<{ kind: WxKind; label: string } | null> {
  try {
    const res = await fetch(`https://api.weather.gov/stations/${id}/observations/latest`, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      properties?: { textDescription?: string | null; icon?: string | null };
    };
    const desc = json.properties?.textDescription ?? "";
    const icon = json.properties?.icon ?? "";
    if (!desc && !icon) return null;
    return { kind: nwsKind(desc, icon), label: desc || "Live" };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/wx-map")({
  server: {
    handlers: {
      GET: async () => {
        if (memo && Date.now() - memo.at < TTL) {
          return Response.json(memo.body, {
            headers: { "Cache-Control": "public, s-maxage=360, stale-while-revalidate=1200" },
          });
        }
        const reads = await Promise.all(STATIONS.map((s) => readStation(s.id)));
        const live: StationWx[] = [];
        STATIONS.forEach((s, i) => {
          const w = reads[i];
          if (w) live.push({ lat: s.lat, lon: s.lon, kind: w.kind, label: w.label });
        });
        if (!live.length) {
          return Response.json({ counties: [] as WxCell[] });
        }
        const counties: WxCell[] = Object.entries(COUNTY_XY).map(([name, [lat, lon]]) => {
          let best = live[0];
          let bd = Infinity;
          for (const s of live) {
            const dlat = lat - s.lat;
            const dlon = lon - s.lon;
            const d = dlat * dlat + dlon * dlon;
            if (d < bd) {
              bd = d;
              best = s;
            }
          }
          return { name, kind: best.kind, label: best.label };
        });
        const body = { counties };
        memo = { at: Date.now(), body };
        return Response.json(body, {
          headers: { "Cache-Control": "public, s-maxage=360, stale-while-revalidate=1200" },
        });
      },
    },
  },
});
