export function About() {
  return (
    <section id="about" className="w-full bg-[#0D1117] py-24 md:py-32 px-6">
      <div className="mx-auto max-w-[700px] text-center">
        <p className="text-[#A3E635] uppercase text-sm font-semibold tracking-wider mb-4">
          About
        </p>
        <h2 className="text-white font-bold text-3xl sm:text-4xl md:text-[40px] leading-tight mb-8 break-words">
          Built for builders who don't speak code.
        </h2>
        <p className="text-[#94A3B8] text-lg leading-relaxed mb-10">
          I'm a non-technical founder. I hit the same wall every non-technical builder
          hits — AI that does what it thinks you mean, not what you actually need. I built
          the Xpansion Framework to close that gap. For builders like me and anyone who
          wants to create with AI and rely on the outcome.
        </p>
        <a
          href="mailto:russ@visionairy.biz"
          className="text-[#60A5FA] font-medium hover:underline"
        >
          Get in touch → russ@visionairy.biz
        </a>
      </div>
    </section>
  );
}
