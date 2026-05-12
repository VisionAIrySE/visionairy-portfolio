export function About() {
  return (
    <section id="about" className="w-full bg-[#0D1117] py-24 px-6">
      <div className="mx-auto max-w-[900px] text-center">
        <p className="text-[#A3E635] uppercase text-sm font-semibold tracking-wider mb-4">
          About the Founder
        </p>
        <h2 className="text-white font-bold text-4xl md:text-5xl mb-8">
          Russ Wright — Founder, Visionairy
        </h2>
        <p className="text-[#94A3B8] text-lg leading-relaxed mb-12">
          I build multi-tool, AI-integrated SaaS platforms and operational tools across
          industries — logistics, civic tech, fintech, security, and more. Every platform
          is built on the Xpansion Framework, a patent-pending methodology I developed to
          solve the core problem with AI-assisted development: getting what you actually
          intended, not what AI guessed you meant. Seven platforms shipped. Six industries.
          One methodology.
        </p>

        <div className="grid grid-cols-3 divide-x divide-white/10 mb-12">
          {[
            { n: "7", l: "Platforms shipped" },
            { n: "6", l: "Industries" },
            { n: "1", l: "Patent-pending methodology" },
          ].map((s) => (
            <div key={s.l} className="px-4">
              <div className="text-white font-bold text-5xl md:text-[56px] mb-2">{s.n}</div>
              <div className="text-[#94A3B8] text-xs uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        <a
          href="mailto:russ@visionairy.biz"
          className="inline-block border border-[#60A5FA] text-[#60A5FA] px-6 py-3 rounded-md font-medium hover:bg-[#60A5FA]/10 transition-colors"
        >
          Let's build something →
        </a>
      </div>
    </section>
  );
}
