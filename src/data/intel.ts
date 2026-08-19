import type { County } from "./types";
import scanners from "./scanners.json";
import flock from "./flock.json";
import crime from "./crime.json";
import dc from "./dc.json";

const scannerMap = scanners as Record<string, number>;
const flockMap = flock as Record<string, number>;
const crimeMap = crime as Record<string, { pulse: number; note: string }>;
const dcMap = dc as Record<string, { op: number; prop: number; note: string }>;

const RURAL_CAD =
  "No statewide live CAD. Rural counties rarely publish a useful pulse.";

export function countyIntel(name: string) {
  const ctid = scannerMap[name];
  const crime = crimeMap[name];
  const datacenter = dcMap[name];
  return {
    flock: flockMap[name] ?? 0,
    crime: crime?.pulse ?? 1,
    crimeNote: crime?.note ?? RURAL_CAD,
    dcOperating: datacenter?.op ?? 0,
    dcProposed: datacenter?.prop ?? 0,
    dcNote: datacenter?.note,
    scanner: ctid
      ? {
          label: `${name} scanners`,
          href: `https://www.broadcastify.com/listen/ctid/${ctid}`,
        }
      : undefined,
  };
}

export function popWeight(pop: number) {
  const t = (Math.log(pop) - Math.log(4800)) / (Math.log(940000) - Math.log(4800));
  return Math.min(1, Math.max(0, t));
}

export function sitShape(c: County) {
  const size =
    c.pop > 400000
      ? "A population center — most of Tennessee does not look like this."
      : c.pop > 150000
        ? "A mid-size metro county. The city and the ring around it are not the same place."
        : c.pop > 50000
          ? "A county-seat town and the countryside that votes with it."
          : "A small rural county. Officials, church, and the weekly paper still set the weather.";
  const growth =
    c.growth > 8
      ? "Adding people fast — many neighbors were not here in 2020."
      : c.growth > 2
        ? "Growing, but not exploding."
        : c.growth > -1
          ? "Population is roughly flat."
          : "Losing people. That changes who shows up and what they talk about.";
  return `${size} ${growth}`;
}

export function sitProfile(c: County) {
  switch (c.profile) {
    case "metro_d":
      return "Urban, younger-skewing, high media volume.";
    case "collar":
      return "New subdivisions, school capacity, property tax — the dinner-table stack.";
    case "midsize_r":
      return "A real city with a conservative hinterland. The split is the story.";
    case "tri":
      return "Older, industrial, TVA country. Talk radio still travels.";
    case "rural_w":
      return "West Tennessee farm and mill towns. Memphis is the gravity well.";
    case "rural_e":
      return "East Tennessee hills. Local and stubborn.";
    default:
      if (c.division === "West")
        return "West Tennessee. Town, highway, and the river still organize the week.";
      if (c.division === "East") return "East Tennessee hills. Local and stubborn.";
      return "Middle Tennessee. The county seat and the road to Nashville.";
  }
}

export const WX_LABEL: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  51: "Drizzle",
  61: "Rain",
  63: "Rain",
  80: "Showers",
  95: "Storms",
  96: "Storms",
  99: "Storms",
};

export const AIRPORTS = [
  { name: "MEM", lat: 35.042, lon: -89.977 },
  { name: "BNA", lat: 36.126, lon: -86.677 },
  { name: "TYS", lat: 35.811, lon: -83.994 },
];
