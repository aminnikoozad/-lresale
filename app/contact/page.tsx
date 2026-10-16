import {Localize} from "@/components/site-language";
import {cookies} from "next/headers";
import Link from "next/link";
import {AuthHumanCheck} from "@/components/auth-human-check";
import {postalReadiness} from "@/lib/postal-server";
import {submitGuestInquiry} from "./actions";
export const dynamic="force-dynamic";
export default async function Contact({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const fr=(await cookies()).get("shikimomo-language")?.value==="fr";const t=(en:string,f:string)=>fr?f:en;const p=await searchParams;const available=postalReadiness().storage;
 return <Localize><main className="buyer-contact section-wrap"><h1>{t("Contact without signing in","Contact sans connexion")}</h1><p>{t("Use this form if you cannot access your account. Do not include passwords, verification codes or payment details.","Utilisez ce formulaire si vous ne pouvez pas accéder à votre compte. N’indiquez aucun mot de passe, code de vérification ou renseignement de paiement.")}</p>{p.saved?<p role="status">{t("Your request was saved for the team. No response time has been promised.","Votre demande a été enregistrée pour l’équipe. Aucun délai de réponse n’a été promis.")}</p>:<form action={submitGuestInquiry}><fieldset disabled={!available}><label>{t("Reply email","Courriel de réponse")}<input type="email" name="email" maxLength={254} required autoComplete="email"/></label><label>{t("Message","Message")}<textarea name="message" minLength={10} maxLength={3000} required/></label><div hidden><input name="website" tabIndex={-1} autoComplete="off"/></div><AuthHumanCheck/><button type="submit">{t("Send request","Envoyer la demande")}</button></fieldset></form>}{(!available||p.error||p.message)&&<p role="alert">{t("This request could not be submitted at the moment. No message has been saved. Please try again later.","Cette demande ne peut pas être transmise pour le moment. Aucun message n’a été enregistré. Veuillez réessayer plus tard.")}</p>}<Link href="/support">{t("Contact & support","Contact et soutien")}</Link></main></Localize>;
}
