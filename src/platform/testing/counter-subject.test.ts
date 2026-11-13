import { describe, expect, test } from "vitest";
import { evaluateCondition } from "../conditions";
import { runSubject } from "../run-subject";
import { lookup } from "../subject";
import { counterCases, counterSubject, type CounterWorld } from "./counter-subject";

function run(text: string, world: CounterWorld = { counters: [] }) {
  return runSubject(counterSubject, { sources: { counters: text }, world, seed: 0, options: {} });
}

describe("counter subject", () => {
  test("adds, sets, and checks named counters", () => {
    const result = run("add 3 to apples\nset apples to 3\nset pears to 1\ncheck apples\n\ncheck plums", { counters: [{ name: "apples", value: 2 }] });
    if (!result.ok) throw new Error(result.problem.what);
    const events = result.record.steps.map((step) => step.event);
    expect(events.map((event) => [event.kind, event.status])).toEqual([
      ["add", "changed"], ["set", "changed"], ["set", "changed"], ["check", "info"], ["check", "failed"],
    ]);
    expect(result.record.final).toEqual({ counters: [{ name: "apples", value: 3 }, { name: "pears", value: 1 }] });
  });

  test("reports setting a counter to its current value as unchanged", () => {
    const result = run("set apples to 2", { counters: [{ name: "apples", value: 2 }] });
    expect(result.ok && result.record.steps[0]?.event.status).toBe("unchanged");
  });

  test("points each event at its line and its counter", () => {
    const result = run("\nadd 1 to apples");
    if (!result.ok) throw new Error(result.problem.what);
    expect(result.record.steps[0]?.event).toMatchObject({
      causes: [{ ref: { artifactId: "counters", fromLine: 2, toLine: 2 }, role: "primary" }],
      targets: [{ entityId: "apples", factId: "value" }],
    });
  });

  test("names the line it cannot read", () => {
    expect(run("add 1 to apples\nmultiply apples")).toEqual({
      ok: false,
      problem: {
        what: "Line 2 of counters.txt cannot be read.",
        fix: "Write each line as add <n> to <name>, set <name> to <n>, or check <name>.",
      },
    });
  });

  test("treats prototype names as ordinary counter names", () => {
    const result = run("add 1 to __proto__\nset constructor to 2\ncheck prototype");
    if (!result.ok) throw new Error(result.problem.what);
    expect(result.record.final).toEqual({ counters: [{ name: "__proto__", value: 1 }, { name: "constructor", value: 2 }] });
    expect(result.record.steps[2]?.event.status).toBe("failed");
  });

  test("describes counters with an optional parity view", () => {
    const world = { counters: [{ name: "a", value: 3 }] };
    expect(counterSubject.describe({ world, sources: {}, view: "default" }).entities[0]?.facts.map((fact) => fact.id)).toEqual(["value"]);
    expect(counterSubject.describe({ world, sources: {}, view: "parity" }).entities[0]?.facts.map((fact) => [fact.id, fact.value])).toEqual([
      ["value", "3"], ["parity", "odd"],
    ]);
  });

  test("has measures with arguments", () => {
    const result = run("add 4 to a\nset a to 4\ncheck a");
    if (!result.ok) throw new Error(result.problem.what);
    const runs = [result.record];
    expect(evaluateCondition(counterSubject, { measure: "counter-value", args: { counter: "a" }, run: "last", op: "equals", value: 4, unmet: "Not yet." }, { runs }).met).toBe(true);
    expect(evaluateCondition(counterSubject, { measure: "status-count", args: { status: "unchanged" }, run: "last", op: "equals", value: 1, unmet: "Not yet." }, { runs }).met).toBe(true);
  });

  test("has a fault that resets a counter", () => {
    const reset = lookup(counterSubject.faults, "reset");
    expect(reset?.apply({ counters: [{ name: "a", value: 3 }, { name: "b", value: 1 }] }, "a")).toEqual({
      counters: [{ name: "a", value: 0 }, { name: "b", value: 1 }],
    });
  });

  test("supplies at least two conformance cases", () => {
    expect(counterCases.length).toBeGreaterThanOrEqual(2);
    for (const item of counterCases) {
      expect(runSubject(counterSubject, item).ok).toBe(true);
    }
  });
});
