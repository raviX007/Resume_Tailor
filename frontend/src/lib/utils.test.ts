import { describe, it, expect } from "vitest";
import { cn, formatDuration, CATEGORY_LABELS } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("resolves tailwind conflicts — last wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("handles undefined and null", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });
});

describe("formatDuration", () => {
  it("returns milliseconds for < 1s", () => {
    expect(formatDuration(450)).toBe("450ms");
  });

  it("returns seconds for >= 1s", () => {
    expect(formatDuration(2500)).toBe("2.5s");
  });

  it("returns 0ms for zero", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("handles exact 1 second", () => {
    expect(formatDuration(1000)).toBe("1.0s");
  });
});

describe("CATEGORY_LABELS", () => {
  it("contains all expected categories", () => {
    const expected = [
      "languages",
      "backend",
      "frontend",
      "ai_llm",
      "databases",
      "devops",
      "soft_skills",
      "domains",
    ];
    for (const key of expected) {
      expect(CATEGORY_LABELS).toHaveProperty(key);
      expect(CATEGORY_LABELS[key]).toBeTruthy();
    }
  });

  it("all values are non-empty strings", () => {
    for (const [, value] of Object.entries(CATEGORY_LABELS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
