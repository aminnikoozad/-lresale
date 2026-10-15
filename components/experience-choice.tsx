"use client";

import { useLocale } from "./site-language";
import Link from "next/link";
import { ShoppingBag, ArrowUpRight } from "lucide-react";
import { BrandWordmark } from "./brand-wordmark";
import { AssistantMark } from "./assistant-mark";
export function ExperienceChoice() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <main className="experience-choice" lang={fr ? "fr" : "en"}>
      <header>
        <Link href="/" className="brand">
          <BrandWordmark />
        </Link>

      </header>
      <section
        className="experience-options"
        aria-label={
          fr ? "Choisissez votre expérience" : "Choose your experience"
        }
      >
        <Link href="/shop" className="experience-option">
          <ShoppingBag aria-hidden="true" />
          <span>{fr ? "Entrer sur le site" : "Enter website"}</span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <Link
          href={`/assistant${fr ? "?lang=fr" : ""}`}
          className="experience-option assistant-option"
        >
          <AssistantMark />
          <span className="experience-option-copy"><span>{fr ? "Achat intelligent" : "Smart Shopping"}</span><small className="coming-soon">{fr ? "Bientôt disponible" : "Coming soon"}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
