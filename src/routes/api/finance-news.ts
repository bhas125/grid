import { createFileRoute } from "@tanstack/react-router";
import type { FinanceHeadline } from "@/data/types";

const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";
const TTL = 120_000;

const FEEDS: { source: string; url: string }[] = [
  { source: "BBC", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147" },
  { source: "Guardian", url: "https://www.theguardian.com/business/rss" },
  {
    source: "Google",
    url: "https://news.google.com/rss/search?q=markets+OR+stocks+OR+economy+OR+fed+when:1d&hl=en-US&gl=US&ceid=US:en",
  },
];

const KEEP =
  /market|stock|bond|fed\b|bank|oil|gold|dollar|yield|inflation|econom|trade|treasur|earning|ipo|nasdaq|dow\b|s&p|rate cut|rate hike|jobs report|gdp|crypto|opec|yen|euro|unemploy|recession|tariff|wto|imf|ecb|boj|commodit|crude|futures/i;
const DROP = /\bsex\b|assault|murder|killed|homicide|obituar|celebrity|sport|football|soccer|nba|nfl/i;

let cache: { at: number; items: FinanceHeadline[] } | null = null;

function decode(s: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (_, g: string) => {
      if (g[0] === "#") {
        const n = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : Number(g.slice(1));
        return Number.isFinite(n) ? String.fromCharCode(n) : _;
      }
      return named[g.toLowerCase()] ?? _;
    })
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRss(xml: string, fallback: string): FinanceHeadline[] {
  const items: FinanceHeadline[] = [];
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  for (const chunk of chunks) {
    const title = decode((chunk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
    const href = decode(
      (
        chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
        chunk.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ??
        ""
      ).trim(),
    );
    const published = decode((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "").trim());
    if (!title || !href) continue;
    items.push({
      id: `${fallback}-${title.slice(0, 48)}`,
      source: fallback,
      headline: title.replace(/\s+/g, " "),
      href,
    });
    if (items.length >= 12) break;
    void published;
  }
  return items;
}

async function pull(feed: { source: string; url: string }): Promise<FinanceHeadline[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(1800),
  });
  if (!res.ok) return [];
  return parseRss(await res.text(), feed.source);
}

const FALLBACK: FinanceHeadline[] = [
  {
    id: "fb-1",
    source: "Markets",
    headline: "Treasury yields and the dollar set the tone for global risk assets",
    href: "https://www.bbc.com/news/business",
  },
  {
    id: "fb-2",
    source: "Fed",
    headline: "Investors watch inflation prints for the next policy move",
    href: "https://www.cnbc.com/economy/",
  },
  {
    id: "fb-3",
    source: "Oil",
    headline: "Crude tracks supply headlines and Middle East risk premium",
    href: "https://www.theguardian.com/business",
  },
];

export const Route = createFileRoute("/api/finance-news")({
  server: {
    handlers: {
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL) {
          return Response.json(
            { items: cache.items },
            { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
          );
        }
        const rows = (await Promise.all(FEEDS.map((f) => pull(f).catch(() => [] as FinanceHeadline[])))).flat();
        const seen = new Set<string>();
        const items: FinanceHeadline[] = [];
        for (const it of rows) {
          const k = it.headline.toLowerCase();
          if (seen.has(k) || DROP.test(k) || !KEEP.test(k)) continue;
          seen.add(k);
          items.push(it);
          if (items.length >= 24) break;
        }
        const out = items.length ? items : FALLBACK;
        cache = { at: Date.now(), items: out };
        return Response.json(
          { items: out },
          { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
        );
      },
    },
  },
});
