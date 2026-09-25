"use client";
import { useState } from "react";
export type CustomerOption = {user_id:string;full_name:string|null;username:string|null;email:string|null};
export function CustomerPicker({customers,initial=""}:{customers:CustomerOption[];initial?:string}){
 const [query,setQuery]=useState("");const [selected,setSelected]=useState(initial);
 const matches=customers.filter(c=>c.user_id===selected||`${c.full_name} ${c.username} ${c.email}`.toLowerCase().includes(query.toLowerCase()));
 const customer=customers.find(c=>c.user_id===selected);
 return <div><label>Find customer<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Username, name or email"/></label>
 <label>Item owner<select name="owner_id" value={selected} onChange={e=>setSelected(e.target.value)} required><option value="">Select the seller</option>{matches.map(c=><option key={c.user_id} value={c.user_id}>@{c.username} · {c.full_name} · {c.email}</option>)}</select></label>
 {customer&&<p>Linking to <strong>@{customer.username}</strong> · {customer.email}. Confirm this is the person who supplied the item.</p>}</div>;
}
