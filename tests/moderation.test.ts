import { describe, it, expect } from "vitest";
import { screenText } from "../cloud/worker/src/lib/moderation";

describe("moderation keyword gate", () => {
  it("passes ordinary equipment listings", () => {
    expect(screenText("Pressure washer for rent, $40/day. Great for driveways.").blocked).toBe(false);
    expect(screenText("Riding lawn mower — cuts a big yard fast. Assist available.").blocked).toBe(false);
    expect(screenText("Post hole digger and a 20ft ladder available this weekend.").blocked).toBe(false);
  });

  it("blocks slurs and explicit terms", () => {
    expect(screenText("free porn here").blocked).toBe(true);
    expect(screenText("escort service available").blocked).toBe(true);
  });

  it("is case- and leetspeak-insensitive", () => {
    expect(screenText("P0RN listings").blocked).toBe(true);
    expect(screenText("PORN").blocked).toBe(true);
  });

  it("does not false-trigger on innocent substrings", () => {
    // 'assist' contains 'ass', 'grass' contains 'ass' — word-boundary matching must not flag these.
    expect(screenText("I can assist with grass cutting").blocked).toBe(false);
    expect(screenText("Class-A trailer hitch").blocked).toBe(false);
  });

  it("flags off-platform payment / spam solicitation", () => {
    expect(screenText("Zelle deposit only, no exceptions").blocked).toBe(true);
    expect(screenText("Make $500 per day working from home! click here https://x.co").blocked).toBe(true);
  });

  it("returns a reason when blocked", () => {
    const r = screenText("free porn");
    expect(r.blocked).toBe(true);
    expect(typeof r.reason).toBe("string");
  });
});
