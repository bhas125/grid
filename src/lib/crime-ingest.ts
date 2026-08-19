import type { CrimeIncident } from "@/data/types";
import { COUNTY_XY, countyFromText } from "@/lib/county-xy";

const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";
const FETCH_MS = 4500;

const NASH =
  "https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Metro_Nashville_Police_Department_Incidents_view/FeatureServer/0/query";
const MEM =
  "https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents_Mapping/FeatureServer/0/query";

const NEWS_SKIP =
  /boston|dorchester|south station|probation|daycare|security deposit|penn state|louisville|kentucky|north carolina/i;

function ymd(ms: number) {
  try {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function gun(weapon: string) {
  return /GUN|FIREARM|RIFLE|SHOTGUN|REVOLVER|PISTOL/i.test(weapon);
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function arcgis(url: string, where: string, fields: string, order: string) {
  const q = new URL(url);
  q.searchParams.set("where", where);
  q.searchParams.set("outFields", fields);
  q.searchParams.set("orderByFields", order);
  q.searchParams.set("resultRecordCount", "250");
  q.searchParams.set("returnGeometry", "false");
  q.searchParams.set("f", "pjson");
  const res = await fetch(q, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(`arcgis ${res.status}`);
  const d = (await res.json()) as { features?: { attributes: Record<string, unknown> }[] };
  return d.features ?? [];
}

function fromNash(a: Record<string, unknown>): CrimeIncident | null {
  const id = String(a.Incident_Number ?? "");
  const lat = num(a.Latitude);
  const lon = num(a.Longitude);
  if (!id || !lat || !lon) return null;
  const nibrs = String(a.Offense_NIBRS ?? "");
  const offense = String(a.Offense_Description ?? "");
  const weapon = String(a.Weapon_Description ?? "");
  const homicide = nibrs === "09A" || nibrs === "09C" || /homicide|murder/i.test(offense);
  if (!homicide && !(nibrs === "13A" && gun(weapon))) return null;
  const zip = String(a.ZIP_Code ?? "").replace(/\.0$/, "");
  return {
    id: `NASH-${id}`,
    date: ymd(num(a.Incident_Occurred)),
    city: "Nashville",
    county: "Davidson",
    address: String(a.Incident_Location ?? "").trim(),
    zip: zip || undefined,
    lat,
    lon,
    type: homicide ? "Homicide" : "Shooting / aggravated assault",
    offense: [offense, weapon].filter((x) => x && x !== "NONE").join(" · "),
    source: "Nashville_MNPD",
    killed: homicide ? 1 : 0,
    injured: 0,
  };
}

function fromMem(a: Record<string, unknown>): CrimeIncident | null {
  const raw = String(a.Crime_ID ?? "");
  const lat = num(a.Latitude);
  const lon = num(a.Longitude);
  if (!raw || !lat || !lon) return null;
  const code = String(a.UCR_Incident_Code ?? "");
  const cat = String(a.UCR_Category ?? "");
  const desc = String(a.UCR_Description ?? "");
  const homicide = code === "09A" || cat === "HOMICIDE";
  const assault = code === "13A" || /aggravated assault/i.test(desc);
  if (!homicide && !assault) return null;
  return {
    id: `MEM-${raw}`,
    date: ymd(num(a.Offense_Datetime)),
    city: String(a.City ?? "MEMPHIS"),
    county: "Shelby",
    address: String(a.Full_Address || a.Street_Address || "").trim(),
    zip: String(a.ZIP_Code ?? "") || undefined,
    lat,
    lon,
    type: homicide ? "Homicide" : "Shooting / aggravated assault",
    offense: desc || cat,
    source: "Memphis_MPD",
    killed: homicide ? 1 : 0,
    injured: 0,
  };
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&/g, "&");
}

function rssDay(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(+d)) return daysAgo(0);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

async function fromNews(): Promise<CrimeIncident[]> {
  const q = `Tennessee (homicide OR "fatal shooting" OR "shot and killed" OR "officer-involved") when:3d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: CrimeIncident[] = [];
    const seen = new Set<string>();
    for (const chunk of xml.split(/<item>/i).slice(1).slice(0, 24)) {
      const title = decode((chunk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
      const pub = decode((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "").trim());
      if (!title) continue;
      if (NEWS_SKIP.test(title)) continue;
      if (!/homicide|killed|fatal shooting|shot and killed|murder|officer-involved/i.test(title)) continue;
      if (!/tennessee|\btn\b|county|knoxville|memphis|nashville|chattanooga|clarksville/i.test(title)) continue;
      const county = countyFromText(title);
      if (!county) continue;
      if (county === "Shelby" || county === "Davidson") continue;
      const xy = COUNTY_XY[county];
      if (!xy) continue;
      const date = rssDay(pub);
      const dayKey = `${county}|${date}`;
      if (seen.has(dayKey)) continue;
      seen.add(dayKey);
      out.push({
        id: `NEWS-${date}-${county}`,
        date,
        city: "",
        county,
        address: title.replace(/\s+-\s+[^-]+$/, "").slice(0, 80),
        lat: xy[0],
        lon: xy[1],
        type: "Homicide",
        offense: /shooting|gun|shot/i.test(title) ? "Gun homicide" : "Homicide",
        source: "News",
        killed: 1,
        injured: 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function unique(rows: CrimeIncident[]) {
  const seen = new Set<string>();
  const out: CrimeIncident[] = [];
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export async function fetchNewCrime(since?: string): Promise<CrimeIncident[]> {
  const from = since && since >= "2026-01-01" ? since : daysAgo(4);
  const nashWhere = `Incident_Occurred > DATE '${from}' AND (Offense_NIBRS IN ('09A','09C','13A'))`;
  const memWhere = `Offense_Datetime > DATE '${from}' AND (UCR_Incident_Code IN ('09A','13A') OR UCR_Category = 'HOMICIDE')`;
  const jobs = await Promise.allSettled([
    arcgis(
      NASH,
      nashWhere,
      "Incident_Number,Incident_Location,Latitude,Longitude,Offense_Description,Weapon_Description,Offense_NIBRS,ZIP_Code,Incident_Occurred",
      "Incident_Occurred DESC",
    ).then((rows) => rows.map((f) => fromNash(f.attributes)).filter((x): x is CrimeIncident => Boolean(x))),
    arcgis(
      MEM,
      memWhere,
      "Crime_ID,Offense_Datetime,Street_Address,ZIP_Code,Latitude,Longitude,UCR_Category,UCR_Description,UCR_Incident_Code,Full_Address,City",
      "Offense_Datetime DESC",
    ).then((rows) => rows.map((f) => fromMem(f.attributes)).filter((x): x is CrimeIncident => Boolean(x))),
    fromNews(),
  ]);
  const rows: CrimeIncident[] = [];
  for (const j of jobs) {
    if (j.status === "fulfilled") rows.push(...j.value);
  }
  const pd = unique(rows.filter((r) => r.source !== "News"));
  const seenDay = new Set(pd.filter((r) => r.type === "Homicide").map((r) => `${r.county}|${r.date}`));
  for (const n of rows.filter((r) => r.source === "News")) {
    if (seenDay.has(`${n.county}|${n.date}`)) continue;
    pd.push(n);
    seenDay.add(`${n.county}|${n.date}`);
  }
  return unique(pd);
}
