"use client";
import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, ArrowUpRight } from "lucide-react";
import { BrandWordmark } from "./brand-wordmark";
import { AssistantMark } from "./assistant-mark";
export function ExperienceChoice() {
  const [fr, setFr] = useState(false);
  return (
    <main className="experience-choice" lang={fr ? "fr" : "en"}>
      <header>
        <Link href="/" className="brand">
          <BrandWordmark />
        </Link>
        <button onClick={() => setFr(!fr)} lang={fr ? "en" : "fr"}>
          {fr ? "English" : "Français"}
        </button>
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
          <span>{fr ? "Achat intelligent" : "Smart Shopping"}</span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
