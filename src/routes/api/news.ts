import { createFileRoute } from "@tanstack/react-router";
import { outletsFor } from "@/data/local-outlets";
import type { NewsItem } from "@/data/types";

const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";
const TTL_MS = 90_000;

const OFF_STATE = [
  "kentucky",
  "north carolina",
  "south carolina",
  "pennsylvania",
  "cumberlink",
  "hope mills",
  "fayetteville, n",
  "trevor lawrence",
  "washington, d.c",
  "washington dc",
  "montgomery, al",
  "louisville, ky",
];

const TN_HINTS = [
  "tennessee",
  " tn",
  ", tn",
  "nashville",
  "memphis",
  "knoxville",
  "chattanooga",
  "clarksville",
  "murfreesboro",
  "franklin",
  "johnson city",
  "jackson, t",
];

type Cached = { at: number; items: NewsItem[] };
const cache = new Map<string, Cached>();

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 72);
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRss(xml: string, county?: string): NewsItem[] {
  const items: NewsItem[] = [];
  const chunks = xml.split(/<item>/i).slice(1);
  for (const chunk of chunks) {
    const title = decode((chunk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
    const href = decode((chunk.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim());
    const published = decode(
      (chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "").trim(),
    );
    const source = decode(
      (chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "Google News").trim(),
    );
    if (!title || !href) continue;
    items.push({
      id: slug(title),
      kind: "news",
      headline: title,
      href,
      source,
      published,
      county,
    });
  }
  return items;
}

function keep(item: NewsItem, county?: string, seat?: string, sites?: string[]) {
  const blob = `${item.headline} ${item.href} ${item.source}`.toLowerCase();
  if (
    blob.includes("obituary") ||
    blob.includes("obit (") ||
    blob.includes("funeral home") ||
    blob.includes("in memoriam")
  ) {
    return false;
  }
  const off = OFF_STATE.some((x) => blob.includes(x));
  const localSite = sites?.some((s) => blob.includes(s.toLowerCase())) ?? false;
  const named =
    (county && blob.includes(county.toLowerCase())) ||
    (seat && blob.includes(seat.toLowerCase()));
  const tn = TN_HINTS.some((x) => blob.includes(x)) || named || localSite;
  if (county) {
    if (off && !named && !localSite) return false;
    return Boolean(named || localSite);
  }
  if (off && !tn) return false;
  return true;
}

async function fetchRss(q: string): Promise<string> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(2800),
  });
  if (!res.ok) throw new Error(`news ${res.status}`);
  return res.text();
}

function ageMs(published: string) {
  const t = Date.parse(published);
  return Number.isFinite(t) ? Date.now() - t : 1e15;
}

function merge(rows: NewsItem[]) {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of rows) {
    const k = it.headline.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  out.sort((a, b) => ageMs(a.published) - ageMs(b.published));
  return out;
}

export const Route = createFileRoute("/api/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const county = u.searchParams.get("county") ?? undefined;
        const seat = u.searchParams.get("seat") ?? undefined;
        const key = `${county ?? ""}|${seat ?? ""}`;
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < TTL_MS) {
          return Response.json(
            { items: hit.items },
            { headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=300" } },
          );
        }

        const outlets = outletsFor(county);
        const sites = outlets.map((o) => o.site);
        const siteQ = sites.map((s) => `site:${s}`).join(" OR ");
        const stateSites =
          "site:tennesseelookout.com OR site:wkrn.com OR site:newschannel5.com OR site:tennessean.com OR site:knoxnews.com OR site:timesfreepress.com";
        const queries = county
          ? [
              `"${county} County" OR "${seat ?? county}" Tennessee when:3d`,
              `("${county} County" OR "${seat ?? county}") (${siteQ}) when:7d`,
            ]
          : ["Tennessee when:2d", `(${stateSites}) Tennessee when:2d`];

        try {
          const xmls = await Promise.allSettled(queries.map(fetchRss));
          const parsed: NewsItem[] = [];
          for (const r of xmls) {
            if (r.status !== "fulfilled") continue;
            parsed.push(...parseRss(r.value, county));
          }
          const items = merge(parsed.filter((it) => keep(it, county, seat, sites))).slice(0, 40);
          cache.set(key, { at: Date.now(), items });
          return Response.json(
            { items },
            { headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=300" } },
          );
        } catch {
          return Response.json({ items: hit?.items ?? [] }, { status: 200 });
        }
      },
    },
  },
});
