export function Contact() {
  return (
    <section id="contact" className="w-full bg-[#0D1117] py-24 md:py-32 px-6">
      <div className="mx-auto max-w-[800px] text-center">
        <p className="text-[#60A5FA] uppercase text-sm font-semibold tracking-wider mb-4">
          Get in touch
        </p>
        <h2 className="text-white font-bold text-3xl sm:text-4xl md:text-5xl mb-6 break-words">
          Ready to build something that works?
        </h2>
        <p className="text-[#94A3B8] text-lg mb-10">
          If you have a platform to build, a problem to solve, or a methodology
          question — reach out directly.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <a
            href="mailto:russ@visionairy.biz"
            className="inline-block bg-[#60A5FA] text-white px-6 py-3 rounded-md font-medium hover:bg-[#60A5FA]/90 transition-colors"
          >
            Email Russ →
          </a>
          <a
            href="https://xpansion.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-[#60A5FA] text-[#60A5FA] px-6 py-3 rounded-md font-medium hover:bg-[#60A5FA]/10 transition-colors"
          >
            Explore Xpansion.dev →
          </a>
          <a
            href="https://www.linkedin.com/company/visionairy-success-engineering"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-[#60A5FA] text-[#60A5FA] px-6 py-3 rounded-md font-medium hover:bg-[#60A5FA]/10 transition-colors"
          >
            LinkedIn →
          </a>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left text-xs text-[#94A3B8]">
          <span>© 2025 Visionairy. Built on the Xpansion Framework.</span>
          <img src="/assets/xf-logo-white.svg" alt="XF" className="h-4" />
        </div>
      </div>
    </section>
  );
}
