"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/site-language";
import { AssistantMark } from "./assistant-mark";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";

const AssistantWorkspace = dynamic(() => import("./assistant-workspace").then(module => module.AssistantWorkspace), { ssr: false });
type Config = { available: boolean; chatEnabled: boolean; voiceEnabled: boolean; memoryEnabled: boolean };
export function ExperienceSwitch() {
  const path = usePathname();
  const { locale } = useLocale();
  const [open,setOpen] = useState(false);
  const [config,setConfig] = useState<Config | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const abort = new AbortController();
    void fetch("/api/assistant/config", {signal:abort.signal,cache:"no-store"}).then(response => { if(!response.ok)throw Error();return response.json(); }).then(value => {
      if(active)setConfig({available:value.available===true,chatEnabled:value.chatEnabled===true,voiceEnabled:value.voiceEnabled===true,memoryEnabled:value.memoryEnabled===true});
    }).catch(() => {if(active)setConfig({available:false,chatEnabled:false,voiceEnabled:false,memoryEnabled:false});});
    return () => { active=false;abort.abort(); };
  },[open]);
  // Do not carry an open assistant across navigation to another page.
  useEffect(() => { const timer=setTimeout(()=>{setOpen(false);setConfig(null);},0);return()=>clearTimeout(timer); },[path]);
  if(path==="/"||path==="/assistant"||path.startsWith("/admin")||path.startsWith("/secure-admin"))return null;
  const label=locale==="fr"?"Achat intelligent":"Smart Shopping";
  return <Dialog open={open} onOpenChange={next=>{setOpen(next);if(!next)setConfig(null);}}><DialogTrigger asChild><button type="button" className="experience-switch" aria-label={label} title={label}><AssistantMark /></button></DialogTrigger>
    <DialogContent className="assistant-modal" showCloseButton={!config} aria-describedby={undefined}>
      <DialogTitle className="sr-only">{label}</DialogTitle>
      {open && config ? <AssistantWorkspace {...config} onClose={()=>{setOpen(false);setConfig(null);}} /> : <div className="assistant-modal-loading" role="status">{locale==="fr"?"Chargement…":"Loading…"}</div>}
    </DialogContent>
  </Dialog>;
}
