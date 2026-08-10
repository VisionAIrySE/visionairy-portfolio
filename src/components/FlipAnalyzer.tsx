import { useEffect, useMemo, useRef, useState } from "react";
import type { LenderBrand } from "@/lib/flip-brands";
import {
  DEFAULT_DEAL,
  DEFAULT_STRESS,
  calculate,
  fmtMoney,
  fmtPct,
  scenarios,
  type DealInputs,
  type StressSettings,
} from "@/lib/flip-model";

/* ---------------------------------------------------------------- sharing */

const FIELD_ORDER: (keyof DealInputs)[] = [
  "purchasePrice",
  "arv",
  "rehabBase",
  "rehabContingencyPct",
  "holdMonths",
  "purchaseFinancedPct",
  "rehabFinancedPct",
  "interestRatePct",
  "lenderPointsPct",
  "otherLenderFees",
  "buyerClosingPct",
  "taxesPerMonth",
  "insurancePerMonth",
  "utilitiesPerMonth",
  "sellingCostPct",
  "otherSellingCosts",
  "wcReservePct",
  "wcReserveMin",
  "maxLtarvPct",
  "maxLtcPct",
];

/** A whole scenario fits in the address bar, so "save" and "share" are free. */
function encodeDeal(d: DealInputs): string {
  const nums = FIELD_ORDER.map((k) => String(d[k] as number)).join("~");
  return `${encodeURIComponent(d.propertyAddress)}~~${nums}`;
}

