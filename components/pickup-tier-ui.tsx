"use client";

import { useLocale, translateElement } from "./site-language";
import { translate } from "@/lib/translations";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SELLING_RULES, normalizeSellingRules } from "@/lib/business-rules";

function money(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function PickupTierUi() {
  const {locale}=useLocale();
  useEffect(() => {
    let cancelled = false;
    let rules = DEFAULT_SELLING_RULES;
    const boundForms=new Map<HTMLFormElement,()=>void>();
    const t=(text:string)=>translate(locale,text);

    const updateStaticCopy = () => {
      const threshold = money(rules.pickupRules.freePickupThresholdCents);
      const perItemFee = money(rules.pickupRules.lowValuePickupItemFeeCents);
      const bagMinimum = money(rules.pickupRules.bagMinimumEstimatedValueCents);

      document.querySelectorAll<HTMLElement>(".mini-rules span").forEach((element) => {
        if (element.dataset.pickupRuleCopy || element.textContent?.includes("Estimated collection total is") || element.textContent===t("Estimated collection total is $100 or more")) {
          element.dataset.pickupRuleCopy="true";
          const next = `✓ ${threshold}+ = free priority pickup; below ${threshold} = ${perItemFee} per item`;
          if (element.textContent !== next) element.textContent = t(next);
        }
      });

      document.querySelectorAll<HTMLElement>(".empty-box p").forEach((element) => {
        if (element.dataset.pickupEmptyCopy || element.textContent?.includes("Order a Bag or arrange a pickup")) {
          element.dataset.pickupEmptyCopy="true";
          const next = `Bag / Box requests require ${bagMinimum}+ estimated resale value. Standard pickups below ${threshold} are available for ${perItemFee} per item.`;
          if (element.textContent !== next) element.textContent = t(next);
        }
      });
    };

    const ensureShoesCategory = (form: HTMLFormElement) => {
      const select = form.querySelector<HTMLSelectElement>('select[name="category"]');
      if (!select) return;
      const clothing = Array.from(select.options).find((option) => option.value === "clothing");
      if (clothing && clothing.text !== t("Clothing & accessories")) clothing.text = t("Clothing & accessories");
      if (!Array.from(select.options).some((option) => option.value === "shoes")) {
        const shoes = document.createElement("option");
        shoes.value = "shoes";
        shoes.text = t("Shoes");
        const electronics = Array.from(select.options).find((option) => option.value === "electronics");
        if (electronics) select.insertBefore(shoes, electronics);
        else select.appendChild(shoes);
      }
    };

    const refreshForm = (form: HTMLFormElement) => {
      ensureShoesCategory(form);
      const requestType = form.querySelector<HTMLInputElement>('input[name="request_type"]')?.value;
      const estimatedInput = form.querySelector<HTMLInputElement>('input[name="estimated_value"]');
      const itemCountInput = form.querySelector<HTMLInputElement>('input[name="item_count"]');
      if (!requestType || !estimatedInput || !itemCountInput) return;

      const threshold = rules.pickupRules.freePickupThresholdCents;
      const bagMinimum = rules.pickupRules.bagMinimumEstimatedValueCents;
      const perItemFee = rules.pickupRules.lowValuePickupItemFeeCents;
      const estimatedCents = Math.max(0, Math.round((Number(estimatedInput.value) || 0) * 100));
      const itemCount = Math.max(0, Math.floor(Number(itemCountInput.value) || 0));
      const isBag = requestType === "bag";
      const isFree = estimatedCents >= threshold;
      const feeCents = isFree ? 0 : itemCount * perItemFee;

      estimatedInput.min = String((isBag ? bagMinimum : rules.minimumPickupEstimatedValueCents) / 100);
      estimatedInput.placeholder = isBag
        ? `${money(bagMinimum)} minimum for Bag / Box`
        : "Enter estimated resale value";
      estimatedInput.placeholder=t(estimatedInput.placeholder);

      let notice = form.querySelector<HTMLElement>('[data-pickup-tier-notice]');
      if (!notice) {
        notice = document.createElement("div");
        notice.dataset.pickupTierNotice = "true";
        notice.className = "hold-card pickup-tier-notice";
        const brandsLabel = form.querySelector('input[name="brands"]')?.closest("label");
        brandsLabel?.insertAdjacentElement("afterend", notice);
      }

      if (notice) {
        if (isBag) {
          notice.innerHTML = `<div><b>Bag / Box requests start at ${money(bagMinimum)}</b><p>Requests below ${money(bagMinimum)} cannot use the Bag / Box option. At ${money(threshold)} or more, pickup is free and prioritized for the earliest available pickup window.</p></div>`;
        } else if (isFree) {
          notice.innerHTML = `<div><b>Free priority pickup</b><p>Your estimated resale value is ${money(threshold)} or more, so pickup is free and prioritized for the earliest available pickup window.</p></div>`;
        } else {
          const feeText = itemCount > 0 ? ` Estimated pickup fee: <strong>${money(feeCents)}</strong>.` : "";
          notice.innerHTML = `<div><b>${money(perItemFee)} pickup fee per item below ${money(threshold)}</b><p>Pickups below ${money(threshold)} are allowed, but cost ${money(perItemFee)} for each item.${feeText}</p></div>`;
        }
      }

      form.querySelectorAll<HTMLElement>(".terms-box p").forEach((paragraph) => {
        if (paragraph.dataset.pickupTermsCopy || paragraph.textContent?.includes("Eligible collections must total at least $100")) {
          paragraph.dataset.pickupTermsCopy="true";
          const next = `• Pickup is free and prioritized at ${money(threshold)} or more. Below ${money(threshold)}, a ${money(perItemFee)} per-item pickup fee applies. Bag / Box requests require at least ${money(bagMinimum)} estimated resale value. Items must be clean and free of stains, tears, holes or missing parts.`;
          if (paragraph.textContent !== next) paragraph.textContent = t(next);
        }
      });

      let feeAcceptance = form.querySelector<HTMLLabelElement>('[data-low-value-fee-acceptance]');
      if (!isBag && !isFree) {
        if (!feeAcceptance) {
          feeAcceptance = document.createElement("label");
          feeAcceptance.dataset.lowValueFeeAcceptance = "true";
          feeAcceptance.className = "check";
          feeAcceptance.innerHTML = `<input name="pickup_fee_accepted" value="accepted" required type="checkbox"> <span>I accept the ${money(perItemFee)} per-item pickup fee for pickups below ${money(threshold)}.</span>`;
          const pickupPolicy = form.querySelector<HTMLInputElement>('input[name="pickup_policy_accepted"]')?.closest("label");
          pickupPolicy?.insertAdjacentElement("beforebegin", feeAcceptance);
        }
      } else if (feeAcceptance) {
        feeAcceptance.remove();
      }

      if(notice)translateElement(notice,locale);
      if(feeAcceptance)translateElement(feeAcceptance,locale);
      const oldHoldCard = Array.from(form.querySelectorAll<HTMLElement>(".hold-card"))
        .find((element) => !element.dataset.pickupTierNotice);
      if (oldHoldCard) {
        const title = oldHoldCard.querySelector("b");
        const copy = oldHoldCard.querySelector("p");
        if (title) title.textContent = `${money(threshold)}+ = free priority pickup`;
        if (copy) copy.textContent = `Below ${money(threshold)}, pickup is ${money(perItemFee)} per item. Bag / Box requests require at least ${money(bagMinimum)} in estimated resale value.`;
      }

      if(oldHoldCard)translateElement(oldHoldCard,locale);
      const paymentNote = form.querySelector<HTMLElement>(".payment-note");
      if (paymentNote) {
        paymentNote.textContent = isBag
          ? `Bag / Box requests require ${money(bagMinimum)}+ estimated resale value.`
          : `Pickup is free and prioritized at ${money(threshold)}+; below that, the fee is ${money(perItemFee)} per item.`;
        translateElement(paymentNote,locale);
      }
    };

    const scan = () => {
      if(cancelled)return;
      observer.disconnect();
      updateStaticCopy();
      document.querySelectorAll<HTMLFormElement>("form.request-form").forEach((form) => {
        refreshForm(form);
        if (boundForms.has(form))return;
        const handler=()=>refreshForm(form);
        boundForms.set(form,handler);
        form.addEventListener("input",handler);
        form.addEventListener("change",handler);
      });
      observer.observe(document.body,{childList:true,subtree:true});
    };

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();

    const supabase = createClient();
    void supabase.rpc("get_public_selling_rules").then(({ data }) => {
      if (cancelled || !data) return;
      rules = normalizeSellingRules(data);
      scan();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      for(const [form,handler] of boundForms){form.removeEventListener("input",handler);form.removeEventListener("change",handler);}
    };
  }, [locale]);

  return null;
}
