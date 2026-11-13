import { describe, expect, test } from "vitest";
import { conditionProblems, evaluateCondition, findMeasure, type Condition } from "./conditions";
import type { StageRunRecord } from "./run-record";
import { defineSubject, type ArgContext, type Measure, type Subject } from "./subject";

type World = { value: number };

function run(value: number, sources: Record<string, string> = { main: "x" }): StageRunRecord<World> {
  return { engine: "tiny", seed: 0, config: { sources, options: {} }, initial: { value }, final: { value }, steps: [] };
}

const measures = new Map<string, Measure<World>>([
  ["value", { args: {}, evidence: ["value"], compute: (runs) => runs.at(-1)?.final.value ?? 0 }],
  ["names", { args: {}, evidence: [], compute: (runs) => runs.length === 0 ? [] : ["web-1", "web-2"] }],
  ["scaled", {
    args: { by: { kind: "number", min: 1, max: 10, integer: true }, target: { kind: "entity" } },
    evidence: ["value"],
    compute: (runs, args) => (runs.at(-1)?.final.value ?? 0) * Number(args.by),
  }],
  ["throws", { args: {}, evidence: [], compute: () => { throw new Error("boom"); } }],
  ["not-a-value", { args: {}, evidence: [], compute: () => Number.NaN }],
]);

const subject: Subject<World> = defineSubject<World>({
  id: "tiny",
  version: 1,
  simulated: false,
  artifacts: [{ id: "main", fileName: "main.txt", kind: "text", language: "plain" }],
  run: () => ({ ok: false, problem: { what: "Not used.", fix: "Not used." } }),
  describe: ({ world }) => ({
    entities: [{ id: "counter", kind: "counter", title: "Counter", facts: [{ id: "value", label: "Value", value: String(world.value), tone: "neutral" }] }],
  }),
  measures,
  results: "list",
  validateStep: () => [],
});

function condition(change: Partial<Condition> = {}): Condition {
  return { measure: "value", args: {}, run: "last", op: "equals", value: 3, unmet: "The value is not 3 yet.", ...change };
}

const runs = [run(1), run(3)];

