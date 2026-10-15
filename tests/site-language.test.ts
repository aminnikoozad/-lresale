import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {translate} from "../lib/translations.ts";
const source=readFileSync(new URL('../components/site-language.tsx',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const evaluated={exports:{} as {LanguageProvider:React.ComponentType<{initialLocale:"en"|"fr";children?:React.ReactNode}>;Localize:React.ComponentType<{children?:React.ReactNode}>}};
vm.runInNewContext(js,{exports:evaluated.exports,require:(name:string)=>{
 if(name==='react')return React;
 if(name==='react/jsx-runtime')return {jsx:React.createElement,jsxs:React.createElement,Fragment:React.Fragment};
 if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
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
