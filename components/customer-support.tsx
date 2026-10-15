"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
export function CustomerSupport({
  userId,
  fr,
  loginReturnTo = "/support",
}: {
  userId: string | null;
  fr: boolean;
  loginReturnTo?: "/support" | "/assistant" | "/account/messages";
}) {
  const [supabase] = useState(() => createClient());
  const [threads, setThreads] = useState<
      { id: string; subject: string; status: string }[]
    >([]),
    [selected, setSelected] = useState<string | null>(null),
    [messages, setMessages] = useState<
      { id: string; sender_kind: string; body: string }[]
    >([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [pendingHandoff, setPendingHandoff] = useState<string | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: loadError } = await supabase
      .from("support_conversations")
      .select("id,subject,status")
      .eq("customer_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(20);
    if (loadError) {
      setError(fr ? "Impossible de charger vos conversations. Réessayez." : "Your conversations could not be loaded. Please try again.");
      return;
    }
    setThreads(data || []);
  }, [supabase, userId, fr]);
  const loadMessages = useCallback(async (conversationId = selected) => {
    if (!conversationId) return;
    const { data, error: loadError } = await supabase
      .from("support_messages")
      .select("id,sender_kind,body")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (loadError) {
      setError(fr ? "Impossible de charger les messages. Réessayez." : "Messages could not be loaded. Please try again.");
      return;
    }
    setMessages((data || []).reverse());
  }, [supabase, selected, fr]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => void loadMessages(), 0);
    if (!selected) return () => clearTimeout(timer);
    const channel = supabase
      .channel(`assistant-support:${selected}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${selected}`,
        },
        () => void loadMessages(),
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, selected, loadMessages]);
  if (!userId)
    return (
      <Link href={`/login?next=${encodeURIComponent(loginReturnTo)}`}>
        {fr
          ? "Connectez-vous pour contacter l’équipe"
          : "Sign in to contact the team"}
      </Link>
    );
  return (
    <section className="assistant-human">
      <h3>{fr ? "L’équipe Shikimomo" : "The Shikimomo team"}</h3>
      <select
        aria-label={fr ? "Conversation de soutien" : "Support conversation"}
        value={selected || ""}
        onChange={(e) => {
          setMessages([]);
          setSelected(e.target.value || null);
        }}
      >
        <option value="">
          {fr ? "Nouvelle conversation" : "New conversation"}
        </option>
        {threads.map((t) => (
          <option key={t.id} value={t.id}>
            {t.subject} · {t.status}
          </option>
        ))}
      </select>
      <div aria-live="polite">
        {messages.map((m) => (
          <p key={m.id}>
            <b>
              {m.sender_kind === "customer" ? (fr ? "Vous" : "You") : "Shikimomo"}
            </b>
            <br />
            {m.body}
          </p>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !text.trim()) return;
          setBusy(true);
          setError("");
          try {
            let id = selected;
            if (!id) {
              const start = await supabase.rpc("support_start_conversation", {
                p_message: text,
                p_subject: "Personal assistant support",
              });
              if (start.error || !start.data) throw Error();
              id = String(start.data);
              setSelected(id);
              const handoff = await supabase.rpc("support_request_human", {
                p_conversation_id: id,
              });
              if (handoff.error) {
                setPendingHandoff(id);
                setText("");
                await load();
                await loadMessages(id);
                setError(fr ? "Votre message a été enregistré, mais la demande à l’équipe a échoué. Réessayez la demande ci-dessous sans renvoyer votre message." : "Your message was saved, but the team handoff failed. Retry the request below without sending your message again.");
                return;
              }
            } else {
              const sent = await supabase.rpc("support_send_customer_message", {
                p_conversation_id: id,
                p_body: text,
              });
              if (sent.error) throw Error();
            }
            setText("");
            await load();
            await loadMessages(id);
          } catch {
            setError(
              fr
                ? "Message non envoyé. Réessayez."
                : "Message was not sent. Please try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          aria-label={fr ? "Message à l’équipe" : "Message to the team"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          required
        />
        <button disabled={busy}>
          {fr ? "Envoyer à l’équipe" : "Send to the team"}
        </button>
      </form>
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); void load(); void loadMessages(); }}>{fr ? "Réessayer le chargement" : "Retry loading"}</button></div>}
      {pendingHandoff && <button type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const { error: handoffError } = await supabase.rpc("support_request_human", { p_conversation_id: pendingHandoff });
          if (handoffError) throw Error();
          setPendingHandoff(null);
          setError("");
          await load();
        } catch {
          setError(fr ? "Votre message est enregistré, mais la demande à l’équipe n’a pas abouti. Réessayez plus tard." : "Your message is saved, but the team request could not be completed. Please try again later.");
        } finally { setBusy(false); }
      }}>{fr ? "Réessayer la demande à l’équipe" : "Retry team request"}</button>}
    </section>
  );
}
