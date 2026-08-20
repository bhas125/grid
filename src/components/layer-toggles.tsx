import { cn } from "@/lib/utils";
import type { LayerId, Layers } from "@/data/types";

const ITEMS: { id: LayerId; label: string }[] = [
  { id: "interstates", label: "Roads" },
  { id: "weather", label: "Weather" },
  { id: "sites", label: "Data Cent." },
  { id: "flock", label: "Flock" },
  { id: "cameras", label: "Traffic Cam" },
];

export function LayerToggles({
  layers,
  onToggle,
}: {
  layers: Layers;
  onToggle: (id: LayerId) => void;
  zoomed?: boolean;
}) {
  return (
    <div className="pointer-events-auto flex min-w-0 items-center gap-2">
      <div className="hidden shrink-0 font-mono text-[10px] tracking-widest text-muted uppercase sm:block">
        Toggle
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-1 overflow-x-auto">
        {ITEMS.map((item) => {
          const on = layers[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              aria-pressed={on}
              className={cn(
                "h-7 min-w-0 shrink-0 border px-1.5 font-mono text-[10px] tracking-widest whitespace-nowrap uppercase sm:px-2",
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
