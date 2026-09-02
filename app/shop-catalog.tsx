"use client";
import Image from "next/image";
import { Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";

type Category="women"|"men"|"kids"|"fragrance"|"electronics";
const products:{name:string;brand:string;price:string;category:Category;cell:number;condition:string}[]=[
  {name:"Wrap midi dress",brand:"Zara",price:"$42",category:"women",cell:0,condition:"Excellent"},
  {name:"Tailored blazer",brand:"Ralph Lauren",price:"$78",category:"men",cell:1,condition:"Very good"},
  {name:"Cotton sweater",brand:"H&M Kids",price:"$18",category:"kids",cell:2,condition:"Excellent"},
  {name:"Floral eau de parfum",brand:"Lancôme",price:"$54",category:"fragrance",cell:3,condition:"90% full"},
  {name:"Unlocked smartphone",brand:"Apple",price:"$425",category:"electronics",cell:4,condition:"Tested"},
  {name:"Leather tote",brand:"Coach",price:"$95",category:"women",cell:5,condition:"Very good"},
  {name:"Leather sneakers",brand:"COS",price:"$62",category:"men",cell:6,condition:"Excellent"},
  {name:"Denim overalls",brand:"Gap Kids",price:"$24",category:"kids",cell:7,condition:"Excellent"},
  {name:"Classic eau de parfum",brand:"Dior",price:"$68",category:"fragrance",cell:8,condition:"85% full"},
  {name:"13-inch laptop",brand:"Apple",price:"$690",category:"electronics",cell:9,condition:"Tested & guaranteed"},
];
const labels:{value:"all"|Category;label:string}[]=[{value:"all",label:"All items"},{value:"women",label:"Women"},{value:"men",label:"Men"},{value:"kids",label:"Kids"},{value:"fragrance",label:"Fragrance"},{value:"electronics",label:"Electronics"}];

export function ShopCatalog(){return <section id="shop" className="shop-catalog section-wrap"><div className="section-heading"><div><p className="eyebrow dark">Available now</p><h2>Shop what’s in.</h2></div><p>Every item is inspected before it goes live. New pieces are added regularly.</p></div><Tabs defaultValue="all"><TabsList className="catalog-shortcuts" aria-label="Shop by category">{labels.map(x=><TabsTrigger key={x.value} value={x.value}>{x.label}</TabsTrigger>)}</TabsList>{labels.map(tab=><TabsContent key={tab.value} value={tab.value}><ProductGrid products={tab.value==="all"?products:products.filter(p=>p.category===tab.value)}/></TabsContent>)}</Tabs></section>}

function ProductGrid({products}:{products:typeof products extends never?never:any[]}){return <div className="catalog-grid">{products.map((p)=><article className="shop-card" key={p.name}><div className={`catalog-photo cell${p.cell}`}><Image src="/shop-products.webp" alt={`${p.brand} ${p.name}`} fill sizes="(max-width: 700px) 50vw, 240px"/><button aria-label={`Save ${p.name}`}><Heart/></button></div><div className="shop-card-copy"><small>{p.brand}</small><h3>{p.name}</h3><span>{p.condition}</span><div><b>{p.price}</b><Button size="icon-sm" aria-label={`Add ${p.name} to bag`}><ShoppingBag/></Button></div></div></article>)}</div>}
