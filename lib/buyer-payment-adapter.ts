/** Provider-specific adapters must verify raw webhook signatures before creating this internal value.
 * Browser success URLs are never payment evidence. No adapter is installed or selected today.
 */
export type VerifiedPayment = {attemptId:string;eventId:string;paymentId:string;payloadSha256:string;amountCents:number;currency:"CAD";succeeded:boolean};
export interface BuyerPaymentAdapter {
 verifyWebhook(rawBody:Uint8Array,headers:Headers):Promise<VerifiedPayment>;
 createSession(input:{orderId:string;attemptId:string;idempotencyKey:string;totalCents:number;currency:"CAD"}):Promise<{checkoutId:string;url:string}>;
}
export const buyerPaymentAdapter: BuyerPaymentAdapter|null = null;
