import { useEffect, useRef, useState } from "react";
import type { FinanceHeadline } from "@/data/types";

const ROW = 42;
const VISIBLE = 1;
const SPEED = 0.0048;

export function FinanceTicker({ active = true }: { active?: boolean }) {
  const [items, setItems] = useState<FinanceHeadline[]>([]);
  const paused = useRef(false);
  const drag = useRef<{ y: number; off: number } | null>(null);
  const offRef = useRef(0);
  const tapeRef = useRef<HTMLUListElement>(null);
  const resume = useRef<number | null>(null);

  function applyOff(n: number) {
    offRef.current = n;
    if (tapeRef.current) tapeRef.current.style.transform = `translateY(${-n}px)`;
  }

  function hold() {
    paused.current = true;
    if (resume.current) window.clearTimeout(resume.current);
  }

  function release() {
    if (resume.current) window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => {
      if (!drag.current) paused.current = false;
    }, 900);
  }

  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/finance-news")
        .then((r) => r.json())
        .then((d: { items?: FinanceHeadline[] }) => {
          if (live) setItems(d.items ?? []);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 180_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!active || items.length < 2) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.visibilityState === "hidden") {
        last = now;
        return;
      }
      const dt = Math.min(48, now - last);
      last = now;
      if (!paused.current) {
        const loop = items.length * ROW;
        let n = offRef.current + dt * SPEED;
        if (n >= loop) n -= loop;
        applyOff(n);
      }
    };
    applyOff(offRef.current);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items.length, active]);

  if (!items.length) {
    return <div className="mt-1.5 h-10 w-full animate-pulse bg-elevated/80" />;
  }

  const loop = items.length * ROW;
  const tape = [...items, ...items, ...items];

  return (
    <div
      className="mt-1.5 w-full cursor-grab touch-none select-none overflow-hidden text-right active:cursor-grabbing"
      style={{ height: ROW * VISIBLE }}
      title="Financial headlines — drag or scroll to pause"
      onPointerDown={(e) => {
        hold();
        drag.current = { y: e.clientY, off: offRef.current };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        let next = drag.current.off - (e.clientY - drag.current.y);
        next = ((next % loop) + loop) % loop;
        applyOff(next);
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
        applyOff((() => {
          let n = offRef.current + e.deltaY * 0.4;
          n = ((n % loop) + loop) % loop;
          return n;
        })());
        release();
      }}
    >
      <ul ref={tapeRef} style={{ transform: `translateY(-${offRef.current}px)` }}>
        {tape.map((it, i) => (
          <li key={`${it.id}-${i}`} className="box-border" style={{ height: ROW }}>
            <a
              href={it.href}
              target="_blank"
              rel="noreferrer"
              className="block h-full overflow-hidden pt-0.5 font-mono text-[10px] leading-[1.3] text-muted hover:text-fg"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="line-clamp-3 text-right">
                <span className="text-faint uppercase">{it.source} </span>
                {it.headline}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
