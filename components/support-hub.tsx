"use client";

import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone, Clock } from "lucide-react";
import { BrandWordmark } from "./brand-wordmark";
import { CustomerSupport } from "./customer-support";
import { useLocale } from "./site-language";

type Contact = { email: string; phone: string; address: string; hoursEn: string; hoursFr: string };

export function SupportHub({ userId, contact }: { userId: string | null; contact: Contact }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const t = (en: string, french: string) => fr ? french : en;
  const hours = fr ? contact.hoursFr : contact.hoursEn;
  return <main className="support-public" lang={locale}>
    <header className="support-public-header">
      <Link href="/" className="brand" aria-label={t("Shikimomo home", "Accueil Shikimomo")}><BrandWordmark /></Link>
      <Link href="/shop">{t("Back to shop", "Retour à la boutique")}</Link>
    </header>
    <div className="support-public-intro">
      <p className="eyebrow">{t("The Shikimomo team", "L’équipe Shikimomo")}</p>
      <h1>{t("Contact & support", "Contact et soutien")}</h1>
      <p>{t("Questions about selling, a pickup, an order or your account? Contact our team here.", "Une question sur la vente, une collecte, une commande ou votre compte? Communiquez avec notre équipe ici.")}</p>
    </div>
    <div className="support-public-grid">
      <section className="support-public-card" aria-labelledby="support-chat-title">
        <MessageCircle aria-hidden="true" />
        <h2 id="support-chat-title">{t("Message our team", "Écrivez à notre équipe")}</h2>
        <p>{t("Team messages are separate from the shopping assistant. You do not need Smart Shopping to be active to contact us.", "Les messages à l’équipe sont distincts de l’assistant d’achat. Vous pouvez nous écrire même si l’achat intelligent n’est pas activé.")}</p>
        {userId ? <CustomerSupport key={userId} userId={userId} fr={fr} /> : <>
          <p>{t("Sign in to send a private message and follow your conversation in your account.", "Connectez-vous pour envoyer un message privé et suivre votre conversation dans votre compte.")}</p>
          <Link className="support-public-button" href="/login?next=%2Fsupport">{t("Sign in to message us", "Se connecter pour nous écrire")}</Link>
        </>}
        <p className="support-public-note">{t("Replies are not necessarily immediate. Never send passwords, verification codes or payment card details.", "La réponse peut ne pas être immédiate. N’envoyez jamais de mot de passe, de code de vérification ou de renseignements de carte bancaire.")}</p>
      </section>
      <div className="support-public-side">
        <section className="support-public-card" aria-labelledby="support-contact-title">
          <h2 id="support-contact-title">{t("Contact details", "Coordonnées")}</h2>
          {contact.email && <p><Mail aria-hidden="true" /><a href={`mailto:${contact.email}`} translate="no">{contact.email}</a></p>}
          {contact.phone && <p><Phone aria-hidden="true" /><a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} translate="no">{contact.phone}</a></p>}
          {contact.address && <p><MapPin aria-hidden="true" /><span translate="no">{contact.address}</span></p>}
          {hours && <p><Clock aria-hidden="true" /><span>{hours}</span></p>}
          {!contact.email && !contact.phone && <p>{t("Direct email and telephone contact details have not been published yet. For now, use the signed-in message service above.", "Les coordonnées directes par courriel et par téléphone ne sont pas encore publiées. Pour le moment, utilisez la messagerie ci-dessus après vous être connecté.")}</p>}
          {!hours && <p>{t("Support hours have not been published yet.", "Les heures de soutien ne sont pas encore publiées.")}</p>}
        </section>
        <section className="support-public-card" aria-labelledby="support-access-title">
          <h2 id="support-access-title">{t("Trouble signing in?", "Difficulté à vous connecter?")}</h2>
          <p>{t("If you have forgotten your password, request a recovery link using your account email.", "Si vous avez oublié votre mot de passe, demandez un lien de récupération à l’aide de l’adresse courriel de votre compte.")}</p>
          <Link href="/forgot-password">{t("Recover my password", "Récupérer mon mot de passe")}</Link>
          {!contact.email && <p className="support-public-note">{t("If you cannot access your account email either, a direct support contact is needed. This contact has not been published yet.", "Si vous n’avez pas non plus accès à l’adresse courriel de votre compte, vous aurez besoin d’un contact direct avec le soutien. Ces coordonnées ne sont pas encore publiées.")}</p>}
        </section>
        <nav className="support-public-card support-policy-links" aria-label={t("Help and policies", "Aide et politiques")}>
          <h2>{t("Useful information", "Renseignements utiles")}</h2>
          <Link href="/sell-with-shikimomo">{t("Seller guide", "Guide de vente")}</Link>
          <Link href="/pickup-policy">{t("Pickup policy", "Politique de collecte")}</Link>
          <Link href="/shipping-policy">{t("Shipping policy", "Politique de livraison")}</Link>
          <Link href="/returns">{t("Returns & refunds", "Retours et remboursements")}</Link>
          <Link href="/privacy">{t("Privacy", "Confidentialité")}</Link>
        </nav>
      </div>
    </div>
  </main>;
}
