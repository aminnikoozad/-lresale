"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ShoppingBag, Mic, MessageCircle } from "lucide-react";
import { AssistantMark } from "./assistant-mark";
export function ExperienceChoice() {
  const [fr, setFr] = useState(false);
  return (
    <main className="experience-choice">
      <header>
        <Link href="/" className="brand">
          REWEAR.
        </Link>
        <button onClick={() => setFr(!fr)} lang={fr ? "en" : "fr"}>
          {fr ? "English" : "Français"}
        </button>
      </header>
      <section>
        <p className="experience-eyebrow">
          {fr ? "UNE NOUVELLE FAÇON DE TROUVER" : "A MORE PERSONAL WAY TO FIND"}
        </p>
        <h1>
          {fr ? (
            <>
              Vos envies.
              <br />
              Votre façon.
            </>
          ) : (
            <>
              Your next find.
              <br />
              Your way.
            </>
          )}
        </h1>
        <p>
          {fr
            ? "Parcourez la boutique ou dites-nous ce que vous cherchez."
            : "Explore the shop, or just tell us what you have in mind."}
        </p>
        <div className="experience-options">
          <Link
            href={`/assistant${fr ? "?lang=fr" : ""}`}
            className="experience-option assistant-option"
          >
            <AssistantMark />
            <div>
              <span>
                {fr
                  ? "UN PEU D’AIDE, BEAUCOUP DE POSSIBILITÉS"
                  : "A LITTLE HELP. A LOT OF POSSIBILITIES."}
              </span>
              <h2>{fr ? "Trouvons ensemble" : "Let’s find it together"}</h2>
              <p>
                {fr
                  ? "Parlez ou écrivez. Trouvez des articles, préparez votre sac ou organisez un ramassage."
                  : "Talk or type. Find your pieces, build your bag, or arrange a pickup."}
              </p>
              <small>
                <Mic size={15} />
                {fr ? "Voix" : "Voice"}
                <MessageCircle size={15} />
                {fr ? "Clavardage" : "Chat"}
              </small>
            </div>
            <ArrowUpRight />
          </Link>
          <Link href="/shop" className="experience-option">
            <ShoppingBag size={42} />
            <div>
              <span>{fr ? "À VOTRE RYTHME" : "AT YOUR OWN PACE"}</span>
              <h2>{fr ? "Je préfère explorer" : "I’ll explore the shop"}</h2>
              <p>
                {fr
                  ? "Photos, filtres et toutes vos trouvailles au même endroit."
                  : "Photos, filters, and all the finds. Browse your own way."}
              </p>
              <small>{fr ? "Ouvrir la boutique" : "Open the shop"}</small>
            </div>
            <ArrowUpRight />
          </Link>
        </div>
        <p className="experience-footnote">
          {fr
            ? "Changez de mode à tout moment. Votre sac vous suit."
            : "Switch anytime. Your shopping bag comes with you."}
        </p>
      </section>
      <footer>MONTRÉAL · SECONDHAND, MADE PERSONAL.</footer>
    </main>
  );
}
