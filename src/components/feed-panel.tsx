import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Radio } from "lucide-react";
import { countyIntel, sitProfile, sitShape } from "@/data/intel";
import officialsJson from "@/data/officials.json";
import type { Alert, County, CrimeIncident, CrimeKind, CrimeLayers, NewsItem, Precinct, Race, TabId } from "@/data/types";
import { cn, fmtAge, fmtMargin, fmtNum, fmtPct } from "@/lib/utils";
import { newsCacheAge, newsCacheKey, fetchNews, readNewsCache } from "@/lib/news-cache";

const TABS: { id: TabId; label: string }[] = [
  { id: "news", label: "News" },
  { id: "sit", label: "Sit" },
  { id: "vote", label: "Vote" },
  { id: "gov", label: "Gov" },
  { id: "crime", label: "Crime" },
];

const OFFICIALS = officialsJson as Record<string, { office: string; name: string }[]>;
const PAGE = 12;

const SOURCE_LABEL: Record<string, string> = {
  Memphis_MPD: "Memphis MPD",
  Nashville_MNPD: "Nashville MNPD",
  Chattanooga_CPD: "Chattanooga CPD",
  GVA: "Gun Violence Archive",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtCrimeDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!month || !d) return iso;
  return `${month} ${Number(d)} ${y}`;
}

function isHomicide(type: string) {
  return type === "Homicide";
}

function isShooting(type: string) {
  const t = type.toLowerCase();
  return t.includes("shooting") || t.includes("aggravated");
}

function kindOf(type: string): CrimeKind | null {
  if (isHomicide(type)) return "hom";
  if (isShooting(type)) return "sht";
  return null;
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 border border-line bg-surface px-2">
      <span className="font-mono text-xs tracking-wide text-faint uppercase">{k}</span>
      <span className="font-mono text-xs text-fg">{v}</span>
    </span>
  );
}

function NewsFeed({
  county,
  seat,
  market,
  extra,
}: {
  county: string | null;
  seat?: string;
  market?: string;
  extra: NewsItem[];
}) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [status, setStatus] = useState<"load" | "ok" | "err">("load");
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const key = newsCacheKey(county, seat, market);
    const cached = readNewsCache(key);
    if (cached?.length) {
      setItems(cached);
      setStatus("ok");
    } else {
      setStatus("load");
    }
    setShown(PAGE);
    const age = newsCacheAge(key);
    const fresh = age == null || age > 15_000;
    fetchNews(county, seat, market, fresh)
      .then((next) => {
        if (!live) return;
        setItems(next);
        setStatus("ok");
      })
      .catch(() => {
        if (live && !cached?.length) setStatus("err");
      });
    return () => {
      live = false;
    };
  }, [county, seat, market]);

  const merged = useMemo(() => {
    const all = [...extra, ...items];
    const seen = new Set<string>();
    const out: NewsItem[] = [];
    for (const it of all) {
      if (seen.has(it.headline)) continue;
      seen.add(it.headline);
      if (county && it.county && it.county !== county) continue;
      out.push(it);
    }
    return out;
  }, [items, extra, county]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setShown((n) => Math.min(merged.length, n + PAGE));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [merged.length]);

  const visible = merged.slice(0, shown);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {status === "load" && !visible.length ? (
        <p className="px-4 py-3 font-mono text-xs tracking-widest text-faint uppercase">
          Loading feed
        </p>
      ) : null}
      {status === "err" ? (
        <p className="px-4 py-3 text-sm text-muted">News feed unavailable.</p>
      ) : null}
      <ul>
        {visible.map((it, i) => (
          <li key={`${it.id}-${it.href}-${i}`} className="border-t border-line">
            <a
              href={it.href}
              target="_blank"
              rel="noreferrer"
              className="block px-4 py-2.5 hover:bg-elevated"
            >
              <div className="flex items-center gap-2 font-mono text-xs tracking-wide text-faint uppercase">
                <span>{it.source}</span>
                {it.county ? <span>· {it.county}</span> : null}
                <span className="ml-auto">{fmtAge(it.published)}</span>
              </div>
              <div className="mt-0.5 text-sm leading-snug">{it.headline}</div>
            </a>
          </li>
        ))}
      </ul>
      {status === "ok" && merged.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No sourced items.</p>
      ) : null}
      <div ref={sentinel} className="h-4" />
    </div>
  );
}

