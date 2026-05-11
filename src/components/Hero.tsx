export function Hero() {
  const handlePortfolio = (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector("#work")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0D1117] px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(30,58,95,0.15), rgba(13,17,23,0) 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-[#60A5FA]">
          Xpansion Framework — Patent Pending
        </p>

        <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight text-white md:text-[64px]">
          AI doesn't understand
          <br />
          your intent. It predicts.
          <br />
          Xpansion fixes that.
        </h1>

        <p className="mt-6 max-w-[600px] text-lg leading-relaxed text-[#94A3B8] md:text-xl">
          Humans communicate with compressed intent — a lifetime of context AI
          will never share. Xpansion decompresses that intent into finite,
          explicit definitions, then enforces AI behavior against them. The
          result: platforms that do exactly what you meant to build.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="#work"
            onClick={handlePortfolio}
            className="inline-flex h-11 items-center justify-center rounded-md bg-[#60A5FA] px-6 text-sm font-semibold text-[#0D1117] transition-colors hover:bg-[#7DB6FB]"
          >
            See What It's Built
          </a>
          <a
            href="https://xpansion.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/80 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Explore the Framework
          </a>
        </div>

        <div className="mt-16 w-full max-w-md">
          <div className="mx-auto h-px w-full bg-white/10" />
          <p className="mt-4 text-xs text-[#94A3B8]">
            Powering: Koinonos · Ask the Record · Stocker AI · Vib8 · Builder-Path
          </p>
        </div>
      </div>
    </section>
  );
}
