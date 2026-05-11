import { createFileRoute } from "@tanstack/react-router";
import { Navigation } from "@/components/Navigation";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="pt-16" />
    </div>
  );
}
