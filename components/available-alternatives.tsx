"use client";
import Link from "next/link";
import Image from "next/image";
import { Localize } from "./site-language";
import { catalogLocation, emptyCatalogFilters } from "@/lib/catalog-navigation";
type Piece = {id:string;name:string;brand:string;size:string|null;photoUrl:string;priceCents:number;category:string};
export function AvailableAlternatives({items,size,category,selectedSizes=[]}:{items:Piece[];size:string|null;category:string;selectedSizes?:string[]}) {
 if(!items.length)return null;
 return <Localize><section className="product-alternatives"><h2>Available alternatives</h2><div className="catalog-grid">{items.map(p=><Link className="shop-card" key={p.id} href={`/item/${p.id}${selectedSizes.length?`?${new URLSearchParams(selectedSizes.map(s=>["sizes",s])).toString()}`:""}`}><div className="catalog-photo live-photo"><Image src={p.photoUrl} alt={p.name} fill sizes="180px" /></div><div className="shop-card-copy"><small translate="no">{p.brand}</small><h3 translate="no">{p.name}</h3>{p.size&&<span translate="no">{p.size}</span>}<b>{new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(p.priceCents/100)} CAD</b></div></Link>)}</div><Link href={catalogLocation("/shop","",{...emptyCatalogFilters(category),sizes:selectedSizes.length?selectedSizes:size?[size]:[]})}>Browse this size</Link></section></Localize>;
}
