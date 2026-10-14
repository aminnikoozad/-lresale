"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
export function CustomerSupport({
  userId,
  fr,
}: {
  userId: string | null;
  fr: boolean;
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
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("support_conversations")
      .select("id,subject,status")
      .eq("customer_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(20);
    setThreads(data || []);
  }, [supabase, userId]);
  const loadMessages = useCallback(async () => {
    if (!selected) return;
    const { data } = await supabase
      .from("support_messages")
      .select("id,sender_kind,body")
      .eq("conversation_id", selected)
      .order("created_at")
      .limit(100);
    setMessages(data || []);
  }, [supabase, selected]);
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
      <Link href="/login?next=%2Fassistant">
        {fr
          ? "Connectez-vous pour contacter l’équipe"
          : "Sign in to contact the team"}
      </Link>
    );
  return (
    <section className="assistant-human">
      <h3>{fr ? "L’équipe REWEAR" : "The REWEAR team"}</h3>
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
              {m.sender_kind === "customer" ? (fr ? "Vous" : "You") : "REWEAR"}
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
              const handoff = await supabase.rpc("support_request_human", {
                p_conversation_id: id,
              });
              if (handoff.error) throw Error();
              setSelected(id);
            } else {
              const sent = await supabase.rpc("support_send_customer_message", {
                p_conversation_id: id,
                p_body: text,
              });
              if (sent.error) throw Error();
            }
            setText("");
            await load();
            await loadMessages();
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
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
