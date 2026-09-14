import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the correct password and rejects others", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(hash.includes("$")).toBe(false);
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("anything", "garbage")).toBe(false);
  });
});
