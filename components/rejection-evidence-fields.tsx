"use client";

import { useEffect } from "react";

function ensureEvidenceFields(form: HTMLFormElement, selectName: "review_action" | "below_minimum_action") {
  const select = form.querySelector<HTMLSelectElement>(`select[name="${selectName}"]`);
  if (!select) return;

  let wrapper = form.querySelector<HTMLElement>("[data-rejection-evidence-fields]");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.dataset.rejectionEvidenceFields = "true";
    wrapper.className = "rejection-evidence-fields";
    wrapper.innerHTML = `
      <label>Seller-facing rejection reason
        <textarea name="seller_rejection_reason" maxlength="500" rows="3" placeholder="Explain the specific reason the seller can see, for example: visible stain on left cuff."></textarea>
      </label>
      <label>Rejection evidence photo
        <input name="rejection_photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif">
        <span>Required when rejecting an item. Use a clear close-up of the issue.</span>
      </label>`;
    const submit = form.querySelector<HTMLElement>('button[type="submit"]');
    submit?.insertAdjacentElement("beforebegin", wrapper);
  }

  const refresh = () => {
    const rejecting = select.value === "reject";
    if (!wrapper) return;
    wrapper.hidden = !rejecting;
    wrapper.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea").forEach((input) => {
      input.required = rejecting;
      if (!rejecting && input instanceof HTMLInputElement && input.type === "file") input.value = "";
    });
  };

  if (select.dataset.rejectionEvidenceBound !== "true") {
    select.dataset.rejectionEvidenceBound = "true";
    select.addEventListener("change", refresh);
  }
  refresh();
}

export function RejectionEvidenceFields() {
  useEffect(() => {
    const scan = () => {
      document.querySelectorAll<HTMLFormElement>("form.review-form").forEach((form) => ensureEvidenceFields(form, "review_action"));
      document.querySelectorAll<HTMLFormElement>("form.admin-item-form").forEach((form) => ensureEvidenceFields(form, "below_minimum_action"));
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => observer.disconnect();
  }, []);
  return null;
}
