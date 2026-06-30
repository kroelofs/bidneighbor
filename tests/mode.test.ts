import { describe, it, expect } from "vitest";
import { providerSetupComplete } from "../src/lib/mode";
import type { Me } from "../src/lib/api";

function mkMe(overrides: Partial<Me> = {}): Me {
  return {
    id: "u1", email: "a@b.com", name: null, phone: null, role: "customer",
    admin_level: null, town: null, county: null, street_address: null, city: null,
    state: null, zip: null, latitude: null, longitude: null, provider_bio: null,
    avatar_url: null, theme_preference: "light", status: "active",
    notify_new_tasks: 1, notify_responses: 1, last_mode: null, ...overrides,
  };
}

describe("providerSetupComplete", () => {
  it("is false when not signed in", () => {
    expect(providerSetupComplete(null)).toBe(false);
  });
  it("is false for a fresh customer with no county", () => {
    expect(providerSetupComplete(mkMe())).toBe(false);
  });
  it("is false for a customer even with a county set", () => {
    expect(providerSetupComplete(mkMe({ county: "Sioux County" }))).toBe(false);
  });
  it("is false for a provider missing a county", () => {
    expect(providerSetupComplete(mkMe({ role: "provider" }))).toBe(false);
  });
  it("is true for a provider with a county", () => {
    expect(providerSetupComplete(mkMe({ role: "provider", county: "Sioux County" }))).toBe(true);
  });
  it("is true for an admin regardless of county", () => {
    expect(providerSetupComplete(mkMe({ role: "admin" }))).toBe(true);
  });
});
