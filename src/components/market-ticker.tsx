import { useEffect, useRef, useState } from "react";
import { cn, fmtChange, fmtQuote } from "@/lib/utils";
import type { MarketQuote } from "@/data/types";

const ROW = 18;
const VISIBLE = 2;

export function MarketTicker() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [off, setOff] = useState(0);
  const paused = useRef(false);
  const drag = useRef<{ y: number; off: number } | null>(null);
  const offRef = useRef(0);
  const resume = useRef<number | null>(null);
  offRef.current = off;

  function hold() {
    paused.current = true;
    if (resume.current) window.clearTimeout(resume.current);
  }

  function release() {
    if (resume.current) window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => {
      if (!drag.current) paused.current = false;
    }, 700);
  }

  useEffect(() => {
    let live = true;
    const load = () => {
      fetch("/api/markets")
        .then((r) => r.json())
        .then((d: { quotes?: MarketQuote[] }) => {
          if (live) setQuotes(d.quotes ?? []);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (quotes.length < 2) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused.current) {
        const loop = quotes.length * ROW;
        setOff((v) => {
          const n = v + dt * 0.016;
          return n >= loop ? n - loop : n;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [quotes.length]);

  if (!quotes.length) {
    return <div className="mt-2 h-9 w-44 animate-pulse bg-elevated/80" />;
  }

  const loop = quotes.length * ROW;
  const tape = [...quotes, ...quotes, ...quotes];

  return (
    <div
      className="mt-2 w-44 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
      style={{ height: ROW * VISIBLE }}
      title="Drag or scroll to pause"
      onPointerDown={(e) => {
        hold();
        drag.current = { y: e.clientY, off: offRef.current };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        let next = drag.current.off - (e.clientY - drag.current.y);
        next = ((next % loop) + loop) % loop;
        setOff(next);
      }}
      onPointerUp={() => {
        drag.current = null;
        release();
      }}
      onPointerCancel={() => {
        drag.current = null;
        release();
      }}
      onWheel={(e) => {
        e.preventDefault();
        hold();
        setOff((v) => {
          let n = v + e.deltaY * 0.4;
          n = ((n % loop) + loop) % loop;
          return n;
        });
        release();
      }}
    >
      <ul style={{ transform: `translateY(-${off}px)` }}>
        {tape.map((q, i) => {
          const up = q.change >= 0;
          return (
            <li
              key={`${q.id}-${i}`}
              className={cn(
                "flex items-center justify-end gap-1.5 font-mono text-xs tabular tracking-wide",
                up ? "text-flow" : "text-hot",
              )}
              style={{ height: ROW }}
            >
              <span className="text-faint">{q.label}</span>
              <span>{fmtQuote(q.value, q.digits, q.suffix)}</span>
              <span>{fmtChange(q.change, q.digits, q.suffix)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
