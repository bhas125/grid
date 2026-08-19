import { cn } from "@/lib/utils";
import type { LayerId, Layers } from "@/data/types";

const ITEMS: { id: LayerId; label: string; countyOnly?: boolean }[] = [
  { id: "interstates", label: "Int" },
  { id: "weather", label: "Wx" },
  { id: "sites", label: "Sites" },
  { id: "flock", label: "Flock" },
  { id: "p24", label: "’24", countyOnly: true },
  { id: "p26", label: "’26", countyOnly: true },
];

export function LayerToggles({
  layers,
  onToggle,
  zoomed,
}: {
  layers: Layers;
  onToggle: (id: LayerId) => void;
  zoomed: boolean;
}) {
  return (
    <div className="pointer-events-auto">
      <div className="mb-0.5 font-mono text-[10px] tracking-widest text-muted uppercase">
        Toggle
      </div>
      <div className="flex flex-wrap gap-1">
        {ITEMS.map((item) => {
          if (item.countyOnly && !zoomed) return null;
          const on = layers[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              aria-pressed={on}
              className={cn(
                "h-6 min-w-0 border px-1.5 font-mono text-[10px] tracking-widest uppercase",
                on
                  ? "border-grid bg-grid/15 text-grid"
                  : "border-line bg-surface/90 text-faint hover:border-muted hover:text-muted",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
