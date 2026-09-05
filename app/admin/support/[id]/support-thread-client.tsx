"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, CircleUserRound, Headphones, LockKeyhole, MessageSquareText, Send, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Conversation = {
  id:string; customer_id:string; customer_name:string|null; customer_email:string|null; customer_phone:string|null; customer_code:string|null; username:string|null;
  subject:string; status:string; priority:string; category:string; subcategory:string; assigned_to:string|null; assigned_name:string|null;
  human_requested:boolean; ai_enabled:boolean; internal_summary:string|null; recommended_action:string|null; ai_confidence:number|null;
  pickup_id:string|null; item_id:string|null; external_order_ref:string|null; created_at:string; last_message_at:string;
};
type Message={id:string;conversation_id:string;sender_id:string|null;sender_kind:string;sender_display_name:string|null;body:string;ai_confidence:number|null;customer_helpful:boolean|null;created_at:string;metadata?:Record<string,unknown>};
type Note={id:string;author_id:string;body:string;created_at:string};
type Admin={user_id:string;display_name:string;role:string;availability_status:string;last_seen_at:string|null};
type Parent={id:string;name:string;code:string;sort_order:number};
type Child={id:string;parent_id:string;name:string;code:string;sort_order:number};
type History={id:string;subject:string;status:string;category:string;subcategory:string;last_message_at:string};
type Permissions={user_id:string;role:string;display_name:string;can_support:boolean;ai_view:boolean;ai_test:boolean;ai_suggest_training:boolean;ai_edit_training:boolean;ai_approve_training:boolean;ai_manage_behavior_rules:boolean};

