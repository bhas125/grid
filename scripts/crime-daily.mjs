#!/usr/bin/env node
/**
 * Merge new homicides + shootings into public/crime-tn.json.
 * Run from GitHub Actions twice a day. This file is the permanent store —
 * Vercel deploys it to the CDN so the map never depends on a sandbox.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "public", "crime-tn.json");
const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";

const NASH =
  "https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Metro_Nashville_Police_Department_Incidents_view/FeatureServer/0/query";
const MEM =
  "https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents_Mapping/FeatureServer/0/query";

function ymd(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function gun(w) {
  return /GUN|FIREARM|RIFLE|SHOTGUN|REVOLVER|PISTOL/i.test(String(w ?? ""));
}

async function arcgis(url, where, fields, order) {
  const q = new URL(url);
  q.searchParams.set("where", where);
  q.searchParams.set("outFields", fields);
  q.searchParams.set("orderByFields", order);
  q.searchParams.set("resultRecordCount", "400");
  q.searchParams.set("returnGeometry", "false");
  q.searchParams.set("f", "pjson");
  const res = await fetch(q, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`arcgis ${res.status}`);
  const d = await res.json();
  return d.features ?? [];
}

function fromNash(a) {
  const id = String(a.Incident_Number ?? "");
  const lat = Number(a.Latitude);
  const lon = Number(a.Longitude);
  if (!id || !lat || !lon) return null;
  const nibrs = String(a.Offense_NIBRS ?? "");
  const offense = String(a.Offense_Description ?? "");
  const weapon = String(a.Weapon_Description ?? "");
  const homicide = nibrs === "09A" || nibrs === "09C" || /homicide|murder/i.test(offense);
  if (!homicide && !(nibrs === "13A" && gun(weapon))) return null;
  const zip = String(a.ZIP_Code ?? "").replace(/\.0$/, "");
  return {
    id: `NASH-${id}`,
    date: ymd(Number(a.Incident_Occurred)),
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

function fromMem(a) {
  const raw = String(a.Crime_ID ?? "");
  const lat = Number(a.Latitude);
  const lon = Number(a.Longitude);
  if (!raw || !lat || !lon) return null;
  const code = String(a.UCR_Incident_Code ?? "");
  const cat = String(a.UCR_Category ?? "");
  const desc = String(a.UCR_Description ?? "");
  const homicide = code === "09A" || cat === "HOMICIDE";
  const assault = code === "13A" || /aggravated assault/i.test(desc);
  if (!homicide && !assault) return null;
  return {
    id: `MEM-${raw}`,
    date: ymd(Number(a.Offense_Datetime)),
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

async function main() {
  const since = daysAgo(14);
  const jobs = await Promise.allSettled([
    arcgis(
      NASH,
      `Incident_Occurred > DATE '${since}' AND (Offense_NIBRS IN ('09A','09C','13A'))`,
      "Incident_Number,Incident_Location,Latitude,Longitude,Offense_Description,Weapon_Description,Offense_NIBRS,ZIP_Code,Incident_Occurred",
      "Incident_Occurred DESC",
    ).then((rows) => rows.map((f) => fromNash(f.attributes)).filter(Boolean)),
    arcgis(
      MEM,
      `Offense_Datetime > DATE '${since}' AND (UCR_Incident_Code IN ('09A','13A') OR UCR_Category = 'HOMICIDE')`,
      "Crime_ID,Offense_Datetime,Street_Address,ZIP_Code,Latitude,Longitude,UCR_Category,UCR_Description,UCR_Incident_Code,Full_Address,City",
      "Offense_Datetime DESC",
    ).then((rows) => rows.map((f) => fromMem(f.attributes)).filter(Boolean)),
  ]);
  const fresh = [];
  for (const j of jobs) {
    if (j.status === "fulfilled") fresh.push(...j.value);
    else console.error("source failed", j.reason);
  }
  const existing = JSON.parse(fs.readFileSync(file, "utf8"));
  const have = new Set(existing.map((r) => r.id));
  const added = [];
  for (const r of fresh) {
    if (have.has(r.id)) continue;
    have.add(r.id);
    added.push(r);
    existing.push(r);
  }
  if (added.length) {
    existing.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
    fs.writeFileSync(file, JSON.stringify(existing));
  }
  console.log(JSON.stringify({ added: added.length, total: existing.length, ids: added.map((r) => r.id).slice(0, 20) }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
