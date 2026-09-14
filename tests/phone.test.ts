import { describe, expect, it } from "vitest";
import { normalizePhone, phoneToWaId, waIdToPhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("normalises local South African numbers to E.164", () => {
    expect(normalizePhone("082 123 4567", "ZA")).toBe("+27821234567");
    expect(normalizePhone("+27 82 123 4567", "ZA")).toBe("+27821234567");
    expect(normalizePhone("(011) 555 0100", "ZA")).toBe("+27115550100");
  });

  it("respects the default country", () => {
    expect(normalizePhone("020 7946 0958", "GB")).toBe("+442079460958");
  });

  it("rejects invalid input", () => {
    expect(normalizePhone("abc", "ZA")).toBeNull();
    expect(normalizePhone("", "ZA")).toBeNull();
    expect(normalizePhone(null, "ZA")).toBeNull();
  });
});

describe("WhatsApp ids", () => {
  it("round-trips between E.164 and wa_id", () => {
    expect(phoneToWaId("+27821234567")).toBe("27821234567");
    expect(waIdToPhone("27821234567")).toBe("+27821234567");
  });
});
