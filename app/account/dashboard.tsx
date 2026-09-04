"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, CircleDollarSign, HeartHandshake, LockKeyhole, Package, RotateCcw, Shirt, ShoppingBag, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { createCollectionRequest } from "./actions";

type Item = { id:string; name:string; status:string; price:string };
type Request = { id:string; type:string; category:string; status:string; holdStatus:string; createdAt:string };
type Props = {
  name:string;
  message:string|null;
  messageType:"success"|"error";
  balance:string;
  totalEarned:string;
  items:Item[];
  requests:Request[];
};

export function Dashboard({name,message,messageType,balance,totalEarned,items,requests}:Props){
  return <div className="dashboard">
    <section className="welcome"><div><p className="eyebrow dark">Customer dashboard</p><h1>Welcome, {name}.</h1><p>See your balance, follow every item and arrange your next collection.</p></div><div className="dash-actions"><RequestDialog type="bag" label="Request a Bag" icon={<Package/>}/><RequestDialog type="pickup" label="Request pickup" icon={<Truck/>}/></div></section>
    {message&&<div className={`success-banner ${messageType}`}>{messageType==="success"?<CheckCircle2/>:<AlertCircle/>}{message}</div>}
    <section className="stats"><article className="balance-stat"><div><Wallet/><span>Available balance</span></div><strong>{balance}</strong><small>Use it to shop now or request payout later</small><Button size="sm" disabled><ShoppingBag/> Shop with balance</Button></article><article><div><Shirt/><span>Items with us</span></div><strong>{items.length}</strong><small>Fashion and electronics</small></article><article><div><CircleDollarSign/><span>Total earned</span></div><strong>{totalEarned}</strong><small>Completed sale credits</small></article></section>
    <section className="account-panel"><Tabs defaultValue="items"><TabsList><TabsTrigger value="items">My items</TabsTrigger><TabsTrigger value="requests">My requests</TabsTrigger><TabsTrigger value="payout">Payout</TabsTrigger></TabsList><TabsContent value="items"><div className="panel-title"><div><h2>Items we’re handling for you</h2><p>Follow each item from collection and inspection through listing, sale and payout.</p></div><RequestDialog type="pickup" label="Arrange collection" icon={<Truck/>}/></div>{items.length?<div className="item-table"><div className="table-head"><span>Item</span><span>Status</span><span>Sale value</span></div>{items.map((item)=><div className="table-row" key={item.id}><span>{item.name}</span><span><i className={`status ${item.status.toLowerCase()}`}/>{item.status}</span><strong>{item.price}</strong></div>)}</div>:<div className="empty-box"><Shirt/><h2>No items yet</h2><p>Your accepted items will appear here after collection and inspection.</p></div>}</TabsContent><TabsContent value="requests">{requests.length?<div className="request-list">{requests.map((request)=><article key={request.id}><div><b>{request.type}</b><span>{request.category} · {request.createdAt}</span></div><div><strong>{request.status}</strong><small>$20 hold: {request.holdStatus}</small></div></article>)}</div>:<div className="empty-box"><Package/><h2>No requests yet</h2><p>Order a Bag or arrange a pickup when your eligible items total at least $100.</p></div>}</TabsContent><TabsContent value="payout"><div className="payout-box"><Wallet/><div><h2>{balance} available</h2><p>Payout setup will become available after payment verification is connected.</p></div><Button disabled>Set up payout</Button></div></TabsContent></Tabs></section>
    <section className="consignment-status"><div className="end-choice"><b>Unsold item preference</b><button disabled><HeartHandshake/> Donate</button><button disabled><RotateCcw/> Return to me</button><small>This choice becomes available when an item is accepted.</small></div></section>
    <section className="mini-rules"><b>Quick check before sending</b><span>✓ Each clothing piece has $10+ resale value</span><span>✓ Estimated total is $100+</span><span>✓ Washed and neatly folded</span><span>✓ No stains, tears or damage</span></section>
  </div>;
}

function RequestDialog({label,icon,type}:{label:string;icon:React.ReactNode;type:"bag"|"pickup"}){
  const [open,setOpen]=useState(false);
  const [category,setCategory]=useState<"clothing"|"electronics">("clothing");
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant={type==="bag"?"default":"outline"}>{icon}{label}</Button></DialogTrigger>
    <DialogContent className="request-dialog">
      <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>Tell us what you want collected. We’ll review the request and contact you to confirm the next step.</DialogDescription></DialogHeader>
      <form className="request-form" action={createCollectionRequest}>
        <div className="request-form-scroll">
          <input type="hidden" name="request_type" value={type}/>
          <label>What are we collecting?<select name="category" value={category} onChange={event=>setCategory(event.target.value as "clothing"|"electronics")}><option value="clothing">Clothing, shoes or accessories</option><option value="electronics">Electronics</option></select></label>
          <div className="hold-card"><LockKeyhole/><div><b>$20 temporary authorization required after approval</b><p>No card information is collected on this form. We’ll send the secure authorization step after confirming your request.</p></div></div>
          <label>Collection address<Input name="address" required minLength={10} maxLength={500} autoComplete="street-address" placeholder="Street address, city, postal code"/></label>
          <label>Estimated total resale value<Input name="estimated_value" required type="number" min="100" max="1000000" step="1" inputMode="decimal" placeholder="$100 minimum"/></label>
          <div className="terms-box"><b>Required terms for {category}</b>{category==="clothing"?<><p>• Eligible clothing must total at least $100 and each piece should be worth at least $10.</p><p>• Items must be washed, folded and free of stains, tears, holes or missing parts.</p><p>• Accepted clothing is listed for up to 90 days. Unsold items may be donated, auctioned or returned according to your choice.</p></>:<><p>• Devices must power on, function properly and be free of serious physical damage.</p><p>• You must verify ownership. We may check identification, serial numbers or IMEI.</p><p>• Passwords, user accounts and activation locks must be removed before collection.</p><p>• Our technicians test the device and Rewear determines its resale value.</p></>}<p>• Pickup dates are determined and confirmed by Rewear.</p><p>• Company share: 55% up to $100; 50% from $101–$199; 40% from $200–$499; 30% from $500+.</p></div>
          <label className="check"><input name="condition_confirmed" value="accepted" required type="checkbox"/> I confirm my {category} meets the condition, ownership and minimum-value requirements.</label>
          <label className="check"><input name="policy_accepted" value="accepted" required type="checkbox"/> I accept the selling period, commission rates and collection policy.</label>
          <label className="check"><input name="hold_terms_accepted" value="accepted" required type="checkbox"/> I agree to complete a temporary $20 card authorization after the request is approved.</label>
        </div>
        <div className="request-form-footer"><Button type="submit">Submit collection request</Button><small className="payment-note">This form does not collect or store card details.</small></div>
      </form>
    </DialogContent>
  </Dialog>;
}
