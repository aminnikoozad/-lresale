import 'server-only';
import { createHash } from 'node:crypto';
import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from './admin-auth';
import { postalStorage } from './postal-server';
import { labelRequest, type Sender, type LabelCredentials, type LabelInput } from './canada-post-label';

export function labelConfiguration() {
  const credentials: LabelCredentials = {clientId:process.env.CANADA_POST_CLIENT_ID ?? '',clientSecret:process.env.CANADA_POST_CLIENT_SECRET ?? '',customerNumber:process.env.CANADA_POST_CUSTOMER_NUMBER ?? '',contractId:process.env.CANADA_POST_CONTRACT_ID};
  let sender: Sender | null=null;
  try { sender=JSON.parse(process.env.CANADA_POST_SENDER_JSON ?? 'null'); } catch { /* Readiness below fails closed. */ }
  const payment=process.env.CANADA_POST_PAYMENT_METHOD;
  const missing: string[]=[];
  for(const [key,value] of Object.entries({CANADA_POST_CLIENT_ID:credentials.clientId,CANADA_POST_CLIENT_SECRET:credentials.clientSecret,CANADA_POST_CUSTOMER_NUMBER:credentials.customerNumber,CANADA_POST_SENDER_JSON:sender,CANADA_POST_PAYMENT_METHOD:['CreditCard','Account'].includes(payment ?? '')})) if(!value) missing.push(key);
  if(payment==='Account' && !credentials.contractId) missing.push('CANADA_POST_CONTRACT_ID');
  if(process.env.CANADA_POST_LABELS_ENABLED!=='true') missing.push('CANADA_POST_LABELS_ENABLED=true');
  if(process.env.CANADA_POST_MODE!=='production') missing.push('CANADA_POST_MODE=production');
  if(!missing.length) try {
    labelRequest({requestId:'readiness',serviceCode:'DOM.RP',sender:sender!,destination:{name:'Readiness',addressDetails:sender!.addressDetails},parcel:{itemId:'readiness',weightGrams:500,lengthMm:300,widthMm:200,heightMm:100,mailingTube:false,unpackaged:false,band:1},mailingDate:'2026-01-01',payment:payment as 'CreditCard'|'Account'},credentials);
  } catch {missing.push('Valid sender, customer number and payment settings');}
  const fingerprint=createHash('sha256').update(JSON.stringify({credentials,sender,payment})).digest('hex');
  return {fingerprint,credentials,sender,payment:payment as LabelInput['payment'],missing,ready:missing.length===0};
}
export async function labelContext(orderId: string) {
  const {access,user}=await requireAdmin();
  if(!access.can_manage_shipping) redirect('/admin');
  if(!access.has_aal2) redirect('/admin/mfa');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) notFound();
  const db=postalStorage();
  const {data:order,error}=await db.from('orders').select('id,status,payment_status,paid_at,tracking_number,recipient_name,address_line1,address_line2,city,province,postal_code').eq('id',orderId).single();
  if(error || !order) notFound();
  return {db,order,user};
}
