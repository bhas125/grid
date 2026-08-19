import { createFileRoute } from "@tanstack/react-router";

const URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?fields=record_date,tot_pub_debt_out_amt&sort=-record_date&page[size]=8";

const FALLBACK = { debt: 40047425768420, asOf: Date.parse("2026-08-18T21:00:00Z"), perSec: 180000 };

type Row = { record_date?: string; tot_pub_debt_out_amt?: string };

let cache: { at: number; body: typeof FALLBACK } | null = null;
const TTL = 30 * 60_000;

export const Route = createFileRoute("/api/debt")({
  server: {
    handlers: {
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL) {
          return Response.json(cache.body, {
            headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
          });
        }
        try {
          const res = await fetch(URL, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return Response.json(FALLBACK);
          const json = (await res.json()) as { data?: Row[] };
          const rows = (json.data ?? [])
            .map((r) => ({
              date: r.record_date ?? "",
              amt: Number(r.tot_pub_debt_out_amt),
            }))
            .filter((r) => r.date && Number.isFinite(r.amt) && r.amt > 0);
          const newest = rows[0];
          const oldest = rows[rows.length - 1];
          if (!newest) return Response.json(FALLBACK);
          const start = Date.parse(`${newest.date}T21:00:00Z`);
          const spanDays = Math.max(
            1,
            (Date.parse(`${newest.date}T00:00:00Z`) - Date.parse(`${oldest.date}T00:00:00Z`)) / 86400000,
          );
          const delta = newest.amt - (oldest?.amt ?? newest.amt);
          const perSec = delta > 0 ? delta / (spanDays * 86400) : FALLBACK.perSec;
          const body = { debt: newest.amt, asOf: Number.isFinite(start) ? start : Date.now(), perSec };
          cache = { at: Date.now(), body };
          return Response.json(body, {
            headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
          });
        } catch {
          return Response.json(FALLBACK);
        }
      },
    },
  },
});
