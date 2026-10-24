import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

let locale = "en";
let privateChatRenders = 0;
const source = readFileSync(new URL("../components/support-hub.tsx", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const evaluated = { exports: {} as { SupportHub: React.ComponentType<{ userId: string | null; contact: { email: string; phone: string; address: string; hoursEn: string; hoursFr: string } }> } };
vm.runInNewContext(js, { exports: evaluated.exports, require: (name: string) => {
  if (name === "react/jsx-runtime") return jsxRuntime;
  if (name === "next/link") return { default: (props: React.ComponentProps<"a">) => React.createElement("a", props) };
  if (name === "lucide-react") return new Proxy({}, { get: () => () => React.createElement("svg") });
  if (name === "./brand-wordmark") return { BrandWordmark: () => "Shikimomo" };
  if (name === "./site-language") return { useLocale: () => ({ locale }) };
  if (name === "./customer-support") return { CustomerSupport: ({ userId }: { userId: string }) => { privateChatRenders++; return React.createElement("div", { "data-chat-user": userId }, "Private team messages"); } };
  throw new Error(name);
} });
const empty = { email: "", phone: "", address: "", hoursEn: "", hoursFr: "" };

test("guest support is reachable without AI or an account and preserves the return destination", () => {
  locale = "en"; privateChatRenders = 0;
  const html = renderToStaticMarkup(React.createElement(evaluated.exports.SupportHub, { userId: null, contact: empty }));
  assert.match(html, /How can we help\?/);
  assert.match(html, /href="\/login\?next=%2Fsupport"/);
  assert.match(html, /href="\/forgot-password"/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, /Create a ticket without signing in/);
  assert.doesNotMatch(html, /mailto:|tel:|data-chat-user/);
  assert.equal(privateChatRenders, 0);
});

test("French support displays provided contacts and exposes the separate private team channel", () => {
  locale = "fr"; privateChatRenders = 0;
  const html = renderToStaticMarkup(React.createElement(evaluated.exports.SupportHub, { userId: "test-customer", contact: { email: "help@example.test", phone: "+1 (514) 555-0100", address: "Test address", hoursEn: "Monday 9–17", hoursFr: "Lundi de 9 h à 17 h" } }));
  assert.match(html, /lang="fr"/); assert.match(html, /Comment pouvons-nous vous aider\?/);
  assert.match(html, /href="mailto:help@example.test"/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, /Lundi de 9 h à 17 h/); assert.doesNotMatch(html, /Monday 9–17|not been published/);
  assert.equal(privateChatRenders, 1);
});
