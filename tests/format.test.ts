import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDateTime, formatNumber, parseDateTimeLocal, toDateTimeLocal, zonedParts } from "@/lib/format";

describe("deterministic formatting", () => {
  it("formats currency and numbers without locale data", () => {
    expect(formatCurrency(3200000, "ZAR")).toBe("R 3 200 000");
    expect(formatCurrency(-1500, "USD")).toBe("-$ 1 500");
    expect(formatCurrency(99, "XYZ")).toBe("XYZ 99");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(240)).toBe("240");
    expect(formatNumber(12345.678, 1)).toBe("12 345.7");
  });

  it("formats dates in the configured time zone", () => {
    const instant = new Date("2026-09-14T07:05:00Z");
    expect(formatDate(instant, "Africa/Johannesburg")).toBe("14 Sep 2026");
    expect(formatDateTime(instant, "Africa/Johannesburg")).toBe("14 Sep 2026, 09:05");
    expect(formatDateTime(instant, "UTC")).toBe("14 Sep 2026, 07:05");
    expect(zonedParts(instant, "Africa/Johannesburg").weekday).toBe(1);
  });

  it("round-trips datetime-local values through a time zone", () => {
    const wall = "2030-01-15T09:30";
    const parsed = parseDateTimeLocal(wall, "Africa/Johannesburg");
    expect(parsed?.toISOString()).toBe("2030-01-15T07:30:00.000Z");
    expect(toDateTimeLocal(parsed, "Africa/Johannesburg")).toBe(wall);
    // Daylight saving zone
    const summer = parseDateTimeLocal("2026-07-01T12:00", "Europe/London");
    expect(summer?.toISOString()).toBe("2026-07-01T11:00:00.000Z");
    expect(toDateTimeLocal(summer, "Europe/London")).toBe("2026-07-01T12:00");
    expect(parseDateTimeLocal("garbage", "UTC")).toBeNull();
  });
});
