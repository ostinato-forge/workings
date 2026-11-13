import { describe, expect, test } from "vitest";
import {
  CONFORMANCE_RULES,
  conformanceProblemList,
  describeSubjectConformance,
  HOSTILE_TEXTS,
  sampleArgs,
  subjectConformanceProblems,
} from "./conformance";
import type { StageEvent } from "./stage-event";
import { BROKEN_SUBJECTS, withEvents } from "./testing/broken-subjects";
import { counterCases, counterHostileCases, counterSubject } from "./testing/counter-subject";

describe("conformance suite", () => {
  test("names nine rules", () => {
    expect(CONFORMANCE_RULES).toEqual([
      "deterministic", "record-invariants", "event-shape", "causes-exist", "targets-exist",
      "changed-is-visible", "after-points-back", "measures-total", "hostile-input-safe",
    ]);
  });

  test("the counter subject has no problems", () => {
    expect(subjectConformanceProblems(counterSubject, counterCases, counterHostileCases)).toEqual([]);
  });

  test("has at least one broken subject for each rule", () => {
    expect([...new Set(BROKEN_SUBJECTS.map((broken) => broken.rule))]).toEqual([...CONFORMANCE_RULES]);
  });

  test.each(BROKEN_SUBJECTS)("reports the subject that breaks $rule under that rule only", ({ rule, also, subject }) => {
    const problems = conformanceProblemList(subject, counterCases, counterHostileCases);
    expect(problems.length).toBeGreaterThan(0);
    expect([...new Set(problems.map((problem) => problem.rule))]).toEqual([rule, ...(also ?? [])]);
  }, 60_000);

  test("reports a run that throws on hostile text, with the reason", () => {
    const broken = BROKEN_SUBJECTS.filter((item) => item.rule === "hostile-input-safe")[1];
    if (broken === undefined) throw new Error("missing broken subject");
    const problems = conformanceProblemList(broken.subject, counterCases, counterHostileCases);
    expect(problems.map((problem) => problem.caseName)).toEqual(["null character in counters"]);
    expect(problems[0]?.message).toMatch(/cannot read a null character/);
  });

  test("checks the events of a run on hostile text", () => {
    const broken = BROKEN_SUBJECTS.filter((item) => item.rule === "hostile-input-safe")[2];
    if (broken === undefined) throw new Error("missing broken subject");
    const problems = conformanceProblemList(broken.subject, counterCases, counterHostileCases);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.caseName === "prototype names as counters")).toBe(true);
    expect(problems[0]).toMatchObject({ step: 0, message: "event-shape: The event's summary is empty." });
  });

  test("names the rule, the case, and the step in each problem", () => {
    const broken = BROKEN_SUBJECTS.find((item) => item.rule === "changed-is-visible");
    if (broken === undefined) throw new Error("missing broken subject");
    expect(subjectConformanceProblems(broken.subject, counterCases)).toEqual([
      'changed-is-visible: case "adds and sets", step 1: The event says changed, but the world looks the same before and after.',
      'changed-is-visible: case "parity view", step 2: The event says changed, but the world looks the same before and after.',
    ]);
  });

  test.each<[string, (event: StageEvent) => StageEvent, string, RegExp]>([
    ["no causes on an event that is not a fault", (event) => ({ ...event, causes: [] }), "causes-exist", /only a fault event/],
    ["a cause in an undeclared artifact", (event) => ({ ...event, causes: [{ ref: { artifactId: "other", fromLine: 1, toLine: 1 }, role: "primary" }] }), "causes-exist", /does not declare/],
    ["a cause past the last line", (event) => ({ ...event, causes: [{ ref: { artifactId: "counters", fromLine: 1, toLine: 99 }, role: "primary" }] }), "causes-exist", /line 99/],
    ["a field cause on a text artifact", (event) => ({ ...event, causes: [{ ref: { artifactId: "counters", field: "a" }, role: "primary" }] }), "causes-exist", /text artifact/],
    ["a target fact that does not exist", (event) => ({ ...event, targets: event.targets.map((target) => ({ ...target, factId: "colour" })) }), "targets-exist", /target fact "colour"/],
  ])("reports %s", (_name, change, rule, message) => {
    const problems = conformanceProblemList(withEvents(change), counterCases);
    expect([...new Set(problems.map((problem) => problem.rule))]).toEqual([rule]);
    expect(problems[0]?.message).toMatch(message);
  });

  test("accepts an event with no causes when it is a fault", () => {
    const subject = withEvents((event) => ({ ...event, kind: "fault", causes: [] }));
    expect(subjectConformanceProblems(subject, counterCases)).toEqual([]);
  });

  test("needs at least two cases", () => {
    const [first] = counterCases;
    if (first === undefined) throw new Error("missing case");
    expect(() => subjectConformanceProblems(counterSubject, [first])).toThrow(/at least two cases/);
  });

  test("lists the hostile texts by name", () => {
    expect(HOSTILE_TEXTS.map((item) => item.name)).toEqual([
      "empty text",
      "one megabyte of the letter a",
      "5,000 opening square brackets",
      "5,000 nested YAML mappings",
      "unclosed template expression followed by 3,000 spaces",
      "only prototype names",
      "null character",
      "only carriage returns",
    ]);
    const text = (name: string) => HOSTILE_TEXTS.find((item) => item.name === name)?.text ?? "";
    expect(text("empty text")).toBe("");
    expect(text("one megabyte of the letter a")).toBe("a".repeat(1_048_576));
    expect(text("5,000 opening square brackets")).toBe("[".repeat(5_000));
    expect(text("5,000 nested YAML mappings").split("{").length - 1).toBe(5_000);
    expect(text("unclosed template expression followed by 3,000 spaces")).toBe(`{{${" ".repeat(3_000)}`);
    expect(text("only prototype names").split("\n").filter(Boolean)).toEqual(["constructor", "__proto__", "prototype"]);
    expect(text("null character")).toContain("\u0000");
    expect(/^\r+$/.test(text("only carriage returns"))).toBe(true);
  });
});

describe("sampleArgs", () => {
  const context = { artifactIds: new Set(["main"]), entityIds: new Set(["web-1"]), factIds: new Set(["reloads"]) };

  test("builds arguments that pass the spec", () => {
    expect(sampleArgs({
      mode: { kind: "choice", choices: ["b", "a"] },
      count: { kind: "number", min: 1.5, max: 4, integer: true },
      ratio: { kind: "number", min: 0.25, max: 1, integer: false },
      host: { kind: "entity" },
      file: { kind: "artifact" },
      fact: { kind: "fact" },
    }, context)).toEqual({ ok: true, args: { mode: "b", count: 2, ratio: 0.25, host: "web-1", file: "main", fact: "reloads" } });
  });

  test("reports an id kind with nothing to name", () => {
    expect(sampleArgs({ host: { kind: "entity" } }, { ...context, entityIds: new Set() })).toEqual({
      ok: false,
      problem: 'The argument "host" needs an entity, but the cases show none.',
    });
  });
});

describeSubjectConformance("counter subject", counterSubject, counterCases, counterHostileCases);
