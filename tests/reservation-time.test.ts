import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatReservationTime } from "../lib/reservation-time.ts";

const cases = [
  { timeZone: "UTC", value: "2026-10-13T17:05:00Z", zoneName: "UTC" },
  { timeZone: "UTC", value: "2026-10-13T00:05:00Z", zoneName: "UTC" },
  { timeZone: "America/Toronto", value: "2026-10-13T17:05:00Z", zoneName: "EDT" },
  { timeZone: "America/Toronto", value: "2026-01-13T17:05:00Z", zoneName: "EST" },
  { timeZone: "America/Vancouver", value: "2026-10-13T00:05:00Z", zoneName: "PDT" },
];

for (const { timeZone, value, zoneName } of cases) {
  test(`reservation time renders the local short time and timezone in ${timeZone} at ${value}`, () => {
    const previousTimeZone = process.env.TZ;
    try {
      process.env.TZ = timeZone;
      const shortTime = new Intl.DateTimeFormat("en-CA", {
        timeStyle: "short",
      }).format(new Date(value));

      assert.equal(formatReservationTime(value), `${shortTime} ${zoneName}`);
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });
}

test("buyer account renders reservation times with the tested formatter", () => {
  const source = readFileSync(new URL("../components/buyer-account-tools.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ formatReservationTime \} from "@\/lib\/reservation-time"/);
  assert.match(source, /formatReservationTime\(order\.reservation_expires_at\)/);
});
