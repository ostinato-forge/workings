import { describe, expect, test } from "vitest";
import { checkDataLimits, checkRepeatedWork, checkRunSize, checkSourceLimits, LIMITS, REPEATED_WORK } from "./limits";

describe("LIMITS", () => {
  test("holds every input limit", () => {
    expect(LIMITS).toEqual({
      maxArtifacts: 8,
      maxArtifactBytes: 64_000,
      maxTotalBytes: 200_000,
      maxArtifactLines: 2_000,
      maxLineCharacters: 400,
      maxDataDepth: 40,
      maxDataNodes: 20_000,
      maxRunSteps: 5_000,
      maxRepeatedWork: 2_000,
    });
    expect(Object.isFrozen(LIMITS)).toBe(true);
  });
});

describe("checkSourceLimits", () => {
  const names = new Map([["site", "site.yml"]]);

  test("accepts sources at the limits", () => {
    const line = "a".repeat(400);
    const sources = { site: Array.from({ length: 150 }, () => line).join("\n") };
    expect(checkSourceLimits(sources, names)).toBeNull();
    expect(checkSourceLimits({})).toBeNull();
    expect(checkSourceLimits({ a: Array.from({ length: 2_000 }, () => "x").join("\n") })).toBeNull();
  });

  test("reports too many artifacts", () => {
    const sources = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`a${i}`, ""]));
    expect(checkSourceLimits(sources)).toEqual({ what: "There are 9 files.", fix: "Use 8 files or fewer." });
  });

  test("reports an artifact that is too large, counting bytes", () => {
    expect(checkSourceLimits({ site: "é".repeat(32_001) }, names)).toEqual({
      what: "site.yml is 64,002 bytes long.",
      fix: "Keep each file to 64,000 bytes or less.",
    });
  });

  test("reports sources that are too large together", () => {
    const sources = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`a${i}`, "\n".repeat(50_001)]));
    expect(checkSourceLimits(sources)).toEqual({
      what: "The files are 200,004 bytes long in total.",
      fix: "Keep all files together to 200,000 bytes or less.",
    });
  });

  test("reports too many lines, counting every line ending", () => {
    expect(checkSourceLimits({ site: "\r".repeat(2_001) }, names)).toEqual({
      what: "site.yml has 2,001 lines.",
      fix: "Keep each file to 2,000 lines or fewer.",
    });
  });

  test("does not count one trailing empty line", () => {
    const lines = Array.from({ length: 2_000 }, () => "x").join("\n");
    expect(checkSourceLimits({ site: `${lines}\n` }, names)).toBeNull();
    expect(checkSourceLimits({ site: `${lines}\r\n` }, names)).toBeNull();
    expect(checkSourceLimits({ site: `${lines}\n\n` }, names)?.what).toBe("site.yml has 2,001 lines.");
  });

  test("keeps line numbers in messages the same with or without a trailing newline", () => {
    const text = ["ok", "a".repeat(401)].join("\n");
    expect(checkSourceLimits({ site: text }, names)?.what).toBe("Line 2 of site.yml is 401 characters long.");
    expect(checkSourceLimits({ site: `${text}\n` }, names)?.what).toBe("Line 2 of site.yml is 401 characters long.");
  });

  test("reports a line that is too long", () => {
    const text = [...Array.from({ length: 11 }, () => "ok"), "a".repeat(1_950)].join("\n");
    expect(checkSourceLimits({ site: text }, names)).toEqual({
      what: "Line 12 of site.yml is 1,950 characters long.",
      fix: "Keep each line to 400 characters or fewer.",
    });
  });

  test("counts characters, not code units, in a line", () => {
    expect(checkSourceLimits({ site: "😀".repeat(400) }, names)).toBeNull();
  });

  test("uses the artifact id when no file name is known", () => {
    expect(checkSourceLimits({ notes: "a".repeat(401) })?.what).toBe("Line 1 of notes is 401 characters long.");
  });

  test("reports a source that is not text", () => {
    const sources: unknown = JSON.parse('{"site": 3}');
    expect(checkSourceLimits(sources, names)).toEqual({ what: "site.yml is not text.", fix: "Give each file as text." });
    expect(checkSourceLimits(null)).toEqual({ what: "The files could not be read.", fix: "Give the files as a set of named texts." });
  });

  test("checks a megabyte of text quickly", () => {
    const start = performance.now();
    expect(checkSourceLimits({ site: "a".repeat(1_048_576) }, names)?.what).toBe("site.yml is 1,048,576 bytes long.");
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("checkDataLimits", () => {
  function nested(depth: number): unknown {
    let value: unknown = 1;
    for (let i = 0; i < depth; i += 1) value = i % 2 === 0 ? [value] : { a: value };
    return value;
  }

  test("accepts data at the limits", () => {
    expect(checkDataLimits(nested(40))).toBeNull();
    expect(checkDataLimits(Array.from({ length: 19_999 }, () => 1))).toBeNull();
    expect(checkDataLimits("text")).toBeNull();
    expect(checkDataLimits(null)).toBeNull();
  });

  test("reports data nested too deeply", () => {
    expect(checkDataLimits(nested(41))).toEqual({
      what: "The data is nested more than 40 levels deep.",
      fix: "Keep nesting to 40 levels or fewer.",
    });
  });

  test("reports data with too many values", () => {
    expect(checkDataLimits(Array.from({ length: 20_000 }, () => 1))).toEqual({
      what: "The data holds more than 20,000 values.",
      fix: "Keep the data to 20,000 values or fewer.",
    });
  });

  test("handles nesting far past the limit without running out of stack", () => {
    expect(checkDataLimits(nested(200_000))?.what).toMatch(/nested/);
  });

  test("reports a very wide list without visiting every item", () => {
    const start = performance.now();
    expect(checkDataLimits([new Array<number>(1_000_000).fill(0)])?.what).toMatch(/20,000 values/);
    expect(performance.now() - start).toBeLessThan(500);
  });

  test("stops on data that refers to itself", () => {
    const loop: unknown[] = [];
    loop.push(loop, loop);
    expect(checkDataLimits(loop)).not.toBeNull();
  });

  test("counts shared values each time they appear", () => {
    const shared = Array.from({ length: 5_000 }, () => 1);
    expect(checkDataLimits([shared, shared, shared, shared])?.what).toMatch(/20,000 values/);
  });
});

describe("checkRepeatedWork", () => {
  test("names the work it can count", () => {
    expect(REPEATED_WORK).toEqual(["task"]);
  });

  test("accepts work at the limit and reports work past it", () => {
    expect(checkRepeatedWork(0, "task")).toBeNull();
    expect(checkRepeatedWork(2_000, "task")).toBeNull();
    expect(checkRepeatedWork(6_000, "task")).toEqual({
      what: "This run would repeat a task 6,000 times.",
      fix: "Use fewer loop items or fewer servers, so the total is 2,000 or fewer.",
    });
  });

  test("reports a count that is not a finite number", () => {
    expect(checkRepeatedWork(Number.POSITIVE_INFINITY, "task")?.what).toBe("This run would repeat a task more than 2,000 times.");
    expect(checkRepeatedWork(Number.NaN, "task")?.what).toBe("This run would repeat a task more than 2,000 times.");
  });
});

describe("checkRunSize", () => {
  test("accepts a run at the limit and reports one past it", () => {
    expect(checkRunSize({ steps: Array.from({ length: 5_000 }, () => null) })).toBeNull();
    expect(checkRunSize({ steps: Array.from({ length: 5_001 }, () => null) })).toEqual({
      what: "The run took 5,001 steps.",
      fix: "Make the input do less work so the run takes 5,000 steps or fewer.",
    });
  });
});
