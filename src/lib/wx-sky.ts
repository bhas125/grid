import { COUNTY_XY } from "@/lib/county-xy";
import type { WxCell, WxKind } from "@/data/types";

export type WxCluster = {
  kind: WxKind;
  names: string[];
};

const LINK2 = 0.7 * 0.7;
const MIN_CLUSTER = 3;

const NAMES = Object.keys(COUNTY_XY);

export function nwsKind(desc: string, icon: string): WxKind {
  const blob = `${desc} ${icon}`.toLowerCase();
  if (/tsra|thunder|\btst\b|storm/.test(blob)) return "storm";
  if (/snow|sleet|freezing/.test(blob)) return "rain";
  if (/\bra\b|\/ra|rain|shower|drizzle/.test(blob)) return "rain";
  if (/fog|mist|haze/.test(blob)) return "fog";
  if (/bkn|broken|ovc|overcast|mostly cloudy/.test(blob)) return "cloudy";
  if (/\bcloudy\b/.test(blob) && !/partly|few|fair/.test(blob)) return "cloudy";
  if (/sct|scattered|partly/.test(blob)) return "partly";
  if (/few|mostly clear/.test(blob)) return "few";
  if (/skc|clear|fair|sun/.test(blob)) return "clear";
  return "clear";
}

export function clusterWx(cells: WxCell[]): WxCluster[] {
  const kindOf = new Map(cells.map((c) => [c.name, c.kind]));
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let p = parent.get(a) ?? a;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(a, p);
    return p;
  };
  const unite = (a: string, b: string) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  };

  for (const name of NAMES) {
    if ((kindOf.get(name) ?? "clear") === "clear") continue;
    parent.set(name, name);
  }

  const active = NAMES.filter((n) => parent.has(n));
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const [la, loa] = COUNTY_XY[a];
    const ka = kindOf.get(a);
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (kindOf.get(b) !== ka) continue;
      const [lb, lob] = COUNTY_XY[b];
      const dlat = la - lb;
      const dlon = loa - lob;
      if (dlat * dlat + dlon * dlon <= LINK2) unite(a, b);
    }
  }

  const groups = new Map<string, string[]>();
  for (const name of active) {
    const root = find(name);
    const list = groups.get(root) ?? [];
    list.push(name);
    groups.set(root, list);
  }

  const out: WxCluster[] = [];
  for (const names of groups.values()) {
    if (names.length < MIN_CLUSTER) continue;
    const kind = kindOf.get(names[0]);
    if (!kind || kind === "clear") continue;
    out.push({ kind, names });
  }
  return out;
}

export function hashName(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
