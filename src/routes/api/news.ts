import { createFileRoute } from "@tanstack/react-router";
import type { NewsItem } from "@/data/types";

const UA = "GridTN/1.0 (tennessee situation monitor)";

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

function keep(item: NewsItem, county?: string, seat?: string) {
  const blob = `${item.headline} ${item.href} ${item.source}`.toLowerCase();
  const off = OFF_STATE.some((x) => blob.includes(x));
  const tn =
    TN_HINTS.some((x) => blob.includes(x)) ||
    (county && blob.includes(county.toLowerCase())) ||
    (seat && blob.includes(seat.toLowerCase()));
  if (off && !tn) return false;
  return true;
}

async function fetchRss(q: string) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`news ${res.status}`);
  return res.text();
}

export const Route = createFileRoute("/api/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const county = u.searchParams.get("county") ?? undefined;
        const seat = u.searchParams.get("seat") ?? undefined;
        const q = county
          ? `"${county} County" OR ${seat ?? county} Tennessee when:7d`
          : "Tennessee when:2d";
        try {
          const xml = await fetchRss(q);
          const items = parseRss(xml, county).filter((it) => keep(it, county, seat)).slice(0, 40);
          return Response.json({ items });
        } catch {
          return Response.json({ items: [] }, { status: 200 });
        }
      },
    },
  },
});
