import { describe, expect, test } from "vitest";
import { lintCopy } from "./lint";

describe("lintCopy", () => {
  test("passes plain mechanism copy", () => {
    expect(
      lintCopy([
        "The model computes a distribution over next tokens and samples from it.",
        "Set top-k to 3 and predict which candidates stay in the running.",
      ]),
    ).toEqual([]);
  });

  test("rejects hype register", () => {
    const violations = lintCopy(["This revolutionary model is magical."]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("revolutionary");
  });

  test("rejects deflation register", () => {
    const violations = lintCopy(["It is just fancy autocomplete."]);
    expect(violations.length).toBeGreaterThan(0);
  });

  test("rejects em dashes and cutesy diminutives", () => {
    const emDash = String.fromCharCode(8212);
    expect(lintCopy([`tokens ${emDash} the unit you pay for`]).length).toBe(1);
    expect(lintCopy(["a delightful little app"]).length).toBeGreaterThan(0);
  });

  test("reports the offending string with each violation", () => {
    const violations = lintCopy(["ok text", "pure magic here"]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("magic");
    expect(violations[0]).toContain("pure magic here");
  });
});

import { shellCopyStrings } from "../shell/copy";

describe("shell copy", () => {
  test("every shell string passes the neutrality lint", () => {
    expect(lintCopy(shellCopyStrings())).toEqual([]);
  });
});
