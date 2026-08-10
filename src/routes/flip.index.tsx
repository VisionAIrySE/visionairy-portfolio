import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FlipAnalyzer } from "@/components/FlipAnalyzer";
import { resolveBrand, type LenderBrand } from "@/lib/flip-brands";

export const Route = createFileRoute("/flip/")({
  component: HostAnalyzer,
  head: () => ({
    meta: [
      { title: "Fix & Flip Deal Analyzer" },
      {
        name: "description",
        content:
          "Model a fix and flip deal: cash to close, working capital, projected profit, ROI and downside scenarios.",
      },
    ],
  }),
});

function HostAnalyzer() {
  // Server render has no host context here, so start neutral and adopt the
  // lender's brand once we know which domain the visitor arrived on.
  const [brand, setBrand] = useState<LenderBrand>(() => resolveBrand(null, null));

  useEffect(() => {
    setBrand(resolveBrand(window.location.hostname, null));
  }, []);

  return <FlipAnalyzer brand={brand} />;
}
