/** Preserve the selected items when checkout requires a fresh sign-in. */
export function checkoutLoginHref(itemIds: string[]) {
  const checkout = `/checkout?${new URLSearchParams({ items: itemIds.join(",") })}`;
  return `/login?${new URLSearchParams({ next: checkout })}`;
}

/** Component options cannot be combined with Intl's timeStyle shortcut. */
export function reservationTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
