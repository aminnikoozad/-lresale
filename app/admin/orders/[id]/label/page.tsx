import Link from 'next/link';
import { labelConfiguration, labelContext } from '@/lib/order-label-server';
import { quoteOrderLabel, purchaseOrderLabel } from './actions';
import '../../../operations/operations.css';
export const dynamic='force-dynamic';
const money=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n/100);
export default async function OrderLabelPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{message?:string}>}) {
  const {id}=await params; const {db,order}=await labelContext(id); const config=labelConfiguration();
  const [{data:label,error},query]=await Promise.all([db.from('order_shipping_labels').select('id,status,request,estimate_cents,expires_at,tracking_number,charged_cents').eq('order_id',id).maybeSingle(),searchParams]);
  const eligible=order.payment_status==='paid'&&order.paid_at&&['paid','processing'].includes(order.status)&&!order.tracking_number;
  const request=label?.request;
  const pending=label&&label.status!=='quoted'&&label.status!=='created';
  return <main className="ops-shell"><section className="ops-wrap">
    <Link href="/admin/orders">← Orders</Link><h1>Canada Post label</h1>
    <p>Order {id.slice(0,8).toUpperCase()} · {order.recipient_name}</p>
    <p>{order.address_line1} {order.address_line2}, {order.city}, {order.province} {order.postal_code}</p>
    {query.message?<p className="ops-message" role="status">{query.message}</p>:null}
    {!config.ready?<section className="ops-card"><h2>Shipping setup required</h2><p>Configure these server environment settings in Vercel, then redeploy:</p><ul>{config.missing.map(key=><li key={key}><code>{key}</code></li>)}</ul><p>Subscribe the existing Production app to the Shipping API. Add the sender address and a default payment card in Canada Post. Enable purchases only after testing. See the repository’s Canada Post label setup guide.</p></section>:null}
    {error?<p role="alert">Label storage is unavailable. Apply the order shipping labels migration before continuing.</p>:null}
    {label?.status==='created'?<section className="ops-card"><h2>Label ready</h2><p>Tracking: {label.tracking_number}</p><p>Postage charged: {money(label.charged_cents)}</p><a className="ops-button" href={`/admin/orders/${id}/label/pdf`} target="_blank" rel="noopener noreferrer">Open PDF / print label</a><p>Print at actual size (100%). Purchasing a label does not mark the order shipped. Use this tracking number when handing the parcel to Canada Post.</p></section>:null}
    {pending?<section className="ops-card"><h2>Purchase requires review</h2><p>A purchase was submitted. It may have charged your account. Repeated purchases are blocked.</p><p>Canada Post request reference: <code>{request.requestId}</code></p><p>Check the shipment in Canada Post before any manual recovery. A request timeout does not mean the purchase failed.</p></section>:null}
    {!eligible&&!label?<p>A verified paid, unshipped order is required to purchase postage.</p>:null}
    {eligible&&!error&&(!label||label.status==='quoted')?<section className="ops-card"><h2>1. Measure the packed order</h2><p>Place all items from this order in one parcel. Enter its final packed weight and outside dimensions. Tubes, unpackaged goods and multiple parcels require manual handling.</p><form action={quoteOrderLabel} className="admin-item-form"><input type="hidden" name="order" value={id}/>
      <label>Weight (grams)<input type="number" name="weight" min="1" max="30000" required defaultValue={request?.parcel.weightGrams}/></label>
      {(['length','width','height'] as const).map(key=><label key={key}>{key} (mm)<input type="number" name={key} min="1" max="2000" required defaultValue={request?.parcel[`${key}Mm`]}/></label>)}
      <label>Service<select name="service" defaultValue={request?.serviceCode??'DOM.RP'}><option value="DOM.RP">Regular Parcel</option><option value="DOM.EP">Expedited Parcel</option><option value="DOM.XP">Xpresspost</option><option value="DOM.PC">Priority</option></select></label>
      <label>Mailing date<input name="mailingDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label><button disabled={!config.ready}>Get postage estimate</button></form></section>:null}
    {label?.status==='quoted'&&eligible?<section className="ops-card"><h2>2. Review and purchase</h2><p>{request.serviceCode} · {request.parcel.weightGrams} g · {request.parcel.lengthMm} × {request.parcel.widthMm} × {request.parcel.heightMm} mm · Mailing {request.mailingDate}</p><p>From: {request.sender.company}, {request.sender.addressDetails.addressLine1}, {request.sender.addressDetails.city}, {request.sender.addressDetails.provState} {request.sender.addressDetails.postalZipCode}</p><p>Estimated postage: <strong>{money(label.estimate_cents)}</strong>, including quoted taxes. Valid until {new Date(label.expires_at).toLocaleString('en-CA',{timeZone:'America/Toronto'})} (Toronto).</p><p>Canada Post charges your configured {request.payment==='Account'?'contract account':'default card'} immediately. Final postage can differ from the estimate or be adjusted by Canada Post. This is a separate expense from the shipping amount paid by the buyer.</p><form action={purchaseOrderLabel}><input type="hidden" name="order" value={id}/><input type="hidden" name="label" value={label.id}/><input type="hidden" name="reference" value={request.requestId}/><label><input type="checkbox" name="confirm" value="yes" required/> I checked the addresses, packed measurements and service, and authorize the Canada Post postage charge.</label><p><button disabled={!config.ready}>Purchase label</button></p></form></section>:null}
  </section></main>;
}
