'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { canadaPostRates } from '@/lib/canada-post';
import { createLabel, labelRequest, type LabelInput } from '@/lib/canada-post-label';
import { labelConfiguration, labelContext } from '@/lib/order-label-server';
import { postalCode, type Parcel } from '@/lib/postal';
function finish(id:string,message:string):never { revalidatePath(`/admin/orders/${id}/label`); redirect(`/admin/orders/${id}/label?${new URLSearchParams({message})}`); }
export async function quoteOrderLabel(form:FormData) {
  const id=String(form.get('order')??'');
  const {db,order,user}=await labelContext(id);
  const config=labelConfiguration();
  if(!config.ready) finish(id,'Complete shipping setup before requesting an estimate.');
  if(order.payment_status!=='paid'||!order.paid_at||!['paid','processing'].includes(order.status)||order.tracking_number) finish(id,'A verified paid, unshipped order is required.');
  const parcel:Parcel={itemId:id,weightGrams:Number(form.get('weight')),lengthMm:Number(form.get('length')),widthMm:Number(form.get('width')),heightMm:Number(form.get('height')),mailingTube:false,unpackaged:false,band:1};
  const input:LabelInput={requestId:randomUUID().replaceAll('-',''),sender:config.sender!,payment:config.payment,serviceCode:String(form.get('service')),parcel,mailingDate:String(form.get('mailingDate')),destination:{name:order.recipient_name,addressDetails:{addressLine1:order.address_line1,...(order.address_line2?{addressLine2:order.address_line2}:{}),city:order.city,provState:order.province,countryCode:'CA',postalZipCode:postalCode(order.postal_code)}}};
  let estimate:number;
  try {
    labelRequest(input,config.credentials);
    const today=new Date().toISOString().slice(0,10);
    if(input.mailingDate<today||input.mailingDate>new Date(Date.now()+7*86400000).toISOString().slice(0,10)) throw new Error();
    const rates=await canadaPostRates([parcel],postalCode(input.sender.addressDetails.postalZipCode),input.destination.addressDetails.postalZipCode,config.credentials);
    const rate=rates.find(r=>r.serviceCode===input.serviceCode); if(!rate) throw new Error(); estimate=rate.totalCents;
  } catch { finish(id,'No estimate saved. Check addresses, packed measurements, mailing date and Canada Post access.'); }
  const row={configuration_hash:config.fingerprint,request:input,estimate_cents:estimate,expires_at:new Date(Date.now()+10*60000).toISOString(),created_by:user.id,updated_at:new Date().toISOString()};
  const {data:existing,error:readError}=await db.from('order_shipping_labels').select('id,status').eq('order_id',id).maybeSingle();
  if(readError) finish(id,'Shipping storage is unavailable. Apply the label migration.');
  if(existing && existing.status!=='quoted') finish(id,'A purchase was already attempted. Review its result before doing anything else.');
  const result=existing ? await db.from('order_shipping_labels').update(row).eq('id',existing.id).eq('status','quoted').select('id') : await db.from('order_shipping_labels').insert({...row,order_id:id}).select('id');
  finish(id,result.error||!result.data?.length?'Estimate was not saved. Reload the order.':'Estimate ready. Review the parcel and cost before purchasing.');
}
export async function purchaseOrderLabel(form:FormData) {
  const id=String(form.get('order')??''); const {db,user}=await labelContext(id);
  const config=labelConfiguration(); if(!config.ready || form.get('confirm')!=='yes') finish(id,'Shipping setup and explicit purchase confirmation are required.');
  const labelId=String(form.get('label')??''); const requestId=String(form.get('reference')??'');
  const {data:owned}=await db.from('order_shipping_labels').select('id,configuration_hash,request').eq('id',labelId).eq('order_id',id).maybeSingle();
  if(!owned || owned.configuration_hash!==config.fingerprint || owned.request.mailingDate<new Date().toISOString().slice(0,10)) finish(id,'Shipping settings or mailing date changed. Refresh the estimate.');
  const {data:locked,error}=await db.rpc('begin_order_label_purchase',{p_label:labelId,p_actor:user.id,p_request_id:requestId,p_configuration_hash:config.fingerprint});
  if(error||!locked) finish(id,'The estimate expired, changed or was already submitted. Reload the order.');
  let result;
  try { result=await createLabel(locked.request as LabelInput,config.credentials); }
  catch {
    await db.from('order_shipping_labels').update({status:'review_required',updated_at:new Date().toISOString()}).eq('id',labelId).eq('status','submitting');
    finish(id,'Purchase result needs review. Do not retry: check Canada Post using the request reference shown here.');
  }
  const {error:saveError}=await db.from('order_shipping_labels').update({status:'created',shipment_id:result.shipmentId,tracking_number:result.tracking,artifact_url:result.artifact,charged_cents:result.chargedCents,updated_at:new Date().toISOString()}).eq('id',labelId).eq('status','submitting');
  if(saveError) finish(id,'Canada Post created the shipment, but saving failed. Do not purchase again. Recover it in Canada Post using the request reference.');
  revalidatePath('/admin/orders');
  finish(id,'Label purchased. Download the PDF to print. Mark the order shipped when you hand over the parcel.');
}
