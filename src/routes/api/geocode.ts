import { createFileRoute } from "@tanstack/react-router";
import { COUNTY_XY, countyFromText } from "@/lib/county-xy";
import { nearestCountyName } from "@/lib/geo";
import countiesJson from "@/data/counties.json";
import type { County } from "@/data/types";

const COUNTIES = countiesJson as County[];
const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";

export type GeocodeHit = {
  label: string;
  lat: number;
  lon: number;
  county?: string;
};

function inTn(lat: number, lon: number) {
  return lat >= 34.8 && lat <= 36.8 && lon >= -90.5 && lon <= -81.4;
}

function attachCounty(hit: GeocodeHit): GeocodeHit {
  const county = countyFromText(hit.label) || nearestCountyName(hit.lat, hit.lon, COUNTY_XY) || undefined;
  return county ? { ...hit, county } : hit;
}

function countyNameHit(q: string): GeocodeHit | null {
  const n = q.replace(/\s+county$/i, "").trim().toLowerCase();
  const c = COUNTIES.find((x) => x.name.toLowerCase() === n);
  if (!c) return null;
  const xy = COUNTY_XY[c.name];
  if (!xy) return null;
  return { label: `${c.name} County`, lat: xy[0], lon: xy[1], county: c.name };
}

async function census(q: string): Promise<GeocodeHit[]> {
  const addr = /,\s*tn\b/i.test(q) ? q : `${q}, TN`;
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[] };
  };
  const out: GeocodeHit[] = [];
  for (const m of json.result?.addressMatches ?? []) {
    const lon = m.coordinates?.x;
    const lat = m.coordinates?.y;
    if (typeof lat !== "number" || typeof lon !== "number" || !inTn(lat, lon)) continue;
    out.push(attachCounty({ label: m.matchedAddress ?? q, lat, lon }));
  }
  return out;
}

async function nominatim(q: string): Promise<GeocodeHit[]> {
  const addr = /tennessee|\btn\b/i.test(q) ? q : `${q}, Tennessee`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(addr)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
  const out: GeocodeHit[] = [];
  for (const m of json) {
    const lat = Number(m.lat);
    const lon = Number(m.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inTn(lat, lon)) continue;
    out.push(attachCounty({ label: m.display_name ?? q, lat, lon }));
  }
  return out;
}

export const Route = createFileRoute("/api/geocode")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
        if (q.length < 2) return Response.json({ hits: [] as GeocodeHit[] });
        const named = countyNameHit(q);
        try {
          let hits = await census(q);
          if (!hits.length) hits = await nominatim(q);
          if (named) hits = [named, ...hits.filter((h) => h.label !== named.label)];
          return Response.json(
            { hits: hits.slice(0, 5) },
            { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } },
          );
        } catch {
          return Response.json({ hits: named ? [named] : [] });
        }
      },
    },
  },
});
