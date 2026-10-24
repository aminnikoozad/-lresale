export const financeKinds = ['payments', 'earnings', 'payouts'] as const;
export type FinanceKind = typeof financeKinds[number];
export function financeFilter(kind?: string, page?: string) {
  return {
    kind: financeKinds.includes(kind as FinanceKind) ? kind as FinanceKind : 'payments' as FinanceKind,
    page: page && /^[1-9]\d{0,4}$/.test(page) ? Number(page) : 1,
  };
}
export type FinanceRow = {
  id: string; name: string; amountCents: number | null; status: string; createdAt: string;
  [key: string]: unknown;
};
