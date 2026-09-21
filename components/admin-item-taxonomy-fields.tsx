"use client";

import { useMemo, useState } from "react";
import {
  CATALOG_CATEGORIES,
  type CatalogCategory,
  subcategoriesFor,
} from "@/lib/catalog-taxonomy";

export function AdminItemTaxonomyFields() {
  const [category, setCategory] = useState<CatalogCategory>("women");
  const [subcategory, setSubcategory] = useState("");
  const options = useMemo(() => subcategoriesFor(category), [category]);

  return (
    <>
      <label>
        Category
        <select
          name="category"
          required
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as CatalogCategory);
            setSubcategory("");
          }}
        >
          {CATALOG_CATEGORIES.map((entry) => (
            <option value={entry.value} key={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Subcategory
        <select
          name="subcategory"
          required
          value={subcategory}
          onChange={(event) => setSubcategory(event.target.value)}
        >
          <option value="" disabled>
            Choose a subcategory
          </option>
          {options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
