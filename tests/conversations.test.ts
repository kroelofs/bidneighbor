import { describe, it, expect } from "vitest";
import {
  isParticipant,
  recipientOf,
  isSubjectType,
  SUBJECT_TYPES,
} from "../cloud/worker/src/lib/conversations";

const conv = { owner_id: "owner", initiator_id: "bidder" };

describe("conversation participant authz", () => {
  it("admits both participants", () => {
    expect(isParticipant(conv, "owner")).toBe(true);
    expect(isParticipant(conv, "bidder")).toBe(true);
  });
  it("rejects a third party (another bidder can't see this thread)", () => {
    expect(isParticipant(conv, "other-bidder")).toBe(false);
    expect(isParticipant(conv, "")).toBe(false);
  });
});

describe("notification recipient resolution", () => {
  it("routes an owner's message to the initiator", () => {
    expect(recipientOf(conv, "owner")).toBe("bidder");
  });
  it("routes an initiator's message to the owner", () => {
    expect(recipientOf(conv, "bidder")).toBe("owner");
  });
});

describe("subject type allowlist", () => {
  it("accepts only known subject types", () => {
    expect(isSubjectType("task")).toBe(true);
    expect(isSubjectType("resource")).toBe(true); // Resources reuse the thread engine
    expect(SUBJECT_TYPES).toContain("task");
    expect(SUBJECT_TYPES).toContain("resource");
  });
  it("rejects unknown / non-string subjects (no 500 on a bogus subject)", () => {
    expect(isSubjectType("user")).toBe(false);
    expect(isSubjectType(42)).toBe(false);
    expect(isSubjectType(undefined)).toBe(false);
  });
});
