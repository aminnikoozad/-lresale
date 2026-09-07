"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, ChevronLeft, Headphones, History, MessageCircle, Send, ThumbsDown, ThumbsUp, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Conversation = {
  id: string;
  subject: string;
  status: "ai" | "waiting" | "human" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  category: string;
  subcategory: string;
  assigned_to: string | null;
  last_message_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_kind: "customer" | "agent" | "ai" | "system";
  sender_display_name: string | null;
  body: string;
  customer_helpful: boolean | null;
  created_at: string;
};

const statusLabel: Record<Conversation["status"], string> = {
  ai: "AI Assistant",
  waiting: "Waiting for Support",
  human: "Support Agent Joined",
  resolved: "Resolved",
  closed: "Closed",
};

const suggestedQuestions = [
  { label: "How does selling work?", question: "How does selling with Rewear work?" },
  { label: "What commission will I get?", question: "How much commission will I receive when my item sells?" },
  { label: "How do I request pickup?", question: "How do I request a pickup for my items?" },
  { label: "What items do you accept?", question: "What clothing, shoes, accessories and electronics do you accept?" },
  { label: "Check my item status", question: "What is the status of my item?" },
  { label: "How does delivery work?", question: "How does Rewear delivery and shipping work?" },
];

export function SupportChat() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("support_conversations")
      .select("id,subject,status,priority,category,subcategory,assigned_to,last_message_at")
      .eq("customer_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(30);
    const rows = (data ?? []) as Conversation[];
    setConversations(rows);
    setActiveId((current) => {
      if (current && rows.some((c) => c.id === current)) return current;
      return rows.find((c) => c.status !== "closed")?.id ?? rows[0]?.id ?? null;
    });
  }, [supabase, userId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: readError } = await supabase
      .from("support_messages")
      .select("id,conversation_id,sender_kind,sender_display_name,body,customer_helpful,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (!readError) setMessages((data ?? []) as Message[]);
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUserId(data.user && !data.user.is_anonymous ? data.user.id : null);
      setAuthReady(true);
    }).catch(() => {
      if (alive) setAuthReady(true);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthReady(true);
      const nextUserId = session?.user && !session.user.is_anonymous ? session.user.id : null;
      setUserId(nextUserId);
      if (!nextUserId) {
        setConversations([]);
        setActiveId(null);
        setMessages([]);
      }
    });
    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    void loadConversations();
    void supabase.rpc("support_live_availability").then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setLiveAvailable(Boolean(row?.live_available));
    });

    const convChannel = supabase
      .channel(`support-customer-conversations-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations", filter: `customer_id=eq.${userId}` }, () => void loadConversations())
      .subscribe();
    return () => { void supabase.removeChannel(convChannel); };
  }, [loadConversations, supabase, userId]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId);
    void supabase.rpc("support_set_presence", { p_conversation_id: activeId, p_viewing: open, p_typing: false });

    const channel = supabase
      .channel(`support-customer-thread-${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `conversation_id=eq.${activeId}` }, () => {
        void loadMessages(activeId);
        void loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_presence", filter: `conversation_id=eq.${activeId}` }, async () => {
        const cutoff = new Date(Date.now() - 20_000).toISOString();
        const { data } = await supabase.from("support_presence").select("actor_kind,typing,updated_at").eq("conversation_id", activeId).eq("actor_kind", "agent").gte("updated_at", cutoff);
        setAgentTyping(Boolean(data?.some((row) => row.typing)));
      })
      .subscribe();

    return () => {
      void supabase.rpc("support_set_presence", { p_conversation_id: activeId, p_viewing: false, p_typing: false });
      void supabase.removeChannel(channel);
    };
  }, [activeId, loadConversations, loadMessages, open, supabase]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, aiTyping, agentTyping, open]);

  if (!authReady || pathname?.startsWith("/admin")) return null;

  if (!userId) {
    if (pathname !== "/") return null;
    return (
      <div className="support-chat-root">
        {!open ? (
          <button className="support-chat-launch" type="button" onClick={() => setOpen(true)}>
            <MessageCircle /> <span>Chat with us</span>
          </button>
        ) : (
          <section className="support-chat-panel support-auth-panel" aria-label="Rewear support sign in">
            <header className="support-chat-head">
              <div>
                <strong>REWEAR Support</strong>
                <span className="support-status">Sign in required</span>
              </div>
              <div className="support-head-actions">
                <button type="button" title="Close chat" onClick={() => setOpen(false)}><X /></button>
              </div>
            </header>
            <div className="support-auth-gate">
              <Bot />
              <p className="eyebrow dark">AI + Human Support</p>
              <h3>Support is available from the homepage.</h3>
              <p>Sign in to start a secure conversation. Your chat history, item questions and pickup status stay connected to your own Rewear account.</p>
              <div className="support-auth-actions">
                <a className="support-auth-primary" href="/login">Sign in to chat</a>
                <a className="support-auth-secondary" href="/signup">Create account</a>
              </div>
              <small>For privacy, account-specific support is not available to signed-out visitors.</small>
            </div>
          </section>
        )}
      </div>
    );
  }

  async function triggerAi(conversationId: string) {
    setAiTyping(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke("support-ai", { body: { conversation_id: conversationId } });
      if (invokeError) setError("AI Assistant is temporarily unavailable. Please try again or start a new AI conversation.");
    } finally {
      setAiTyping(false);
      await Promise.all([loadMessages(conversationId), loadConversations()]);
    }
  }

  async function startSuggestedQuestion(question: string) {
    if (sending) return;
    setSending(true);
    setError(null);
    setInput("");
    setHistoryOpen(false);
    try {
      const { data, error: startError } = await supabase.rpc("support_start_conversation", { p_message: question, p_subject: "AI quick question" });
      if (startError || !data) throw new Error(startError?.message || "Could not start chat");
      const id = String(data);
      setActiveId(id);
      await loadConversations();
      await loadMessages(id);
      await triggerAi(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    try {
      if (!activeId || active?.status === "closed") {
        const { data, error: startError } = await supabase.rpc("support_start_conversation", { p_message: text, p_subject: "Support chat" });
        if (startError || !data) throw new Error(startError?.message || "Could not start chat");
        const id = String(data);
        setActiveId(id);
        await loadConversations();
        await loadMessages(id);
        await triggerAi(id);
      } else {
        const { error: sendError } = await supabase.rpc("support_send_customer_message", { p_conversation_id: activeId, p_body: text });
        if (sendError) throw new Error(sendError.message);
        await loadMessages(activeId);
        if (active?.status === "ai" || active?.status === "resolved") await triggerAi(activeId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message");
      setInput(text);
    } finally {
      setSending(false);
      if (activeId) void supabase.rpc("support_set_presence", { p_conversation_id: activeId, p_viewing: true, p_typing: false });
    }
  }

  function onInput(value: string) {
    setInput(value);
    if (!activeId) return;
    void supabase.rpc("support_set_presence", { p_conversation_id: activeId, p_viewing: true, p_typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void supabase.rpc("support_set_presence", { p_conversation_id: activeId, p_viewing: true, p_typing: false });
    }, 1200);
  }

  async function requestHuman() {
    if (!activeId) return;
    setError(null);
    const { error: handoffError } = await supabase.rpc("support_request_human", { p_conversation_id: activeId });
    if (handoffError) setError(handoffError.message);
    await Promise.all([loadMessages(activeId), loadConversations()]);
  }

  async function rate(messageId: string, helpful: boolean) {
    await supabase.rpc("support_rate_ai_message", { p_message_id: messageId, p_helpful: helpful });
    if (activeId) await loadMessages(activeId);
  }

  function newConversation() {
    setActiveId(null);
    setMessages([]);
    setHistoryOpen(false);
    setInput("");
    setError(null);
  }

  return (
    <div className="support-chat-root">
      {!open ? (
        <button className="support-chat-launch" type="button" onClick={() => setOpen(true)}>
          <MessageCircle /> <span>Chat with us</span>
        </button>
      ) : (
        <section className="support-chat-panel" aria-label="Customer support chat">
          <header className="support-chat-head">
            <div>
              <strong>REWEAR Support</strong>
              <span className={`support-status status-${active?.status ?? "ai"}`}>{active ? statusLabel[active.status] : "AI Assistant"}</span>
            </div>
            <div className="support-head-actions">
              <button type="button" title="Conversation history" onClick={() => setHistoryOpen((v) => !v)}><History /></button>
              <button type="button" title="Close chat" onClick={() => setOpen(false)}><X /></button>
            </div>
          </header>

          {historyOpen ? (
            <div className="support-history">
              <div className="support-history-title"><button type="button" onClick={() => setHistoryOpen(false)}><ChevronLeft /></button><b>Conversation history</b></div>
              <button className="support-new-chat" type="button" onClick={newConversation}>+ New conversation</button>
              {conversations.length ? conversations.map((c) => (
                <button key={c.id} type="button" className={c.id === activeId ? "active" : ""} onClick={() => { setActiveId(c.id); setHistoryOpen(false); }}>
                  <span>{c.category} · {c.subcategory}</span>
                  <b>{statusLabel[c.status]}</b>
                  <small>{new Date(c.last_message_at).toLocaleString()}</small>
                </button>
              )) : <p>No previous support conversations.</p>}
            </div>
          ) : (
            <>
              <div className="support-availability">
                <span className={liveAvailable ? "online" : "offline"} />
                {liveAvailable ? "Live support is available." : "Support team is currently offline. You can still leave a message and use the AI Assistant."}
              </div>

              <div className="support-messages">
                {!activeId && !messages.length ? (
                  <div className="support-welcome">
                    <Bot />
                    <h3>How can we help?</h3>
                    <p>Choose a common question or type your own. The AI uses approved Rewear information and can hand off to Support when needed.</p>
                    <div className="support-suggestions" aria-label="Suggested support questions">
                      {suggestedQuestions.map((item) => (
                        <button key={item.label} type="button" onClick={() => void startSuggestedQuestion(item.question)} disabled={sending}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {messages.map((m) => (
                  <div key={m.id} className={`support-message ${m.sender_kind}`}>
                    <div className="support-message-meta">
                      {m.sender_kind === "customer" ? <UserRound /> : m.sender_kind === "agent" ? <Headphones /> : <Bot />}
                      <b>{m.sender_kind === "customer" ? "You" : m.sender_display_name || (m.sender_kind === "agent" ? "Support Team" : "AI Assistant")}</b>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p>{m.body}</p>
                    {m.sender_kind === "ai" ? (
                      <div className="support-feedback">
                        <span>Helpful?</span>
                        <button className={m.customer_helpful === true ? "selected" : ""} type="button" onClick={() => void rate(m.id, true)} aria-label="Helpful"><ThumbsUp /></button>
                        <button className={m.customer_helpful === false ? "selected" : ""} type="button" onClick={() => void rate(m.id, false)} aria-label="Not helpful"><ThumbsDown /></button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {(aiTyping || agentTyping) ? <div className="support-typing"><span /><span /><span /> {agentTyping ? "Support Team is typing" : "AI Assistant is typing"}</div> : null}
                <div ref={endRef} />
              </div>

              {error ? <div className="support-error">{error}</div> : null}

              <footer className="support-composer">
                {active && active.status !== "waiting" && active.status !== "human" && active.status !== "closed" ? (
                  <button className="support-human" type="button" onClick={() => void requestHuman()}><Headphones /> Talk to a human</button>
                ) : active?.status === "waiting" ? (
                  <div className="support-wait-wrap">
                    <div className="support-wait-note">Your conversation is waiting for Support. You can keep adding details here.</div>
                    <div className="support-ai-restart">
                      <b>Need an instant AI answer instead?</b>
                      <span>Start a separate AI conversation:</span>
                      <div className="support-suggestions compact">
                        {suggestedQuestions.slice(0, 4).map((item) => (
                          <button key={item.label} type="button" onClick={() => void startSuggestedQuestion(item.question)} disabled={sending}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="support-input-row">
                  <textarea value={input} onChange={(e) => onInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} maxLength={4000} rows={2} placeholder={active?.status === "closed" ? "Start a new conversation from History" : "Type your message…"} disabled={sending || active?.status === "closed"} />
                  <button type="button" onClick={() => void send()} disabled={!input.trim() || sending || active?.status === "closed"} aria-label="Send message"><Send /></button>
                </div>
              </footer>
            </>
          )}
        </section>
      )}
    </div>
  );
}