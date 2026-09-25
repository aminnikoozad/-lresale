import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Privacy Policy | Rewear",
  description: "How Rewear collects, uses, protects and handles personal information.",
};

function Contact() {
  return <p><strong>{siteConfig.privacyOfficerTitle}</strong><br />{siteConfig.businessName}{siteConfig.privacyEmail ? <><br /><a href={`mailto:${siteConfig.privacyEmail}`}>{siteConfig.privacyEmail}</a></> : null}{siteConfig.businessAddress ? <><br />{siteConfig.businessAddress}</> : null}{siteConfig.businessPhone ? <><br />{siteConfig.businessPhone}</> : null}</p>;
}

export default function PrivacyPage() {
  return <main className="shipping-policy-page">
    <header className="policy-header"><Link href="/" className="brand">REWEAR<span>.</span></Link><Link href="/account">My account</Link></header>
    <article className="legal-policy">
      <div className="policy-hero"><p className="eyebrow dark">Privacy / Confidentialité</p><h1>Privacy Policy · Politique de confidentialité</h1><p>Effective September 25, 2026 · En vigueur le 25 septembre 2026</p></div>

      <section lang="fr"><h2>Français</h2><p>Nous recueillons seulement les renseignements personnels raisonnablement nécessaires pour exploiter la plateforme, notamment les renseignements de compte et de contact, les adresses de collecte ou de livraison, les renseignements sur les articles, les commandes, les communications avec le soutien et les données techniques de sécurité.</p><h3>Utilisation</h3><p>Ces renseignements servent notamment à créer et sécuriser les comptes, organiser les collectes et livraisons, traiter les commandes, calculer les montants applicables, communiquer avec vous, prévenir la fraude et les abus, respecter nos obligations légales et améliorer le service.</p><h3>Partage</h3><p>Nous pouvons communiquer les renseignements nécessaires à des fournisseurs qui nous aident à fournir le service, par exemple l’hébergement, l’authentification, l’envoi de courriels, le transport, le soutien technique et, une fois activé, le traitement des paiements. Nous ne vendons pas les renseignements personnels.</p><h3>Conservation et sécurité</h3><p>Nous limitons l’accès aux renseignements selon les rôles et appliquons des mesures techniques et administratives adaptées. Les renseignements sont conservés seulement aussi longtemps que nécessaire pour les fins prévues, la sécurité, la résolution de litiges et les obligations légales.</p><h3>Vos droits</h3><p>Vous pouvez demander l’accès ou la rectification de vos renseignements personnels et communiquer avec la personne responsable de leur protection. Selon la loi applicable, vous pouvez aussi demander le retrait d’un consentement ou la cessation de certaines utilisations.</p><h3>Responsable</h3><Contact /></section>

      <section lang="en"><h2>English</h2><p>We collect only personal information reasonably needed to operate the platform, including account and contact information, pickup or delivery addresses, item and order information, support communications, and technical security data.</p><h3>How we use it</h3><p>We use this information to create and secure accounts, arrange pickups and deliveries, prepare and process orders, calculate applicable amounts, communicate with you, prevent fraud and abuse, meet legal obligations, and improve the service.</p><h3>Sharing</h3><p>We may disclose information that is necessary to service providers that help operate the platform, such as hosting, authentication, email delivery, carriers, technical support and, once enabled, payment processing. We do not sell personal information.</p><h3>Retention and security</h3><p>Access is restricted by role and protected with appropriate technical and administrative safeguards. Information is retained only as long as reasonably necessary for the stated purposes, security, dispute resolution and legal obligations.</p><h3>Your rights</h3><p>You may request access to or correction of your personal information and contact the person responsible for privacy. Applicable law may also give you rights to withdraw consent or stop certain uses.</p><h3>Privacy contact</h3><Contact /></section>

      <section><h2>Cookies and similar technologies · Témoins et technologies similaires</h2><p>Essential session and security technologies may be used to keep you signed in, protect forms and preserve cart or account functionality. Non-essential analytics or advertising technologies should not be enabled without the consent required by applicable law.</p></section>
      <section><h2>Changes · Modifications</h2><p>Material changes to this policy will be published with an updated effective date. Where required, additional notice or consent will be obtained.</p></section>
      <Link className="policy-back" href="/"><ArrowLeft/> Back to Rewear</Link>
    </article>
  </main>;
}
