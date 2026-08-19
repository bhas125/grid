import { createFileRoute } from "@tanstack/react-router";

const AIRPORTS = [
  { name: "MEM", lat: 35.042, lon: -89.977 },
  { name: "BNA", lat: 36.126, lon: -86.677 },
  { name: "TYS", lat: 35.811, lon: -83.994 },
];

const LABELS: Record<number, string> = {
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

type Cache = { at: number; body: unknown };
const cache = new Map<string, Cache>();
const TTL = 5 * 60_000;

function typical(lat: number, lon: number) {
  return {
    temp: lon < -88.2 ? 90 : lon > -84.4 ? 83 : 87,
    code: 1,
    label: "Typical Aug",
    live: false,
  };
}

export const Route = createFileRoute("/api/wx")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const lat = u.searchParams.get("lat");
        const lon = u.searchParams.get("lon");
        const key = lat && lon ? `${lat},${lon}` : "state";
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);

        try {
          if (lat && lon) {
            const la = Number(lat);
            const lo = Number(lon);
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${la.toFixed(3)}&longitude=${lo.toFixed(3)}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&forecast_days=1`;
            const res = await fetch(url);
            if (res.status === 429 || !res.ok) {
              const body = typical(la, lo);
              return Response.json(body);
            }
            const json = (await res.json()) as {
              current?: { temperature_2m?: number; weather_code?: number };
            };
            const temp = json.current?.temperature_2m;
            const code = json.current?.weather_code ?? 0;
            const body =
              typeof temp === "number"
                ? { temp: Math.round(temp), code, label: LABELS[code] ?? "Live", live: true }
                : typical(la, lo);
            cache.set(key, { at: Date.now(), body });
            return Response.json(body);
          }

          const url = `https://api.open-meteo.com/v1/forecast?latitude=${AIRPORTS.map((a) => a.lat).join(",")}&longitude=${AIRPORTS.map((a) => a.lon).join(",")}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&forecast_days=1`;
          const res = await fetch(url);
          if (res.status === 429 || !res.ok) {
            return Response.json({ temp: 87, code: 2, label: "MEM · BNA · TYS", live: false });
          }
          const json = await res.json();
          const rows = (Array.isArray(json) ? json : [json])
            .map((r: { current?: { temperature_2m?: number } }) => r.current?.temperature_2m)
            .filter((n: unknown): n is number => typeof n === "number");
          const body = rows.length
            ? {
                temp: Math.round(rows.reduce((a, b) => a + b, 0) / rows.length),
                code: 2,
                label: "MEM · BNA · TYS",
                live: true,
              }
            : { temp: 87, code: 2, label: "MEM · BNA · TYS", live: false };
          cache.set(key, { at: Date.now(), body });
          return Response.json(body);
        } catch {
          const body =
            lat && lon
              ? typical(Number(lat), Number(lon))
              : { temp: 87, code: 2, label: "MEM · BNA · TYS", live: false };
          return Response.json(body);
        }
      },
    },
  },
});
