"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CatalogCategory = "women" | "men" | "kids" | "shoes" | "accessories" | "electronics";
type TabValue = "all" | CatalogCategory;

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  priceCents: number;
  category: CatalogCategory;
  condition: string | null;
  size: string | null;
  photoUrl: string;
  publishedAt: string | null;
  inspectedAt: string | null;
};

const labels: { value: TabValue; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "shoes", label: "Shoes" },
  { value: "accessories", label: "Accessories" },
  { value: "electronics", label: "Electronics" },
];

function hashCategory(hash: string): TabValue | null {
  const value = hash.replace(/^#/, "").toLowerCase();
  return labels.some((entry) => entry.value === value) ? (value as TabValue) : null;
}
function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}
function remainingDays(publishedAt: string | null, sellingPeriodDays: number) {
  if (!publishedAt) return null;
  const elapsed = Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400000);
  return Math.max(0, sellingPeriodDays - elapsed);
}

export function ShopCatalog({ products, sellingPeriodDays = 90 }: { products: CatalogProduct[]; sellingPeriodDays?: number }) {
  const [activeCategory, setActiveCategory] = useState<TabValue>("all");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const syncHash = () => { const next = hashCategory(window.location.hash); if (next) setActiveCategory(next); };
    syncHash(); window.addEventListener("hashchange", syncHash); return () => window.removeEventListener("hashchange", syncHash);
  }, []);
  useEffect(() => {
    if (!filterOpen) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [filterOpen]);

  const categoryProducts = useMemo(() => activeCategory === "all" ? products : products.filter((p) => p.category === activeCategory), [activeCategory, products]);
  const brands = useMemo(() => [...new Set(categoryProducts.map((p) => p.brand))].sort((a,b) => a.localeCompare(b)), [categoryProducts]);
  const sizes = useMemo(() => [...new Set(categoryProducts.map((p) => p.size).filter((x): x is string => Boolean(x)))].sort((a,b) => a.localeCompare(b, undefined, { numeric: true })), [categoryProducts]);
  const filteredProducts = useMemo(() => categoryProducts.filter((p) => (!selectedBrands.length || selectedBrands.includes(p.brand)) && (!selectedSizes.length || (p.size && selectedSizes.includes(p.size)))), [categoryProducts, selectedBrands, selectedSizes]);
  const activeFilterCount = selectedBrands.length + selectedSizes.length;
  const hasFilterOptions = brands.length > 0 || sizes.length > 0;
  const clearFilters = () => { setSelectedBrands([]); setSelectedSizes([]); };
  const changeCategory = (value: string) => {
    const next = value as TabValue; setActiveCategory(next); clearFilters(); setFilterOpen(false);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${next === "all" ? "shop" : next}`);
  };
  const filterPanel = <FilterPanel activeCategory={activeCategory} brands={brands} sizes={sizes} selectedBrands={selectedBrands} selectedSizes={selectedSizes} clearFilters={clearFilters} setSelectedBrands={setSelectedBrands} setSelectedSizes={setSelectedSizes}/>;

  return <section id="shop" className="shop-catalog section-wrap">
    <div className="catalog-hash-anchors" aria-hidden="true">{labels.filter((e) => e.value !== "all").map((e) => <span id={e.value} key={e.value}/>)}</div>
    <div className="section-heading"><div><p className="eyebrow dark">Available now</p><h2>Curated secondhand, ready to wear.</h2></div><p>Only managed listings published by Rewear staff appear here. Open an item to see its recorded condition and inspection details.</p></div>
    <Tabs value={activeCategory} onValueChange={changeCategory}>
      <TabsList className="catalog-shortcuts" aria-label="Shop by category">{labels.map((e) => <TabsTrigger key={e.value} value={e.value}>{e.label}</TabsTrigger>)}</TabsList>
      {labels.map((tab) => <TabsContent key={tab.value} value={tab.value}>
        <div className={`catalog-body ${hasFilterOptions ? "" : "no-filter-options"}`}>
          {hasFilterOptions ? <aside className="catalog-filter desktop-filter" aria-label="Product filters">{filterPanel}</aside> : null}
          <div className="catalog-results">
            <div className="catalog-toolbar"><div className="catalog-result-count"><strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? "item" : "items"}</div>{hasFilterOptions ? <button className="mobile-filter-toggle" type="button" onClick={() => setFilterOpen(true)}><SlidersHorizontal/> Filters {activeFilterCount ? <span>{activeFilterCount}</span> : null}</button> : null}</div>
            <ProductGrid products={filteredProducts} filtersActive={activeFilterCount > 0} sellingPeriodDays={sellingPeriodDays}/>
          </div>
        </div>
        {filterOpen && hasFilterOptions ? <><button className="filter-sheet-backdrop" type="button" aria-label="Close filters" onClick={() => setFilterOpen(false)}/><aside className="catalog-filter filter-sheet" aria-label="Mobile product filters"><div className="filter-sheet-head"><strong>Filters</strong><button type="button" aria-label="Close filters" onClick={() => setFilterOpen(false)}><X/></button></div>{filterPanel}<div className="filter-sheet-footer"><Button type="button" onClick={() => setFilterOpen(false)}>Show {filteredProducts.length} {filteredProducts.length === 1 ? "item" : "items"}</Button></div></aside></> : null}
      </TabsContent>)}
    </Tabs>
  </section>;
}

function FilterPanel({ activeCategory, brands, sizes, selectedBrands, selectedSizes, clearFilters, setSelectedBrands, setSelectedSizes }: {
  activeCategory: TabValue; brands: string[]; sizes: string[]; selectedBrands: string[]; selectedSizes: string[]; clearFilters: () => void; setSelectedBrands: Dispatch<SetStateAction<string[]>>; setSelectedSizes: Dispatch<SetStateAction<string[]>>;
}) {
  return <><div className="filter-title"><span><SlidersHorizontal/> Filters</span>{(selectedBrands.length || selectedSizes.length) ? <button type="button" onClick={clearFilters}><X/> Clear</button> : null}</div>
    <FilterGroup title="Brand" values={brands} selected={selectedBrands} onToggle={(brand) => setSelectedBrands((current) => current.includes(brand) ? current.filter((x) => x !== brand) : [...current, brand])}/>
    {sizes.length ? <FilterGroup title={activeCategory === "shoes" ? "Shoe size" : "Size"} values={sizes} selected={selectedSizes} onToggle={(size) => setSelectedSizes((current) => current.includes(size) ? current.filter((x) => x !== size) : [...current, size])}/> : null}
  </>;
}
function FilterGroup({ title, values, selected, onToggle }: { title: string; values: string[]; selected: string[]; onToggle: (value: string) => void }) {
  if (!values.length) return null;
  return <fieldset className="filter-group"><legend>{title}</legend>{values.map((value) => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)}/><span>{value}</span></label>)}</fieldset>;
}
function ProductGrid({ products, filtersActive, sellingPeriodDays }: { products: CatalogProduct[]; filtersActive: boolean; sellingPeriodDays: number }) {
  if (!products.length) return <div className="catalog-empty"><h3>{filtersActive ? "No matching items" : "Nothing live here yet"}</h3><p>{filtersActive ? "Try removing one of the filters." : "Published inventory will appear here automatically."}</p></div>;
  return <div className="catalog-grid">{products.map((product) => {
    const left = remainingDays(product.publishedAt, sellingPeriodDays);
    return <article className="shop-card" key={product.id}>
      <Link href={`/items/${product.id}`} className="catalog-photo live-photo" aria-label={`View ${product.brand} ${product.name}`}>
        <Image src={product.photoUrl} alt={`${product.brand} ${product.name}`} fill sizes="(max-width:700px) 50vw, 260px"/>
        {product.inspectedAt ? <span className="inspection-badge"><ShieldCheck/> Inspected</span> : null}
        {left !== null && left <= 21 ? <span className="last-chance-badge">Last chance · {left}d</span> : null}
        {product.condition ? <span className="condition-badge">{product.condition}</span> : null}
      </Link>
      <div className="shop-card-copy"><small>{product.brand}</small><h3>{product.name}</h3><span>{product.size ? `Size ${product.size}` : product.category}</span><div><b>{cad(product.priceCents)}</b><Link className="product-view-link" href={`/items/${product.id}`}>View item</Link></div></div>
    </article>;
  })}</div>;
}
