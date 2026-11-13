/*
 * A condition is how a lesson states what the learner should achieve. It
 * is data: a measure, its arguments, which runs to read, a fixed
 * comparison, and the text shown when it does not hold. Lessons never store
 * an answer. With a reference value, the expected value is the same measure
 * computed on the reference solution's runs.
 */

import { PLATFORM_MEASURES } from "./measures";
import type { StageRunRecord } from "./run-record";
import { isPlainRecord } from "./stage-event";
import {
  checkArgs,
  isMeasureValue,
  lookup,
  type ArgContext,
  type ArgValue,
  type Measure,
  type MeasureValue,
  type Subject,
} from "./subject";

export const CONDITION_OPS = ["equals", "not-equals", "greater", "at-least", "less", "at-most", "includes", "excludes"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition = {
  measure: string;
  args: Record<string, ArgValue>;
  // Which runs the measure receives. A number is a 0-based run index.
  run: number | "last" | "all";
  op: ConditionOp;
  value: string | number | boolean | { reference: true };
  // Shown when the condition does not hold.
  unmet: string;
};

export type ConditionResult = {
  met: boolean;
  actual: MeasureValue | null;
  expected: MeasureValue | null;
  unmet?: string;
  // Set when the condition could not be checked at all.
  problem?: string;
};

const CONDITION_KEYS = ["measure", "args", "run", "op", "value", "unmet"];
const ORDER_OPS: readonly string[] = ["greater", "at-least", "less", "at-most"];
const LIST_OPS: readonly string[] = ["includes", "excludes"];

export function findMeasure<World>(subject: Subject<World>, name: unknown): Measure<World> | undefined {
  return lookup(PLATFORM_MEASURES, name) ?? lookup(subject.measures, name);
}

function isOp(value: unknown): value is ConditionOp {
  return CONDITION_OPS.some((op) => op === value);
}

function isReference(value: unknown): value is { reference: true } {
  return isPlainRecord(value) && value.reference === true && Object.keys(value).length === 1;
}

function isRunSelector(value: unknown): value is Condition["run"] {
  return value === "last" || value === "all" || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

// The ids a condition argument may name, taken from the subject's artifacts
// and from every world the runs passed through.
function argContextFor<World>(subject: Subject<World>, runs: StageRunRecord<World>[], view: string): ArgContext {
  const entityIds = new Set<string>();
  const factIds = new Set<string>();
  for (const record of runs) {
    for (const world of [record.initial, record.final]) {
      for (const entity of subject.describe({ world, sources: record.config.sources, view }).entities) {
        entityIds.add(entity.id);
        entity.facts.forEach((fact) => factIds.add(fact.id));
      }
    }
  }
  return { artifactIds: new Set(subject.artifacts.map((artifact) => artifact.id)), entityIds, factIds };
}

export function conditionProblems<World>(subject: Subject<World>, condition: unknown, context: ArgContext): string[] {
  if (!isPlainRecord(condition)) return ["The condition is not an object."];
  const problems = Object.keys(condition)
    .filter((key) => !CONDITION_KEYS.includes(key))
    .map((key) => `The condition has an unknown field "${key}".`);
  const measure = findMeasure(subject, condition.measure);
  if (measure === undefined) problems.push(`There is no measure named "${String(condition.measure)}".`);
  else problems.push(...checkArgs(measure.args, condition.args, context));
  if (!isRunSelector(condition.run)) problems.push('The run must be "last", "all", or a run number of zero or more.');
  const { op, value } = condition;
  if (!isOp(op)) problems.push(`The comparison must be one of: ${CONDITION_OPS.join(", ")}.`);
  if (!isReference(value) && !isScalar(value)) {
    problems.push("The value must be text, a number, true or false, or the reference solution.");
  } else if (!isReference(value)) {
    if (typeof op === "string" && ORDER_OPS.includes(op) && typeof value !== "number") {
      problems.push(`The comparison "${op}" needs a number as its value.`);
    }
    if (typeof op === "string" && LIST_OPS.includes(op) && typeof value === "boolean") {
      problems.push(`The comparison "${op}" needs text or a number as its value.`);
    }
  }
  if (typeof condition.unmet !== "string" || condition.unmet.trim() === "") {
    problems.push("The condition needs text to show when it is not met.");
  }
  return problems;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; problem: string };

function selectRuns<World>(runs: StageRunRecord<World>[], selector: unknown): Outcome<StageRunRecord<World>[]> {
  if (selector === "all") return { ok: true, value: runs };
  if (selector === "last") {
    const last = runs.at(-1);
    return last === undefined ? { ok: false, problem: "There is no run yet." } : { ok: true, value: [last] };
  }
  if (typeof selector === "number" && Number.isInteger(selector) && selector >= 0) {
    const chosen = runs[selector];
    if (chosen !== undefined) return { ok: true, value: [chosen] };
    return { ok: false, problem: `There is no run ${selector}. There ${runs.length === 1 ? "is 1 run" : `are ${runs.length} runs`}.` };
  }
  return { ok: false, problem: 'The run must be "last", "all", or a run number of zero or more.' };
}

function computeValue<World>(
  name: string,
  measure: Measure<World>,
  runs: StageRunRecord<World>[],
  args: Record<string, ArgValue>,
  referenceRuns: StageRunRecord<World>[],
): Outcome<MeasureValue> {
  let value: unknown;
  try {
    value = measure.compute(runs, args, { referenceRuns });
  } catch {
    return { ok: false, problem: `The measure "${name}" stopped because of an internal error.` };
  }
  return isMeasureValue(value) ? { ok: true, value } : { ok: false, problem: `The measure "${name}" gave something that is not a value.` };
}

function compare(name: string, op: ConditionOp, actual: MeasureValue, expected: MeasureValue): Outcome<boolean> {
  if (op === "equals" || op === "not-equals") {
    const same = JSON.stringify(actual) === JSON.stringify(expected);
    return { ok: true, value: op === "equals" ? same : !same };
  }
  if (op === "includes" || op === "excludes") {
    if (!Array.isArray(actual)) return { ok: false, problem: `The measure "${name}" gave a value that is not a list, so "${op}" cannot apply.` };
    if (typeof expected === "boolean") return { ok: false, problem: `The comparison "${op}" needs text or a number to look for.` };
    const wanted = Array.isArray(expected) ? expected : [expected];
    const found = wanted.filter((item) => actual.includes(item)).length;
    return { ok: true, value: op === "includes" ? found === wanted.length : found === 0 };
  }
  if (typeof actual !== "number" || typeof expected !== "number") {
    return { ok: false, problem: `The measure "${name}" gave a value that is not a number, so "${op}" cannot apply.` };
  }
  switch (op) {
    case "greater": return { ok: true, value: actual > expected };
    case "at-least": return { ok: true, value: actual >= expected };
    case "less": return { ok: true, value: actual < expected };
    case "at-most": return { ok: true, value: actual <= expected };
  }
}

function problemResult(problem: string, actual: MeasureValue | null = null): ConditionResult {
  return { met: false, actual, expected: null, problem };
}

function evaluate<World>(
  subject: Subject<World>,
  condition: Condition,
  runs: StageRunRecord<World>[],
  referenceRuns: StageRunRecord<World>[] | undefined,
  view: string,
): ConditionResult {
  const name = condition.measure;
  const measure = findMeasure(subject, name);
  if (measure === undefined) return problemResult(`There is no measure named "${String(name)}".`);
  const op: unknown = condition.op;
  if (!isOp(op)) return problemResult(`The comparison must be one of: ${CONDITION_OPS.join(", ")}.`);
  const selected = selectRuns(runs, condition.run);
  if (!selected.ok) return problemResult(selected.problem);
  const context = argContextFor(subject, [...runs, ...(referenceRuns ?? [])], view);
  const argProblems = checkArgs(measure.args, condition.args, context);
  if (argProblems.length > 0) return problemResult(argProblems.join(" "));

  const actual = computeValue(name, measure, selected.value, condition.args, referenceRuns ?? []);
  if (!actual.ok) return problemResult(actual.problem);

  let expected: MeasureValue;
  const value: unknown = condition.value;
  if (isReference(value)) {
    if (referenceRuns === undefined) {
      return problemResult("This condition compares with the reference solution, but no reference runs were given.", actual.value);
    }
    const reference = selectRuns(referenceRuns, condition.run);
    if (!reference.ok) return problemResult(`The reference solution has no such run. ${reference.problem}`, actual.value);
    const computed = computeValue(name, measure, reference.value, condition.args, referenceRuns);
    if (!computed.ok) return problemResult(computed.problem, actual.value);
    expected = computed.value;
  } else if (isScalar(value)) {
    expected = value;
  } else {
    return problemResult("The value must be text, a number, true or false, or the reference solution.", actual.value);
  }

  const outcome = compare(name, op, actual.value, expected);
  if (!outcome.ok) return { met: false, actual: actual.value, expected, problem: outcome.problem };
  return outcome.value
    ? { met: true, actual: actual.value, expected }
    : { met: false, actual: actual.value, expected, unmet: condition.unmet };
}

// Never throws. A condition that cannot be checked is reported as not met,
// with a problem sentence that says why.
export function evaluateCondition<World>(
  subject: Subject<World>,
  condition: Condition,
  input: { runs: StageRunRecord<World>[]; referenceRuns?: StageRunRecord<World>[]; view?: string },
): ConditionResult {
  try {
    return evaluate(subject, condition, input.runs, input.referenceRuns, input.view ?? "");
  } catch {
    return problemResult("The condition could not be checked because of an internal error.");
  }
}