function CrimeFeed({
  county,
  incidents,
  crimeLayers,
}: {
  county: County | null;
  incidents: CrimeIncident[];
  crimeLayers: CrimeLayers;
}) {
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const intel = county ? countyIntel(county.name) : null;

  const scoped = useMemo(() => {
    return county ? incidents.filter((i) => i.county === county.name) : incidents;
  }, [incidents, county]);

  const list = useMemo(() => {
    const rows = scoped.filter((i) => {
      const k = kindOf(i.type);
      return k ? crimeLayers[k] : false;
    });
    return [...rows].sort((a, b) => {
      const da = a.date ?? "";
      const db = b.date ?? "";
      if (da !== db) return db.localeCompare(da);
      const ha = isHomicide(a.type) ? 0 : 1;
      const hb = isHomicide(b.type) ? 0 : 1;
      return ha - hb;
    });
  }, [scoped, crimeLayers]);

  const stats = useMemo(() => {
    let hom = 0;
    let sht = 0;
    for (const i of scoped) {
      if (isHomicide(i.type)) hom += 1;
      else if (isShooting(i.type)) sht += 1;
    }
    return { hom, sht, n: hom + sht };
  }, [scoped]);

  useEffect(() => {
    setShown(PAGE);
  }, [county?.name, incidents.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setShown((n) => Math.min(list.length, n + PAGE));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length]);

  const visible = list.slice(0, shown);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap gap-2 px-4 pb-2">
        <Stat k="2026" v={`${fmtNum(stats.n)} pts`} />
        <Stat k="Hom" v={fmtNum(stats.hom)} />
        <Stat k="Sht" v={fmtNum(stats.sht)} />
      </div>
      <p className="px-4 pb-2 font-mono text-xs leading-relaxed tracking-wide text-muted">
        {county
          ? (intel?.crimeNote ?? `${county.name} · 2026 homicide / shooting points.`)
          : "2026 homicide / shooting points. Official Memphis, Nashville, and Chattanooga records plus Gun Violence Archive (through June 30) for the rest of the state. Hover a spot for type, date, address, and ZIP."}
      </p>
      {!incidents.length ? (
        <p className="px-4 py-3 font-mono text-xs tracking-widest text-faint uppercase">
          Loading incidents
        </p>
      ) : null}
      <ul>
        {visible.map((it) => (
          <li key={it.id} className="border-t border-line px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-xs tracking-wide uppercase">
              <span className={isHomicide(it.type) ? "text-hot" : "text-watch"}>{it.type}</span>
              <span className="ml-auto text-faint">{fmtCrimeDate(it.date)}</span>
            </div>
            <div className="mt-0.5 text-sm leading-snug">{it.address}</div>
            <div className="mt-0.5 font-mono text-xs tracking-wide text-faint uppercase">
              {it.city}
              {it.county ? ` · ${it.county}` : ""}
              {it.zip ? ` · ${it.zip}` : ""}
              {" · "}
              {SOURCE_LABEL[it.source] ?? it.source}
            </div>
          </li>
        ))}
      </ul>
      {incidents.length > 0 && list.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">
          No 2026 homicide / shooting points in this county yet. Official city feeds cover
          Memphis, Nashville, and Chattanooga; statewide GVA coverage runs through June 30.
        </p>
      ) : null}
      <div ref={sentinel} className="h-4" />
    </div>
  );
}

