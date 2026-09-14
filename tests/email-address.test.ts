import { describe, expect, it } from "vitest";
import { formatAddress, normalizeEmail, parseAddressList, splitName } from "@/lib/email-address";

describe("parseAddressList", () => {
  it("parses names, quoted names with commas and bare addresses", () => {
    const parsed = parseAddressList('"Doe, Jane" <Jane@Example.com>, John Smith <john@example.com>, bob@example.com');
    expect(parsed).toEqual([
      { name: "Doe, Jane", address: "jane@example.com" },
      { name: "John Smith", address: "john@example.com" },
      { name: null, address: "bob@example.com" },
    ]);
  });

  it("ignores garbage and empty input", () => {
    expect(parseAddressList("")).toEqual([]);
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList("not an address")).toEqual([]);
  });

  it("formats addresses with quoting when needed", () => {
    expect(formatAddress({ name: "Doe, Jane", address: "jane@example.com" })).toBe('"Doe, Jane" <jane@example.com>');
    expect(formatAddress({ name: "Jane", address: "jane@example.com" })).toBe("Jane <jane@example.com>");
    expect(formatAddress({ name: null, address: "jane@example.com" })).toBe("jane@example.com");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and validates", () => {
    expect(normalizeEmail("  Agent@Example.COM ")).toBe("agent@example.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("splitName", () => {
  it("splits first and last names", () => {
    expect(splitName("Jane Marie Doe")).toEqual({ firstName: "Jane", lastName: "Marie Doe" });
    expect(splitName("Jane")).toEqual({ firstName: "Jane", lastName: "" });
    expect(splitName(undefined)).toEqual({ firstName: "", lastName: "" });
  });
});
