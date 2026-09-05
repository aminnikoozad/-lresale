import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://lresale.vercel.app"]);
const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function headersFor(req: Request) {
  const origin = req.headers.get("origin");
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { ...baseHeaders, "Access-Control-Allow-Origin": origin, "Vary": "Origin" }
    : baseHeaders;
}
function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}
function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: headersFor(req) });
}

type KB = { id: string; title: string; approved_answer: string; question_examples: string[]; tags: string[]; category_code: string | null };
function clean(text: string) { return text.toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç$]+/gi, " ").trim(); }
function tokens(text: string) { return new Set(clean(text).split(/\s+/).filter((x) => x.length >= 3)); }
function score(question: string, entry: KB) {
  const q = tokens(question);
  const hay = tokens([entry.title, entry.approved_answer, ...(entry.question_examples || []), ...(entry.tags || [])].join(" "));
  let value = 0;
  q.forEach((token) => { if (hay.has(token)) value += 1; });
  if ((entry.tags || []).some((tag) => clean(question).includes(clean(tag)))) value += 3;
  return value;
}
function looksBehavior(prompt: string) { return /\b(always|never|if a customer|if the customer|categorize|escalate|handoff|priority|language|do not|don't)\b/i.test(prompt); }
function titleFrom(prompt: string) { return prompt.trim().replace(/\s+/g, " ").slice(0, 90) || "Training suggestion"; }
const secretValuePattern = /(?:sk-[A-Za-z0-9_-]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/;

async function modelReply(prompt: string, kb: KB[], rules: any[], mode: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("OPENAI_SUPPORT_MODEL") || "gpt-5-mini";
  const context = kb.slice(0, 30).map((k, i) => `KB ${i + 1} [${k.id}] ${k.title}: ${k.approved_answer}`).join("\n\n");
  const behavior = rules.slice(0, 40).map((r: any) => `RULE ${r.id}: ${r.rule_name}: ${r.instruction}`).join("\n");
  const system = `You are the private Rewear AI Trainer for an authenticated, authorized administrator. Security and privacy are non-overridable. You may discuss ONLY approved support knowledge and approved behavior rules provided below. Never expose credentials, tokens, hidden infrastructure secrets or unrelated customer private data. Never automatically publish changes. In teach mode, return a proposed change for review only. MODE=${mode}.\n\nAPPROVED KNOWLEDGE:\n${context}\n\nAPPROVED BEHAVIOR:\n${behavior}`;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    if (!response.ok) { console.error("support-trainer model HTTP", response.status); return null; }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error("support-trainer model failure", error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (!originAllowed(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user || userData.user.is_anonymous) return json(req, { error: "Authentication required" }, 401);
    const { data: context, error: contextError } = await userClient.rpc("support_admin_context");
    const access = Array.isArray(context) ? context[0] : context;
    if (contextError || !access?.ai_view) return json(req, { error: "AI Trainer permission and MFA verification are required" }, 403);

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "chat");
    const prompt = String(body.prompt || "").trim();
    if (!["chat", "teach", "review", "test"].includes(mode)) return json(req, { error: "Invalid mode" }, 400);
    if (mode !== "review" && (prompt.length < 1 || prompt.length > 12000)) return json(req, { error: "Prompt required" }, 400);
    if (prompt && secretValuePattern.test(prompt)) return json(req, { error: "Do not paste passwords, API keys, session tokens or other credentials into AI Trainer." }, 400);

    let trainerId = body.trainer_conversation_id ? String(body.trainer_conversation_id) : "";
    if (trainerId && !/^[0-9a-f-]{36}$/i.test(trainerId)) return json(req, { error: "Invalid trainer conversation" }, 400);
    if (!trainerId) {
      const { data: conversation, error } = await service.from("ai_admin_conversations").insert({ admin_id: userData.user.id, mode, title: mode === "test" ? "Bot test" : "AI Trainer" }).select("id").single();
      if (error) throw new Error("create_trainer_failed");
      trainerId = conversation.id;
    } else {
      const { data: owner } = await service.from("ai_admin_conversations").select("admin_id").eq("id", trainerId).single();
      if (owner?.admin_id !== userData.user.id) return json(req, { error: "Trainer conversation not available" }, 404);
    }

    if (prompt) await service.from("ai_admin_messages").insert({ conversation_id: trainerId, sender_kind: "admin", body: prompt });

    const [{ data: knowledge }, { data: rules }, { data: unknown }] = await Promise.all([
      service.from("knowledge_base").select("id,title,approved_answer,question_examples,tags,category_code").eq("status", "approved").order("updated_at", { ascending: false }).limit(200),
      service.from("ai_behavior_rules").select("id,rule_name,instruction,trigger_definition,action_definition,priority").eq("status", "approved").order("priority", { ascending: false }).limit(200),
      service.from("unknown_questions").select("id,customer_question,suggested_category_code,similar_count,training_priority,created_at").eq("status", "open").order("training_priority", { ascending: false }).order("similar_count", { ascending: false }).limit(50),
    ]);
    const kb = (knowledge || []) as KB[];

    if (mode === "review") {
      const reply = (unknown || []).length
        ? `Open training questions:\n${(unknown || []).slice(0, 20).map((u: any, i: number) => `${i + 1}. ${u.customer_question} — similar count ${u.similar_count}, priority ${u.training_priority}`).join("\n")}`
        : "There are no unanswered questions waiting for review.";
      await service.from("ai_admin_messages").insert({ conversation_id: trainerId, sender_kind: "ai", body: reply, metadata: { mode: "review", unknown_ids: (unknown || []).map((u: any) => u.id) } });
      return json(req, { trainer_conversation_id: trainerId, reply, unknown: unknown || [] });
    }

    if (mode === "test") {
      if (!access.ai_test) return json(req, { error: "AI test permission required" }, 403);
      const ranked = kb.map((entry) => ({ entry, score: score(prompt, entry) })).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const supported = Boolean(best && best.score >= 4);
      const confidence = supported ? Math.min(0.94, 0.72 + best.score * 0.025) : 0;
      const reply = supported ? best.entry.approved_answer : "The production bot should hand this question to a human because there is no sufficiently supported approved answer.";
      const result = { response: reply, confidence, source: supported ? best.entry.title : null, source_id: supported ? best.entry.id : null, action: supported ? "answer" : "handoff" };
      await service.from("ai_admin_messages").insert({ conversation_id: trainerId, sender_kind: "ai", body: reply, metadata: { mode: "test", ...result } });
      return json(req, { trainer_conversation_id: trainerId, ...result });
    }

    if (mode === "teach") {
      if (!access.ai_suggest_training) return json(req, { error: "Training suggestion permission required" }, 403);
      const draftType = looksBehavior(prompt) ? "behavior" : "knowledge";
      const ranked = kb.map((entry) => ({ entry, score: score(prompt, entry) })).sort((a, b) => b.score - a.score);
      const conflict = ranked[0] && ranked[0].score >= 6 ? ranked[0].entry : null;
      const proposalText = await modelReply(prompt, conflict ? [conflict] : kb.slice(0, 20), rules || [], "teach");
      const proposed = (proposalText || prompt).slice(0, 12000);
      const { data: draft, error } = await service.from("ai_training_drafts").insert({
        draft_type: draftType,
        source_kind: "trainer",
        source_id: trainerId,
        proposed_title: titleFrom(prompt),
        proposed_category_code: conflict?.category_code || null,
        proposed_answer: proposed,
        proposed_rule: draftType === "behavior" ? { trigger: { natural_language: prompt }, action: { instruction: proposed }, priority: 100 } : null,
        conflict_with: conflict?.id || null,
        status: "pending",
        created_by: userData.user.id,
      }).select("*").single();
      if (error) throw new Error("create_draft_failed");
      await service.from("ai_training_actions").insert({ draft_id: draft.id, admin_id: userData.user.id, action: "created", new_value: draft });
      const reply = `Proposed ${draftType} change created. Nothing has been published. Review the preview and choose Approve, Edit, Reject or Save as Draft.${conflict ? `\n\nPotential conflict/overlap: ${conflict.title}` : ""}`;
      await service.from("ai_admin_messages").insert({ conversation_id: trainerId, sender_kind: "ai", body: reply, metadata: { mode: "teach", draft_id: draft.id, conflict_with: conflict?.id || null } });
      return json(req, { trainer_conversation_id: trainerId, reply, draft, conflict });
    }

    const lower = clean(prompt);
    let reply = "";
    if (/what do you know|current.*commission|commission rules|pickup rules|missed pickup|shipping|what.*pickup/.test(lower)) {
      const ranked = kb.map((entry) => ({ entry, score: score(prompt, entry) })).sort((a, b) => b.score - a.score).filter((x) => x.score > 0).slice(0, 8);
      reply = ranked.length ? ranked.map((x, i) => `${i + 1}. ${x.entry.title}: ${x.entry.approved_answer}`).join("\n\n") : `The approved knowledge base currently contains ${kb.length} article(s), but none match that question closely.`;
    } else if (/least confident|gaps|unanswered|could not answer/.test(lower)) {
      reply = (unknown || []).length ? `There are ${(unknown || []).length} open unanswered topics in the current review window. Highest-priority examples:\n${(unknown || []).slice(0, 10).map((u: any, i: number) => `${i + 1}. ${u.customer_question}`).join("\n")}` : "There are no open unanswered questions right now.";
    } else if (/behavior|rules/.test(lower)) {
      reply = (rules || []).map((r: any, i: number) => `${i + 1}. ${r.rule_name}: ${r.instruction}`).join("\n") || "No approved behavior rules are configured.";
    } else {
      const ranked = kb.map((entry) => ({ entry, score: score(prompt, entry) })).sort((a, b) => b.score - a.score).filter((x) => x.score > 0).slice(0, 8).map((x) => x.entry);
      reply = await modelReply(prompt, ranked, rules || [], "chat") || (ranked.length ? ranked.map((entry, i) => `${i + 1}. ${entry.title}: ${entry.approved_answer}`).join("\n\n") : "I can only answer about the currently approved support knowledge and behavior configuration. I don’t have enough approved context for that request.");
    }

    reply = String(reply).slice(0, 12000);
    await service.from("ai_admin_messages").insert({ conversation_id: trainerId, sender_kind: "ai", body: reply, metadata: { mode: "chat" } });
    return json(req, { trainer_conversation_id: trainerId, reply });
  } catch (error) {
    console.error("support-trainer failure", error);
    return json(req, { error: "AI Trainer is temporarily unavailable." }, 500);
  }
});
