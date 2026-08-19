import { createFileRoute } from "@tanstack/react-router";
import { GridApp } from "@/components/grid-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GridApp />;
}
