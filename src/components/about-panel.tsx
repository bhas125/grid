import { useEffect, useState } from "react";
import type { AboutSection, County, CountyAbout } from "@/data/types";
import { countyIntel, sitProfile, sitShape } from "@/data/intel";
import { fmtNum } from "@/lib/utils";

const mem = new Map<string, CountyAbout>();

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 border border-line bg-surface px-2">
      <span className="font-mono text-xs tracking-wide text-faint uppercase">{k}</span>
      <span className="font-mono text-xs text-fg">{v}</span>
    </span>
  );
}

function Block({ section }: { section: AboutSection }) {
  return (
    <div className="border-t border-line pt-2">
      <div className="font-mono text-[10px] tracking-widest text-grid uppercase">{section.title}</div>
      {section.body ? <p className="mt-1 text-sm leading-snug text-fg/90">{section.body}</p> : null}
      {section.items?.length ? (
        <ul className="mt-1 space-y-1">
          {section.items.map((it) => (
            <li key={it} className="text-sm leading-snug text-fg/90">
              {it}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AboutPanel({
  county,
  brief,
  active,
}: {
  county: County;
  brief?: string;
  active: boolean;
}) {
  const intel = countyIntel(county.name);
  const [about, setAbout] = useState<CountyAbout | null>(() => mem.get(county.name) ?? null);
  const [status, setStatus] = useState<"load" | "ok" | "err">(mem.has(county.name) ? "ok" : "load");

  useEffect(() => {
    if (!active) return;
    const hit = mem.get(county.name);
    if (hit) {
      setAbout(hit);
      setStatus("ok");
      return;
    }
    let live = true;
    setAbout(null);
    setStatus("load");
    fetch(
      `/api/county-about?name=${encodeURIComponent(county.name)}&seat=${encodeURIComponent(county.seat)}`,
      { signal: AbortSignal.timeout(9000) },
    )
      .then((r) => r.json())
      .then((d: CountyAbout) => {
        if (!live) return;
        if (d?.lede || d?.sections?.length) {
          mem.set(county.name, d);
          setAbout(d);
          setStatus("ok");
        } else {
          setStatus("err");
        }
      })
      .catch(() => {
        if (live) setStatus("err");
      });
    return () => {
      live = false;
    };
  }, [active, county.name, county.seat]);

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-3">
      <div className="flex flex-wrap gap-2">
        <Stat k="People" v={fmtNum(county.pop)} />
        <Stat k="Since 2020" v={`${county.growth > 0 ? "+" : ""}${county.growth}%`} />
        {intel.dcOperating + intel.dcProposed ? (
          <Stat k="Data centers" v={`${intel.dcOperating} / ${intel.dcProposed}`} />
        ) : null}
      </div>
      {status === "load" && !about ? (
        <p className="font-mono text-xs tracking-widest text-faint uppercase">Pulling county notes</p>
      ) : null}
      {about?.lede ? <p className="text-sm leading-snug text-fg/90">{about.lede}</p> : null}
      {about?.sections.map((sec) => {
        if (sec.id === "known" && sec.body && about.lede && sec.body.slice(0, 48) === about.lede.slice(0, 48)) {
          return null;
        }
        return <Block key={sec.id} section={sec} />;
      })}
      {!about && status !== "load" ? (
        <p className="text-sm leading-snug text-fg/90">
          {brief ?? `${sitShape(county)} ${sitProfile(county)}`}
        </p>
      ) : null}
      {about?.href ? (
        <a
          href={about.href}
          target="_blank"
          rel="noreferrer"
          className="inline-block font-mono text-[10px] tracking-widest text-faint uppercase hover:text-grid"
        >
          Wikipedia
        </a>
      ) : null}
    </div>
  );
}
