import { createFileRoute } from "@tanstack/react-router";
import { fetchNewCrime } from "@/lib/crime-ingest";
import { ingestIfStale, readLiveCrime } from "@/lib/crime-store";

export const Route = createFileRoute("/api/crime-live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const since = u.searchParams.get("since") ?? undefined;
        try {
          const result = await ingestIfStale(false, fetchNewCrime);
          const incidents = since
            ? result.incidents.filter((r) => (r.date ?? "") >= since)
            : result.incidents;
          return Response.json(
            { incidents, skipped: result.skipped },
            { headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=300" } },
          );
        } catch {
          const incidents = await readLiveCrime(since);
          return Response.json(
            { incidents, skipped: true },
            { headers: { "Cache-Control": "public, s-maxage=30" } },
          );
        }
      },
    },
  },
});