function VotePrecinct({
  name,
  races,
  fallback,
}: {
  name: string;
  races?: Race[];
  fallback: Precinct;
}) {
  const other = Math.max(0, fallback.t - fallback.d - fallback.r);
  const list: Race[] =
    races && races.length
      ? races
      : [
          {
            o: "President",
            d: "",
            c: [
              { n: "Donald Trump", p: "REP", v: fallback.r },
              { n: "Kamala Harris", p: "DEM", v: fallback.d },
              ...(other ? [{ n: "Other", p: "", v: other }] : []),
            ],
          },
        ];
  return (
    <div className="space-y-2 overflow-y-auto px-4 pb-3">
      <p className="font-mono text-xs tracking-widest text-grid uppercase">
        Precinct {name} · 2024
      </p>
      {list.map((race) => {
        const tot = race.c.reduce((s, c) => s + c.v, 0) || 1;
        const label = race.d && race.d !== "NA" ? `${race.o} ${race.d}` : race.o;
        return (
          <div key={`${race.o}-${race.d}`} className="border-t border-line pt-1.5">
            <div className="font-mono text-xs tracking-wide text-muted uppercase">{label}</div>
            <ul className="mt-0.5 space-y-0.5">
              {race.c.map((c) => (
                <li key={c.n} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    {c.n}
                    {c.p ? <span className="ml-1 font-mono text-xs text-faint">{c.p}</span> : null}
                  </span>
                  <span className="font-mono text-xs tabular">
                    {c.v.toLocaleString()} · {Math.round((c.v / tot) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function CrimeShare({
  county,
  incidents,
  layers,
}: {
  county: County;
  incidents: CrimeIncident[];
  layers: CrimeLayers;
}) {
  const share = useMemo(() => {
    let stateHom = 0;
    let stateSht = 0;
    let ctyHom = 0;
    let ctySht = 0;
    for (const i of incidents) {
      if (isHomicide(i.type)) {
        stateHom += 1;
        if (i.county === county.name) ctyHom += 1;
      } else if (isShooting(i.type)) {
        stateSht += 1;
        if (i.county === county.name) ctySht += 1;
      }
    }
    const useHom = layers.hom;
    const useSht = layers.sht;
    const num = (useHom ? ctyHom : 0) + (useSht ? ctySht : 0);
    const den = (useHom ? stateHom : 0) + (useSht ? stateSht : 0);
    const label =
      useHom && useSht ? "homicides + shootings" : useHom ? "homicides" : "shootings";
    return {
      num,
      den,
      pct: den ? (num / den) * 100 : 0,
      label,
      useHom,
      useSht,
    };
  }, [incidents, county.name, layers]);

  if (!layers.hom && !layers.sht) return null;
  if (!incidents.length || share.den === 0) return null;

  const big = share.pct >= 10 ? share.pct.toFixed(0) : share.pct.toFixed(1);
  const bar = share.useHom && !share.useSht ? "bg-hot" : share.useSht && !share.useHom ? "bg-watch" : "bg-hot";

  return (
    <div className="shrink-0 border-t border-line bg-elevated px-4 py-2.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className={cn("font-display text-3xl leading-none tabular", share.useHom ? "text-hot" : "text-watch")}>
            {big}%
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-widest text-muted uppercase">
            of Tennessee {share.label}
          </div>
        </div>
        <div className="text-right font-mono text-[10px] tracking-widest text-faint uppercase">
          {county.name}
          <div className="mt-0.5 text-muted">
            {fmtNum(share.num)} of {fmtNum(share.den)} · 2026
          </div>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden bg-bg">
        <div className={cn("h-full", bar)} style={{ width: `${Math.min(100, share.pct)}%` }} />
      </div>
    </div>
  );
}

export function FeedPanel({
  county,
  tab,
  onTab,
  alerts,
  precinct,
  races,
  briefs,
  expanded,
  onToggleExpand,
  crime,
  crimeLayers,
  onToggleCrime,
}: {
  county: County | null;
  tab: TabId;
  onTab: (t: TabId) => void;
  alerts: Alert[];
  precinct: Precinct | null;
  races?: Race[];
  briefs: Record<string, string>;
  expanded: boolean;
  onToggleExpand: () => void;
  crime: CrimeIncident[];
  crimeLayers: CrimeLayers;
  onToggleCrime: (kind: CrimeKind) => void;
}) {
  const intel = county ? countyIntel(county.name) : null;
  const extra: NewsItem[] = (county ? alerts.filter((a) => a.counties.includes(county.name)) : alerts).map(
    (a) => ({
      id: a.id,
      kind: "official" as const,
      source: "NWS",
      headline: a.headline,
      href: a.href,
      county: county?.name,
      published: new Date().toUTCString(),
      ongoing: true,
    }),
  );
  const roster = county ? (OFFICIALS[county.name] ?? []) : [];
  const brief = county ? briefs[county.name] : undefined;

  return (
    <section
      className={cn(
        "flex shrink-0 flex-col border-t border-line bg-bg-2 transition-[max-height,height] duration-200",
        expanded ? "h-[75dvh] max-h-[75dvh]" : "max-h-44 sm:max-h-52",
      )}
    >
      <div className="flex items-center gap-1 px-3">
        {TABS.map((t) => {
          if (t.id !== "news" && t.id !== "crime" && !county) return null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={cn(
                "h-8 min-w-12 px-2 font-mono text-xs tracking-widest uppercase",
                tab === t.id ? "text-grid" : "text-faint hover:text-muted",
              )}
            >
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? "Minimize news" : "Enlarge news"}
          title={expanded ? "Minimize" : "Enlarge"}
          className="ml-auto grid size-9 place-items-center border border-line bg-elevated text-grid hover:border-grid"
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      </div>
      {tab === "crime" ? (
        <div className="flex items-center gap-1 px-3 pb-1">
          {(
            [
              { id: "hom" as const, label: "Hom" },
              { id: "sht" as const, label: "Sht" },
            ] as const
          ).map((item) => {
            const on = crimeLayers[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggleCrime(item.id)}
                aria-pressed={on}
                className={cn(
                  "h-6 border px-2 font-mono text-[10px] tracking-widest uppercase",
                  on ? "border-grid bg-grid/15 text-grid" : "border-line text-faint hover:text-muted",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className={tab === "news" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <NewsFeed
          county={county?.name ?? null}
          seat={county?.seat}
          market={county?.market}
          extra={extra}
        />
      </div>
      <div className={tab === "crime" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <CrimeFeed county={county} incidents={crime} crimeLayers={crimeLayers} />
      </div>
      {tab === "sit" && county && intel ? (
        <div className="space-y-2 overflow-y-auto px-4 pb-3">
          <div className="flex flex-wrap gap-2">
            <Stat k="People" v={fmtNum(county.pop)} />
            <Stat k="Since 2020" v={`${county.growth > 0 ? "+" : ""}${county.growth}%`} />
            {intel.dcOperating + intel.dcProposed ? (
              <Stat k="Data centers" v={`${intel.dcOperating} / ${intel.dcProposed}`} />
            ) : null}
            {intel.scanner ? (
              <a
                href={intel.scanner.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1.5 border border-line px-2 font-mono text-xs tracking-wide text-grid uppercase"
              >
                <Radio className="size-3" />
                Scanner
              </a>
            ) : null}
          </div>
          <p className="text-sm leading-snug text-fg/90">
            {brief ?? `${sitShape(county)} ${sitProfile(county)}`}
          </p>
        </div>
      ) : null}
      {tab === "vote" && county ? (
        precinct ? (
          <VotePrecinct name={precinct.name} races={races} fallback={precinct} />
        ) : (
          <div className="space-y-2 overflow-y-auto px-4 pb-3">
            <div className="flex h-1 overflow-hidden bg-bg">
              <div className="bg-gop" style={{ width: `${county.trumpPct}%` }} />
              <div className="bg-dem" style={{ width: `${county.harrisPct}%` }} />
            </div>
            <p className="font-mono text-xs text-muted">
              2024 · Trump {fmtPct(county.trumpPct)} · Harris {fmtPct(county.harrisPct)} ·{" "}
              {fmtMargin(county.margin)}
            </p>
            <p className="text-sm text-fg/90">
              <span className="font-mono text-xs text-hot uppercase">Aug 6 2026 · </span>
              {county.aug6
                ? county.aug6.note
                : "County general / state primary. No precinct GIS published for this cycle — turn on ’24 and click a precinct for 2024 race tallies through State House."}
            </p>
            {county.aug6?.offices?.length ? (
              <p className="font-mono text-xs text-muted">
                Offices in play: {county.aug6.offices.join(" · ")}
              </p>
            ) : null}
          </div>
        )
      ) : null}
      {tab === "gov" && county ? (
        <div className="overflow-y-auto px-4 pb-3">
          {roster.length ? (
            <ul>
              {roster.map((row) => (
                <li
                  key={`${row.office}-${row.name}`}
                  className="flex items-baseline justify-between gap-3 border-t border-line py-1 text-sm"
                >
                  <span className="font-mono text-xs tracking-wide text-muted uppercase">
                    {row.office}
                  </span>
                  <span>{row.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">CTAS directory has no roster for this county.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
