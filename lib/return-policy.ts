export const ISSUE_ONLY_RETURN_POLICY_VERSION = "2026-10-26";
export const ISSUE_RETURN_REASONS = ["not_as_described", "damaged", "wrong_item"] as const;

export function issueOnlyReturns(version: string | null | undefined): boolean {
  return !!version && version >= ISSUE_ONLY_RETURN_POLICY_VERSION;
}

export function withinReturnReportingPeriod(deliveredAt: string | null | undefined, now = Date.now()): boolean {
  if (!deliveredAt) return false;
  const delivered = Date.parse(deliveredAt);
  return Number.isFinite(delivered) && delivered <= now && now <= delivered + 7 * 24 * 60 * 60 * 1000;
}
