/*
 * Runs the conformance suite as one named test per rule, so a failing
 * subject shows which rule it breaks. It lives with the test support
 * because it needs the test runner. Nothing outside tests imports it.
 */

import { describe, expect, test } from "vitest";
import {
  CONFORMANCE_RULES,
  createConformanceChecker,
  formatConformanceProblem,
  type ConformanceCase,
  type HostileCase,
} from "../conformance";
import type { Subject } from "../subject";

export function describeSubjectConformance<World>(
  name: string,
  subject: Subject<World>,
  cases: readonly ConformanceCase<World>[],
  hostileCases: readonly HostileCase[] = [],
): void {
  describe(`${name} conformance`, () => {
    const checker = createConformanceChecker(subject, cases, hostileCases);
    for (const rule of CONFORMANCE_RULES) {
      // The hostile texts include a megabyte of text, which a busy machine
      // needs more than the default five seconds to run through every artifact.
      test(rule, () => {
        expect(checker.check(rule).map(formatConformanceProblem)).toEqual([]);
      }, 60_000);
    }
  });
}