function decodeDeal(raw: string): DealInputs | null {
  try {
    const [addr, packed] = raw.split("~~");
    if (!packed) return null;
    const parts = packed.split("~");
    if (parts.length !== FIELD_ORDER.length) return null;
    const next: DealInputs = { ...DEFAULT_DEAL, propertyAddress: decodeURIComponent(addr ?? "") };
    FIELD_ORDER.forEach((k, i) => {
      const v = Number(parts[i]);
      if (!Number.isFinite(v)) throw new Error("bad number");
      (next[k] as number) = v;
    });
    return next;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- primitives */

interface FieldProps {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Thousands separators while idle, raw digits while typing. */
function NumberField({ label, hint, value, onChange, prefix, suffix, step = 1 }: FieldProps) {
  const [text, setText] = useState(() => grouped.format(value));
  const [focused, setFocused] = useState(false);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setText(grouped.format(value));
  }, [value]);

  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white transition-colors focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand)]/15">
        {prefix && <span className="pl-3 text-sm text-slate-400">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          step={step}
          value={text}
          onFocus={() => {
            isFocused.current = true;
            setFocused(true);
            setText(String(value));
          }}
          onBlur={() => {
            isFocused.current = false;
            setFocused(false);
            setText(grouped.format(value));
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const n = Number(raw.replace(/,/g, ""));
            if (raw.trim() === "") onChange(0);
            else if (Number.isFinite(n)) onChange(n);
          }}
          aria-label={label}
          data-focused={focused}
          className="w-full bg-transparent px-3 py-2 text-[15px] font-medium text-slate-900 outline-none"
        />
        {suffix && <span className="pr-3 text-sm text-slate-400">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-[12px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * Definitions carried over from the workbook's Quick Guide tab. A glossary tab
 * goes unread; the same words attached to the term at the moment someone is
 * looking at it do not.
 */
const DEFINITIONS: Record<string, string> = {
  "Cash to close":
    "Down payment plus estimated acquisition closing costs, lender points and lender fees.",
  "Post-closing working capital":
    "Suggested liquidity remaining after closing to bridge draws and carrying costs.",
  "Total liquidity needed": "Cash to close plus recommended post-closing working capital.",
  "Total loan amount": "Purchase funding plus the rehab funds available through draws.",
  "Loan-to-cost": "Total loan ÷ purchase price + base rehab budget.",
  "Loan-to-cost (LTC)": "Total loan ÷ purchase price + base rehab budget.",
  "Loan-to-ARV": "Total loan ÷ expected after-repair value.",
  "Loan-to-ARV (LTARV)": "Total loan ÷ expected after-repair value.",
  "ROI on cash invested": "Projected profit ÷ estimated total liquidity needed.",
  "Break-even sale price": "Approximate sale price where projected profit reaches zero.",
  "Profit margin on sale": "Projected profit ÷ expected sale price.",
  "Est. interest during hold":
    "Interest on the average outstanding balance — purchase funds from day one, rehab funds drawn over time.",
  "Borrower rehab contribution":
    "The portion of the rehab budget not covered by the loan, paid by the borrower.",
  "Projected total project cost":
    "Purchase, rehab including contingency, closing costs, points, fees, interest, carrying costs and selling costs.",
};

/** A term with its plain-English definition one hover or tap away. */
function Term({ label, className }: { label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const def = DEFINITIONS[label];
  if (!def) return <span className={className}>{label}</span>;

  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        title={def}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="cursor-help text-left underline decoration-dotted decoration-slate-400 underline-offset-[3px]"
      >
        {label}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-1.5 block w-60 rounded-lg px-3 py-2 text-[12px] font-normal leading-snug text-white shadow-lg print:hidden"
          style={{ background: "var(--brand-deep)" }}
        >
          {def}
        </span>
      )}
    </span>
  );
}

function Row({
  label,
  value,
  strong,
  note,
}: {
  label: string;
  value: string;
  strong?: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className={`text-[13px] ${strong ? "font-semibold text-slate-900" : "text-slate-600"}`}>
        <Term label={label} />
        {note && <span className="ml-1 text-[11px] font-normal text-slate-400">{note}</span>}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          strong ? "text-[16px] font-extrabold" : "text-[14px] font-medium text-slate-800"
        }`}
        style={strong ? { color: "var(--brand)" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
  collapsible = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <header
        className={`relative flex items-center justify-between py-4 pl-6 pr-5 ${
          collapsible ? "cursor-pointer select-none transition-colors hover:brightness-[0.98]" : ""
        }`}
        style={{ background: "var(--brand-wash)" }}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
      >
        {/* Brand rule anchoring every section heading. */}
        <span
          className="absolute inset-y-0 left-0 w-[5px]"
          style={{ background: "var(--brand)" }}
          aria-hidden
        />
        <h2
          className="text-[14px] font-extrabold uppercase tracking-[0.13em]"
          style={{ color: "var(--brand-deep)" }}
        >
          {title}
        </h2>
        {collapsible && (
          <span
            className="rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide print:hidden"
            style={{ color: "var(--brand)", borderColor: "var(--brand)" }}
          >
            {open ? "Hide" : "Show"}
          </span>
        )}
      </header>
      {open && <div className="border-t border-slate-200 px-6 py-5">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------- page */

const UNLOCK_KEY = "flip-unlocked";

/**
 * Preview gate. Shows only when the brand carries a passcode. Deliberately
 * simple — it keeps a preview link from circulating, and nothing more. It is
 * not a substitute for the real sign-in that arrives with lender accounts.
 */
function PreviewGate({ brand, onUnlock }: { brand: LenderBrand; onUnlock: () => void }) {
  const [entry, setEntry] = useState("");
  const [wrong, setWrong] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entry.trim().toLowerCase() === brand.lock?.passcode?.trim().toLowerCase()) {
      try {
        sessionStorage.setItem(`${UNLOCK_KEY}:${brand.slug}`, "1");
      } catch {
        /* private browsing — unlock for this view only */
      }
      onUnlock();
    } else {
      setWrong(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 text-center shadow-sm"
      >
        {brand.logoSrc ? (
          <img src={brand.logoSrc} alt={brand.company} className="mx-auto h-10 w-auto" />
        ) : (
          <div className="text-[18px] font-extrabold tracking-[0.14em]">{brand.wordmark}</div>
        )}
        <div
          className="mt-5 text-[13px] font-extrabold uppercase tracking-[0.12em]"
          style={{ color: "var(--brand-deep)" }}
        >
          {brand.tagline}
        </div>
        <p className="mt-2 text-[13px] text-slate-500">
          This preview is private. Enter the access code to continue.
        </p>
        <input
          value={entry}
          onChange={(e) => {
            setEntry(e.target.value);
            setWrong(false);
          }}
          autoFocus
          aria-label="Access code"
          placeholder="Access code"
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-[15px] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        />
        {wrong && (
          <div className="mt-2 text-[12.5px] font-medium" style={{ color: "var(--neg)" }}>
            That code doesn't match. Try again.
          </div>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded-lg px-4 py-2.5 text-[14px] font-bold text-white"
          style={{ background: "var(--brand-deep)" }}
        >
          View the analyzer
        </button>
      </form>
    </div>
  );
}

export function FlipAnalyzer({ brand }: { brand: LenderBrand }) {
  const [deal, setDeal] = useState<DealInputs>(DEFAULT_DEAL);
  const [stress, setStress] = useState<StressSettings>(DEFAULT_STRESS);
  const [copied, setCopied] = useState(false);

  // Restore a shared scenario from the address bar on first paint.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("d");
    if (!raw) return;
    const restored = decodeDeal(raw);
    if (restored) setDeal(restored);
  }, []);

  const set = <K extends keyof DealInputs>(key: K, val: DealInputs[K]) =>
    setDeal((d) => ({ ...d, [key]: val }));

  const r = useMemo(() => calculate(deal), [deal]);
  const rows = useMemo(() => scenarios(deal, stress), [deal, stress]);

  const brandStyle = {
    "--brand": brand.colors.accent,
    "--brand-deep": brand.colors.accentDeep,
    "--brand-wash": brand.colors.accentWash,
    "--pos": brand.colors.positive,
    "--neg": brand.colors.negative,
  } as React.CSSProperties;

  const shareLink = () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${window.location.pathname}?d=${encodeDeal(deal)}`;
    window.history.replaceState(null, "", url);
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const profitPositive = r.projectedProfit >= 0;

  // Preview gate — only stands in the way when a passcode is set on the brand.
  const needsCode = Boolean(brand.lock?.passcode);
  const [unlocked, setUnlocked] = useState(!needsCode);
  useEffect(() => {
    if (!needsCode) return;
    try {
      if (sessionStorage.getItem(`${UNLOCK_KEY}:${brand.slug}`) === "1") setUnlocked(true);
    } catch {
      /* private browsing — the code is simply asked for again */
    }
  }, [needsCode, brand.slug]);

  if (!unlocked) {
    return (
      <div style={brandStyle}>
        <PreviewGate brand={brand} onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  return (
    <div style={brandStyle} className="min-h-screen bg-slate-50 text-slate-900">
      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print, .screen-only { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }
          .print-break { break-inside: avoid; }
          @page { margin: 0.5in; }
        }
      `}</style>

      <PrintSummary brand={brand} deal={deal} r={r} />

      {/* Header ------------------------------------------------------- */}
      <header className="screen-only bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-5">
            {brand.logoSrc ? (
              // The logo already carries the company name, so the title sits
              // beside it rather than repeating it.
              <img src={brand.logoSrc} alt={brand.company} className="h-11 w-auto" />
            ) : (
              <div
                className="rounded-md px-4 py-2.5 text-[22px] font-extrabold leading-none tracking-[0.16em] text-white"
                style={{ background: "var(--brand-deep)" }}
              >
                {brand.wordmark}
              </div>
            )}
            <div className="border-l border-slate-200 pl-5 leading-tight">
              {!brand.logoSrc && (
                <div className="text-[20px] font-extrabold tracking-tight text-slate-900">
                  {brand.company}
                </div>
              )}
              <div
                className="text-[15px] font-extrabold uppercase tracking-[0.14em]"
                style={{ color: "var(--brand-deep)" }}
              >
                {brand.tagline}
              </div>
            </div>
          </div>
          <div className="no-print flex gap-2">
            <button
              onClick={shareLink}
              className="rounded-lg border-2 px-4 py-2.5 text-[13px] font-bold transition-colors hover:bg-[var(--brand-wash)]"
              style={{ color: "var(--brand-deep)", borderColor: "var(--brand)" }}
            >
              {copied ? "Link copied" : "Save / share"}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-lg px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: "var(--brand-deep)" }}
            >
              Download PDF
            </button>
          </div>
        </div>

        {/* AE contact band — the whole point of the tool is a call to this person. */}
        {brand.contact.name && (
          <div
            className="border-t-4 text-white"
            style={{ background: "var(--brand-deep)", borderColor: "var(--brand)" }}
          >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5 text-[13px]">
              <span className="font-bold">
                Your {brand.company.split(" ")[0]} contact: {brand.contact.name}
              </span>
              <span className="opacity-75">{brand.contact.title}</span>
              {brand.contact.mobile && (
                <a href={`tel:${brand.contact.mobile}`} className="font-semibold hover:underline">
                  {brand.contact.mobile}
                </a>
              )}
              {brand.contact.office && (
                <a href={`tel:${brand.contact.office}`} className="opacity-90 hover:underline">
                  Office {brand.contact.office}
                </a>
              )}
              <span className="ml-auto text-[12px] font-medium opacity-75">{brand.nmls}</span>
            </div>
          </div>
        )}
      </header>

      <main className="screen-only mx-auto max-w-6xl px-5 py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Inputs -------------------------------------------------- */}
          <div className="space-y-5">
            <Section title="The deal">
              <label className="mb-4 block">
                <span className="block text-[13px] font-medium text-slate-700">
                  Property address
                </span>
                <input
                  value={deal.propertyAddress}
                  onChange={(e) => set("propertyAddress", e.target.value)}
                  placeholder="123 Example Street, Seattle WA"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Purchase price"
                  prefix="$"
                  step={5000}
                  value={deal.purchasePrice}
                  onChange={(v) => set("purchasePrice", v)}
                  hint="Contract purchase price"
                />
                <NumberField
                  label="After-repair value (ARV)"
                  prefix="$"
                  step={5000}
                  value={deal.arv}
                  onChange={(v) => set("arv", v)}
                  hint="Expected value after renovation"
                />
                <NumberField
                  label="Rehab budget"
                  prefix="$"
                  step={5000}
                  value={deal.rehabBase}
                  onChange={(v) => set("rehabBase", v)}
                  hint="Scope-of-work budget before contingency"
                />
                <NumberField
                  label="Rehab contingency"
                  suffix="%"
                  step={1}
                  value={deal.rehabContingencyPct}
                  onChange={(v) => set("rehabContingencyPct", v)}
                  hint="Cushion for unforeseen costs"
                />
                <NumberField
                  label="Hold period"
                  suffix="months"
                  step={1}
                  value={deal.holdMonths}
                  onChange={(v) => set("holdMonths", v)}
                  hint="Purchase through sale"
                />
              </div>
            </Section>

            <Section title="Financing" collapsible defaultOpen={false}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Purchase price financed"
                  suffix="%"
                  value={deal.purchaseFinancedPct}
                  onChange={(v) => set("purchaseFinancedPct", v)}
                />
                <NumberField
                  label="Rehab financed"
                  suffix="%"
                  value={deal.rehabFinancedPct}
                  onChange={(v) => set("rehabFinancedPct", v)}
                  hint="Available through draws"
                />
                <NumberField
                  label="Interest rate"
                  suffix="%"
                  step={0.25}
                  value={deal.interestRatePct}
                  onChange={(v) => set("interestRatePct", v)}
                  hint="Annual note rate"
                />
                <NumberField
                  label="Lender points"
                  suffix="%"
                  step={0.25}
                  value={deal.lenderPointsPct}
                  onChange={(v) => set("lenderPointsPct", v)}
                  hint="Points on total committed loan"
                />
                <NumberField
                  label="Other lender fees"
                  prefix="$"
                  step={250}
                  value={deal.otherLenderFees}
                  onChange={(v) => set("otherLenderFees", v)}
                />
              </div>
            </Section>

            <Section title="Holding & exit costs" collapsible defaultOpen={false}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Buyer closing costs"
                  suffix="% of purchase"
                  step={0.5}
                  value={deal.buyerClosingPct}
                  onChange={(v) => set("buyerClosingPct", v)}
                  hint="Title, escrow, recording"
                />
                <NumberField
                  label="Property taxes"
                  prefix="$"
                  suffix="/mo"
                  step={50}
                  value={deal.taxesPerMonth}
                  onChange={(v) => set("taxesPerMonth", v)}
                />
                <NumberField
                  label="Insurance"
                  prefix="$"
                  suffix="/mo"
                  step={50}
                  value={deal.insurancePerMonth}
                  onChange={(v) => set("insurancePerMonth", v)}
                />
                <NumberField
                  label="Utilities & other"
                  prefix="$"
                  suffix="/mo"
                  step={50}
                  value={deal.utilitiesPerMonth}
                  onChange={(v) => set("utilitiesPerMonth", v)}
                  hint="Utilities, HOA, lawn, security"
                />
                <NumberField
                  label="Selling costs"
                  suffix="% of sale"
                  step={0.5}
                  value={deal.sellingCostPct}
                  onChange={(v) => set("sellingCostPct", v)}
                  hint="Commissions + seller closing"
                />
                <NumberField
                  label="Other selling costs"
                  prefix="$"
                  step={1000}
                  value={deal.otherSellingCosts}
                  onChange={(v) => set("otherSellingCosts", v)}
                  hint="Staging, concessions, repairs at sale"
                />
              </div>
            </Section>

            <Section title="Planning assumptions" collapsible defaultOpen={false}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Working capital reserve"
                  suffix="% of rehab"
                  value={deal.wcReservePct}
                  onChange={(v) => set("wcReservePct", v)}
                  hint="Planning assumption, not an industry standard"
                />
                <NumberField
                  label="Minimum working capital"
                  prefix="$"
                  step={5000}
                  value={deal.wcReserveMin}
                  onChange={(v) => set("wcReserveMin", v)}
                />
                <NumberField
                  label="Max LTARV screen"
                  suffix="%"
                  value={deal.maxLtarvPct}
                  onChange={(v) => set("maxLtarvPct", v)}
                />
                <NumberField
                  label="Max LTC screen"
                  suffix="%"
                  value={deal.maxLtcPct}
                  onChange={(v) => set("maxLtcPct", v)}
                />
              </div>
            </Section>

            {/* Full analysis --------------------------------------- */}
            <Section title="Full analysis">
              <div className="grid gap-x-8 gap-y-0 md:grid-cols-2">
                <div>
                  <Row label="Purchase funding" value={fmtMoney(r.purchaseFunding)} />
                  <Row label="Rehab funds available" value={fmtMoney(r.rehabAvailable)} />
                  <Row label="Total loan amount" value={fmtMoney(r.loanAmount)} strong />
                  <Row label="Down payment" value={fmtMoney(r.downPayment)} />
                  <Row
                    label="Borrower rehab contribution"
                    value={fmtMoney(r.borrowerRehabContribution)}
                  />
                  <Row label="Rehab contingency" value={fmtMoney(r.rehabContingency)} />
                  <Row label="Buyer closing costs" value={fmtMoney(r.buyerClosingCosts)} />
                </div>
                <div>
                  <Row label="Lender points" value={fmtMoney(r.lenderPoints)} />
                  <Row label="Other lender fees" value={fmtMoney(deal.otherLenderFees)} />
                  <Row label="Est. interest during hold" value={fmtMoney(r.interestDuringHold)} />
                  <Row label="Non-interest holding costs" value={fmtMoney(r.nonInterestHolding)} />
                  <Row label="Projected selling costs" value={fmtMoney(r.sellingCosts)} />
                  <Row
                    label="Projected total project cost"
                    value={fmtMoney(r.totalProjectCost)}
                    strong
                  />
                  <Row label="Break-even sale price" value={fmtMoney(r.breakEvenSalePrice)} />
                  <Row label="Profit margin on sale" value={fmtPct(r.profitMarginOnSale)} />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ScreenCard
                  label="Loan-to-cost (LTC)"
                  value={fmtPct(r.ltc)}
                  limit={`Screen: max ${deal.maxLtcPct}%`}
                  pass={r.ltcPass}
                />
                <ScreenCard
                  label="Loan-to-ARV (LTARV)"
                  value={fmtPct(r.ltarv)}
                  limit={`Screen: max ${deal.maxLtarvPct}%`}
                  pass={r.ltarvPass}
                />
              </div>
            </Section>

            {/* Stress test ----------------------------------------- */}
            <Section title="What if the project doesn't go as planned">
              <div className="no-print mb-5 grid gap-5 sm:grid-cols-3">
                <Slider
                  label="Sale price vs ARV"
                  value={stress.salePriceDeltaPct}
                  min={-25}
                  max={0}
                  step={1}
                  display={`${stress.salePriceDeltaPct}%`}
                  onChange={(v) => setStress((s) => ({ ...s, salePriceDeltaPct: v }))}
                />
                <Slider
                  label="Rehab overrun"
                  value={stress.rehabOverrunPct}
                  min={0}
                  max={50}
                  step={5}
                  display={`+${stress.rehabOverrunPct}%`}
                  onChange={(v) => setStress((s) => ({ ...s, rehabOverrunPct: v }))}
                />
                <Slider
                  label="Extra hold time"
                  value={stress.extraMonths}
                  min={0}
                  max={12}
                  step={1}
                  display={`+${stress.extraMonths} mo`}
                  onChange={(v) => setStress((s) => ({ ...s, extraMonths: v }))}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead>
                    <tr
                      className="border-b-2 text-left text-[11px] font-bold uppercase tracking-[0.1em]"
                      style={{ borderColor: "var(--brand)", color: "var(--brand-deep)" }}
                    >
                      <th className="py-2 pr-3 font-semibold">Scenario</th>
                      <th className="py-2 pr-3 text-right font-semibold">Sale price</th>
                      <th className="py-2 pr-3 text-right font-semibold">Rehab</th>
                      <th className="py-2 pr-3 text-right font-semibold">Hold</th>
                      <th className="py-2 pr-3 text-right font-semibold">Profit</th>
                      <th className="py-2 text-right font-semibold">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row.label}
                        className={`border-b border-slate-100 last:border-0 ${i === 0 ? "font-semibold" : ""}`}
                      >
                        <td className="py-2 pr-3 text-slate-700">{row.label}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                          {fmtMoney(row.salePrice)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                          {fmtMoney(row.rehabCost)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                          {row.months} mo
                        </td>
                        <td
                          className="py-2 pr-3 text-right font-semibold tabular-nums"
                          style={{ color: row.profit >= 0 ? "var(--pos)" : "var(--neg)" }}
                        >
                          {fmtMoney(row.profit)}
                        </td>
                        <td
                          className="py-2 text-right font-semibold tabular-nums"
                          style={{ color: row.profit >= 0 ? "var(--pos)" : "var(--neg)" }}
                        >
                          {fmtPct(row.roi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          {/* Results rail -------------------------------------------- */}
          <aside className="lg:sticky lg:top-5 lg:self-start">
            <div className="print-break space-y-3">
              <div
                className="rounded-xl border-t-4 p-5 text-white"
                style={{
                  borderColor: "var(--brand)",
                  background: `linear-gradient(160deg, var(--brand-deep) 0%, color-mix(in oklab, var(--brand-deep) 78%, black) 100%)`,
                }}
              >
                <div className="text-[12px] font-bold uppercase tracking-[0.12em] opacity-80">
                  Projected profit
                </div>
                <div className="mt-1 text-[40px] font-extrabold leading-none tabular-nums">
                  {fmtMoney(r.projectedProfit)}
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-white/20 pt-3">
                  <span className="text-[12px] opacity-80">ROI on cash invested</span>
                  <span className="text-[22px] font-bold leading-none tabular-nums">
                    {fmtPct(r.roiOnCash)}
                  </span>
                </div>
                {!profitPositive && (
                  <div className="mt-3 rounded-md bg-white/15 px-3 py-2 text-[12px] leading-snug">
                    This deal projects a loss at the assumptions entered.
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div
                  className="relative py-3 pl-6 pr-5 text-[13px] font-extrabold uppercase tracking-[0.13em]"
                  style={{ background: "var(--brand-wash)", color: "var(--brand-deep)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 w-[5px]"
                    style={{ background: "var(--brand)" }}
                    aria-hidden
                  />
                  Liquidity
                </div>
                <div className="space-y-3 border-t border-slate-200 px-5 py-4">
                  <Big label="Cash to close" value={fmtMoney(r.cashAtClosing)} />
                  <Big label="Post-closing working capital" value={fmtMoney(r.workingCapital)} />
                  <Big label="Total liquidity needed" value={fmtMoney(r.totalLiquidity)} accent />
                  <p className="border-t border-slate-100 pt-3 text-[12px] leading-snug text-slate-500">
                    What you need to close, what should remain afterward, and the combined amount.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div
                  className="relative py-3 pl-6 pr-5 text-[13px] font-extrabold uppercase tracking-[0.13em]"
                  style={{ background: "var(--brand-wash)", color: "var(--brand-deep)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 w-[5px]"
                    style={{ background: "var(--brand)" }}
                    aria-hidden
                  />
                  Loan & leverage
                </div>
                <div className="border-t border-slate-200 px-5 py-2">
                  <Row label="Total loan amount" value={fmtMoney(r.loanAmount)} />
                  <Row label="Loan-to-cost" value={fmtPct(r.ltc)} />
                  <Row label="Loan-to-ARV" value={fmtPct(r.ltarv)} />
                  <Row label="Break-even sale price" value={fmtMoney(r.breakEvenSalePrice)} />
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Footer ---------------------------------------------------- */}
        <footer className="print-break mt-8 rounded-xl border border-slate-200 bg-white p-5">
          {brand.contact.name && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[14px] font-bold text-slate-900">{brand.contact.name}</span>
              <span className="text-[13px] text-slate-500">{brand.contact.title}</span>
              <span className="text-slate-300">|</span>
              <span className="text-[13px] text-slate-600">{brand.company}</span>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
            {brand.contact.office && <span>O: {brand.contact.office}</span>}
            {brand.contact.mobile && <span>C: {brand.contact.mobile}</span>}
            {brand.contact.email && <span>{brand.contact.email}</span>}
            {brand.contact.website && (
              <a
                href={`https://${brand.contact.website}`}
                className="font-medium text-[var(--brand)] hover:underline"
              >
                {brand.contact.website}
              </a>
            )}
          </div>
          {brand.contact.address && (
            <div className="mt-1 text-[12px] text-slate-500">{brand.contact.address}</div>
          )}
          <div className="mt-2 text-[12px] font-semibold text-slate-700">{brand.nmls}</div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-[11.5px] leading-relaxed text-slate-500">
            {brand.disclaimer}
          </p>
        </footer>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------- printed page */

/**
 * The workbook's Deal Summary tab, rebuilt as the printed one-pager. Hidden on
 * screen; it replaces the interactive page entirely when someone prints or
 * saves a PDF, so what lands in an inbox is a clean lender-branded document
 * rather than a screenshot of a calculator.
 */
function PrintSummary({
  brand,
  deal,
  r,
}: {
  brand: LenderBrand;
  deal: DealInputs;
  r: ReturnType<typeof calculate>;
}) {
  const pair = (label: string, value: string) => (
    <div className="flex justify-between border-b border-slate-200 py-1.5">
      <span className="text-[11.5px] text-slate-600">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );

  return (
    <div className="print-only">
      <div className="flex items-center justify-between border-b-4 pb-3" style={{ borderColor: "var(--brand)" }}>
        <div className="flex items-center gap-4">
          {brand.logoSrc ? (
            <img src={brand.logoSrc} alt={brand.company} className="h-10 w-auto" />
          ) : (
            <span className="text-[18px] font-extrabold tracking-[0.14em]">{brand.wordmark}</span>
          )}
          <span
            className="border-l border-slate-300 pl-4 text-[13px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--brand-deep)" }}
          >
            Fix &amp; Flip Deal Summary
          </span>
        </div>
        <div className="text-right text-[10.5px] leading-tight text-slate-500">
          {brand.contact.name && <div>Prepared by {brand.contact.name}</div>}
          <div>{brand.nmls}</div>
        </div>
      </div>

      {deal.propertyAddress && (
        <div className="mt-3 text-[15px] font-bold text-slate-900">{deal.propertyAddress}</div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-8">
        <div>
          <div
            className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--brand-deep)" }}
          >
            Property &amp; project
          </div>
          {pair("Purchase price", fmtMoney(deal.purchasePrice))}
          {pair("Base rehab budget", fmtMoney(deal.rehabBase))}
          {pair("After-repair value (ARV)", fmtMoney(deal.arv))}
          {pair("Hold period", `${deal.holdMonths} months`)}
          {pair("Total loan amount", fmtMoney(r.loanAmount))}
          {pair("Purchase funding", fmtMoney(r.purchaseFunding))}
          {pair("Rehab funds available", fmtMoney(r.rehabAvailable))}
          {pair("Borrower rehab contribution", fmtMoney(r.borrowerRehabContribution))}
        </div>
        <div>
          <div
            className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--brand-deep)" }}
          >
            Financing &amp; liquidity
          </div>
          {pair("Cash required at closing", fmtMoney(r.cashAtClosing))}
          {pair("Post-closing working capital", fmtMoney(r.workingCapital))}
          {pair("Total liquidity needed", fmtMoney(r.totalLiquidity))}
          {pair("Loan-to-cost (LTC)", fmtPct(r.ltc))}
          {pair("Loan-to-ARV (LTARV)", fmtPct(r.ltarv))}
          {pair("Projected total project cost", fmtMoney(r.totalProjectCost))}
          {pair("Break-even sale price", fmtMoney(r.breakEvenSalePrice))}
          {pair("Profit margin on sale", fmtPct(r.profitMarginOnSale))}
        </div>
      </div>

      <div
        className="mt-4 flex items-center justify-between rounded-lg px-6 py-4 text-white"
        style={{ background: "var(--brand-deep)" }}
      >
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] opacity-80">
            Projected profit
          </div>
          <div className="text-[30px] font-extrabold leading-none tabular-nums">
            {fmtMoney(r.projectedProfit)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] opacity-80">
            ROI on cash invested
          </div>
          <div className="text-[30px] font-extrabold leading-none tabular-nums">
            {fmtPct(r.roiOnCash)}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        {brand.contact.name && (
          <div className="text-[11.5px] text-slate-700">
            <span className="font-bold text-slate-900">{brand.contact.name}</span>
            {brand.contact.title && <span> · {brand.contact.title}</span>}
            <span> · {brand.company}</span>
            {brand.contact.office && <span> · O: {brand.contact.office}</span>}
            {brand.contact.mobile && <span> · C: {brand.contact.mobile}</span>}
            {brand.contact.website && <span> · {brand.contact.website}</span>}
          </div>
        )}
        {brand.contact.address && (
          <div className="text-[10.5px] text-slate-500">{brand.contact.address}</div>
        )}
        <div className="mt-1 text-[10.5px] font-semibold text-slate-700">{brand.nmls}</div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-slate-500">{brand.disclaimer}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ sub-widgets */

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-slate-500">
        <Term label={label} />
      </div>
      <div
        className="text-[24px] font-bold leading-tight tabular-nums"
        style={{ color: accent ? "var(--brand)" : "#0f172a" }}
      >
        {value}
      </div>
    </div>
  );
}

function ScreenCard({
  label,
  value,
  limit,
  pass,
}: {
  label: string;
  value: string;
  limit: string;
  pass: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div>
        <div className="text-[12px] text-slate-500">
          <Term label={label} />
        </div>
        <div className="text-[19px] font-bold tabular-nums text-slate-900">{value}</div>
        <div className="text-[11px] text-slate-400">{limit}</div>
      </div>
      <span
        className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
        style={{ background: pass ? "var(--pos)" : "var(--neg)" }}
      >
        {pass ? "Pass" : "Over"}
      </span>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-slate-700">{label}</span>
        <span className="text-[13px] font-bold tabular-nums text-[var(--brand)]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--brand)]"
      />
    </label>
  );
}
