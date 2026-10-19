"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Thread = { id: string; subject: string; status: string };
type Message = { id: string; sender_kind: string; body: string };
export function CustomerSupport({userId,fr,loginReturnTo="/support"}: {userId:string|null;fr:boolean;loginReturnTo?:"/support"|"/assistant"|"/account/messages"}) {
  const [supabase] = useState(() => createClient());
  const [threads,setThreads] = useState<Thread[]>([]);
  const [selected,setSelected] = useState("");
  const [messages,setMessages] = useState<Message[]>([]);
  const [subject,setSubject] = useState("");
  const [text,setText] = useState("");
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const messageRequest = useRef(0);
  const t = (en:string,french:string) => fr ? french : en;
  const load = useCallback(async () => {
    if (!userId) return;
    const {data,error} = await supabase.from("support_conversations").select("id,subject,status").eq("customer_id",userId).order("last_message_at",{ascending:false}).limit(20);
    if(error) {setError(fr?"Impossible de charger vos demandes. Réessayez.":"Your tickets could not be loaded. Please try again.");return;}
    setThreads(data || []);
  },[supabase,userId,fr]);
  const loadMessages = useCallback(async (id:string) => {
    const request = ++messageRequest.current;
    if(!id) {setMessages([]);setLoading(false);return;}
    setLoading(true);
    const {data,error} = await supabase.from("support_messages").select("id,sender_kind,body").eq("conversation_id",id).order("created_at",{ascending:false}).limit(100);
    if(request!==messageRequest.current)return;
    setLoading(false);
    if(error){setError(fr?"Impossible de charger les messages.":"Messages could not be loaded.");return;}
    setMessages((data || []).reverse());
  },[supabase,fr]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
  useEffect(()=>{
    const timer=setTimeout(()=>void loadMessages(selected),0);
    if(!selected)return()=>clearTimeout(timer);
    const channel=supabase.channel(`support-ticket:${selected}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"support_messages",filter:`conversation_id=eq.${selected}`},()=>{void loadMessages(selected);void load();}).subscribe();
    return()=>{clearTimeout(timer);void supabase.removeChannel(channel);};
  },[supabase,selected,loadMessages,load]);
  if(!userId)return <Link href={`/login?next=${encodeURIComponent(loginReturnTo)}`}>{t("Sign in to create a ticket","Connectez-vous pour créer une demande")}</Link>;
  const thread=threads.find(entry=>entry.id===selected);
  const closed=thread?.status==="closed";
  const statusLabel=(status:string)=>({waiting:t("Waiting for our team","En attente de notre équipe"),human:t("In progress","En cours"),resolved:t("Resolved","Résolue"),closed:t("Closed","Fermée"),ai:t("Open","Ouverte")}[status] || t("Open","Ouverte"));
  return <section className="support-ticket">
    <div className="ticket-heading"><div><p className="support-kicker">{t("CUSTOMER CARE","SERVICE À LA CLIENTÈLE")}</p><h2>{selected?t("Your support ticket","Votre demande de soutien"):t("Create a support ticket","Créer une demande de soutien")}</h2></div>{selected?<button type="button" className="ticket-new" disabled={busy} onClick={()=>{messageRequest.current++;setSelected("");setMessages([]);setText("");setSubject("");setSuccess("");setError("");}}>{t("+ New ticket","+ Nouvelle demande")}</button>:null}</div>
    {success?<p role="status" className="ticket-success">{success}</p>:null}
    {selected?<div className="ticket-reference"><strong>{thread?.subject || subject}</strong><span translate="no">#{selected.slice(0,8).toUpperCase()}</span><small>{statusLabel(thread?.status || "waiting")}</small></div>:null}
    {selected?<div className="ticket-transcript" aria-live="polite" aria-busy={loading}>{loading?<p>{t("Loading messages…","Chargement des messages…")}</p>:messages.map(message=><article key={message.id} className={message.sender_kind==="customer"?"from-customer":"from-team"}><b>{message.sender_kind==="customer"?t("You","Vous"):"Shikimomo"}</b><p>{message.body}</p></article>)}</div>:null}
    {!closed?<form onSubmit={async e=>{
      e.preventDefault();if(busy||text.trim().length<1||(!selected&&subject.trim().length<3))return;
      setBusy(true);setError("");setSuccess("");
      try{
        let id=selected;
        if(!id){const result=await supabase.rpc("support_create_ticket",{p_subject:subject.trim(),p_message:text.trim()});if(result.error||!result.data)throw Error();id=String(result.data);setSelected(id);setSuccess(t("Ticket submitted. Our team will reply here.","Demande envoyée. Notre équipe vous répondra ici."));}
        else{const result=await supabase.rpc("support_reply_ticket",{p_conversation_id:id,p_body:text.trim()});if(result.error)throw Error();setSuccess(t("Your reply was sent.","Votre réponse a été envoyée."));}
        setText("");await load();await loadMessages(id);
      }catch{setError(t("Your ticket or reply could not be sent. Please try again.","Votre demande ou réponse n’a pas pu être envoyée. Veuillez réessayer."));}
      finally{setBusy(false);}
    }}>
      {!selected?<label>{t("Subject","Objet")}<input name="subject" value={subject} onChange={e=>setSubject(e.target.value)} required minLength={3} maxLength={160} placeholder={t("For example: Change my pickup date","Par exemple : modifier ma date de collecte")} disabled={busy}/></label>:null}
      <label>{selected?t("Your reply","Votre réponse"):t("How can we help?","Comment pouvons-nous vous aider?")}<textarea name="message" value={text} onChange={e=>setText(e.target.value)} maxLength={4000} minLength={selected?1:10} required disabled={busy} placeholder={t("Describe the issue. Include your order or pickup reference if you have one.","Décrivez le problème. Ajoutez votre référence de commande ou de collecte si vous en avez une.")}/></label>
      <div className="ticket-form-bottom"><small>{t("Do not include passwords or payment card details.","N’incluez aucun mot de passe ni renseignement de carte bancaire.")}</small><button className="ticket-submit" disabled={busy}>{busy?t("Sending…","Envoi…"):selected?t("Send reply","Envoyer la réponse"):t("Submit ticket","Envoyer la demande")}</button></div>
    </form>:<p>{t("This ticket is closed. Create a new ticket if you need more help.","Cette demande est fermée. Créez une nouvelle demande si vous avez besoin d’aide.")}</p>}
    {error?<div role="alert" className="ticket-error"><p>{error}</p><button type="button" onClick={()=>{setError("");void load();void loadMessages(selected);}}>{t("Reload tickets","Recharger les demandes")}</button></div>:null}
  </section>;
}
