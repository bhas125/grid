import { createFileRoute } from "@tanstack/react-router";
import type { SorPerson } from "@/data/types";

const LAYER =
  "https://tnmap.tn.gov/arcgis/rest/services/PUBLIC_SAFETY/TBI_SEX_OFFENDER_REGISTRY/MapServer/0/query";
const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";
const FIELDS =
  "Tid,FirstName,LastName,MiddleName,ResAddr1,ResCity,ResZip,ResCounty,Classification,Tca1,latitude_primary,longitude_primary";

type Cache = { at: number; body: { offenders: SorPerson[] } };
const cache = new Map<string, Cache>();
const TTL = 10 * 60_000;

function title(s: string) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`);
}

function klassOf(raw: string) {
  const u = raw.toUpperCase();
  if (u.includes("VIOLENT")) return "Violent";
  if (u.includes("CHILD")) return "Against children";
  return "Sexual offender";
}

function countyOf(raw: string) {
  const t = title(raw.trim());
  if (t === "Dekalb") return "DeKalb";
  if (t === "Mcminn") return "McMinn";
  if (t === "Mcnairy") return "McNairy";
  return t;
}

function row(a: Record<string, unknown>): SorPerson | null {
  const id = String(a.Tid ?? "").trim();
  const lat = Number(a.latitude_primary);
  const lon = Number(a.longitude_primary);
  if (!id) return null;
  const first = title(String(a.FirstName ?? "").trim());
  const mid = title(String(a.MiddleName ?? "").trim());
  const last = title(String(a.LastName ?? "").trim());
  const name = [first, mid, last].filter(Boolean).join(" ");
  if (!name) return null;
  return {
    id,
    name,
    lat: Number.isFinite(lat) ? lat : 0,
    lon: Number.isFinite(lon) ? lon : 0,
    county: countyOf(String(a.ResCounty ?? "")),
    city: title(String(a.ResCity ?? "").trim()),
    address: title(String(a.ResAddr1 ?? "").trim()),
    zip: String(a.ResZip ?? "").trim(),
    klass: klassOf(String(a.Classification ?? "")),
    offense: String(a.Tca1 ?? "")
      .replace(/^\d{2}\/\d{2}\/\d{4}\s+/, "")
      .trim(),
  };
}

async function query(where: string) {
  const offenders: SorPerson[] = [];
  let offset = 0;
  for (;;) {
    const u = new URL(LAYER);
    u.searchParams.set("where", where);
    u.searchParams.set("outFields", FIELDS);
    u.searchParams.set("returnGeometry", "false");
    u.searchParams.set("resultOffset", String(offset));
    u.searchParams.set("resultRecordCount", "2000");
    u.searchParams.set("f", "json");
    const res = await fetch(u, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      features?: { attributes?: Record<string, unknown> }[];
      exceededTransferLimit?: boolean;
    };
    const feats = json.features ?? [];
    for (const f of feats) {
      const p = f.attributes ? row(f.attributes) : null;
      if (p) offenders.push(p);
    }
    if (feats.length < 2000 && !json.exceededTransferLimit) break;
    offset += 2000;
    if (offset > 8000) break;
  }
  return offenders;
}

export const Route = createFileRoute("/api/sor")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const id = u.searchParams.get("id")?.trim();
        const county = u.searchParams.get("county")?.trim();
        const key = id ? `id:${id}` : county ? `co:${county.toUpperCase()}` : "";
        if (!key) return Response.json({ offenders: [] as SorPerson[] });
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < TTL) {
          return Response.json(hit.body, {
            headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" },
          });
        }
        try {
          const where = id
            ? `Tid='${id.replace(/'/g, "")}'`
            : `ResCounty='${county!.toUpperCase().replace(/'/g, "")}'`;
          const offenders = await query(where);
          const body = { offenders };
          cache.set(key, { at: Date.now(), body });
          return Response.json(body, {
            headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" },
          });
        } catch {
          return Response.json({ offenders: [] as SorPerson[] });
        }
      },
    },
  },
});
