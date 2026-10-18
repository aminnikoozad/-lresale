"use client";
import { createContext, useContext, useMemo, useState, cloneElement, isValidElement, Children, type ReactNode, type ReactElement } from "react";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand-wordmark";
import { useRouter } from "next/navigation";
import { translate, type Locale } from "@/lib/translations";
const LanguageContext = createContext<{locale: Locale; setLocale: (value: Locale) => void}>({locale:"en",setLocale:()=>{}});
export function LanguageProvider({initialLocale,children}:{initialLocale:Locale;children:ReactNode}) {
  const [locale, update] = useState(initialLocale);
  const router = useRouter();
  const value = useMemo(()=>({locale,setLocale:(next:Locale)=>{
    if(next!=="en"&&next!=="fr")return;
    update(next);
    document.cookie=`shikimomo-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    document.documentElement.lang=next;
    router.refresh();
  }}),[locale,router]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export const useLocale = () => useContext(LanguageContext);
export function LanguageSwitch() {
  const {locale,setLocale}=useLocale();
  return <div className="site-language-bar" translate="no"><Link className="site-home-link" href="/" aria-label={locale==="en"?"Shikimomo — Back to home":"Shikimomo — Retour à l’accueil"}><BrandWordmark /></Link><button className="site-language-switch" type="button" onClick={()=>setLocale(locale==="en"?"fr":"en")} aria-label={locale==="en"?"Passer au français":"Switch to English"}><span lang="en">EN</span><span aria-hidden="true">/</span><span lang="fr">FR</span><strong>{locale==="en"?"Français":"English"}</strong></button></div>;
}
const attributes = new Set(["placeholder","title","aria-label","alt","pendingLabel"]);
/** Translate only reviewed source UI copy, never HTML, paths, actions or form values. */
export function Localize({children}:{children:ReactNode}) {
 const {locale}=useLocale();
 function visit(node:ReactNode):ReactNode {
  if(typeof node==="string")return translate(locale,node);
  if(!isValidElement(node))return node;
  const element=node as ReactElement<Record<string,unknown>>;
  const props=element.props;
  if(element.type===Localize)return node;
  if(props.translate==="no"||element.type==="script"||element.type==="style"||element.type==="code"||element.type==="pre")return node;
  // Existing bilingual legal copy is authoritative: show only the chosen language.
  if(element.type==="section" && (props.lang==="en"||props.lang==="fr")) {
    if(props.lang!==locale)return null;
    return node;
  }
  const changes:Record<string,unknown>={};
  // An option without an explicit value submits its original label. Preserve it.
  if(element.type==="option" && props.value===undefined && typeof props.children==="string")changes.value=props.children;
  for(const key of attributes)if(typeof props[key]==="string")changes[key]=translate(locale,props[key] as string);
  if(props.children!==undefined)changes.children=Array.isArray(props.children)?Children.map(props.children as ReactNode,visit):visit(props.children as ReactNode);
  return cloneElement(element,changes);
 }
 return <>{Array.isArray(children)?Children.map(children,visit):visit(children)}</>;
}

const originalText = new WeakMap<Node,{source:string;last:string}>();
const originalAttributes = new WeakMap<Element,Map<string,{source:string;last:string}>>();
/** Localize only newly constructed UI fragments used by legacy form widgets. */
export function translateElement(element:Element,locale:Locale) {
 const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
 let node:Node|null;
 while((node=walker.nextNode())) {
  if(node.parentElement?.closest('textarea,[translate="no"]'))continue;
  const current=node.textContent||"";
  const previous=originalText.get(node);
  const source=previous&&previous.last===current?previous.source:current;
  const next=translate(locale,source);
  originalText.set(node,{source,last:next});
  if(next!==current)node.textContent=next;
 }
 for(const target of [element,...element.querySelectorAll('[placeholder],[aria-label],[title]')]) {
  const saved=originalAttributes.get(target)||new Map<string,{source:string;last:string}>();
  for(const attr of ['placeholder','aria-label','title']) {
   const current=target.getAttribute(attr);
   if(!current)continue;
   const previous=saved.get(attr);
   const source=previous&&previous.last===current?previous.source:current;
   const next=translate(locale,source);saved.set(attr,{source,last:next});
   if(next!==current)target.setAttribute(attr,next);
  }
  originalAttributes.set(target,saved);
 }
}
