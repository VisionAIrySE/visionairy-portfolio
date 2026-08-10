/**
 * Lender brand registry for the Fix & Flip Deal Analyzer.
 *
 * Adding a lender is one entry here plus a logo file. No component changes.
 *
 * Brand resolution order:
 *   1. The hostname the visitor arrived on  (production: each lender's own domain)
 *   2. The /flip/<slug> path segment        (previewing before DNS is pointed)
 *   3. The default brand
 */

/**
 * Preview lock for the standalone prototype. Set `passcode` to any string and
 * the page asks for it before showing anything; set it to null and the page is
 * open to anyone with the link. This is a preview control only — it is replaced
 * by real sign-in once lenders and their reps have their own accounts.
 */
export interface PreviewLock {
  passcode: string | null;
}

export interface LenderBrand {
  slug: string;
  company: string;
  /** Shown under the company name in the header. */
  tagline: string;
  /** Preview gate. Omit or set passcode:null to leave the page open. */
  lock?: PreviewLock;
  /** Hostnames that should resolve to this brand, lowercase, no protocol. */
  domains: string[];
  /** Path to a logo in /public. Falls back to the wordmark when absent. */
  logoSrc?: string;
  /** Text wordmark used when no logo file is set. */
  wordmark: string;
  colors: {
    /** Primary brand color — headers, key figures, primary button. */
    accent: string;
    /** Darker shade for text on light backgrounds. */
    accentDeep: string;
    /** Very light tint for panel backgrounds. */
    accentWash: string;
    /** Positive / profit color. */
    positive: string;
    /** Negative / loss color. */
    negative: string;
  };
  contact: {
    name: string;
    title: string;
    office?: string;
    mobile?: string;
    email?: string;
    address?: string;
    website?: string;
  };
  /**
   * Required. Anything borrower-facing must carry the lender's NMLS number, so
   * this is not optional — a lender cannot be added to the registry without it.
   */
  nmls: string;
  disclaimer: string;
}

const SHARED_DISCLAIMER =
  "This analyzer is a planning tool, not a loan approval, commitment, or offer to lend. " +
  "Figures are estimates based on the assumptions entered and will differ from actual results. " +
  "Rehab funds are commonly advanced through reimbursement draws, so a borrower may need to pay " +
  "contractors and suppliers before reimbursement. The working-capital figure is a transparent " +
  "planning rule — the greater of the reserve percentage, two months of estimated carrying costs " +
  "including interest, or the stated minimum — not an industry standard or an approval requirement.";

export const BRANDS: Record<string, LenderBrand> = {
  veristone: {
    slug: "veristone",
    company: "Veristone Capital",
    tagline: "Fix & Flip Deal Analyzer",
    domains: ["veristonecapital.com", "www.veristonecapital.com", "flip.veristonecapital.com"],
    // Open while Heath previews it. Put a word here and redeploy to require it.
    lock: { passcode: null },
    logoSrc: "/veristone-logo.png",
    wordmark: "VERISTONE",
    // Sampled from the logo file: the mark is #6BA519, the wordmark is black.
    // The bright green is too light to carry small white text (about 3:1 against
    // white, below the 4.5:1 readability floor), so it does accents and large
    // figures while a deep forest green carries body text and buttons — the same
    // split their own logo uses.
    colors: {
      accent: "#6BA519",
      accentDeep: "#33500E",
      accentWash: "#F3F8EA",
      positive: "#4A7512",
      negative: "#B3261E",
    },
    contact: {
      name: "Heath Pierce",
      title: "Senior Sales Executive",
      office: "425-828-9800",
      mobile: "206-883-1952",
      address: "6725 116th Ave NE, Suite 210, Kirkland, WA 98033",
      website: "veristonecapital.com",
    },
    nmls: "NMLS# 1106440",
    disclaimer: SHARED_DISCLAIMER,
  },

  // Neutral fallback — also serves as the template for a new lender.
  default: {
    slug: "default",
    company: "Fix & Flip",
    tagline: "Deal Analyzer",
    domains: [],
    wordmark: "FIX & FLIP",
    colors: {
      accent: "#334155",
      accentDeep: "#1E293B",
      accentWash: "#F8FAFC",
      positive: "#1B7A4B",
      negative: "#B3261E",
    },
    contact: {
      name: "",
      title: "",
    },
    nmls: "NMLS# pending",
    disclaimer: SHARED_DISCLAIMER,
  },
};

const DOMAIN_INDEX: Record<string, string> = Object.values(BRANDS).reduce(
  (acc, brand) => {
    for (const d of brand.domains) acc[d.toLowerCase()] = brand.slug;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Resolve the brand for a request. The lender's own domain wins so that a
 * production signup is a DNS change plus a registry entry — never a code change.
 */
export function resolveBrand(hostname?: string | null, slug?: string | null): LenderBrand {
  if (hostname) {
    const host = hostname.toLowerCase().replace(/:\d+$/, "");
    const bySlug = DOMAIN_INDEX[host];
    if (bySlug && BRANDS[bySlug]) return BRANDS[bySlug];
  }
  if (slug && BRANDS[slug.toLowerCase()]) return BRANDS[slug.toLowerCase()];
  return BRANDS.default;
}
