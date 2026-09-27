import { expect, test } from "vitest";
import { emptyEvidence, readEvidence } from "./agent-evidence";

test("independent evidence keeps assistance history and expires on content revision", () => {
  const evidence = { ...emptyEvidence(1), passed: true, hints: 1, attempts: 2 };
  const storage = { getItem: () => JSON.stringify(evidence) };
  expect(readEvidence(storage, "tools", "challenge", 1)).toEqual(evidence);
  expect(readEvidence(storage, "tools", "challenge", 2)).toEqual(emptyEvidence(2));
  expect(readEvidence({ getItem: () => "{" }, "tools", "challenge", 1)).toEqual(emptyEvidence(1));
  expect(readEvidence({ getItem: () => { throw new Error("blocked"); } }, "tools", "challenge", 1)).toEqual(emptyEvidence(1));
});
