import type { CatalogCategory } from "./catalog-taxonomy";

// Shared by item intake and storefront filters. Values are stored in English.
export const CATALOG_BRANDS = ["Adidas","Aldo","American Eagle","Aritzia","Banana Republic","Calvin Klein","Carter's","Columbia","Converse","COS","Gap","H&M","Joe Fresh","Lacoste","Levi's","Lululemon","Mango","Massimo Dutti","New Balance","Nike","Old Navy","OshKosh B'gosh","Patagonia","Puma","Ralph Lauren","Reebok","Roots","The North Face","Tommy Hilfiger","Under Armour","Uniqlo","Vans","Zara","Unbranded"];
export const CATALOG_CONDITIONS = ["New with tags","Like new","Excellent","Very good","Good"];
export const CATALOG_COLORS = ["Black","White","Grey","Beige","Brown","Blue","Navy","Green","Red","Pink","Purple","Yellow","Orange","Gold","Silver","Multicolour"];
export const CATALOG_MATERIALS = ["Cotton","Linen","Wool","Cashmere","Silk","Denim","Polyester","Viscose","Nylon","Acrylic","Leather","Faux leather","Fleece","Velvet","Blend"];
export const CATALOG_PATTERNS = ["Solid","Striped","Checked","Plaid","Floral","Polka dot","Animal print","Graphic","Geometric","Camouflage","Colour block","Abstract"];
const ADULT_SIZES = ["XXS","XS","S","M","L","XL","XXL","XXXL","0","2","4","6","8","10","12","14","16","18","20","24","25","26","27","28","29","30","31","32","33","34","36","38","40","42","44","One Size"];
const KIDS_SIZES = ["Preemie","Newborn","0–3M","3–6M","6–9M","9–12M","12–18M","18–24M","2T","3T","4T","5T","4Y","5Y","6Y","7Y","8Y","9Y","10Y","12Y","14Y","16Y","One Size"];
export function catalogSizes(category: CatalogCategory | "all"): string[] {
 if(category === "kids") return KIDS_SIZES;
 if(category === "shoes") return Array.from({length: 29}, (_,i) => String(3+i*0.5));
 if(category === "accessories" || category === "home_decor" || category === "electronics") return ["One Size"];
 return category === "all" ? [...new Set([...ADULT_SIZES,...KIDS_SIZES])] : ADULT_SIZES;
}
export function catalogAttributeOptions(category: CatalogCategory | "all") {
 return {brands: CATALOG_BRANDS, sizes:catalogSizes(category), conditions:category==="electronics"?[...CATALOG_CONDITIONS,"Tested"]:CATALOG_CONDITIONS,colors:CATALOG_COLORS,materials:CATALOG_MATERIALS,patterns:CATALOG_PATTERNS};
}
