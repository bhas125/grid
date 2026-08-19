import { createFileRoute } from "@tanstack/react-router";
import { fetchNewCrime } from "@/lib/crime-ingest";
import { ingestIfStale } from "@/lib/crime-store";

export const Route = createFileRoute("/api/crime-refresh")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await ingestIfStale(true, fetchNewCrime);
          return Response.json(
            { ok: true, added: result.added, count: result.incidents.length },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "refresh failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
