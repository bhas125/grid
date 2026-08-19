import type { CrimeIncident, CrimeNames } from "@/data/types";
import seedJson from "@/data/crime-names.json";

const seed = new Map((seedJson as CrimeNames[]).map((n) => [n.id, n]));
const mem = new Map<string, CrimeNames | null>([...seed.entries()]);

export function readCrimeNames(id: string): CrimeNames | null | undefined {
  if (mem.has(id)) return mem.get(id);
  return undefined;
}

export async function fetchCrimeNames(c: CrimeIncident): Promise<CrimeNames | null> {
  if (mem.has(c.id)) return mem.get(c.id) ?? null;
  const q = new URLSearchParams({
    id: c.id,
    date: c.date ?? "",
    city: c.city ?? "",
    county: c.county ?? "",
    address: c.address ?? "",
    type: c.type,
  });
  try {
    const r = await fetch(`/api/crime-names?${q}`);
    const d = (await r.json()) as { names?: CrimeNames | null };
    const names = d.names ?? null;
    mem.set(c.id, names);
    return names;
  } catch {
    mem.set(c.id, null);
    return null;
  }
}
