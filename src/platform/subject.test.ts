import { describe, expect, test } from "vitest";
import {
  checkArgs,
  defineSubject,
  isMeasureValue,
  isPackageId,
  lookup,
  type ArgContext,
  type ArgSpec,
  type Subject,
} from "./subject";

type World = { value: number };

function subject(change: Partial<Subject<World>> = {}): Subject<World> {
  return {
    id: "tiny",
    version: 1,
    simulated: false,
    artifacts: [{ id: "main", fileName: "main.txt", kind: "text", language: "plain" }],
    run: () => ({ ok: false, problem: { what: "Not used.", fix: "Not used." } }),
    describe: () => ({ entities: [] }),
    measures: new Map([["value", { args: { mode: { kind: "choice", choices: ["a"] } }, evidence: ["value"], compute: () => 0 }]]),
    faults: new Map([["reset", { label: "Reset", apply: (world: World) => world }]]),
    results: "list",
    validateStep: () => [],
    ...change,
  };
}

describe("isPackageId", () => {
  test.each(["a", "web-2", "site.yml", "a_b", "0", "x".repeat(64)])("accepts %s", (text) => {
    expect(isPackageId(text)).toBe(true);
  });

  test.each(["", "A", "-a", ".a", "_a", "a b", "a/b", "x".repeat(65), "a\n", "é", "__proto__"])("rejects %j", (text) => {
    expect(isPackageId(text)).toBe(false);
  });

  test("rejects values that are not text", () => {
    expect(isPackageId(3)).toBe(false);
    expect(isPackageId(null)).toBe(false);
  });
});

describe("lookup", () => {
  const table = new Map([["known", 1]]);

  test("finds a registered name", () => {
    expect(lookup(table, "known")).toBe(1);
  });

  test.each(["constructor", "__proto__", "prototype", "toString", "hasOwnProperty", "missing"])("returns undefined for %s", (name) => {
    expect(lookup(table, name)).toBeUndefined();
  });

  test("returns undefined for a name that is not text", () => {
    expect(lookup(table, 1)).toBeUndefined();
    expect(lookup(undefined, "known")).toBeUndefined();
  });
});

describe("checkArgs", () => {
  const spec: Record<string, ArgSpec> = {
    mode: { kind: "choice", choices: ["first", "last"] },
    count: { kind: "number", min: 1, max: 5, integer: true },
    ratio: { kind: "number", min: 0, max: 1, integer: false },
    host: { kind: "entity" },
    file: { kind: "artifact" },
    fact: { kind: "fact" },
  };
  const context: ArgContext = {
    artifactIds: new Set(["playbook"]),
    entityIds: new Set(["web-1"]),
    factIds: new Set(["reloads"]),
  };
  const good = { mode: "first", count: 3, ratio: 0.5, host: "web-1", file: "playbook", fact: "reloads" };

  test("accepts arguments that match the spec", () => {
    expect(checkArgs(spec, good, context)).toEqual([]);
  });

  test("reports a missing argument", () => {
    const { mode: _mode, ...rest } = good;
    expect(checkArgs(spec, rest, context)).toEqual(['The argument "mode" is missing.']);
  });

  test("reports an extra argument", () => {
    expect(checkArgs(spec, { ...good, extra: 1 }, context)).toEqual(['The argument "extra" is not one this measure takes.']);
  });

  test("treats prototype names as extra arguments", () => {
    const args: unknown = JSON.parse('{"__proto__": 1, "constructor": 2}');
    expect(checkArgs({}, args, context)).toEqual([
      'The argument "__proto__" is not one this measure takes.',
      'The argument "constructor" is not one this measure takes.',
    ]);
  });

  test("does not find inherited names in the spec", () => {
    expect(checkArgs({}, { toString: "x" }, context)).toEqual(['The argument "toString" is not one this measure takes.']);
  });

  test("reports a value that is not a choice", () => {
    expect(checkArgs(spec, { ...good, mode: "middle" }, context)).toEqual(['The argument "mode" must be one of: first, last.']);
  });

  test.each([0, 6, 2.5, "3", Number.NaN])("reports count %j", (count) => {
    expect(checkArgs(spec, { ...good, count }, context)).toEqual(['The argument "count" must be a whole number from 1 to 5.']);
  });

  test("allows fractions for a number that is not whole", () => {
    expect(checkArgs(spec, { ...good, ratio: 0.25 }, context)).toEqual([]);
    expect(checkArgs(spec, { ...good, ratio: 2 }, context)).toEqual(['The argument "ratio" must be a number from 0 to 1.']);
  });

  test("reports ids that do not exist", () => {
    expect(checkArgs(spec, { ...good, host: "web-9", file: "inventory", fact: "constructor" }, context)).toEqual([
      'There is no entity named "web-9".',
      'There is no artifact named "inventory".',
      'There is no fact named "constructor".',
    ]);
  });

  test("reports ids that are not text", () => {
    expect(checkArgs(spec, { ...good, host: 1 }, context)).toEqual(['The argument "host" must name an entity.']);
  });

  test("reports arguments that are not an object", () => {
    expect(checkArgs(spec, null, context)).toEqual(["The arguments must be a set of named values."]);
    expect(checkArgs(spec, [], context)).toEqual(["The arguments must be a set of named values."]);
  });
});

