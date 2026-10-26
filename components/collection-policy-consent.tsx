"use client";
import Link from "next/link";
import { useLocale } from "@/components/site-language";

export function CollectionPolicyConsent({ needsPricingConsent, checked, onAcceptedChange }: { needsPricingConsent: boolean; checked: boolean; onAcceptedChange: (accepted: boolean) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return <label className="check collection-policy-consent">
    <input name="collection_terms_accepted" value="accepted" required type="checkbox" checked={checked} onChange={event => onAcceptedChange(event.target.checked)} />
    {needsPricingConsent ? <input type="hidden" name="pricing_mandate_version" value="2026-10-15-team-v1" /> : null}
    <span>{fr ? "J’accepte la " : "I accept the "}<Link href="/seller-terms" target="_blank" rel="noopener noreferrer">{fr ? "politique de vente gérée" : "managed-selling policy"}</Link>{fr ? " et les frais affichés." : " and displayed fees."}{needsPricingConsent ? (fr ? " J’autorise la tarification par l’équipe après inspection." : " I authorize team pricing after inspection.") : ""}</span>
  </label>;
}
