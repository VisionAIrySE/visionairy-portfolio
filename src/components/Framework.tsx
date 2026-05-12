export function Framework() {
  const stats = [
    { title: "Patent Pending", desc: "USPTO provisional filed" },
    { title: "Any Industry", desc: "One methodology, every domain" },
    { title: "Days", desc: "From defined intent to working platform" },
  ];

  return (
    <section id="framework" className="bg-[#0D1117] py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left column */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#60A5FA]">
              Our Methodology
            </p>
            <h2 className="mt-4 text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight">
              The engine behind
              <br />
              everything we build.
            </h2>

            <div className="mt-10 space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60A5FA]">
                  The Problem
                </p>
                <p className="mt-3 text-[#94A3B8] leading-relaxed">
                  Humans communicate with compressed intent — a lifetime of context AI will never share. AI fills the gaps with pattern prediction. When the pattern runs out, it invents. The result: platforms that do what AI thought you meant, not what you actually needed.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A3E635]">
                  Our Solution
                </p>
                <p className="mt-3 text-[#94A3B8] leading-relaxed">
                  The Xpansion Framework decompresses human intent into finite, explicit definitions that AI can actually execute against — then enforces AI behavior to stay locked to that intent throughout the build. Patent pending. The reason every Visionairy platform ships in days, not weeks.
                </p>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map((s) => (
                <div
                  key={s.title}
                  className="rounded-lg bg-[#161B27] border border-white/10 p-5"
                >
                  <div className="text-white font-semibold">{s.title}</div>
                  <div className="mt-1 text-sm text-[#94A3B8]">{s.desc}</div>
                </div>
              ))}
            </div>

            <a
              href="https://xpansion.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 text-[#60A5FA] hover:text-[#93C5FD] transition-colors font-medium"
            >
              Explore Xpansion.dev <span aria-hidden>→</span>
            </a>
          </div>

          {/* Right column */}
          <div className="relative">
            <div className="relative rounded-2xl bg-[#161B27] border border-white/10 aspect-square flex items-center justify-center overflow-hidden">
              <img
                src="/assets/xf-logo-white.svg"
                alt="Xpansion Framework logo"
                className="relative"
                style={{ width: "200px" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
