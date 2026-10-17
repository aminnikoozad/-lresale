/** Reject skipped/repeated wall times rather than silently changing a pickup slot. */
export function torontoLocalToIso(local: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error("Invalid local date/time");
  const [, year, month, day, hour, minute] = match;
  const wall = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const partsAt = (instant: number) => Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]),
  );
  const offsets = new Set<number>();
  // Sample both sides of a possible transition to discover both valid offsets.
  for (const hours of [-24, 0, 24]) {
    const instant = wall + hours * 60 * 60 * 1000;
    const p = partsAt(instant);
    offsets.add(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - instant);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(instant => {
    const p = partsAt(instant);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === local;
  });
  if (candidates.length !== 1) throw new Error("Choose an unambiguous Toronto time outside the daylight-saving transition");
  return new Date(candidates[0]).toISOString();
}
