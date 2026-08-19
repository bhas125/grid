import type { NewsItem } from "@/data/types";

type Entry = { items: NewsItem[]; at: number };

const mem = new Map<string, Entry>();

export function newsCacheKey(county: string | null, seat?: string) {
  return `${county ?? ""}|${seat ?? ""}`;
}

export function readNewsCache(key: string): NewsItem[] | null {
  return mem.get(key)?.items ?? null;
}

export function writeNewsCache(key: string, items: NewsItem[]) {
  mem.set(key, { items, at: Date.now() });
}
