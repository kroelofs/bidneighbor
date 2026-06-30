import { describe, it, expect } from "vitest";
import { sanitizeText, slugify, isEmail, toCents } from "../cloud/worker/src/lib/text";
import { match } from "../cloud/worker/src/lib/match";
import { sign, unsign } from "../cloud/worker/src/lib/crypto";
import { isAdmin, canImpersonate } from "../cloud/worker/src/lib/guards";
import type { AuthContext, UserRow, Session } from "../cloud/worker/src/types";

function mkAuth(overrides: Partial<UserRow> = {}, session: Partial<Session> = {}): AuthContext {
  const user: UserRow = {
    id: "u1", email: "a@b.com", name: null, phone: null, role: "customer",
    admin_level: null, auth_provider: "magic_link", town: null, county: null,
    provider_bio: null, avatar_url: null, theme_preference: "light", status: "active",
    created_at: "", updated_at: "", ...overrides,
  };
  return {
    user,
    session: {
      user_id: user.id, role: user.role, admin_level: user.admin_level,
      created_at: "", expires_at: "", impersonator_id: null, ...session,
    },
    sessionId: "s1",
  };
}

describe("text helpers", () => {
  it("sanitizes HTML angle brackets and trims", () => {
    expect(sanitizeText("  <script>x</script>  ")).toBe("&lt;script&gt;x&lt;/script&gt;");
  });
  it("strips control characters", () => {
    expect(sanitizeText("a\x08b\x00c")).toBe("abc");
  });
  it("enforces max length", () => {
    expect(sanitizeText("abcdef", 3)).toBe("abc");
  });
  it("slugifies", () => {
    expect(slugify("Small Engine Repair!")).toBe("small-engine-repair");
  });
  it("validates email", () => {
    expect(isEmail("a@b.com")).toBe(true);
    expect(isEmail("nope")).toBe(false);
    expect(isEmail(42)).toBe(false);
  });
  it("parses budget to cents", () => {
    expect(toCents("$1,234.50")).toBe(123450);
    expect(toCents("")).toBeNull();
    expect(toCents("-5")).toBe(500); // sign stripped before parse
  });
});

describe("router match", () => {
  it("captures params", () => {
    expect(match("/api/tasks/:id", "/api/tasks/abc")).toEqual({ id: "abc" });
  });
  it("rejects mismatched length", () => {
    expect(match("/api/tasks/:id", "/api/tasks/abc/extra")).toBeNull();
  });
  it("rejects different static segment", () => {
    expect(match("/api/tasks/:id", "/api/users/abc")).toBeNull();
  });
});

describe("session signing", () => {
  it("round-trips a signed value", async () => {
    const signed = await sign("session-id-123", "secret");
    expect(await unsign(signed, "secret")).toBe("session-id-123");
  });
  it("rejects a tampered signature", async () => {
    const signed = await sign("session-id-123", "secret");
    expect(await unsign(signed + "0", "secret")).toBeNull();
    expect(await unsign(signed, "wrong-secret")).toBeNull();
  });
});

describe("authorization guards", () => {
  it("isAdmin only for admin_level holders", () => {
    expect(isAdmin(mkAuth())).toBe(false);
    expect(isAdmin(mkAuth({ admin_level: "admin" }))).toBe(true);
    expect(isAdmin(null)).toBe(false);
  });
  it("platform_manager cannot impersonate; admin/superadmin can", () => {
    expect(canImpersonate(mkAuth({ admin_level: "platform_manager" }))).toBe(false);
    expect(canImpersonate(mkAuth({ admin_level: "admin" }))).toBe(true);
    expect(canImpersonate(mkAuth({ admin_level: "superadmin" }))).toBe(true);
  });
});
