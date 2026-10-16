"use server";
import {redirect} from "next/navigation";
import {protectAuthForm} from "@/lib/auth-form-protection";
import {postalStorage} from "@/lib/postal-server";
export async function submitGuestInquiry(form:FormData){
 await protectAuthForm(form,"/contact");
 const email=String(form.get("email")||"").trim(), message=String(form.get("message")||"").trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||message.length<10||message.length>3000)redirect("/contact?error=1");
 let saved=false;try{const {error}=await postalStorage().from("buyer_guest_inquiries").insert({email,message});saved=!error;}catch{}
 redirect(`/contact?${saved?"saved":"error"}=1`);
}
