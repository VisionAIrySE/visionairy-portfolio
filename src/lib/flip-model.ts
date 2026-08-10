/**
 * Fix & Flip deal model.
 *
 * Ported from the "Fix-and-Flip Analyzer.xlsx" workbook and verified against it
 * line by line: total loan, cash to close, interest during hold, non-interest
 * holding, selling costs, total project cost, projected profit, ROI, LTC,
 * LTARV, profit margin and break-even sale price all reconcile to the dollar.
 *
 * One deliberate divergence: the workbook's stress-test table returned HIGHER
 * profit for a lower sale price and for a rehab overrun. That is impossible, so
 * scenarios here are computed by re-running the full model with the stressed
 * inputs rather than by adjusting the base-case profit.
 */

export interface DealInputs {
  propertyAddress: string;
  purchasePrice: number;
  arv: number;
  rehabBase: number;
  rehabContingencyPct: number;
  holdMonths: number;

  purchaseFinancedPct: number;
  rehabFinancedPct: number;
  interestRatePct: number;
  lenderPointsPct: number;
  otherLenderFees: number;

  buyerClosingPct: number;
  taxesPerMonth: number;
  insurancePerMonth: number;
  utilitiesPerMonth: number;
  sellingCostPct: number;
  otherSellingCosts: number;

  wcReservePct: number;
  wcReserveMin: number;
  maxLtarvPct: number;
  maxLtcPct: number;
}

export interface DealResults {
  purchaseFunding: number;
  rehabAvailable: number;
  loanAmount: number;
  downPayment: number;
  borrowerRehabContribution: number;
  rehabContingency: number;
  rehabTotal: number;

  buyerClosingCosts: number;
  lenderPoints: number;
  interestDuringHold: number;
  nonInterestHolding: number;
  sellingCosts: number;

  cashAtClosing: number;
  workingCapital: number;
  totalLiquidity: number;
  totalProjectCost: number;

  projectedProfit: number;
  roiOnCash: number;
  profitMarginOnSale: number;
  ltc: number;
  ltarv: number;
  breakEvenSalePrice: number;

  ltarvPass: boolean;
  ltcPass: boolean;
}

export const DEFAULT_DEAL: DealInputs = {
  propertyAddress: "",
  purchasePrice: 500000,
  arv: 800000,
  rehabBase: 100000,
  rehabContingencyPct: 10,
  holdMonths: 6,

  purchaseFinancedPct: 80,
  rehabFinancedPct: 100,
  interestRatePct: 12,
  lenderPointsPct: 2,
  otherLenderFees: 2500,

  buyerClosingPct: 5,
  taxesPerMonth: 500,
  insurancePerMonth: 300,
  utilitiesPerMonth: 500,
  sellingCostPct: 8,
  otherSellingCosts: 0,

  wcReservePct: 20,
  wcReserveMin: 25000,
  maxLtarvPct: 65,
  maxLtcPct: 90,
};

/** Overrides used to stress a deal without mutating the borrower's inputs. */
export interface Stress {
  salePrice?: number;
  rehabBase?: number;
  holdMonths?: number;
}

