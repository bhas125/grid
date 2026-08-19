import type { CrimeIncident } from "@/data/types";
import { getSql } from "@/lib/db";

const STALE_MS = 20 * 60 * 60_000;
let inflight: Promise<CrimeIncident[]> | null = null;

function rowToIncident(r: Record<string, unknown>): CrimeIncident {
  return {
    id: String(r.id),
    date: r.date ? String(r.date).slice(0, 10) : null,
    city: String(r.city ?? ""),
    county: String(r.county ?? ""),
    address: String(r.address ?? ""),
    zip: r.zip ? String(r.zip) : undefined,
    lat: Number(r.lat),
    lon: Number(r.lon),
    type: String(r.type),
    offense: String(r.offense ?? ""),
    source: String(r.source ?? ""),
    killed: Number(r.killed ?? 0),
    injured: Number(r.injured ?? 0),
  };
}

export async function lastIngestAt(): Promise<number> {
  try {
    const sql = await getSql();
    const rows = await sql<{ value: string }>`select value from crime_meta where key = ${"ingest_at"}`;
    const n = Number(rows[0]?.value ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function readLiveCrime(since?: string): Promise<CrimeIncident[]> {
  try {
    const sql = await getSql();
    const rows = since
      ? await sql<Record<string, unknown>>`select * from crime_live where date >= ${since} order by date desc`
      : await sql<Record<string, unknown>>`select * from crime_live order by date desc`;
    return rows.map(rowToIncident);
  } catch {
    return [];
  }
}

export async function writeLiveCrime(rows: CrimeIncident[]) {
  if (!rows.length) return 0;
  const sql = await getSql();
  let n = 0;
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40);
    const params: unknown[] = [];
    const values = chunk.map((r, idx) => {
      const b = idx * 13;
      params.push(
        r.id,
        r.date,
        r.city,
        r.county,
        r.address,
        r.zip ?? null,
        r.lat,
        r.lon,
        r.type,
        r.offense,
        r.source,
        r.killed,
        r.injured,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13})`;
    });
    await sql.query(
      `insert into crime_live (id, date, city, county, address, zip, lat, lon, type, offense, source, killed, injured)
       values ${values.join(",")}
       on conflict (id) do nothing`,
      params,
    );
    n += chunk.length;
  }
  await sql`
    insert into crime_meta (key, value, updated_at)
    values (${"ingest_at"}, ${String(Date.now())}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return n;
}

export async function ingestIfStale(force: boolean, fetchNew: () => Promise<CrimeIncident[]>) {
  const last = await lastIngestAt();
  if (!force && last && Date.now() - last < STALE_MS) {
    return { added: 0, skipped: true as const, incidents: await readLiveCrime() };
  }
  if (inflight) {
    const incidents = await inflight;
    return { added: incidents.length, skipped: false as const, incidents };
  }
  inflight = (async () => {
    const fresh = await fetchNew();
    await writeLiveCrime(fresh);
    return readLiveCrime();
  })();
  try {
    const incidents = await inflight;
    return { added: incidents.length, skipped: false as const, incidents };
  } finally {
    inflight = null;
  }
}
