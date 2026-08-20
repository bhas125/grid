import { createFileRoute } from "@tanstack/react-router";
import { GridApp } from "@/components/grid-app";
import { SiteGate } from "@/components/site-gate";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <SiteGate>
      <GridApp />
    </SiteGate>
  );
}
