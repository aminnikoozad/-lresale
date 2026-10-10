"use client";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
export function PendingSubmitButton({ disabled = false, children, pendingLabel = "Submitting…", className, size, variant }: { disabled?: boolean; children: ReactNode; pendingLabel?: string; className?: string; size?: ComponentProps<typeof Button>["size"]; variant?: ComponentProps<typeof Button>["variant"] }) {
  const { pending } = useFormStatus();
  return <Button type="submit" className={className} size={size} variant={variant} disabled={disabled || pending} aria-busy={pending}>{pending ? pendingLabel : children}</Button>;
}
