import { createFileRoute } from "@tanstack/react-router";
import counties from "@/data/counties.json";
import type { Alert, County } from "@/data/types";

const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";
const NAMES = (counties as County[]).map((c) => c.name);

function matchCounties(area: string) {
  const lower = area.toLowerCase();
  return NAMES.filter((n) => {
    const re = new RegExp(`\\b${n.toLowerCase()}\\b`);
    return re.test(lower);
  });
}

export const Route = createFileRoute("/api/alerts")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch("https://api.weather.gov/alerts/active?area=TN", {
            headers: { "User-Agent": UA, Accept: "application/geo+json" },
          });
          if (!res.ok) return Response.json({ alerts: [] });
          const json = (await res.json()) as {
            features?: {
              id?: string;
              properties?: {
                event?: string;
                severity?: string;
                headline?: string;
                areaDesc?: string;
                ends?: string;
                id?: string;
              };
            }[];
          };
          const alerts: Alert[] = (json.features ?? [])
            .map((f) => {
              const p = f.properties ?? {};
              const area = p.areaDesc ?? "";
              return {
                id: f.id ?? p.id ?? p.headline ?? "alert",
                event: p.event ?? "Alert",
                severity: p.severity ?? "Unknown",
                headline: p.headline ?? p.event ?? "NWS alert",
                area,
                ends: p.ends,
                href: "https://www.weather.gov/",
                counties: matchCounties(area),
              };
            })
            .filter((a) => a.counties.length > 0);
          return Response.json({ alerts });
        } catch {
          return Response.json({ alerts: [] });
        }
      },
    },
  },
});
