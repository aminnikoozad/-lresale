import type { SaleMode } from "./marketplace";
export type SellerLedgerRow = {amount_cents:number;status:string;transaction_type:string;sale_mode:SaleMode|null};
export function sellerBalances(rows:SellerLedgerRow[]) {
  const result = {managed_consignment:{pending:0,confirmed:0},peer_to_peer:{pending:0,confirmed:0},unallocated:0};
  for (const row of rows) {
    if (!Number.isSafeInteger(row.amount_cents) || !["sale_credit","adjustment","payout_debit","missed_pickup_fee"].includes(row.transaction_type)) continue;
    if (row.status === "reversed") continue;
    if (row.sale_mode !== "managed_consignment" && row.sale_mode !== "peer_to_peer") { result.unallocated++; continue; }
    const balance = result[row.sale_mode];
    if (row.status === "pending" && row.transaction_type === "sale_credit") balance.pending += row.amount_cents;
    if (row.status === "completed") balance.confirmed += row.amount_cents;
  }
  return result;
}

export type SellerBalances = ReturnType<typeof sellerBalances>;
