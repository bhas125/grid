import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type {
  Alert,
  County,
  CrimeIncident,
  CrimeKind,
  CrimeLayers,
  GeoFeature,
  LayerId,
  Layers,
  Precinct,
  Race,
  TabId,
  WxNow,
} from "@/data/types";
import { centroid } from "@/lib/geo";
import { prefetchNews } from "@/lib/news-cache";
import { CrimeShare, FeedPanel } from "./feed-panel";
import { LayerToggles } from "./layer-toggles";
import { MarketTicker } from "./market-ticker";
import { TnMap } from "./tn-map";

const DEFAULT_LAYERS: Layers = {
  interstates: true,
  weather: false,
  sites: false,
  flock: false,
  p24: false,
  p26: false,
};

const DEFAULT_CRIME: CrimeLayers = { hom: true, sht: true };

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
      prefetchNews("Shelby", "Memphis", "Memphis");
      prefetchNews("Davidson", "Nashville", "Nashville");
      prefetchNews("Knox", "Knoxville", "Knoxville");
      prefetchNews("Hamilton", "Chattanooga", "Chattanooga");
    }, 700);
    return () => window.clearTimeout(idle);
  }, []);

  useEffect(() => {
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
    const wait = window.setTimeout(() => {
      fetch("/crime-tn.json")
        .then((r) => r.json())
        .then((d: CrimeIncident[]) => {
          if (live) merge(Array.isArray(d) ? d : []);
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(wait);
    };
  }, []);

  useEffect(() => {
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
    const loadLive = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/crime-live", { signal: AbortSignal.timeout(1200) })
        .then((r) => r.json())
        .then((d: { incidents?: CrimeIncident[] }) => {
          if (live) merge(d.incidents ?? []);
        })
        .catch(() => undefined);
    };
    const wait = window.setTimeout(loadLive, 1800);
    const poll = window.setInterval(loadLive, 60 * 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") loadLive();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      window.clearTimeout(wait);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

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
    const pt = feat ? centroid(feat) : { lat: 36.16, lon: -86.78 };
    void loadWx(pt.lat, pt.lon).then((w) => {
      if (live) setWx(w);
    });
    return () => {
      live = false;
    };
  }, [selected, geo]);

  function pickCounty(c: County) {
    setSelected(c);
    setTab((t) => (t === "crime" ? "crime" : "news"));
    setPrecinct(null);
    setRaces(undefined);
    prefetchNews(c.name, c.seat, c.market);
  }

  function backToState() {
    setSelected(null);
    setPrecinct(null);
    setRaces(undefined);
    setTab((t) => (t === "crime" ? "crime" : "news"));
  }

  function pickPrecinct(p: Precinct, next?: Race[]) {
    setPrecinct(p);
    setRaces(next);
    setTab("vote");
  }

  function handleTab(t: TabId) {
    if (t === "crime") setCrimeLayers(DEFAULT_CRIME);
    setTab(t);
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
      <header className="flex shrink-0 items-start justify-between px-4 py-3 sm:px-6">
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
        <div className="flex flex-col items-end text-right">
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
          <MarketTicker />
        </div>
      </header>
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
        />
        <div
          className={
            selected
              ? "absolute top-2 right-2 z-10 max-w-[11rem]"
              : "absolute right-2 bottom-2 left-2 z-10 sm:right-3 sm:left-auto"
          }
        >
          <LayerToggles layers={layers} onToggle={toggle} zoomed={!!selected} />
        </div>
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
      />
    </div>
  );
}
