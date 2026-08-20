import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import countiesJson from "@/data/counties.json";
import type {
  Alert,
  County,
  CrimeIncident,
  CrimeKind,
  CrimeLayers,
  ElectYear,
  GeoFeature,
  LayerId,
  Layers,
  Precinct,
  Race,
  TabId,
  WxNow,
} from "@/data/types";
import { COUNTY_XY } from "@/lib/county-xy";
import { centroid, countyFipsAt, geomLonLatBBox, nearestCountyName, type MapPin } from "@/lib/geo";
import { prefetchNews } from "@/lib/news-cache";
import { AddressSearch } from "./address-search";
import { CrimeShare, FeedPanel } from "./feed-panel";
import { LayerToggles } from "./layer-toggles";
import { MarketTicker } from "./market-ticker";
import { DebtClock } from "./debt-clock";
import { FinanceTicker } from "./finance-ticker";
import { TnMap } from "./tn-map";

const COUNTIES = countiesJson as County[];
const BY_FIPS = new Map(COUNTIES.map((c) => [c.fips, c]));

const DEFAULT_LAYERS: Layers = {
  interstates: true,
  weather: false,
  sites: false,
  flock: false,
  cameras: false,
  p24: false,
  p26: false,
};

const DEFAULT_CRIME: CrimeLayers = { hom: true, sht: true, reg: false };

const FALLBACK_WX: WxNow = { temp: 87, code: 2, label: "MEM · BNA · TYS", live: false };

async function loadWx(lat?: number, lon?: number): Promise<WxNow> {
  const q = lat != null && lon != null ? `?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}` : "";
  try {
    const res = await fetch(`/api/wx${q}`);
    if (!res.ok) return FALLBACK_WX;
    return (await res.json()) as WxNow;
  } catch {
    return FALLBACK_WX;
  }
}

