"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Heart, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Category = "women" | "men" | "kids" | "shoes" | "electronics";
type TabValue = "all" | Category;
type Product = {
  name: string;
  brand: string;
  price: string;
  category: Category;
  cell: number;
  condition: string;
  size: string;
};

const products: Product[] = [
  { name: "Wrap midi dress", brand: "Zara", price: "$42", category: "women", cell: 0, condition: "Excellent", size: "M" },
  { name: "Tailored blazer", brand: "Ralph Lauren", price: "$78", category: "men", cell: 1, condition: "Very good", size: "L" },
  { name: "Cotton sweater", brand: "H&M Kids", price: "$18", category: "kids", cell: 2, condition: "Excellent", size: "8Y" },
  { name: "Unlocked smartphone", brand: "Apple", price: "$425", category: "electronics", cell: 4, condition: "Tested", size: "N/A" },
  { name: "Leather tote", brand: "Coach", price: "$95", category: "women", cell: 5, condition: "Very good", size: "One Size" },
  { name: "Leather sneakers", brand: "COS", price: "$62", category: "shoes", cell: 6, condition: "Excellent", size: "9" },
  { name: "Denim overalls", brand: "Gap Kids", price: "$24", category: "kids", cell: 7, condition: "Excellent", size: "6Y" },
  { name: "13-inch laptop", brand: "Apple", price: "$690", category: "electronics", cell: 9, condition: "Tested & guaranteed", size: "N/A" },
];

const labels: { value: TabValue; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "shoes", label: "Shoes" },
  { value: "electronics", label: "Electronics" },
];

function hashCategory(hash: string): TabValue | null {
  const value = hash.replace(/^#/, "").toLowerCase();
  return labels.some((entry) => entry.value === value) ? (value as TabValue) : null;
}

export function ShopCatalog() {
  const [activeCategory, setActiveCategory] = useState<TabValue>("all");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);

  useEffect(() => {
    const syncHash = () => {
      const next = hashCategory(window.location.hash);
      if (next) setActiveCategory(next);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const categoryProducts = useMemo(
    () => activeCategory === "all" ? products : products.filter((product) => product.category === activeCategory),
    [activeCategory],
  );

  const brands = useMemo(
    () => [...new Set(categoryProducts.map((product) => product.brand))].sort((a, b) => a.localeCompare(b)),
    [categoryProducts],
  );
  const sizes = useMemo(
    () => [...new Set(categoryProducts.map((product) => product.size).filter((size) => size !== "N/A"))],
    [categoryProducts],
  );

  const filteredProducts = useMemo(
    () => categoryProducts.filter((product) =>
      (!selectedBrands.length || selectedBrands.includes(product.brand)) &&
      (!selectedSizes.length || selectedSizes.includes(product.size)),
    ),
    [categoryProducts, selectedBrands, selectedSizes],
  );

  const clearFilters = () => {
    setSelectedBrands([]);
    setSelectedSizes([]);
  };

  const changeCategory = (value: string) => {
    const next = value as TabValue;
    setActiveCategory(next);
    clearFilters();
    if (typeof window !== "undefined") {
      const hash = next === "all" ? "shop" : next;
      window.history.replaceState(null, "", `#${hash}`);
    }
  };

  return (
    <section id="shop" className="shop-catalog section-wrap">
      <div className="section-heading">
        <div><p className="eyebrow dark">Available now</p><h2>Shop what’s in.</h2></div>
        <p>Every item is inspected before it goes live. New pieces are added regularly.</p>
      </div>

      <Tabs value={activeCategory} onValueChange={changeCategory}>
        <TabsList className="catalog-shortcuts" aria-label="Shop by category">
          {labels.map((entry) => <TabsTrigger key={entry.value} value={entry.value}>{entry.label}</TabsTrigger>)}
        </TabsList>

        {labels.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <div className="catalog-body">
              <aside className="catalog-filter" aria-label="Product filters">
                <div className="filter-title">
                  <span><SlidersHorizontal /> Filters</span>
                  {(selectedBrands.length > 0 || selectedSizes.length > 0) && (
                    <button type="button" onClick={clearFilters}><X /> Clear</button>
                  )}
                </div>

                <FilterGroup
                  title="Brand"
                  values={brands}
                  selected={selectedBrands}
                  onToggle={(brand) => setSelectedBrands((current) =>
                    current.includes(brand) ? current.filter((value) => value !== brand) : [...current, brand],
                  )}
                />

                {sizes.length > 0 && (
                  <FilterGroup
                    title={activeCategory === "shoes" ? "Shoe size" : "Size"}
                    values={sizes}
                    selected={selectedSizes}
                    onToggle={(size) => setSelectedSizes((current) =>
                      current.includes(size) ? current.filter((value) => value !== size) : [...current, size],
                    )}
                  />
                )}
              </aside>

              <div className="catalog-results">
                <div className="catalog-result-count">
                  <strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? "item" : "items"}
                </div>
                <ProductGrid products={filteredProducts} />
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function FilterGroup({ title, values, selected, onToggle }: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!values.length) return null;
  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      {values.map((value) => (
        <label key={value}>
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />
          <span>{value}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) {
    return <div className="catalog-empty"><h3>No matching items</h3><p>Try removing one of the filters.</p></div>;
  }
  return (
    <div className="catalog-grid">
      {products.map((product) => (
        <article className="shop-card" key={product.name}>
          <div className={`catalog-photo cell${product.cell}`}>
            <Image src="/shop-products.webp" alt={`${product.brand} ${product.name}`} fill sizes="(max-width: 700px) 50vw, 240px" />
            <button aria-label={`Save ${product.name}`}><Heart /></button>
          </div>
          <div className="shop-card-copy">
            <small>{product.brand}</small>
            <h3>{product.name}</h3>
            <span>{product.condition}{product.size !== "N/A" ? ` · Size ${product.size}` : ""}</span>
            <div><b>{product.price}</b><Button size="icon-sm" aria-label={`Add ${product.name} to bag`}><ShoppingBag /></Button></div>
          </div>
        </article>
      ))}
    </div>
  );
}
