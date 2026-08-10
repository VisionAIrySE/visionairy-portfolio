import { createFileRoute } from "@tanstack/react-router";
import { FlipAnalyzer } from "@/components/FlipAnalyzer";
import { BRANDS, resolveBrand } from "@/lib/flip-brands";

export const Route = createFileRoute("/flip/$lender")({
  component: LenderAnalyzer,
  head: ({ params }) => {
    const brand = BRANDS[params.lender?.toLowerCase()] ?? BRANDS.default;
    const title = `${brand.company} | ${brand.tagline}`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: `Model a fix and flip deal: cash to close, working capital, projected profit, ROI and downside scenarios. Prepared by ${brand.company}.`,
        },
        { property: "og:title", content: title },
        { property: "og:type", content: "website" },
      ],
    };
  },
});

function LenderAnalyzer() {
  const { lender } = Route.useParams();
  // The path segment is how a brand is previewed before a lender's own domain
  // is pointed at the app; resolveBrand prefers the hostname in production.
  return <FlipAnalyzer brand={resolveBrand(null, lender)} />;
}
