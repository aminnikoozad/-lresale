import type { ShippingQuote } from "@/lib/shipping";
export type ShippingRequest={itemIds:string[];postalCode:string};
export interface ShippingRateProvider { readonly id:string; quote(request:ShippingRequest):Promise<ShippingQuote>; }
export class InternalShippingProvider implements ShippingRateProvider {
 readonly id="rewear-internal-v1";
 constructor(private readonly quoteInternal:(request:ShippingRequest)=>Promise<ShippingQuote>){}
 quote(request:ShippingRequest){return this.quoteInternal(request);}
}
export class FallbackShippingProvider implements ShippingRateProvider {
 readonly id="carrier-with-internal-fallback";
 constructor(private readonly primary:ShippingRateProvider|null,private readonly fallback:ShippingRateProvider){}
 async quote(request:ShippingRequest){if(this.primary){try{const q=await this.primary.quote(request);if(q.status==="ok"||q.status==="local_free")return q;}catch(e){console.error("[shipping] carrier provider failure",{provider:this.primary.id});}}return this.fallback.quote(request);}
}
