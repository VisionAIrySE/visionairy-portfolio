import { ArrowUpRight } from "lucide-react";

type Product = {
  name: string;
  industry: string;
  description: string;
  stack?: string[];
  status: "Live" | "Coming Soon";
  url?: string;
  image?: string;
  highlight?: boolean;
};

const products: Product[] = [
  {
    name: "Xpansion.dev",
    industry: "AI Tooling",
    description:
      "The SaaS platform that embodies the framework — built using Xpansion to deliver Xpansion to builders.",
    stack: ["Patent-Pending", "Proprietary"],
    status: "Live",
    url: "https://xpansion.dev",
    image: "/assets/product-xpansion.png",
    highlight: true,
  },
  {
    name: "Koinonos",
    industry: "Spiritual Tech",
    description:
      "Greek NT companion with fresh, direct translations and cultural context.",
    stack: ["Next.js", "Supabase", "OpenRouter", "ElevenLabs"],
    status: "Live",
    url: "https://koinonos.app",
    image: "/assets/product-koinonos.png",
  },
  {
    name: "Ask the Record",
    industry: "Civic Tech",
    description:
      "AI search across millions of declassified government documents.",
    stack: ["React", "Cloudflare", "Supabase", "OpenRouter", "Voyage AI"],
    status: "Live",
    url: "https://asktherecord.com",
    image: "/assets/product-atr.png",
  },
  {
    name: "Stocker AI",
    industry: "Logistics",
    description:
      "Voice-guided picking for vending route operators. Enterprise speed, zero hardware.",
    stack: ["React", "Supabase", "Deepgram", "n8n"],
    status: "Live",
    url: "https://my-stocker-ai.com",
    image: "/assets/product-stocker.png",
  },
  {
    name: "Vib8",
    industry: "AI Tooling",
    description:
      "Universal AI prompt translator — your intent, perfectly formatted for any platform.",
    stack: ["Claude API", "Supabase", "Python", "Google Cloud"],
    status: "Live",
    url: "https://vib8ai.com",
    image: "/assets/product-vib8.png",
  },
  {
    name: "Builder-Path",
    industry: "FinTech / Construction",
    description:
      "AI-driven builder prospecting for spec construction lenders.",
    stack: ["Next.js", "PostgreSQL", "Claude API", "Tavily"],
    status: "Coming Soon",
  },
  {
    name: "LC Access",
    industry: "Security",
    description: "AI-driven access control and perimeter management.",
    status: "Coming Soon",
  },
];

function StatusPill({ status }: { status: Product["status"] }) {
  if (status === "Live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#A3E635]/10 text-[#A3E635] border border-[#A3E635]/30 px-2.5 py-0.5 text-xs font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-[#A3E635]" />
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-white/5 text-[#94A3B8] border border-white/10 px-2.5 py-0.5 text-xs font-medium">
      Coming Soon
    </span>
  );
}

function Card({ product }: { product: Product }) {
  const isLink = !!product.url;
  const Wrapper: React.ElementType = isLink ? "a" : "div";
  const wrapperProps = isLink
    ? { href: product.url, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={[
        "group relative flex flex-col rounded-xl bg-[#161B27] border p-6 transition-all",
        product.highlight
          ? "border-[#60A5FA]/60 shadow-[0_0_40px_-10px_rgba(96,165,250,0.5)] hover:border-[#60A5FA]"
          : "border-[#1E293B] hover:border-[#60A5FA]",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-lg">{product.name}</h3>
          <span className="mt-2 inline-flex items-center rounded-full bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/20 px-2.5 py-0.5 text-xs font-medium">
            {product.industry}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={product.status} />
          {isLink && (
            <ArrowUpRight className="h-4 w-4 text-[#94A3B8] group-hover:text-[#60A5FA] transition-colors" />
          )}
        </div>
      </div>

      {/* Description */}
      <p className="mt-4 text-sm text-[#94A3B8] leading-relaxed">
        {product.description}
      </p>

      {/* Stack */}
      {product.stack && product.stack.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {product.stack.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-md bg-white/5 text-[#94A3B8] border border-white/10 px-2 py-0.5 text-[11px]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-[#94A3B8]">
          Powered by
        </span>
        <img
          src="/assets/xf-logo-white.svg"
          alt="Xpansion Framework"
          style={{ height: "16px" }}
        />
      </div>
    </Wrapper>
  );
}

export function Portfolio() {
  return (
    <section id="work" className="bg-[#0D1117] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A3E635]">
              Powered by
            </p>
            <img
              src="/assets/xf-logo-white.svg"
              alt="Xpansion Framework"
              style={{ height: "24px" }}
            />
          </div>
          <h2 className="mt-4 text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight">
            One framework.
            <br />
            Seven platforms.
            <br />
            Six industries.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => (
            <Card key={p.name} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
