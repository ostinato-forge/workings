import { describe, expect, test } from "vitest";
import { PLATFORM_MEASURES } from "./measures";
import type { StageRunRecord } from "./run-record";
import type { MeasureArgs } from "./subject";
import { normalizeText, splitLines } from "./text";

function run(sources: Record<string, string>): StageRunRecord<null> {
  return { engine: "test", seed: 0, config: { sources, options: {} }, initial: null, final: null, steps: [] };
}

function compute(name: string, runs: StageRunRecord<null>[], args: MeasureArgs = {}, referenceRuns: StageRunRecord<null>[] = []) {
  const measure = PLATFORM_MEASURES.get(name);
  if (measure === undefined) throw new Error(`missing measure ${name}`);
  return measure.compute(runs, args, { referenceRuns });
}

describe("text helpers", () => {
  test("split all three line endings", () => {
    expect(splitLines("a\r\nb\rc\nd")).toEqual(["a", "b", "c", "d"]);
    expect(splitLines("")).toEqual([""]);
  });

  test("normalize line endings and trailing whitespace", () => {
    expect(normalizeText("a  \r\nb\t\r c")).toBe("a\nb\n c");
  });
});

describe("platform measures", () => {
  test("are registered under exactly these names", () => {
    expect([...PLATFORM_MEASURES.keys()]).toEqual(["run-count", "sources-unchanged", "sources-match-reference"]);
  });

  test("run-count counts the runs it receives", () => {
    expect(compute("run-count", [])).toBe(0);
    expect(compute("run-count", [run({}), run({})])).toBe(2);
  });

  test("sources-unchanged compares the last run with the run before it", () => {
    expect(compute("sources-unchanged", [])).toBe(false);
    expect(compute("sources-unchanged", [run({ a: "x" })])).toBe(false);
    expect(compute("sources-unchanged", [run({ a: "y" }), run({ a: "x", b: "z" }), run({ b: "z", a: "x" })])).toBe(true);
    expect(compute("sources-unchanged", [run({ a: "x" }), run({ a: "x " })])).toBe(false);
    expect(compute("sources-unchanged", [run({ a: "x" }), run({ a: "x", b: "" })])).toBe(false);
  });

  test("sources-match-reference ignores line endings and trailing whitespace", () => {
    const reference = [run({ playbook: "- hosts: all\n  tasks: []\n" })];
    const args = { artifact: "playbook" };
    expect(compute("sources-match-reference", [run({ playbook: "- hosts: all  \r\n  tasks: []\r\n" })], args, reference)).toBe(true);
    expect(compute("sources-match-reference", [run({ playbook: "- hosts: web\n  tasks: []\n" })], args, reference)).toBe(false);
  });

  test("sources-match-reference reads only the last run and the last reference run", () => {
    const args = { artifact: "playbook" };
    const runs = [run({ playbook: "same" }), run({ playbook: "different" })];
    expect(compute("sources-match-reference", runs, args, [run({ playbook: "different" })])).toBe(true);
    expect(compute("sources-match-reference", runs, args, [run({ playbook: "different" }), run({ playbook: "same" })])).toBe(false);
  });

  test("sources-match-reference is false when a side is missing", () => {
    const args = { artifact: "playbook" };
    expect(compute("sources-match-reference", [], args, [run({ playbook: "x" })])).toBe(false);
    expect(compute("sources-match-reference", [run({ playbook: "x" })], args, [])).toBe(false);
    expect(compute("sources-match-reference", [run({})], args, [run({})])).toBe(false);
    expect(compute("sources-match-reference", [run({ playbook: "x" })], { artifact: "__proto__" }, [run({ playbook: "x" })])).toBe(false);
  });
});
