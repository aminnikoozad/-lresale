"use client";
import { Localize } from "@/components/site-language";

import { useState } from "react";
export type CustomerOption = {user_id:string;full_name:string|null;username:string|null;email:string|null;customer_code?:string|null};
export function CustomerPicker({customers,initial="",customerIdFirst=false}:{customers:CustomerOption[];initial?:string;customerIdFirst?:boolean}){
 const [query,setQuery]=useState("");const [selected,setSelected]=useState(initial);
 const matches=customers.filter(c=>c.user_id===selected||`${c.customer_code??""} ${c.user_id} ${c.full_name} ${c.username} ${c.email}`.toLowerCase().includes(query.toLowerCase()));
 const customer=customers.find(c=>c.user_id===selected);
 return <Localize>{<div><label>{customerIdFirst?"Customer ID":"Find customer"}<input type="search" value={query} onChange={e=>{const next=e.target.value;setQuery(next);if(customerIdFirst)setSelected(customers.find(c=>c.customer_code?.toLowerCase()===next.trim().toLowerCase()||c.user_id===next.trim())?.user_id??"");}} placeholder={customerIdFirst?"RW-…":"Username, name or email"}/></label>
 <label>Item owner<select name="owner_id" value={selected} onChange={e=>setSelected(e.target.value)} required><option value="">Select the seller</option>{matches.map(c=><option key={c.user_id} value={c.user_id}>{c.customer_code ? `${c.customer_code} · ` : ""}@{c.username} · {c.full_name} · {c.email}</option>)}</select></label>
 {customer&&<p>Linking to <strong>{customer.customer_code ? `${customer.customer_code} · ` : ""}@{customer.username}</strong> · {customer.email}. Confirm this is the person who supplied the item.</p>}</div>}</Localize>;
}
