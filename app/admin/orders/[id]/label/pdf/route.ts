import { labelConfiguration, labelContext } from '@/lib/order-label-server';
import { downloadLabel } from '@/lib/canada-post-label';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params; const {db}=await labelContext(id);
  const {data}=await db.from('order_shipping_labels').select('artifact_url,status').eq('order_id',id).eq('status','created').maybeSingle();
  if(!data) return new Response('Label not found',{status:404});
  try {
    const bytes=await downloadLabel(data.artifact_url,labelConfiguration().credentials);
    return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="canada-post-${id}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch { return new Response('Label temporarily unavailable. Do not purchase another label.',{status:502,headers:{'Cache-Control':'no-store'}}); }
}