export function GridApp() {
  const [selected, setSelected] = useState<County | null>(null);
  const [tab, setTab] = useState<TabId>("news");
  const [wx, setWx] = useState<WxNow | null>(null);
  const [geo, setGeo] = useState<GeoFeature[] | null>(null);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [precinct, setPrecinct] = useState<Precinct | null>(null);
  const [races, setRaces] = useState<Race[] | undefined>(undefined);
  const [briefs, setBriefs] = useState<Record<string, string>>({});
  const [crime, setCrime] = useState<CrimeIncident[]>([]);
  const [crimeLayers, setCrimeLayers] = useState<CrimeLayers>(DEFAULT_CRIME);
  const [expanded, setExpanded] = useState(false);
  const [pin, setPin] = useState<MapPin | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [focusCrimeId, setFocusCrimeId] = useState<string | null>(null);
  const [electYear, setElectYear] = useState<ElectYear>("2024");
  const crimeLoaded = useRef(false);

  useEffect(() => {
    fetch("/tn-counties.geojson")
      .then((r) => r.json())
      .then((d: { features: GeoFeature[] }) => setGeo(d.features))
      .catch(() => undefined);
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d: { alerts?: Alert[] }) => setAlerts(d.alerts ?? []))
      .catch(() => undefined);
    fetch("/tn-briefs.json")
      .then((r) => r.json())
      .then((d: Record<string, string>) => setBriefs(d))
      .catch(() => undefined);
    try {
      setExpanded(sessionStorage.getItem("grid-feed-expanded") === "1");
    } catch {
      /* ignore */
    }
    const idle = window.setTimeout(() => {
      prefetchNews(null);
    }, 2200);
    return () => window.clearTimeout(idle);
  }, []);

  useEffect(() => {
    if (tab !== "crime") return;
    let live = true;
    const merge = (next: CrimeIncident[]) => {
      if (!live || !next.length) return;
      setCrime((prev) => {
        if (!prev.length) return next;
        const have = new Set(prev.map((r) => r.id));
        const extra = next.filter((r) => !have.has(r.id));
        return extra.length ? prev.concat(extra) : prev;
      });
    };
    const loadSnap = () => {
      fetch("/crime-tn.json")
        .then((r) => r.json())
        .then((d: CrimeIncident[]) => {
          if (!live) return;
          crimeLoaded.current = true;
          merge(Array.isArray(d) ? d : []);
        })
        .catch(() => undefined);
    };
    const loadLive = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/crime-live", { signal: AbortSignal.timeout(1200) })
        .then((r) => r.json())
        .then((d: { incidents?: CrimeIncident[] }) => {
          if (live) merge(d.incidents ?? []);
        })
        .catch(() => undefined);
    };
    if (!crimeLoaded.current) {
      crimeLoaded.current = true;
      loadSnap();
    }
    const wait = window.setTimeout(loadLive, 900);
    const poll = window.setInterval(loadLive, 60 * 60_000);
    let waitR = 0;
    try {
      const last = Number(sessionStorage.getItem("grid-crime-refresh") || 0);
      if (Date.now() - last > 24 * 60 * 60_000) {
        waitR = window.setTimeout(() => {
          fetch("/api/crime-refresh", { signal: AbortSignal.timeout(8000) })
            .then((r) => r.json())
            .then(() => {
              try {
                sessionStorage.setItem("grid-crime-refresh", String(Date.now()));
              } catch {
                /* ignore */
              }
              if (live) loadLive();
            })
            .catch(() => undefined);
        }, 8000);
      }
    } catch {
      /* ignore */
    }
    const onVis = () => {
      if (document.visibilityState === "visible") loadLive();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      window.clearTimeout(wait);
      if (waitR) window.clearTimeout(waitR);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tab]);

  useEffect(() => {
    let live = true;
    if (!selected) {
      void loadWx().then((w) => {
        if (live) setWx(w);
      });
      return () => {
        live = false;
      };
    }
    const feat = geo?.find((f) => f.properties.fips === selected.fips);
    const pt = pin ?? (feat ? centroid(feat) : { lat: 36.16, lon: -86.78 });
    void loadWx(pt.lat, pt.lon).then((w) => {
      if (live) setWx(w);
    });
    return () => {
      live = false;
    };
  }, [selected, geo, pin]);

  function countyAt(lon: number, lat: number): County | null {
    if (geo) {
      const fips = countyFipsAt(lon, lat, geo);
      if (fips) return BY_FIPS.get(fips) ?? null;
      const hits: County[] = [];
      for (const f of geo) {
        const b = geomLonLatBBox(f.geometry);
        if (!b || lon < b.minX || lon > b.maxX || lat < b.minY || lat > b.maxY) continue;
        const c = BY_FIPS.get(f.properties.fips);
        if (c) hits.push(c);
      }
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) {
        let best = hits[0];
        let bd = Infinity;
        for (const c of hits) {
          const xy = COUNTY_XY[c.name];
          if (!xy) continue;
          const d = (xy[0] - lat) ** 2 + (xy[1] - lon) ** 2;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        return best;
      }
    }
    const name = nearestCountyName(lat, lon, COUNTY_XY);
    return COUNTIES.find((c) => c.name === name) ?? null;
  }

  function pickCounty(c: County) {
    if (pin) {
      const at = countyAt(pin.lon, pin.lat);
      if (at?.fips === c.fips) {
        setSelected(c);
        setPrecinct(null);
        setRaces(undefined);
        setFocusTick((n) => n + 1);
        prefetchNews(c.name, c.seat, c.market);
        return;
      }
    }
    setPin(null);
    setSelected(c);
    setTab((t) => (t === "crime" || t === "sit" || t === "vote" || t === "gov" ? t : "news"));
    setPrecinct(null);
    setRaces(undefined);
    prefetchNews(c.name, c.seat, c.market);
  }

  function goToPlace(hit: MapPin & { county?: string }) {
    const county = hit.county ? (COUNTIES.find((c) => c.name === hit.county) ?? null) : countyAt(hit.lon, hit.lat);
    setPin({ lat: hit.lat, lon: hit.lon, label: hit.label });
    setFocusTick((n) => n + 1);
    if (county) {
      setSelected(county);
      setPrecinct(null);
      setRaces(undefined);
      prefetchNews(county.name, county.seat, county.market);
    }
  }

  function goToIncident(c: CrimeIncident) {
    goToPlace({
      lat: c.lat,
      lon: c.lon,
      label: c.address || c.type,
      county: c.county,
    });
    setTab("crime");
    setFocusCrimeId(c.id);
  }

  function backToState() {
    setSelected(null);
    setPin(null);
    setPrecinct(null);
    setRaces(undefined);
    setTab((t) => (t === "crime" ? "crime" : "news"));
  }

  function clearPin() {
    setPin(null);
    setFocusCrimeId(null);
    setFocusTick((n) => n + 1);
  }

  function pickPrecinct(p: Precinct, next?: Race[]) {
    setPrecinct(p);
    setRaces(next);
    setElectYear("2024");
    setTab("vote");
    setLayers((prev) => ({ ...prev, p24: true, p26: false }));
  }

  function handleTab(t: TabId) {
    if (t === "crime") setCrimeLayers(DEFAULT_CRIME);
    setLayers((prev) => {
      if (t === "vote") {
        return { ...prev, p24: electYear === "2024", p26: electYear === "2026" };
      }
      if (prev.p24 || prev.p26) return { ...prev, p24: false, p26: false };
      return prev;
    });
    setTab(t);
  }

  function handleElectYear(y: ElectYear) {
    setElectYear(y);
    setLayers((prev) => ({ ...prev, p24: y === "2024", p26: y === "2026" }));
    if (y === "2026") {
      setPrecinct(null);
      setRaces(undefined);
    }
  }

  function toggleCrime(kind: CrimeKind) {
    setCrimeLayers((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  function toggle(id: LayerId) {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleFeed() {
    setExpanded((v) => {
      const next = !v;
      try {
        sessionStorage.setItem("grid-feed-expanded", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg text-fg">
      <header className="shrink-0 py-3 pr-2 pl-4 sm:pr-3 sm:pl-6">
        <div className="flex items-start justify-between gap-3">
        <div>
          {selected ? (
            <button
              type="button"
              onClick={backToState}
              className="flex h-11 items-center gap-2 text-fg hover:opacity-80"
              aria-label="Back to state"
            >
              <ArrowLeft className="size-5" />
              <span className="font-display text-3xl leading-none font-semibold tracking-wide uppercase">
                {selected.name}
              </span>
            </button>
          ) : (
            <div className="flex h-11 items-center gap-3">
              <span className="grid grid-cols-2 gap-px" aria-hidden="true">
                <span className="size-1.5 bg-grid shadow-glow" />
                <span className="size-1.5 bg-grid/40" />
                <span className="size-1.5 bg-grid/40" />
                <span className="size-1.5 bg-grid shadow-glow" />
              </span>
              <h1 className="font-display text-3xl leading-none font-semibold tracking-[0.18em]">
                GRID
              </h1>
            </div>
          )}
          <p className="font-mono text-xs tracking-widest text-faint uppercase">
            {selected ? `${selected.seat} · ${selected.division}` : "Tennessee"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end text-right">
          {wx ? (
            <>
              <div className="font-display text-4xl leading-none tabular">{wx.temp}°</div>
              <div className="mt-0.5 font-mono text-xs tracking-widest text-faint uppercase">
                {wx.label}
              </div>
            </>
          ) : (
            <div className="h-10 w-16 animate-pulse bg-elevated/80" />
          )}
          <div className={selected ? "hidden w-[15.5rem]" : "w-[15.5rem]"}>
            <MarketTicker active={!selected} />
            <DebtClock />
            <FinanceTicker active={!selected} />
          </div>
        </div>
        </div>
        <div className="mt-2">
          <AddressSearch pin={pin} onGo={goToPlace} onClear={clearPin} />
        </div>
      </header>
      <div className="shrink-0 px-2 pb-1 sm:px-3">
        {expanded ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleFeed}
              aria-expanded="true"
              aria-label="Minimize panel"
              title="Minimize"
              className="grid size-11 place-items-center border border-line bg-elevated text-grid hover:border-grid"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        ) : null}
        <LayerToggles layers={layers} onToggle={toggle} />
      </div>
      <div className="relative min-h-0 flex-1">
        <TnMap
          geo={geo}
          selected={selected}
          onSelect={pickCounty}
          onPickPrecinct={pickPrecinct}
          pickedId={precinct?.id ?? null}
          layers={layers}
          alerts={alerts}
          crime={crime}
          showCrime={tab === "crime"}
          crimeLayers={crimeLayers}
          onToggleCrime={toggleCrime}
          showSor={tab === "crime" && crimeLayers.reg}
          pin={pin}
          onClearPin={clearPin}
          focusTick={focusTick}
          focusCrimeId={focusCrimeId}
        />
      </div>
      {selected && tab === "crime" ? (
        <CrimeShare county={selected} incidents={crime} layers={crimeLayers} />
      ) : null}
      <FeedPanel
        county={selected}
        tab={tab}
        onTab={handleTab}
        alerts={alerts}
        precinct={precinct}
        races={races}
        briefs={briefs}
        expanded={expanded}
        onToggleExpand={toggleFeed}
        crime={crime}
        crimeLayers={crimeLayers}
        onToggleCrime={toggleCrime}
        onPickCrime={goToIncident}
        electYear={electYear}
        onElectYear={handleElectYear}
      />
    </div>
  );
}
