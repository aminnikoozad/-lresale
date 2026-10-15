import french from "./translations-fr.json" with { type: "json" };
import templates from "./translations-fr-templates.json" with { type: "json" };
const patterns = Object.entries(templates).filter(([key])=>key.replace(/ZXQ\d+ZXQ/g, "").replace(/[^a-z]/gi, "").length > 2).sort(([a],[b])=>b.replace(/ZXQ\d+ZXQ/g, "").length-a.replace(/ZXQ\d+ZXQ/g, "").length).map(([key,value])=>({
 expression: new RegExp("^"+key.split(/ZXQ\d+ZXQ/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("(.+?)")+"$"),
 placeholders: key.match(/ZXQ\d+ZXQ/g) || [], value
}));
export type Locale = "en" | "fr";
const dictionary: Record<string,string> = french;
export function translate(locale: Locale, text: string): string {
 if(locale!=="fr" || !text.trim())return text;
 const key=text.trim().replace(/\s+/g," ");
 const value=dictionary[key];
 if(value)return text.replace(text.trim(),value);
 for(const template of patterns){
  const match=key.match(template.expression);
  if(match){let result=template.value;template.placeholders.forEach((placeholder,index)=>{result=result.replaceAll(placeholder,match[index+1]);});return text.replace(text.trim(),result);}
 }
 return text;
}
