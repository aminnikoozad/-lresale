"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/site-language";
import "./selling-hero.css";

export function SellingHero() {
  const fr = useLocale().locale === "fr";
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(true);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReducedMotion(query.matches);
    const visibility = () => setVisible(!document.hidden);
    motion(); visibility();
    query.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      query.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const rotating = !paused && !hovered && !focused && !reducedMotion && visible;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setActive(value => 1 - value), 6500);
    return () => window.clearInterval(timer);
  }, [rotating]);

  function select(index: number) {
    setActive(index);
    setPaused(true);
  }

  const slides = [
    {
      title: fr ? <>Offrez une seconde vie<br />à vos vêtements.</> : <>Give your clothes<br />a second life.</>,
      description: fr ? "Nous collectons, inspectons, photographions et vendons vos articles. Vous gagnez lorsqu’ils sont vendus." : "We collect, inspect, photograph and sell your pieces. You earn when they sell.",
      action: fr ? "Vendre avec Shikimomo" : "Sell with Shikimomo",
      href: "/sell-with-shikimomo",
      image: "/fashion-hero.webp",
      alt: fr ? "Portant de vêtements avec tricots et jeans pliés" : "An editorial clothing rail with folded knitwear and denim",
    },
    {
      title: fr ? <>Vos vêtements.<br />Vos annonces.</> : <>Your clothes.<br />Your listings.</>,
      description: fr ? "Ajoutez vos photos, décrivez vos vêtements et fixez votre prix. Envoyez votre annonce à notre équipe pour vérification." : "Upload photos, describe your clothes and set your own price. Send your listing to our team for review.",
      action: fr ? "Ajouter mes vêtements" : "List my clothes",
      href: "/account/seller/direct",
      image: "/featured-products.webp",
      alt: fr ? "Sélection de vêtements et accessoires d’occasion" : "A selection of secondhand clothing and accessories",
      note: fr ? "Publiez après approbation. Les achats et versements seront ouverts après la connexion du paiement." : "Publish after approval. Purchases and payouts will open once payments are connected.",
    },
  ];

  return <section className="hero selling-hero" aria-label={fr ? "Deux façons de vendre" : "Two ways to sell"} aria-roledescription={fr ? "carrousel" : "carousel"} translate="no"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); select(1 - active); }
    }}>
    <div className="selling-hero-viewport" onTouchStart={event => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }}
      onTouchCancel={() => { touch.current = null; }}
      onTouchEnd={event => {
        const start = touch.current; touch.current = null;
        if (!start) return;
        const point = event.changedTouches[0];
        const dx = point.clientX - start.x; const dy = point.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) select(1 - active);
      }}>
      <div className="selling-hero-track" style={{ transform: `translateX(-${active * 100}%)` }} aria-live={rotating ? "off" : "polite"}>
        {slides.map((slide, index) => <div key={slide.href} className="hero-inner selling-hero-slide" role="group" aria-roledescription={fr ? "diapositive" : "slide"} aria-label={`${index + 1} / 2`} aria-hidden={active !== index} inert={active !== index}>
          <div className="hero-copy">
            {index === 0 ? <h1 id="home-hero-title">{slide.title}</h1> : <h2>{slide.title}</h2>}
            <p>{slide.description}</p>
            <div className="hero-actions"><Button asChild size="lg"><Link href={slide.href}>{slide.action}<ArrowRight aria-hidden="true" /></Link></Button></div>
            {slide.note && <small className="selling-hero-note">{slide.note}</small>}
          </div>
          <div className="hero-media"><Image src={slide.image} alt={slide.alt} fill priority={index === 0} sizes="(max-width: 900px) 100vw, 52vw" /></div>
        </div>)}
      </div>
    </div>
    <div className="selling-hero-controls">
      <button type="button" onClick={() => select(1 - active)} aria-label={fr ? "Diapositive précédente" : "Previous slide"}><ArrowLeft aria-hidden="true" /></button>
      <div className="selling-hero-dots">{slides.map((slide, index) => <button key={slide.href} type="button" onClick={() => select(index)} aria-label={`${fr ? "Afficher" : "Show"}: ${slide.action}`} aria-current={active === index ? "true" : undefined}><span /></button>)}</div>
      <button type="button" onClick={() => select(1 - active)} aria-label={fr ? "Diapositive suivante" : "Next slide"}><ArrowRight aria-hidden="true" /></button>
      {!reducedMotion && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? (fr ? "Activer le défilement automatique" : "Start automatic slides") : (fr ? "Mettre le défilement en pause" : "Pause automatic slides")}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}
    </div>
  </section>;
}
