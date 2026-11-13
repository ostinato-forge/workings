/*
 * Variants of the counter subject, at least one per conformance rule. Each
 * variant breaks one rule, so the tests can show that the suite reports a
 * fault under the right rule. A fault that shows in every run also shows
 * under hostile-input-safe, and the variant says so. Nothing outside tests
 * imports it.
 */

import type { ConformanceRule } from "../conformance";
import type { EngineStep } from "../run-record";
import type { StageEvent } from "../stage-event";
import type { Measure, Subject } from "../subject";
import { counterRun, counterSubject, counterSubjectWith, type CounterWorld } from "./counter-subject";

type Step = EngineStep<CounterWorld, StageEvent>;

function withSteps(change: (step: Step) => Step): Subject<CounterWorld> {
  return counterSubjectWith({
    run: (input) => {
      const result = counterRun(input);
      if (!result.ok) return result;
      return { ok: true, record: { ...result.record, steps: result.record.steps.map(change) } };
    },
  });
}

export function withEvents(change: (event: StageEvent, step: Step) => StageEvent): Subject<CounterWorld> {
  return withSteps((step) => ({ ...step, event: change(step.event, step) }));
}

// Each run stamps its own call number into the events.
function nondeterministic(): Subject<CounterWorld> {
  let calls = 0;
  return counterSubjectWith({
    run: (input) => {
      calls += 1;
      const call = calls;
      const result = counterRun(input);
      if (!result.ok) return result;
      const steps = result.record.steps.map((step) => ({ ...step, event: { ...step.event, detail: `Run ${call}.` } }));
      return { ok: true, record: { ...result.record, steps } };
    },
  });
}

// A measure that assumes there is always a last run.
const lastStepCount: Measure<CounterWorld> = {
  args: {},
  evidence: [],
  compute: (runs) => {
    const last = runs.at(-1);
    if (last === undefined) throw new Error("There is no last run.");
    return last.steps.length;
  },
};

// Takes longer than the hostile input time limit on text with a null
// character, which only the hostile texts contain.
function slowOnNullCharacter(): Subject<CounterWorld> {
  return counterSubjectWith({
    run: (input) => {
      if (Object.values(input.sources).some((text) => text.includes("\u0000"))) {
        const start = performance.now();
        while (performance.now() - start < 1_100) {
          // Busy wait, as a slow regular expression would.
        }
      }
      return counterRun(input);
    },
  });
}

// Throws on text with a null character, which only the hostile texts hold.
function throwsOnNullCharacter(): Subject<CounterWorld> {
  return counterSubjectWith({
    run: (input) => {
      if (Object.values(input.sources).some((text) => text.includes("\u0000"))) throw new Error("cannot read a null character");
      return counterRun(input);
    },
  });
}

// Returns an event with no summary for text that names "__proto__", which
// only the hostile cases do.
function malformedOnPrototypeName(): Subject<CounterWorld> {
  return counterSubjectWith({
    run: (input) => {
      const result = counterRun(input);
      if (!result.ok || !Object.values(input.sources).some((text) => text.includes("__proto__"))) return result;
      const steps = result.record.steps.map((step) => ({ ...step, event: { ...step.event, summary: "" } }));
      return { ok: true, record: { ...result.record, steps } };
    },
  });
}

// "also" names the other rules a variant breaks.
export type BrokenSubject = { rule: ConformanceRule; also?: ConformanceRule[]; subject: Subject<CounterWorld> };

export const BROKEN_SUBJECTS: BrokenSubject[] = [
  { rule: "deterministic", subject: nondeterministic() },
  { rule: "record-invariants", also: ["hostile-input-safe"], subject: withSteps((step) => ({ ...step, index: step.index + 1 })) },
  { rule: "event-shape", also: ["hostile-input-safe"], subject: withEvents((event) => (event.kind === "check" ? { ...event, summary: "" } : event)) },
  {
    rule: "causes-exist",
    also: ["hostile-input-safe"],
    subject: withEvents((event) => ({
      ...event,
      causes: event.causes.map((cause) => ("field" in cause.ref
        ? cause
        : { ...cause, ref: { ...cause.ref, toLine: cause.ref.fromLine, fromColumn: 1, toColumn: 200 } })),
    })),
  },
  {
    rule: "targets-exist",
    also: ["hostile-input-safe"],
    subject: withEvents((event) => ({ ...event, targets: event.targets.map((target) => ({ ...target, entityId: `${target.entityId}-missing` })) })),
  },
  { rule: "changed-is-visible", subject: withEvents((event) => (event.status === "unchanged" ? { ...event, status: "changed" } : event)) },
  { rule: "after-points-back", subject: withEvents((event, step) => ({ ...event, after: [step.index] })) },
  { rule: "measures-total", subject: counterSubjectWith({ measures: new Map([...counterSubject.measures, ["last-step-count", lastStepCount]]) }) },
  { rule: "hostile-input-safe", subject: slowOnNullCharacter() },
  { rule: "hostile-input-safe", subject: throwsOnNullCharacter() },
  { rule: "hostile-input-safe", subject: malformedOnPrototypeName() },
];
