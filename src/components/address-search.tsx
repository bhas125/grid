import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapPin } from "@/lib/geo";

type Hit = MapPin & { county?: string };
const IDLE_MS = 10_000;

export function AddressSearch({
  onGo,
  onClear,
  pin,
}: {
  onGo: (hit: Hit) => void;
  onClear: () => void;
  pin: MapPin | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "load" | "miss">("idle");
  const box = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const idle = useRef<number | null>(null);

  function stopIdle() {
    if (idle.current) {
      window.clearTimeout(idle.current);
      idle.current = null;
    }
  }

  function bumpIdle() {
    stopIdle();
    idle.current = window.setTimeout(() => {
      setExpanded(false);
      setOpen(false);
      setHits([]);
      setStatus("idle");
    }, IDLE_MS);
  }

  function collapse(clear: boolean) {
    stopIdle();
    setExpanded(false);
    setOpen(false);
    setHits([]);
    setStatus("idle");
    if (clear) {
      setQ("");
      onClear();
    }
  }

  useEffect(() => {
    if (!expanded) {
      stopIdle();
      return;
    }
    bumpIdle();
    input.current?.focus();
    return stopIdle;
  }, [expanded]);

  async function run(value: string) {
    const query = value.trim();
    if (query.length < 2) return;
    bumpIdle();
    setStatus("load");
    setOpen(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(7000),
      });
      const d = (await res.json()) as { hits?: Hit[] };
      const next = d.hits ?? [];
      setHits(next);
      setStatus(next.length ? "idle" : "miss");
      if (next.length === 1) {
        onGo(next[0]);
        setQ(next[0].label.split(",")[0] ?? next[0].label);
        setOpen(false);
        bumpIdle();
      }
    } catch {
      setHits([]);
      setStatus("miss");
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label={pin ? `Search · ${pin.label.split(",")[0]}` : "Search address"}
        onClick={() => setExpanded(true)}
        className="grid size-11 place-items-center border border-line bg-elevated text-grid hover:border-grid"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    <form
      ref={box}
      className="relative w-[min(100%,20rem)]"
      onSubmit={(e) => {
        e.preventDefault();
        void run(q);
      }}
      onPointerDown={bumpIdle}
      onKeyDown={bumpIdle}
    >
      <label className="sr-only" htmlFor="grid-address">
        Search address
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={input}
        id="grid-address"
        type="search"
        enterKeyHint="search"
        value={q}
        placeholder="Address or county"
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setStatus("idle");
          bumpIdle();
          if (!e.target.value) {
            setHits([]);
            setOpen(false);
          }
        }}
        onFocus={() => {
          bumpIdle();
          if (hits.length) setOpen(true);
        }}
        className="h-11 w-full border border-line bg-elevated pr-10 pl-8 font-mono text-xs tracking-wide text-fg placeholder:text-faint focus:border-grid focus:outline-none"
      />
      <button
        type="button"
        aria-label="Close search"
        onClick={() => collapse(true)}
        className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center text-faint hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
      {open ? (
        <ul className="absolute top-full right-0 left-0 z-40 mt-px max-h-56 overflow-y-auto border border-line bg-elevated shadow-glow">
          {status === "load" ? (
            <li className="px-3 py-2 font-mono text-[10px] tracking-widest text-faint uppercase">Looking up</li>
          ) : null}
          {status === "miss" ? (
            <li className="px-3 py-2 font-mono text-[10px] tracking-widest text-faint uppercase">No Tennessee match</li>
          ) : null}
          {hits.map((h) => (
            <li key={`${h.label}-${h.lat}`}>
              <button
                type="button"
                onClick={() => {
                  onGo(h);
                  setQ(h.label.split(",")[0] ?? h.label);
                  setOpen(false);
                  bumpIdle();
                }}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm leading-snug hover:bg-grid/10",
                  "font-mono text-xs tracking-wide text-muted",
                )}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
