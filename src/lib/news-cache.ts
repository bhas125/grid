import type { NewsItem } from "@/data/types";

type Entry = { items: NewsItem[]; at: number };

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<NewsItem[]>>();
const SS_KEY = "grid-news-v1";
const SS_TTL = 45_000;

function hydrate() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (v?.items?.length && now - v.at < SS_TTL) mem.set(k, v);
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") hydrate();

function persist() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, Entry> = {};
    const now = Date.now();
    let n = 0;
    for (const [k, v] of mem) {
      if (now - v.at > SS_TTL) continue;
      obj[k] = v;
      if (++n >= 16) break;
    }
    sessionStorage.setItem(SS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export function newsCacheKey(county: string | null, seat?: string, market?: string) {
  return `${county ?? ""}|${seat ?? ""}|${market ?? ""}`;
}

export function readNewsCache(key: string): NewsItem[] | null {
  return mem.get(key)?.items ?? null;
}

export function newsCacheAge(key: string): number | null {
  const e = mem.get(key);
  return e ? Date.now() - e.at : null;
}

export function writeNewsCache(key: string, items: NewsItem[]) {
  mem.set(key, { items, at: Date.now() });
  persist();
}

function newsUrl(county: string | null, seat?: string, market?: string, fresh = false) {
  const params = new URLSearchParams();
  if (county) params.set("county", county);
  if (seat) params.set("seat", seat);
  if (market) params.set("market", market);
  if (fresh) params.set("fresh", "1");
  const qs = params.toString();
  return qs ? `/api/news?${qs}` : "/api/news";
}

function load(county: string | null, seat: string | undefined, market: string | undefined, fresh: boolean) {
  const key = newsCacheKey(county, seat, market);
  if (!fresh) {
    const hit = inflight.get(key);
    if (hit) return hit;
  }
  const p = fetch(newsUrl(county, seat, market, fresh))
    .then((r) => r.json())
    .then((d: { items?: NewsItem[] }) => {
      const items = d.items ?? [];
      writeNewsCache(key, items);
      return items;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export function prefetchNews(county: string | null, seat?: string, market?: string) {
  const key = newsCacheKey(county, seat, market);
  const age = newsCacheAge(key);
  if (age != null && age < 12_000) return;
  void load(county, seat, market, false);
}

export function fetchNews(county: string | null, seat?: string, market?: string, fresh = false) {
  return load(county, seat, market, fresh);
}
