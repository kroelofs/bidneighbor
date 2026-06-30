import { describe, it, expect } from "vitest";
import { sanitizeText, slugify, isEmail, toCents } from "../cloud/worker/src/lib/text";
import { taskSlug, taskIdFilter } from "../cloud/worker/src/lib/taskref";
import { match } from "../cloud/worker/src/lib/match";
import { parseSuggestions, parsePlaceDetails } from "../cloud/worker/src/lib/places";
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

describe("task slug + ref resolution", () => {
  const id = "baa45b4a-f220-475f-b6c1-d653ec23d577";

  it("builds a readable slug from title + locality + id8", () => {
    expect(taskSlug({ id, title: "Mow my yard!", town: "Sioux Center", county: "Sioux" }))
      .toBe("mow-my-yard-sioux-center-baa45b4a");
  });
  it("omits empty locality but always ends with id8", () => {
    expect(taskSlug({ id, title: "Fix gutter", town: null, county: null }))
      .toBe("fix-gutter-baa45b4a");
  });
  it("resolves a full UUID ref to an exact-id filter", () => {
    expect(taskIdFilter(id, "t.id")).toEqual({ clause: "t.id = ?", binds: [id] });
  });
  it("resolves a slug ref to an id8 prefix range that brackets the real id", () => {
    const f = taskIdFilter("mow-my-yard-sioux-center-baa45b4a");
    expect(f).toEqual({ clause: "id >= ? AND id < ?", binds: ["baa45b4a", "baa45b4ag"] });
    // the actual uuid must fall inside the range
    expect(id >= f!.binds[0] && id < f!.binds[1]).toBe(true);
  });
  it("returns null when there is no valid id8 tail", () => {
    expect(taskIdFilter("not-a-real-task")).toBeNull();
    expect(taskIdFilter("")).toBeNull();
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

describe("google places parsing", () => {
  it("flattens autocomplete suggestions, dropping malformed entries", () => {
    const body = {
      suggestions: [
        { placePrediction: { placeId: "p1", text: { text: "123 Main St, Sioux Center, IA, USA" } } },
        { placePrediction: { placeId: "p2" } }, // no text -> dropped
        { queryPrediction: {} }, // not a place -> dropped
      ],
    };
    expect(parseSuggestions(body)).toEqual([{ placeId: "p1", description: "123 Main St, Sioux Center, IA, USA" }]);
  });

  it("returns [] when there are no suggestions", () => {
    expect(parseSuggestions({})).toEqual([]);
  });

  it("maps place details to structured address + coords (state as short code)", () => {
    const addr = parsePlaceDetails({
      formattedAddress: "123 Main St, Sioux Center, IA 51250, USA",
      location: { latitude: 43.0776, longitude: -96.1758 },
      addressComponents: [
        { longText: "123", shortText: "123", types: ["street_number"] },
        { longText: "Main Street", shortText: "Main St", types: ["route"] },
        { longText: "Sioux Center", shortText: "Sioux Center", types: ["locality", "political"] },
        { longText: "Iowa", shortText: "IA", types: ["administrative_area_level_1", "political"] },
        { longText: "51250", shortText: "51250", types: ["postal_code"] },
      ],
    });
    expect(addr).toEqual({
      street_address: "123 Main Street",
      city: "Sioux Center",
      state: "IA",
      zip: "51250",
      latitude: 43.0776,
      longitude: -96.1758,
      formatted: "123 Main St, Sioux Center, IA 51250, USA",
    });
  });

  it("tolerates missing components and missing coordinates", () => {
    const addr = parsePlaceDetails({ addressComponents: [{ longText: "Hawarden", types: ["locality"] }] });
    expect(addr.city).toBe("Hawarden");
    expect(addr.street_address).toBe("");
    expect(addr.latitude).toBeNull();
    expect(addr.longitude).toBeNull();
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