export function calculate(d: DealInputs, stress: Stress = {}): DealResults {
  const salePrice = stress.salePrice ?? d.arv;
  const rehabBase = stress.rehabBase ?? d.rehabBase;
  const months = stress.holdMonths ?? d.holdMonths;

  const purchaseFunding = d.purchasePrice * (d.purchaseFinancedPct / 100);
  const rehabAvailable = rehabBase * (d.rehabFinancedPct / 100);
  const loanAmount = purchaseFunding + rehabAvailable;
  const downPayment = d.purchasePrice - purchaseFunding;
  const borrowerRehabContribution = Math.max(0, rehabBase - rehabAvailable);

  const rehabContingency = rehabBase * (d.rehabContingencyPct / 100);
  const rehabTotal = rehabBase + rehabContingency;

  const buyerClosingCosts = d.purchasePrice * (d.buyerClosingPct / 100);
  const lenderPoints = loanAmount * (d.lenderPointsPct / 100);

  // Purchase funds are drawn at closing; rehab funds arrive through draws, so
  // the average outstanding balance carries roughly half the rehab line.
  const avgBalance = purchaseFunding + rehabAvailable / 2;
  const interestDuringHold = avgBalance * (d.interestRatePct / 100) * (months / 12);

  const monthlyCarryNonInterest = d.taxesPerMonth + d.insurancePerMonth + d.utilitiesPerMonth;
  const nonInterestHolding = monthlyCarryNonInterest * months;

  const sellingCosts = salePrice * (d.sellingCostPct / 100) + d.otherSellingCosts;

  const cashAtClosing = downPayment + buyerClosingCosts + lenderPoints + d.otherLenderFees;

  // Working capital is the greater of the reserve percentage, two months of
  // carrying costs including interest, or the stated minimum. Planning rule,
  // not an approval requirement.
  const monthlyCarryAll =
    monthlyCarryNonInterest + (avgBalance * (d.interestRatePct / 100)) / 12;
  const workingCapital = Math.max(
    rehabBase * (d.wcReservePct / 100),
    2 * monthlyCarryAll,
    d.wcReserveMin,
  );

  const totalLiquidity = cashAtClosing + workingCapital;

  const totalProjectCost =
    d.purchasePrice +
    rehabTotal +
    buyerClosingCosts +
    lenderPoints +
    d.otherLenderFees +
    interestDuringHold +
    nonInterestHolding +
    sellingCosts;

  const projectedProfit = salePrice - totalProjectCost;
  const roiOnCash = totalLiquidity > 0 ? projectedProfit / totalLiquidity : 0;
  const profitMarginOnSale = salePrice > 0 ? projectedProfit / salePrice : 0;

  const ltc =
    d.purchasePrice + rehabBase > 0 ? loanAmount / (d.purchasePrice + rehabBase) : 0;
  const ltarv = d.arv > 0 ? loanAmount / d.arv : 0;

  const costExcludingSelling = totalProjectCost - sellingCosts;
  const sellRate = d.sellingCostPct / 100;
  const breakEvenSalePrice =
    sellRate < 1 ? (costExcludingSelling + d.otherSellingCosts) / (1 - sellRate) : 0;

  return {
    purchaseFunding,
    rehabAvailable,
    loanAmount,
    downPayment,
    borrowerRehabContribution,
    rehabContingency,
    rehabTotal,
    buyerClosingCosts,
    lenderPoints,
    interestDuringHold,
    nonInterestHolding,
    sellingCosts,
    cashAtClosing,
    workingCapital,
    totalLiquidity,
    totalProjectCost,
    projectedProfit,
    roiOnCash,
    profitMarginOnSale,
    ltc,
    ltarv,
    breakEvenSalePrice,
    ltarvPass: ltarv <= d.maxLtarvPct / 100,
    ltcPass: ltc <= d.maxLtcPct / 100,
  };
}

export interface ScenarioRow {
  label: string;
  salePrice: number;
  rehabCost: number;
  months: number;
  profit: number;
  roi: number;
}

export interface StressSettings {
  salePriceDeltaPct: number; // negative, e.g. -5
  rehabOverrunPct: number; // positive, e.g. 10
  extraMonths: number; // e.g. 2
}

export const DEFAULT_STRESS: StressSettings = {
  salePriceDeltaPct: -5,
  rehabOverrunPct: 10,
  extraMonths: 2,
};

export function scenarios(d: DealInputs, s: StressSettings): ScenarioRow[] {
  const lowSale = d.arv * (1 + s.salePriceDeltaPct / 100);
  const overRehab = d.rehabBase * (1 + s.rehabOverrunPct / 100);
  const longHold = d.holdMonths + s.extraMonths;

  const build = (label: string, st: Stress): ScenarioRow => {
    const r = calculate(d, st);
    return {
      label,
      salePrice: st.salePrice ?? d.arv,
      rehabCost: st.rehabBase ?? d.rehabBase,
      months: st.holdMonths ?? d.holdMonths,
      profit: r.projectedProfit,
      roi: r.roiOnCash,
    };
  };

  return [
    build("Base case", {}),
    build("Sale price lower", { salePrice: lowSale }),
    build("Rehab over budget", { rehabBase: overRehab }),
    build("Longer hold", { holdMonths: longHold }),
    build("Combined downside", {
      salePrice: lowSale,
      rehabBase: overRehab,
      holdMonths: longHold,
    }),
  ];
}

const money0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.5) return "—";
  return n < 0 ? `(${money0.format(Math.abs(n))})` : money0.format(n);
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  const v = (n * 100).toFixed(digits);
  return n < 0 ? `(${v.replace("-", "")}%)` : `${v}%`;
}
