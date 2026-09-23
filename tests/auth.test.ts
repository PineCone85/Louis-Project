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

describe("additional sign-in users", () => {
  it("parses ADDITIONAL_USERS alongside the admin account", async () => {
    const { env } = await import("@/lib/env");
    process.env.ADMIN_EMAIL = "Owner@Example.com";
    process.env.ADMIN_PASSWORD_HASH = "scrypt:owner";
    process.env.ADDITIONAL_USERS = "Tester@Example.com:scrypt:16384:8:1:abc:def, second@example.com:scrypt:x , broken-entry,";
    try {
      const users = env.users;
      expect(users.map((u) => u.email)).toEqual(["owner@example.com", "tester@example.com", "second@example.com"]);
      expect(users[1].passwordHash).toBe("scrypt:16384:8:1:abc:def");
      expect(env.userByEmail("TESTER@example.com")?.email).toBe("tester@example.com");
      expect(env.userByEmail("nobody@example.com")).toBeNull();
    } finally {
      delete process.env.ADDITIONAL_USERS;
    }
  });
});
