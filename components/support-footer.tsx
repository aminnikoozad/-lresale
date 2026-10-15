"use client";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useLocale } from "./site-language";

export function SupportFooter() {
  const { locale } = useLocale();
  return <nav className="support-public-footer" aria-label={locale === "fr" ? "Aide" : "Help"}>
    <Link href="/support"><MessageCircle size={18} aria-hidden="true" />{locale === "fr" ? "Contact et soutien" : "Contact & support"}</Link>
  </nav>;
}
