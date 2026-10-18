"use client";
import { Localize } from "@/components/site-language";


import { useMemo, useState } from "react";
import {
  CATALOG_CATEGORIES,
  type CatalogCategory,
  subcategoriesFor,
} from "@/lib/catalog-taxonomy";

import { catalogAttributeOptions } from "@/lib/catalog-attributes";

export function AdminItemTaxonomyFields({ activeCategories }: { activeCategories: CatalogCategory[] }) {
  const [category, setCategory] = useState<CatalogCategory>("women");
  const [subcategory, setSubcategory] = useState("");
  const options = useMemo(() => subcategoriesFor(category), [category]);

  const attributes = catalogAttributeOptions(category);

  return <Localize>{(
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
              {entry.label}{activeCategories.includes(entry.value) ? "" : " (not currently live)"}
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
      <label>Brand
        <input name="brand" list="intake-brand-options" maxLength={100} placeholder="Search or enter brand" />
        <datalist id="intake-brand-options">{attributes.brands.map(value => <option key={value} value={value} />)}</datalist>
      </label>
      <label>Size
        <input key={category} name="size" list="intake-size-options" maxLength={40} placeholder="Search or enter size" />
        <datalist id="intake-size-options">{attributes.sizes.map(value => <option key={value} value={value} />)}</datalist>
      </label>
      <label>Condition
        <select name="item_condition" defaultValue="Excellent">{attributes.conditions.map(value => <option key={value} value={value}>{value}</option>)}</select>
      </label>
      {([{name:"color", label:"Colour", values:attributes.colors},{name:"material",label:"Material",values:attributes.materials},{name:"pattern",label:"Pattern",values:attributes.patterns}]).map(field => <label key={field.name}>{field.label}<select name={field.name} defaultValue=""><option value="">Select</option>{field.values.map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}
    </>
  )}</Localize>;
}
