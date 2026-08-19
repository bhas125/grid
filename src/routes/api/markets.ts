import { createFileRoute } from "@tanstack/react-router";
import type { MarketQuote } from "@/data/types";

const UA =
  "Mozilla/5.0 (compatible; GridTN/1.0; +https://grid.blakehassler.com)";

const TICKERS: { id: string; label: string; digits: number; suffix?: string }[] = [
  { id: "^GSPC", label: "SPX", digits: 0 },
  { id: "^DJI", label: "DJI", digits: 0 },
  { id: "^IXIC", label: "COMP", digits: 0 },
  { id: "GC=F", label: "GOLD", digits: 0 },
  { id: "SI=F", label: "SLV", digits: 2 },
  { id: "^TNX", label: "10Y", digits: 2, suffix: "%" },
  { id: "^TYX", label: "30Y", digits: 2, suffix: "%" },
  { id: "JPY=X", label: "JPY", digits: 2 },
];

const FALLBACK: MarketQuote[] = [
  { id: "^GSPC", label: "SPX", digits: 0, value: 7692, change: -94 },
  { id: "^DJI", label: "DJI", digits: 0, value: 53399, change: -334 },
  { id: "^IXIC", label: "COMP", digits: 0, value: 26298, change: -431 },
  { id: "GC=F", label: "GOLD", digits: 0, value: 4411, change: -7 },
  { id: "SI=F", label: "SLV", digits: 2, value: 63.96, change: -2.17 },
  { id: "^TNX", label: "10Y", digits: 2, suffix: "%", value: 4.71, change: -0.02 },
  { id: "^TYX", label: "30Y", digits: 2, suffix: "%", value: 4.88, change: -0.01 },
  { id: "JPY=X", label: "JPY", digits: 2, value: 159.58, change: 0.36 },
];

let cache: { at: number; quotes: MarketQuote[] } | null = null;
const TTL = 45_000;

async function quote(id: string): Promise<{ value: number; change: number } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: {
      result?: {
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
          chartPreviousClose?: number;
        };
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  };
  const result = json.chart?.result?.[0];
  const meta = result?.meta;
  const value = meta?.regularMarketPrice;
  if (typeof value !== "number") return null;
  const closes = result?.indicators?.quote?.[0]?.close?.filter(
    (n): n is number => typeof n === "number",
  );
  const prev =
    meta?.previousClose ??
    meta?.chartPreviousClose ??
    (closes && closes.length >= 2 ? closes[closes.length - 2] : value);
  return { value, change: value - (prev ?? value) };
}

export const Route = createFileRoute("/api/markets")({
  server: {
    handlers: {
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL) {
          return Response.json({ quotes: cache.quotes });
        }
        const quotes: MarketQuote[] = [];
        for (const t of TICKERS) {
          try {
            const q = await quote(t.id);
            if (q) quotes.push({ ...t, ...q });
          } catch {
            /* skip */
          }
        }
        const byId = new Map(quotes.map((q) => [q.id, q]));
        const merged = TICKERS.map((t) => byId.get(t.id) ?? FALLBACK.find((f) => f.id === t.id)!);
        cache = { at: Date.now(), quotes: merged };
        return Response.json({ quotes: merged });
      },
    },
  },
});
