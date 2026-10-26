"use client";
import { useState, type ReactNode } from "react";
import { CollectionPolicyConsent } from "@/components/collection-policy-consent";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function CollectionRequestConfirmation({ needsPricingConsent, disabled = false, pendingLabel, children }: {
  needsPricingConsent: boolean;
  disabled?: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  const [accepted, setAccepted] = useState(false);
  return <>
    <CollectionPolicyConsent needsPricingConsent={needsPricingConsent} checked={accepted} onAcceptedChange={setAccepted} />
    <PendingSubmitButton disabled={disabled || !accepted} pendingLabel={pendingLabel}>{children}</PendingSubmitButton>
  </>;
}
