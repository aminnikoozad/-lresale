import test from "node:test";
import assert from "node:assert/strict";
import { torontoLocalToIso } from "../lib/toronto-local-time.ts";

test("Toronto pickup time remains exact across DST transition dates", () => {
  assert.equal(torontoLocalToIso("2026-11-01T03:30"), "2026-11-01T08:30:00.000Z");
  assert.equal(torontoLocalToIso("2027-03-14T03:30"), "2027-03-14T07:30:00.000Z");
  assert.equal(torontoLocalToIso("2026-10-17T12:00"), "2026-10-17T16:00:00.000Z");
  assert.equal(torontoLocalToIso("2026-12-17T12:00"), "2026-12-17T17:00:00.000Z");
});

test("skipped, repeated and invalid Toronto wall times are rejected", () => {
  for (const local of ["2027-03-14T02:30", "2026-11-01T01:30", "2026-02-30T12:00", "2026-12-17T24:00", "not a date"]) {
    assert.throws(() => torontoLocalToIso(local), undefined, local);
  }
});
