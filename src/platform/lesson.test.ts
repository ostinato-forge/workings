import { expect, test } from "vitest";
import { desiredStateLesson } from "../courses/ansible/desired-state";
import { samplingDialsLesson } from "../lessons/sampling-dials";
import { lintCopy } from "../lessons/lint";
import { catalog } from "./catalog";

test.each([samplingDialsLesson, desiredStateLesson])("$id uses the shared teaching flow", (lesson) => {
  const ids = lesson.beats.map((beat) => beat.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(lesson.beats[0]?.kind).toBe("teach");
  expect(lesson.beats.at(-1)?.kind).toBe("free-play");
  expect(lesson.beats.filter((beat) => beat.kind === "play").length).toBeGreaterThanOrEqual(2);
  const copy = [lesson.title];
  for (const beat of lesson.beats) {
    if (beat.kind === "teach" || beat.kind === "recap") copy.push(beat.title, beat.body);
    else if (beat.kind === "play") copy.push(beat.goal, beat.prediction.question, ...beat.prediction.options.map((option) => option.label));
    else copy.push(beat.intro);
  }
  expect(lintCopy(copy)).toEqual([]);
  expect(catalog.lessons.find((item) => item.id === lesson.id)?.title).toBe(lesson.title);
});

test("course and lesson descriptions follow the same copy rules", () => {
  expect(lintCopy([...catalog.courses, ...catalog.lessons].flatMap((item) => [item.title, item.description]))).toEqual([]);
});
