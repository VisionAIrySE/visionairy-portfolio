import { createFileRoute } from "@tanstack/react-router";
import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { Framework } from "@/components/Framework";
import { Portfolio } from "@/components/Portfolio";
import { About } from "@/components/About";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main>
        <Hero />
        <Framework />
        <Portfolio />
        <About />
      </main>
    </div>
  );
}
