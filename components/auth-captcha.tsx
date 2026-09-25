"use client";
import Script from 'next/script';
import {useCallback,useEffect,useRef,useState} from 'react';
type Turnstile={render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void};
export function AuthCaptcha(){
 const sitekey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
 const container=useRef<HTMLDivElement>(null);const widget=useRef<string|undefined>(undefined);const [token,setToken]=useState('');const [error,setError]=useState(false);
 const mount=useCallback(()=>{const api=(window as Window & {turnstile?:Turnstile}).turnstile;if(!api||!container.current||widget.current||!sitekey)return;widget.current=api.render(container.current,{sitekey,callback:(value:string)=>{setToken(value);setError(false);},'expired-callback':()=>setToken(''),'error-callback':()=>{setToken('');setError(true);}});},[sitekey]);
 useEffect(()=>()=>{if(widget.current)(window as Window & {turnstile?:Turnstile}).turnstile?.remove(widget.current);widget.current=undefined;},[]);
 if(!sitekey)return null;
 return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={mount} onError={()=>setError(true)}/><div ref={container}/><input type="hidden" name="captcha_token" value={token}/>{error&&<p role="alert">Verification could not load. Reload to try again.</p>}</>;
}
