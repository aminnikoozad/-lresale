import { HOME_SUBCATEGORIES } from "./home-decor";

export const CATALOG_SUBCATEGORIES = {
  women: [
    "Tops",
    "T-Shirts",
    "Shirts & Blouses",
    "Sweaters & Knitwear",
    "Hoodies & Sweatshirts",
    "Dresses",
    "Jumpsuits & Rompers",
    "Skirts",
    "Jeans",
    "Pants & Trousers",
    "Shorts",
    "Jackets",
    "Coats",
    "Blazers",
    "Activewear",
    "Loungewear",
    "Swimwear",
    "Other Women's Clothing",
  ],
  men: [
    "T-Shirts",
    "Shirts",
    "Polos",
    "Sweaters & Knitwear",
    "Hoodies & Sweatshirts",
    "Jeans",
    "Pants & Chinos",
    "Shorts",
    "Jackets",
    "Coats",
    "Blazers & Suits",
    "Activewear",
    "Loungewear",
    "Swimwear",
    "Other Men's Clothing",
  ],
  kids: [
    "Tops & T-Shirts",
    "Shirts & Blouses",
    "Sweaters & Hoodies",
    "Dresses",
    "Pants & Jeans",
    "Shorts",
    "Skirts",
    "Sets & Outfits",
    "Jumpsuits & One-Pieces",
    "Jackets & Coats",
    "Activewear",
    "Sleepwear",
    "Swimwear",
    "Baby Clothing",
    "Other Kids' Clothing",
  ],
  shoes: [
    "Sneakers",
    "Running & Athletic Shoes",
    "Boots",
    "Ankle Boots",
    "Loafers",
    "Flats",
    "Heels",
    "Sandals",
    "Dress Shoes",
    "Slippers",
    "Other Shoes",
  ],
  accessories: [
    "Bags & Handbags",
    "Backpacks",
    "Wallets & Card Holders",
    "Belts",
    "Hats & Caps",
    "Scarves & Shawls",
    "Sunglasses & Eyewear",
    "Jewelry",
    "Watches",
    "Hair Accessories",
    "Ties & Bow Ties",
    "Gloves",
    "Other Accessories",
  ],
  electronics: [
    "Smartphones",
    "Tablets",
    "Laptops",
    "Desktop Computers",
    "Monitors",
    "Computer Components",
    "Keyboards & Mice",
    "Storage Devices",
    "Gaming Consoles",
    "Gaming Accessories",
    "Headphones & Audio",
    "Smartwatches & Wearables",
    "Cameras & Photography",
    "Networking Devices",
    "Chargers & Cables",
    "Other Electronics",
  ],
  home_decor: HOME_SUBCATEGORIES,
} as const;

export type CatalogCategory = keyof typeof CATALOG_SUBCATEGORIES;

export const CATALOG_CATEGORIES: { value: CatalogCategory; label: string }[] = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "shoes", label: "Shoes" },
  { value: "accessories", label: "Accessories" },
  { value: "electronics", label: "Electronics" },
  { value: "home_decor", label: "Home & Decor" },
];

export const FASHION_CATEGORIES: CatalogCategory[] = [
  "women",
  "men",
  "kids",
  "shoes",
  "accessories",
];

export function isCatalogCategory(value: string): value is CatalogCategory {
  return Object.prototype.hasOwnProperty.call(CATALOG_SUBCATEGORIES, value);
}

export function subcategoriesFor(category: CatalogCategory): readonly string[] {
  return CATALOG_SUBCATEGORIES[category];
}

export function isCatalogSubcategory(category: string, subcategory: string) {
  return (
    isCatalogCategory(category) &&
    (CATALOG_SUBCATEGORIES[category] as readonly string[]).includes(subcategory)
  );
}

export function categoryLabel(category: string) {
  return CATALOG_CATEGORIES.find((entry) => entry.value === category)?.label ?? category;
}