describe("isMeasureValue", () => {
  test.each(["a", 1, true, ["a", 1], []])("accepts %j", (value) => {
    expect(isMeasureValue(value)).toBe(true);
  });

  test.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, [true], [["a"]], { a: 1 }])("rejects %j", (value) => {
    expect(isMeasureValue(value)).toBe(false);
  });
});

describe("defineSubject", () => {
  test("returns a valid subject unchanged", () => {
    const valid = subject();
    expect(defineSubject(valid)).toBe(valid);
  });

  test.each<[string, Partial<Subject<World>>]>([
    ["subject id", { id: "Tiny" }],
    ["artifact id", { artifacts: [{ id: "Main", fileName: "main.txt", kind: "text", language: "plain" }] }],
    ["artifact language", { artifacts: [{ id: "main", fileName: "main.txt", kind: "text", language: "Plain Text" }] }],
    ["settings field id", { artifacts: [{ id: "main", fileName: "main.json", kind: "settings", fields: [{ id: "top k", label: "Top k" }] }] }],
    ["measure name", { measures: new Map([["__proto__", { args: {}, evidence: [], compute: () => 0 }]]) }],
    ["argument name", { measures: new Map([["value", { args: { "Bad Name": { kind: "entity" } }, evidence: [], compute: () => 0 }]]) }],
    ["evidence fact id", { measures: new Map([["value", { args: {}, evidence: ["Value"], compute: () => 0 }]]) }],
    ["fault name", { faults: new Map([["Reset", { label: "Reset", apply: (world: World) => world }]]) }],
  ])("rejects a bad %s", (what, change) => {
    expect(() => defineSubject(subject(change))).toThrow(new RegExp(what));
  });

  test("rejects a repeated artifact id", () => {
    const artifact = { id: "main", fileName: "main.txt", kind: "text", language: "plain" } as const;
    expect(() => defineSubject(subject({ artifacts: [artifact, artifact] }))).toThrow(/more than once/);
  });

  test("rejects a version that is not a positive whole number", () => {
    expect(() => defineSubject(subject({ version: 0 }))).toThrow(/version/);
  });

  test("rejects argument specs that no value can meet", () => {
    expect(() => defineSubject(subject({ measures: new Map([["value", {
      args: { mode: { kind: "choice", choices: [] } }, evidence: [], compute: () => 0,
    }]]) }))).toThrow(/no choices/);
    expect(() => defineSubject(subject({ measures: new Map([["value", {
      args: { count: { kind: "number", min: 5, max: 1, integer: true } }, evidence: [], compute: () => 0,
    }]]) }))).toThrow(/range/);
  });
});
