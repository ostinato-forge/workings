import { expect, test } from "vitest";
import { catalog, defineCatalog } from "./catalog";
import { completeLesson, decodeProgress, PROGRESS_KEY, readProgress, saveProgress } from "./progress";

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

test("completing a reused lesson affects only its selected course", () => {
  const shared = defineCatalog({ ...catalog, courses: [
    catalog.courses[0]!, { ...catalog.courses[0]!, id: "second-course" },
  ] });
  const progress = completeLesson({}, "ai", "sampling-dials");
  const saved = storage();
  saveProgress(saved, progress, shared);
  expect(readProgress(saved, shared)).toEqual({ ai: { "sampling-dials": "complete" } });
  expect(progress["second-course"]).toBeUndefined();
});

test("legacy completion migrates only to the original AI course", () => {
  const saved = storage({ "workings-progress": JSON.stringify({ "sampling-dials": "complete", "desired-state": "complete" }) });
  expect(readProgress(saved, catalog)).toEqual({ ai: { "sampling-dials": "complete" } });
  saveProgress(saved, completeLesson(readProgress(saved, catalog), "ansible", "desired-state"), catalog);
  expect(readProgress(saved, catalog)).toEqual({ ai: { "sampling-dials": "complete" }, ansible: { "desired-state": "complete" } });
  expect(saved.getItem("workings-progress")).not.toBeNull();
});

test.each(["null", "[]", "false", "broken", '{"ai":null}', '{"ai":{"sampling-dials":true}}'])(
  "malformed saved data cannot mark a lesson complete: %s", (raw) => {
    expect(decodeProgress(raw, catalog)).toEqual({});
  },
);

test("saving one course preserves completion recorded in another tab", () => {
  const saved = storage();
  saveProgress(saved, completeLesson({}, "ai", "sampling-dials"), catalog);
  saveProgress(saved, completeLesson({}, "ansible", "desired-state"), catalog);
  expect(readProgress(saved, catalog)).toEqual({ ai: { "sampling-dials": "complete" }, ansible: { "desired-state": "complete" } });
});

test("retired or misplaced lessons do not contribute to progress", () => {
  const saved = storage({ [PROGRESS_KEY]: JSON.stringify({
    ai: { "sampling-dials": "complete", "desired-state": "complete", retired: "complete" },
    retired: { old: "complete" },
  }) });
  expect(readProgress(saved, catalog)).toEqual({ ai: { "sampling-dials": "complete" } });
});
