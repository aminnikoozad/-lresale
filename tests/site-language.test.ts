import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {renderToStaticMarkup} from "react-dom/server";
import {translate} from "../lib/translations.ts";
const source=readFileSync(new URL('../components/site-language.tsx',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const evaluated={exports:{} as {LanguageProvider:React.ComponentType<{initialLocale:"en"|"fr";children?:React.ReactNode}>;Localize:React.ComponentType<{children?:React.ReactNode}>}};
vm.runInNewContext(js,{exports:evaluated.exports,require:(name:string)=>{
 if(name==='react')return React;
 if(name==='react/jsx-runtime')return jsxRuntime;
 if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
 if(name==='next/link')return {default:(props:React.ComponentProps<'a'>)=>React.createElement('a',props)};
 if(name==='@/components/brand-wordmark')return {BrandWordmark:()=>React.createElement('span',null,'Shikimomo')};
 if(name==='@/lib/translations')return {translate};
 throw new Error(name);
}});
const {LanguageProvider,Localize}=evaluated.exports;
function render(locale:'en'|'fr',children:React.ReactNode){return renderToStaticMarkup(React.createElement(LanguageProvider,{initialLocale:locale},React.createElement(Localize,null,children)));}
test('language applies to nested UI, placeholders and accessibility labels while preserving form values',()=>{
 const tree=React.createElement('form',null,
 React.createElement('label',null,'Email address',React.createElement('input',{name:'email',placeholder:'Search brands or pieces','aria-label':'My account',value:'Women',readOnly:true})),
 React.createElement('select',{name:'category',defaultValue:'Women'},React.createElement('option',null,'Women')));
 const fr=render('fr',tree);assert.match(fr,/Adresse courriel/);assert.match(fr,/placeholder="Rechercher une marque ou un article"/);assert.match(fr,/aria-label="Mon compte"/);assert.match(fr,/value="Women"/);assert.match(fr,/>Femmes<\/option>/);
 const en=render('en',tree);assert.match(en,/Email address/);assert.match(en,/>Women<\/option>/);
});
test('customer content and existing legal language sections retain their original meaning',()=>{
 const tree=React.createElement('main',null,
 React.createElement('p',{translate:'no'},'Women'),
 React.createElement('section',{lang:'en'},'English policy'),
 React.createElement('section',{lang:'fr'},'Politique française'));
 const fr=render('fr',tree);assert.match(fr,/>Women</);assert.match(fr,/Politique française/);assert.doesNotMatch(fr,/English policy/);
 const en=render('en',tree);assert.match(en,/English policy/);assert.doesNotMatch(en,/Politique française/);
});
test('dynamic UI translations preserve amounts and user-provided parameters',()=>{
 assert.equal(translate('fr','12 pieces available'),'12 articles disponibles');
 assert.equal(translate('fr','Shopping bag with 3 items'),'Panier contenant 3 articles');
 assert.equal(translate('fr','Free local delivery in Montréal and within the configured 20 km local radius when the delivery address is eligible. Shipping fees apply outside the local area.'),'Livraison locale gratuite à Montréal et dans le rayon configuré de 20 km, selon l’admissibilité de l’adresse. Des frais s’appliquent à l’extérieur de cette zone.');
 assert.equal(translate('fr','customer-provided text 56'),'customer-provided text 56');
});

test('asChild controls retain exactly one React element after localization',()=>{
 function SingleChild({children}:{children?:React.ReactNode}) {
  const only=React.Children.only(children);
  assert.ok(React.isValidElement(only));
  return only;
 }
 const tree=React.createElement(SingleChild,null,React.createElement('a',{href:'/shop'},'Enter website'));
 assert.match(render('fr',tree),/href="\/shop"/);
 assert.match(render('en',tree),/Enter website/);
});

test('French customer copy uses articles, available places and fixed fees without changing amounts',()=>{
 assert.equal(translate('fr','items'),'articles');
 assert.equal(translate('fr','spots.'),'places.');
 assert.equal(translate('fr','Nothing live here yet'),'Aucun article en vente pour le moment');
 assert.equal(translate('fr','You send the pieces.'),'Vous nous confiez vos articles.');
 const fee=translate('fr','The flat $5 pickup transportation fee still applies when the pickup’s estimated resale value is below $100.');
 assert.equal(fee,'Les frais fixes de transport de collecte de $5 s’appliquent toujours lorsque la valeur de revente estimée est inférieure à $100.');
 const consent=translate('fr','I understand this new batch records one $12 service fee. If I request a Shikimomo Bag, it is included in that fee and no separate Bag fee is added. This fee is intended to be deducted from seller earnings when settlement is available, not charged to my card upfront.');
 assert.match(consent,/\$12/);assert.match(consent,/sans supplément/);assert.match(consent,/plutôt qu’à être facturés à l’avance sur ma carte/);
 const policy=translate('fr','The offer has no scheduled calendar end date. It ends automatically when claim #100 is used. After that, the regular $12 batch service fee applies to all new batches. The flat $5 pickup transportation fee for pickups below $100 is separate and is not waived.');
 assert.match(policy,/place no 100/);assert.match(policy,/\$12/);assert.match(policy,/\$5/);assert.match(policy,/\$100/);assert.match(policy,/ne sont pas exonérés/);
 assert.doesNotMatch(policy,/ZXQ|undefined/);
 const first=translate('fr','First 100 sellers: your first $12 batch service fee is waived.');
 assert.equal(first,'Pour les 100 premiers vendeurs : les frais de service de $12 de votre premier lot sont exonérés.');
 const missed=translate('fr','Shikimomo currently does not charge a first- or second-missed-pickup cash fee under the active rules. After 2 confirmed missed pickups, free-pickup access may be suspended. Other options may remain available.');
 assert.match(missed,/aucune pénalité monétaire/);assert.match(missed,/Après 2 collectes manquées/);assert.match(missed,/peut être suspendu/);
});