export function SupportThreadClient({initialConversation,initialMessages,initialNotes,admins,parentCategories,childCategories,customerHistory,permissions}:{initialConversation:Conversation;initialMessages:Message[];initialNotes:Note[];admins:Admin[];parentCategories:Parent[];childCategories:Child[];customerHistory:History[];permissions:Permissions}){
  const supabase=useMemo(()=>createClient(),[]);
  const [conversation,setConversation]=useState(initialConversation);
  const [messages,setMessages]=useState(initialMessages);
  const [notes,setNotes]=useState(initialNotes);
  const [reply,setReply]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [presence,setPresence]=useState<Array<{actor_id:string;actor_kind:string;viewing:boolean;typing:boolean;updated_at:string}>>([]);
  const [correctionFor,setCorrectionFor]=useState<string|null>(null);
  const [correction,setCorrection]=useState("");
  const [trainingNotice,setTrainingNotice]=useState<string|null>(null);
  const endRef=useRef<HTMLDivElement|null>(null);
  const typingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const myId=permissions.user_id;
  const assignedToMe=conversation.assigned_to===myId;
  const currentSubcategories=childCategories.filter(c=>parentCategories.find(p=>p.id===c.parent_id)?.name===conversation.category);

  const loadConversation=useCallback(async()=>{
    const {data}=await supabase.rpc("support_admin_conversation",{p_conversation_id:conversation.id});
    const row=Array.isArray(data)?data[0]:data;if(row)setConversation(row as Conversation);
  },[conversation.id,supabase]);
  const loadMessages=useCallback(async()=>{
    const {data}=await supabase.from("support_messages").select("id,conversation_id,sender_id,sender_kind,sender_display_name,body,ai_confidence,customer_helpful,created_at,metadata").eq("conversation_id",conversation.id).order("created_at");
    if(data)setMessages(data as Message[]);
  },[conversation.id,supabase]);
  const loadNotes=useCallback(async()=>{
    const {data}=await supabase.from("support_internal_notes").select("id,author_id,body,created_at").eq("conversation_id",conversation.id).order("created_at",{ascending:false});
    if(data)setNotes(data as Note[]);
  },[conversation.id,supabase]);
  const loadPresence=useCallback(async()=>{
    const cutoff=new Date(Date.now()-30000).toISOString();
    const {data}=await supabase.from("support_presence").select("actor_id,actor_kind,viewing,typing,updated_at").eq("conversation_id",conversation.id).gte("updated_at",cutoff);
    if(data)setPresence(data);
  },[conversation.id,supabase]);

  useEffect(()=>{
    void supabase.rpc("support_set_presence",{p_conversation_id:conversation.id,p_viewing:true,p_typing:false});
    void loadPresence();
    const channel=supabase.channel(`support-admin-thread-${conversation.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"support_messages",filter:`conversation_id=eq.${conversation.id}`},()=>void loadMessages())
      .on("postgres_changes",{event:"*",schema:"public",table:"support_conversations",filter:`id=eq.${conversation.id}`},()=>void loadConversation())
      .on("postgres_changes",{event:"*",schema:"public",table:"support_presence",filter:`conversation_id=eq.${conversation.id}`},()=>void loadPresence())
      .subscribe();
    return()=>{void supabase.rpc("support_set_presence",{p_conversation_id:conversation.id,p_viewing:false,p_typing:false});void supabase.removeChannel(channel)};
  },[conversation.id,loadConversation,loadMessages,loadPresence,supabase]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth",block:"end"})},[messages]);

  async function run(task:()=>Promise<void>){setBusy(true);setError(null);try{await task()}catch(e){setError(e instanceof Error?e.message:"Action failed")}finally{setBusy(false)}}
  function rpcError(error:{message?:string}|null){if(error)throw new Error(error.message||"Action failed")}

  async function takeOver(force=false){await run(async()=>{const {error:e}=await supabase.rpc("support_take_over",{p_conversation_id:conversation.id,p_force:force});rpcError(e);await loadConversation()})}
  async function returnToAi(){await run(async()=>{const {error:e}=await supabase.rpc("support_return_to_ai",{p_conversation_id:conversation.id});rpcError(e);await loadConversation()})}
  async function sendReply(){const text=reply.trim();if(!text)return;await run(async()=>{const {error:e}=await supabase.rpc("support_send_agent_message",{p_conversation_id:conversation.id,p_body:text});rpcError(e);setReply("");await loadMessages()})}
  async function assign(adminId:string){if(!adminId)return;await run(async()=>{const {error:e}=await supabase.rpc("support_assign_conversation",{p_conversation_id:conversation.id,p_admin_id:adminId});rpcError(e);await loadConversation()})}
  async function setPriority(priority:string){await run(async()=>{const {error:e}=await supabase.rpc("support_set_priority",{p_conversation_id:conversation.id,p_priority:priority});rpcError(e);await loadConversation()})}
  async function setCategory(category:string){const first=childCategories.find(c=>parentCategories.find(p=>p.id===c.parent_id)?.name===category);if(!first)return;await run(async()=>{const {error:e}=await supabase.rpc("support_set_category",{p_conversation_id:conversation.id,p_category:category,p_subcategory:first.name});rpcError(e);await loadConversation()})}
  async function setSubcategory(subcategory:string){await run(async()=>{const {error:e}=await supabase.rpc("support_set_category",{p_conversation_id:conversation.id,p_category:conversation.category,p_subcategory:subcategory});rpcError(e);await loadConversation()})}
  async function addNote(){const text=note.trim();if(!text)return;await run(async()=>{const {error:e}=await supabase.rpc("support_add_internal_note",{p_conversation_id:conversation.id,p_body:text});rpcError(e);setNote("");await loadNotes()})}
  async function resolve(){await run(async()=>{const {error:e}=await supabase.rpc("support_resolve",{p_conversation_id:conversation.id});rpcError(e);await loadConversation()})}
  async function closeConversation(){await run(async()=>{const {error:e}=await supabase.rpc("support_close_conversation",{p_conversation_id:conversation.id});rpcError(e);await loadConversation()})}
  async function suggestTraining(){await run(async()=>{const {data,error:e}=await supabase.rpc("support_suggest_training_from_conversation",{p_conversation_id:conversation.id});rpcError(e);setTrainingNotice(`Training suggestion created${data?` · ${String(data).slice(0,8)}`:""}. It is not active until an authorized admin approves it.`)})}
  async function submitCorrection(messageId:string){const text=correction.trim();if(!text)return;await run(async()=>{const {data,error:e}=await supabase.rpc("support_correct_ai_message",{p_message_id:messageId,p_correction:text});rpcError(e);setCorrectionFor(null);setCorrection("");setTrainingNotice(`AI correction saved as a training proposal${data?` · ${String(data).slice(0,8)}`:""}. The live bot has not changed yet.`)})}

  function updateTyping(value:string){setReply(value);void supabase.rpc("support_set_presence",{p_conversation_id:conversation.id,p_viewing:true,p_typing:true});if(typingTimer.current)clearTimeout(typingTimer.current);typingTimer.current=setTimeout(()=>void supabase.rpc("support_set_presence",{p_conversation_id:conversation.id,p_viewing:true,p_typing:false}),1200)}

  const customerTyping=presence.some(p=>p.actor_kind==="customer"&&p.typing);
  const otherAgents=presence.filter(p=>p.actor_kind==="agent"&&p.actor_id!==myId&&(p.viewing||p.typing));
  const adminName=(id:string)=>admins.find(a=>a.user_id===id)?.display_name||"Another support agent";

  return <>
    {error?<div className="support-admin-error">{error}</div>:null}
    {trainingNotice?<div className="support-admin-chip" style={{marginBottom:12,whiteSpace:"normal"}}>{trainingNotice}</div>:null}
    <div className="support-thread-layout">
      <section className="support-thread-card">
        <div className="support-thread-head">
          <div><h2>{conversation.customer_name||conversation.customer_email||"Customer"}</h2><p>{conversation.subject} · {conversation.customer_code?`Customer #${conversation.customer_code}`:"Authenticated customer"}</p></div>
          <div className="support-thread-badges"><span className={conversation.priority==="urgent"?"urgent":""}>{conversation.priority}</span><span>{conversation.status}</span><span>{conversation.category} › {conversation.subcategory}</span></div>
        </div>
        {otherAgents.length?<div className="support-thread-typing">{otherAgents.map(p=>`${adminName(p.actor_id)}${p.typing?" is typing":" is viewing"}`).join(" · ")}</div>:null}
        {customerTyping?<div className="support-thread-typing">Customer is typing…</div>:null}
        <div className="support-thread-messages">
          {messages.map(m=><article key={m.id} className={`support-admin-message ${m.sender_kind}`}>
            <div className="support-admin-message-meta">{m.sender_kind==="customer"?<UserRound/>:m.sender_kind==="agent"?<Headphones/>:m.sender_kind==="ai"?<Bot/>:<MessageSquareText/>}<b>{m.sender_kind==="customer"?conversation.customer_name||"Customer":m.sender_display_name||m.sender_kind}</b><span>{new Date(m.created_at).toLocaleString()}</span></div>
            <p>{m.body}</p>
            {m.sender_kind==="ai"&&permissions.ai_suggest_training?<div className="support-ai-actions"><button type="button" onClick={()=>{setCorrectionFor(correctionFor===m.id?null:m.id);setCorrection("")}}>Correct AI</button>{m.ai_confidence!==null?<span>Confidence {Math.round(Number(m.ai_confidence)*100)}%</span>:null}</div>:null}
            {correctionFor===m.id?<div className="support-draft"><h4>Correct AI answer</h4><textarea className="support-note-input" style={{width:"100%",minHeight:80}} value={correction} onChange={e=>setCorrection(e.target.value)} placeholder="The correct answer is…"/><div className="support-button-row" style={{marginTop:7}}><button className="support-primary-btn" type="button" disabled={busy||!correction.trim()} onClick={()=>void submitCorrection(m.id)}>Create correction proposal</button><button className="support-secondary-btn" type="button" onClick={()=>setCorrectionFor(null)}>Cancel</button></div><p>This creates a draft only. It will not change official bot knowledge until approved.</p></div>:null}
          </article>)}
          <div ref={endRef}/>
        </div>
        <div className="support-reply-box">
          <textarea value={reply} onChange={e=>updateTyping(e.target.value)} placeholder={assignedToMe&&conversation.status==="human"?"Reply to customer…":"Take over or assign this conversation before replying."} disabled={!assignedToMe||conversation.status!=="human"||busy}/>
          <div className="support-reply-actions"><span>{assignedToMe?"You are the active support agent.":conversation.assigned_name?`Assigned to ${conversation.assigned_name}.`:"Not assigned."}</span><button className="support-primary-btn" type="button" disabled={!assignedToMe||conversation.status!=="human"||!reply.trim()||busy} onClick={()=>void sendReply()}><Send/> Reply</button></div>
        </div>
      </section>

      <aside className="support-side">
        <section className="support-panel-card">
          <h3>Conversation control</h3>
          <div className="support-button-row">
            {!assignedToMe?<button className="support-primary-btn" type="button" disabled={busy||conversation.status==="closed"} onClick={()=>void takeOver(false)}>Take Over Conversation</button>:null}
            {assignedToMe&&conversation.status==="human"?<button className="support-secondary-btn" type="button" disabled={busy} onClick={()=>void returnToAi()}>Return to AI</button>:null}
            {conversation.status!=="resolved"&&conversation.status!=="closed"?<button className="support-secondary-btn" type="button" disabled={busy} onClick={()=>void resolve()}><CheckCircle2/> Resolve</button>:null}
            {conversation.status!=="closed"?<button className="support-danger-btn" type="button" disabled={busy} onClick={()=>void closeConversation()}>Close</button>:null}
          </div>
          {conversation.assigned_to&&!assignedToMe&&permissions.role!=="agent"?<button className="support-danger-btn" style={{marginTop:8}} type="button" disabled={busy} onClick={()=>void takeOver(true)}>Force takeover</button>:null}
          <div className="support-controls" style={{marginTop:12}}>
            <label>Assigned admin<select className="support-control-select" value={conversation.assigned_to||""} onChange={e=>void assign(e.target.value)} disabled={busy}><option value="">Unassigned</option>{admins.map(a=><option key={a.user_id} value={a.user_id}>{a.display_name} · {a.availability_status}</option>)}</select></label>
            <label>Priority<select className="support-control-select" value={conversation.priority} onChange={e=>void setPriority(e.target.value)} disabled={busy}>{["low","normal","high","urgent"].map(v=><option key={v} value={v}>{v.toUpperCase()}</option>)}</select></label>
            <label>Category<select className="support-control-select" value={conversation.category} onChange={e=>void setCategory(e.target.value)} disabled={busy}>{parentCategories.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
            <label>Subcategory<select className="support-control-select" value={conversation.subcategory} onChange={e=>void setSubcategory(e.target.value)} disabled={busy}>{currentSubcategories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
          </div>
        </section>

        {(conversation.internal_summary||conversation.recommended_action)?<section className="support-panel-card support-summary"><h3>AI handoff summary</h3>{conversation.internal_summary?<><strong>Summary</strong><p>{conversation.internal_summary}</p></>:null}{conversation.recommended_action?<><strong>Recommended action</strong><p>{conversation.recommended_action}</p></>:null}<small><LockKeyhole/> Internal only — never shown to the customer.</small></section>:null}

        <section className="support-panel-card"><h3>Authenticated customer</h3><div className="support-detail-grid"><div><span>Name</span><b>{conversation.customer_name||"—"}</b></div><div><span>Email</span><b>{conversation.customer_email||"—"}</b></div><div><span>Phone</span><b>{conversation.customer_phone||"—"}</b></div><div><span>Username</span><b>{conversation.username?`@${conversation.username}`:"—"}</b></div><div><span>Customer ID</span><b>{conversation.customer_code||conversation.customer_id}</b></div>{conversation.pickup_id?<div><span>Pickup</span><b>{conversation.pickup_id}</b></div>:null}{conversation.item_id?<div><span>Item</span><b>{conversation.item_id}</b></div>:null}</div></section>

        <section className="support-panel-card"><h3>Internal notes</h3><textarea className="support-note-input" style={{width:"100%",minHeight:70}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Customer never sees this note."/><button className="support-secondary-btn" style={{marginTop:7}} type="button" disabled={!note.trim()||busy} onClick={()=>void addNote()}>Add internal note</button><div className="support-notes" style={{marginTop:10}}>{notes.map(n=><div className="support-note" key={n.id}><p>{n.body}</p><small>{adminName(n.author_id)} · {new Date(n.created_at).toLocaleString()}</small></div>)}</div></section>

        {permissions.ai_suggest_training?<section className="support-panel-card"><h3>Improve the AI</h3><p>Use the latest human answer from this conversation as a proposed reusable knowledge entry. Approval is still required.</p><button className="support-secondary-btn" type="button" disabled={busy} onClick={()=>void suggestTraining()}>Teach AI from this conversation</button><p><Link href="/admin/ai-trainer">Open AI Trainer →</Link></p></section>:null}

        <section className="support-panel-card"><h3>Customer history</h3><div className="support-history-mini">{customerHistory.length?customerHistory.map(h=><Link key={h.id} href={`/admin/support/${h.id}`}><b>{h.category} › {h.subcategory}</b><br/><span>{h.status} · {new Date(h.last_message_at).toLocaleDateString()}</span></Link>):<p>No previous support chats.</p>}</div></section>
      </aside>
    </div>
  </>;
}
