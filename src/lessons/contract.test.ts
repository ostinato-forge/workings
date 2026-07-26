import { describe, expect, test } from "vitest";
import { runTokenMachine } from "../engine/token-machine";
import { lessons } from "./index";
import { lintCopy } from "./lint";

describe.each(lessons.map((lesson) => [lesson.id, lesson] as const))(
  "lesson contract: %s",
  (_id, lesson) => {
    const records = lesson.cases.map((lessonCase) => {
      const result = runTokenMachine(lesson.model, lesson.tokenizer, lessonCase.config);
      if (!result.ok) {
        throw new Error(
          `case ${lessonCase.id} rejected its own config: ${result.problem.what}`,
        );
      }
      return result.record;
    });

    test("every case config runs clean on the lesson's own model", () => {
      expect(records).toHaveLength(2);
    });

    test("the derived correct option exists and is unique in the options", () => {
      const ids = lesson.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const record of records) {
        const derived = lesson.deriveCorrectOption(record);
        expect(ids).toContain(derived);
      }
    });

    test("the second case changes the outcome", () => {
      const first = lesson.deriveCorrectOption(records[0] as (typeof records)[0]);
      const second = lesson.deriveCorrectOption(records[1] as (typeof records)[0]);
      expect(first).not.toBe(second);
    });

    test("runs are byte-identical on repeat", () => {
      for (const lessonCase of lesson.cases) {
        const again = runTokenMachine(
          lesson.model,
          lesson.tokenizer,
          lessonCase.config,
        );
        expect(again.ok).toBe(true);
        if (!again.ok) return;
        const index = lesson.cases.indexOf(lessonCase);
        expect(JSON.stringify(again.record)).toBe(
          JSON.stringify(records[index]),
        );
      }
    });

    test("guide cards and case ids are unique", () => {
      const cardIds = lesson.guideCards.map((c) => c.id);
      expect(new Set(cardIds).size).toBe(cardIds.length);
      const caseIds = lesson.cases.map((c) => c.id);
      expect(new Set(caseIds).size).toBe(caseIds.length);
    });

    test("every string of lesson copy passes the neutrality lint", () => {
      const copy = [
        lesson.title,
        ...lesson.guideCards.flatMap((c) => [c.title, c.body]),
        ...lesson.options.map((o) => o.label),
        ...lesson.cases.flatMap((c) => [c.setup, c.question]),
      ];
      expect(lintCopy(copy)).toEqual([]);
    });
  },
);
