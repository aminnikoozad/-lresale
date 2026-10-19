"use client";

import Link from "next/link";
import { ArrowLeft, LifeBuoy, Mail, ArrowUpRight } from "lucide-react";
import { CustomerSupport } from "./customer-support";
import { useLocale } from "./site-language";

type Contact = { email: string; phone: string; address: string; hoursEn: string; hoursFr: string };
export function SupportHub({ userId, contact }: { userId: string | null; contact: Contact }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const t = (en: string, french: string) => fr ? french : en;
  const hours = fr ? contact.hoursFr : contact.hoursEn;
  return <main className="support-public support-redesign" lang={locale}>
    <Link className="support-back" href="/shop"><ArrowLeft size={16} />{t("Back to shop", "Retour à la boutique")}</Link>
    <header className="support-hero"><span className="support-icon"><LifeBuoy size={24} /></span><p className="support-kicker">SHIKIMOMO</p><h1>{t("How can we help?", "Comment pouvons-nous vous aider?")}</h1><p>{t("Tell us about your order, pickup or account. Our team will follow up here.", "Parlez-nous de votre commande, collecte ou compte. Notre équipe vous répondra ici.")}</p></header>
    <div className="support-public-grid">
      <section className="support-public-card support-main-card" aria-label={t("Support tickets", "Demandes de soutien")}>
        {userId ? <CustomerSupport key={userId} userId={userId} fr={fr} /> : <div className="support-guest-choice"><h2>{t("Send a support ticket", "Envoyer une demande de soutien")}</h2><p>{t("Sign in to track your ticket and read our replies, or contact us without an account.", "Connectez-vous pour suivre votre demande et lire nos réponses, ou écrivez-nous sans compte.")}</p><Link className="support-public-button" href="/login?next=%2Fsupport">{t("Sign in & create a ticket", "Se connecter et créer une demande")}</Link><Link href="/contact">{t("Create a ticket without signing in", "Créer une demande sans connexion")} <ArrowUpRight size={15} /></Link></div>}
      </section>
      <aside className="support-public-side">
        <nav className="support-public-card support-policy-links" aria-label={t("Quick help", "Aide rapide")}><h2>{t("Quick help", "Aide rapide")}</h2>
          <Link href="/pickup-policy">{t("Pickup & collection", "Collecte et ramassage")}<ArrowUpRight size={16}/></Link><Link href="/returns">{t("Returns & refunds", "Retours et remboursements")}<ArrowUpRight size={16}/></Link><Link href="/shipping-policy">{t("Shipping & delivery", "Expédition et livraison")}<ArrowUpRight size={16}/></Link><Link href="/forgot-password">{t("Reset your password", "Réinitialiser votre mot de passe")}<ArrowUpRight size={16}/></Link>
        </nav>
        <section className="support-public-card support-contact-compact"><Mail size={20}/><h2>{t("Need help signing in?", "Besoin d’aide pour vous connecter?")}</h2><Link href="/contact">{t("Contact us without signing in", "Nous écrire sans connexion")}</Link>{contact.email ? <p><a href={`mailto:${contact.email}`} translate="no">{contact.email}</a></p> : null}{hours ? <p>{hours}</p> : null}</section>
      </aside>
    </div>
  </main>;
}