describe("evaluateCondition", () => {
  test("meets a condition on the last run", () => {
    expect(evaluateCondition(subject, condition(), { runs })).toEqual({ met: true, actual: 3, expected: 3 });
  });

  test("shows the unmet text when the condition does not hold", () => {
    expect(evaluateCondition(subject, condition({ value: 4 }), { runs })).toEqual({
      met: false, actual: 3, expected: 4, unmet: "The value is not 3 yet.",
    });
  });

  test("passes a numbered run or all runs to the measure", () => {
    expect(evaluateCondition(subject, condition({ run: 0, value: 1 }), { runs }).met).toBe(true);
    expect(evaluateCondition(subject, condition({ measure: "run-count", run: "all", value: 2 }), { runs }).met).toBe(true);
    expect(evaluateCondition(subject, condition({ measure: "run-count", run: "last", value: 1 }), { runs }).met).toBe(true);
  });

  test.each<[Condition["op"], number, boolean]>([
    ["equals", 3, true], ["not-equals", 3, false], ["greater", 2, true], ["greater", 3, false],
    ["at-least", 3, true], ["less", 4, true], ["less", 3, false], ["at-most", 3, true], ["at-most", 2, false],
  ])("compares with %s %d", (op, value, met) => {
    expect(evaluateCondition(subject, condition({ op, value }), { runs }).met).toBe(met);
  });

  test("checks list membership with includes and excludes", () => {
    expect(evaluateCondition(subject, condition({ measure: "names", op: "includes", value: "web-2" }), { runs }).met).toBe(true);
    expect(evaluateCondition(subject, condition({ measure: "names", op: "excludes", value: "web-2" }), { runs }).met).toBe(false);
    expect(evaluateCondition(subject, condition({ measure: "names", op: "excludes", value: "db-1" }), { runs }).met).toBe(true);
  });

  test("computes the expected value from the reference runs", () => {
    const result = evaluateCondition(subject, condition({ value: { reference: true } }), { runs, referenceRuns: [run(3)] });
    expect(result).toEqual({ met: true, actual: 3, expected: 3 });
    expect(evaluateCondition(subject, condition({ value: { reference: true } }), { runs, referenceRuns: [run(5)] }).met).toBe(false);
  });

  test("passes the reference runs to platform measures", () => {
    const match = condition({ measure: "sources-match-reference", args: { artifact: "main" }, value: true });
    expect(evaluateCondition(subject, match, { runs, referenceRuns: [run(0, { main: "x  " })] }).met).toBe(true);
    expect(evaluateCondition(subject, match, { runs, referenceRuns: [run(0, { main: "y" })] }).met).toBe(false);
  });

  test("checks arguments against the entities the runs show", () => {
    const scaled = condition({ measure: "scaled", args: { by: 2, target: "counter" }, value: 6 });
    expect(evaluateCondition(subject, scaled, { runs }).met).toBe(true);
    const missing = evaluateCondition(subject, { ...scaled, args: { by: 2, target: "ghost" } }, { runs });
    expect(missing).toMatchObject({ met: false, problem: 'There is no entity named "ghost".' });
  });

  const problems: [string, Record<string, unknown>, string | RegExp][] = [
    ["an unknown measure", { measure: "missing" }, 'There is no measure named "missing".'],
    ["a prototype name as the measure", { measure: "constructor" }, 'There is no measure named "constructor".'],
    ["a bad argument", { args: { extra: 1 } }, 'The argument "extra" is not one this measure takes.'],
    ["an unknown op", { op: "matches" }, /comparison/],
    ["a run index past the end", { run: 2 }, "There is no run 2. There are 2 runs."],
    ["a negative run index", { run: -1 }, /run/],
    ["a fractional run index", { run: 0.5 }, /run/],
    ["an order comparison on a list", { measure: "names", op: "greater" }, /not a number/],
    ["includes on a number", { op: "includes" }, /not a list/],
    ["a measure that throws", { measure: "throws" }, 'The measure "throws" stopped because of an internal error.'],
    ["a measure with a value that is not data", { measure: "not-a-value" }, /not a value/],
    ["a reference with no reference runs", { value: { reference: true } }, /reference/],
  ];

  test.each(problems)("reports %s as a problem without throwing", (_name, change, problem) => {
    const hostile: Condition = JSON.parse(JSON.stringify({ ...condition(), ...change }));
    const result = evaluateCondition(subject, hostile, { runs });
    expect(result.met).toBe(false);
    expect(result.problem).toEqual(typeof problem === "string" ? problem : expect.stringMatching(problem));
  });

  test("reports a missing last run", () => {
    expect(evaluateCondition(subject, condition(), { runs: [] })).toMatchObject({ met: false, problem: "There is no run yet." });
  });
});

describe("conditionProblems", () => {
  const context: ArgContext = { artifactIds: new Set(["main"]), entityIds: new Set(["counter"]), factIds: new Set(["value"]) };

  test("accepts a valid condition", () => {
    expect(conditionProblems(subject, condition(), context)).toEqual([]);
    expect(conditionProblems(subject, condition({ measure: "scaled", args: { by: 3, target: "counter" }, value: { reference: true } }), context)).toEqual([]);
  });

  test.each<[string, unknown]>([
    ["not an object", "value"],
    ["unknown measure", { ...condition(), measure: "__proto__" }],
    ["bad argument", { ...condition(), measure: "scaled", args: { by: 11, target: "counter" } }],
    ["unknown entity", { ...condition(), measure: "scaled", args: { by: 1, target: "ghost" } }],
    ["bad run", { ...condition(), run: "first" }],
    ["bad op", { ...condition(), op: "matches" }],
    ["bad value", { ...condition(), value: { reference: false } }],
    ["object value", { ...condition(), value: { a: 1 } }],
    ["empty unmet text", { ...condition(), unmet: " " }],
    ["unknown field", { ...condition(), extra: true }],
    ["order comparison with text", { ...condition(), op: "less", value: "a" }],
    ["includes with a boolean", { ...condition(), op: "includes", value: true }],
  ])("reports %s", (_name, value) => {
    expect(conditionProblems(subject, value, context).length).toBeGreaterThan(0);
  });
});

describe("findMeasure", () => {
  test("finds platform measures and subject measures", () => {
    expect(findMeasure(subject, "run-count")).toBeDefined();
    expect(findMeasure(subject, "value")).toBeDefined();
    expect(findMeasure(subject, "prototype")).toBeUndefined();
  });

  test("a subject cannot reuse a platform measure name", () => {
    expect(() => defineSubject({ ...subject, measures: new Map([["run-count", { args: {}, evidence: [], compute: () => 0 }]]) }))
      .toThrow(/platform measure/);
  });
});
