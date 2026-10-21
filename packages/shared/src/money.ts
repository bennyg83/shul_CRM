// ---------------------------------------------------------------------------
// What has been paid towards a pledge.
//
// A pledge is promised in one currency. A donation against it may be recorded
// in another, and there is no exchange rate in this app — inventing one would
// quietly misstate what a family owes. So money paid in the pledge's own
// currency counts against it, and anything else is reported beside it.
// ---------------------------------------------------------------------------

export interface PledgePayments {
  /** Paid in the pledge's own currency. */
  paid: number;
  /** Still owed in the pledge's own currency; never below zero. */
  balance: number;
  /** Paid against this pledge in other currencies, which cannot be netted off. */
  paidOther: Record<string, number>;
}

type MoneyRow = { amount: number; currency: string };

export function pledgePayments(pledge: MoneyRow, donations: ReadonlyArray<MoneyRow>): PledgePayments {
  let paid = 0;
  const paidOther: Record<string, number> = {};
  for (const d of donations) {
    if (d.currency === pledge.currency) paid += d.amount;
    else paidOther[d.currency] = (paidOther[d.currency] ?? 0) + d.amount;
  }
  return { paid, balance: Math.max(0, pledge.amount - paid), paidOther };
}

/** True when anything was paid towards this pledge in a currency it was not promised in. */
export const hasOtherCurrency = (p: Pick<PledgePayments, 'paidOther'>) => Object.keys(p.paidOther).length > 0;

/** Add an amount to a per-currency running total. */
export function addMoney(totals: Record<string, number>, currency: string, amount: number): void {
  if (amount !== 0) totals[currency] = (totals[currency] ?? 0) + amount;
}

/** "£500" / "£500 and €20", for saying what was paid in other currencies. */
export function describeOtherCurrencies(
  paidOther: Record<string, number>,
  format: (amount: number, currency: string) => string,
): string {
  const parts = Object.entries(paidOther).map(([currency, amount]) => format(amount, currency));
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
