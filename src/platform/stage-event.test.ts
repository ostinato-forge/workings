import { describe, expect, test } from "vitest";
import { stageEventProblems, type StageEvent } from "./stage-event";

function event(): StageEvent {
  return {
    kind: "task-result",
    status: "changed",
    statusWord: "changed",
    causes: [
      { ref: { artifactId: "playbook", fromLine: 3, toLine: 5 }, role: "primary" },
      { ref: { artifactId: "playbook", fromLine: 9, toLine: 9, fromColumn: 2, toColumn: 7 }, role: "via" },
      { ref: { artifactId: "settings", field: "temperature" }, role: "via" },
    ],
    after: [0, 2],
    targets: [{ entityId: "web-1", factId: "nginx" }, { entityId: "web-2" }],
    row: { id: "install", label: "Install nginx" },
    item: "nginx",
    summary: "Installed nginx on web-1.",
    detail: "/usr/sbin/nginx",
    data: { count: 2, name: "x", done: true, list: ["a", 1] },
  };
}

function withChange(change: (value: Record<string, unknown>) => void): unknown {
  const copy: Record<string, unknown> = JSON.parse(JSON.stringify(event()));
  change(copy);
  return copy;
}

describe("stageEventProblems", () => {
  test("accepts a complete event", () => {
    expect(stageEventProblems(event())).toEqual([]);
  });

  test("accepts a minimal event", () => {
    expect(stageEventProblems({ kind: "fault", status: "info", causes: [], targets: [], summary: "A fault was applied." })).toEqual([]);
  });

  test("rejects values that are not objects", () => {
    for (const value of [null, 3, "text", [], undefined]) {
      expect(stageEventProblems(value).length).toBeGreaterThan(0);
    }
  });

  test.each(["ok", "", "CHANGED", 1])("rejects status %s", (status) => {
    expect(stageEventProblems(withChange((value) => { value.status = status; }))).toEqual([
      expect.stringMatching(/status/i),
    ]);
  });

  test.each(["", "   ", 4])("rejects summary %j", (summary) => {
    expect(stageEventProblems(withChange((value) => { value.summary = summary; }))).toEqual([
      expect.stringMatching(/summary/i),
    ]);
  });

  test("rejects an empty kind", () => {
    expect(stageEventProblems(withChange((value) => { value.kind = ""; }))).toHaveLength(1);
  });

  test.each([
    [{ artifactId: "p", fromLine: 0, toLine: 1 }],
    [{ artifactId: "p", fromLine: 1.5, toLine: 2 }],
    [{ artifactId: "p", fromLine: 4, toLine: 3 }],
    [{ artifactId: "p", fromLine: -1, toLine: 3 }],
    [{ artifactId: "p", fromLine: 2, toLine: 2, fromColumn: 0, toColumn: 3 }],
    [{ artifactId: "p", fromLine: 2, toLine: 2, fromColumn: 5, toColumn: 3 }],
    [{ artifactId: "p", fromLine: 2, toLine: 3, fromColumn: 1, toColumn: 3 }],
    [{ artifactId: "p", fromLine: Number.NaN, toLine: 3 }],
    [{ artifactId: "", fromLine: 1, toLine: 1 }],
    [{ artifactId: "p", field: "" }],
    [{ artifactId: "p", field: "a", fromLine: 1, toLine: 1 }],
    [{ artifactId: "p" }],
  ])("rejects source reference %j", (ref) => {
    const problems = stageEventProblems(withChange((value) => { value.causes = [{ ref, role: "primary" }]; }));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => /cause 1/i.test(problem))).toBe(true);
  });

  test("rejects a bad cause role", () => {
    expect(stageEventProblems(withChange((value) => {
      value.causes = [{ ref: { artifactId: "p", field: "a" }, role: "secondary" }];
    }))).toEqual([expect.stringMatching(/role/)]);
  });

  test.each([[[-1]], [[1.5]], [["0"]], ["0"]])("rejects after %j", (after) => {
    expect(stageEventProblems(withChange((value) => { value.after = after; }))).toEqual([
      expect.stringMatching(/after/i),
    ]);
  });

  test.each([
    { nested: { a: 1 } },
    { deep: [["a"]] },
    { infinite: Number.POSITIVE_INFINITY },
    { missing: null },
    { listWithBoolean: [true] },
  ])("rejects data %j", (data) => {
    expect(stageEventProblems(withChange((value) => { value.data = data; }))).toEqual([
      expect.stringMatching(/data/i),
    ]);
  });

  test("rejects data that is not a plain object", () => {
    const value = { ...event(), data: new Map([["a", 1]]) };
    expect(stageEventProblems(value)).toEqual([expect.stringMatching(/data/i)]);
  });

  test("rejects targets without an entity id", () => {
    expect(stageEventProblems(withChange((value) => { value.targets = [{ factId: "x" }]; }))).toHaveLength(1);
  });

  test("rejects unknown fields so misspelled names are caught", () => {
    expect(stageEventProblems(withChange((value) => { value.sumary = "typo"; }))).toEqual([
      expect.stringMatching(/sumary/),
    ]);
  });

  test("treats prototype names in data as ordinary keys", () => {
    const data: unknown = JSON.parse('{"__proto__": "x", "constructor": 1}');
    expect(stageEventProblems(withChange((value) => { value.data = data; }))).toEqual([]);
  });
});
