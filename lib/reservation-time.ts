export function formatReservationTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    // Style shortcuts cannot be combined with a timezone-name component.
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
