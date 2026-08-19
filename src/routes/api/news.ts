import { createFileRoute } from "@tanstack/react-router";
import { dedicatedCounty, outletsFor, STATE_OUTLETS } from "@/data/local-outlets";
import type { NewsItem } from "@/data/types";

const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";
const FRESH_MS = 20_000;
const STALE_MS = 8 * 60_000;
const FETCH_MS = 1300;

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

const FOREIGN = [
  "boston",
  "atlanta",
  "chicago",
  "new york",
  "los angeles",
  "philadelphia",
  "penn state",
  "seattle seahawks",
  "south station",
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}

function hostname(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseRss(xml: string, county?: string, fallback = "Google News"): NewsItem[] {
  const items: NewsItem[] = [];
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
    const published = decode(
      (chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "").trim(),
    );
    const source = decode(
      (chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "").trim(),
    );
    if (!title || !href) continue;
    items.push({
      id: slug(title),
      kind: "news",
      headline: title,
      href,
      source: source || hostname(href) || fallback,
      published,
      county,
    });
  }
  return items;
}

function keep(
  item: NewsItem,
  county?: string,
  seat?: string,
  sites?: string[],
  dedicated = false,
  trusted = false,
) {
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
  const foreign = FOREIGN.some((x) => blob.includes(x));
  const tn = TN_HINTS.some((x) => blob.includes(x)) || named || localSite;
  if (foreign && !named) return false;
  if (county) {
    if (off && !named && !localSite) return false;
    if (trusted) return true;
    if (dedicated) return Boolean(named || localSite);
    return Boolean(named);
  }
  if (off && !tn) return false;
  return true;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(`news ${res.status}`);
  return res.text();
}

function googleRss(q: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
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

function jsonNews(items: NewsItem[], extra?: Record<string, string>) {
  return Response.json(
    { items },
    {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=300",
        ...extra,
      },
    },
  );
}

export const Route = createFileRoute("/api/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const county = u.searchParams.get("county") ?? undefined;
        const seat = u.searchParams.get("seat") ?? undefined;
        const market = u.searchParams.get("market") ?? undefined;
        const fresh = u.searchParams.get("fresh") === "1";
        const key = `${county ?? ""}|${seat ?? ""}|${market ?? ""}`;
        const hit = cache.get(key);
        const age = hit ? Date.now() - hit.at : Infinity;
        if (hit && age < FRESH_MS && !fresh) return jsonNews(hit.items, { "X-Grid-News": "cache" });
        if (hit && age < STALE_MS && !fresh) return jsonNews(hit.items, { "X-Grid-News": "stale" });

        const outlets = outletsFor(county, market ?? undefined);
        const sites = outlets.map((o) => o.site);
        const siteQ = sites.map((s) => `site:${s}`).join(" OR ");
        const dedicated = dedicatedCounty(county);
        const stateSites =
          "site:tennesseelookout.com OR site:wkrn.com OR site:newschannel5.com OR site:tennessean.com OR site:knoxnews.com OR site:timesfreepress.com";
        const google = county
          ? [
              `"${county} County" OR "${seat ?? county}" Tennessee when:${dedicated ? "3d" : "14d"}`,
              siteQ ? `("${county} County" OR "${seat ?? county}") (${siteQ}) when:${dedicated ? "5d" : "14d"}` : "",
            ].filter(Boolean)
          : ["Tennessee when:1d", `(${stateSites}) Tennessee when:2d`];
        const rss = (county ? outlets : STATE_OUTLETS.filter((o) => o.rss))
          .map((o) => o.rss)
          .filter((x): x is string => Boolean(x))
          .slice(0, 2);

        try {
          const jobs = [
            ...google.map((q) => fetchText(googleRss(q))),
            ...rss.map((url) => fetchText(url)),
          ];
          const xmls = await Promise.allSettled(jobs);
          const parsed: NewsItem[] = [];
          const trusted = new Set<string>();
          xmls.forEach((r, i) => {
            if (r.status !== "fulfilled") return;
            const rows = parseRss(r.value, county);
            if (county && i === 0) {
              for (const it of rows) trusted.add(it.headline.toLowerCase());
            }
            parsed.push(...rows);
          });
          const items = merge(
            parsed.filter((it) =>
              keep(it, county, seat, sites, dedicated, trusted.has(it.headline.toLowerCase())),
            ),
          ).slice(0, 40);
          if (items.length) cache.set(key, { at: Date.now(), items });
          else if (hit) return jsonNews(hit.items, { "X-Grid-News": "keep" });
          return jsonNews(items, { "X-Grid-News": "live" });
        } catch {
          return jsonNews(hit?.items ?? [], { "X-Grid-News": "err" });
        }
      },
    },
  },
});
