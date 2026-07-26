import { describe, expect, test } from "vitest";
import { runTokenMachine } from "../engine/token-machine";
import { shellCopyStrings } from "../shell/copy";
import { lessons } from "./index";
import { lintCopy } from "./lint";
import type { PredictBeat } from "./types";

describe.each(lessons.map((lesson) => [lesson.id, lesson] as const))(
  "lesson contract: %s",
  (_id, lesson) => {
    const predictBeats = lesson.beats.filter(
      (beat): beat is PredictBeat => beat.kind === "predict",
    );

    const recordsOf = (beat: PredictBeat) =>
      beat.configs.map((config) => {
        const result = runTokenMachine(lesson.model, lesson.tokenizer, config);
        if (!result.ok) {
          throw new Error(
            `beat ${beat.id} rejected its own config: ${result.problem.what}`,
          );
        }
        return result.record;
      });

    test("the lesson has at least two predict beats and one recap", () => {
      expect(predictBeats.length).toBeGreaterThanOrEqual(2);
      expect(lesson.beats.some((b) => b.kind === "recap")).toBe(true);
    });

    test("beat ids are unique", () => {
      const ids = lesson.beats.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("every predict beat derives a valid, unique option", () => {
      for (const beat of predictBeats) {
        const ids = beat.options.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        const derived = beat.deriveCorrectOption(recordsOf(beat));
        expect(ids).toContain(derived);
      }
    });

    test("the predict beats do not all share one derived answer", () => {
      const derived = predictBeats.map((beat) =>
        beat.deriveCorrectOption(recordsOf(beat)),
      );
      expect(new Set(derived).size).toBeGreaterThan(1);
    });

    test("every run is byte-identical on repeat", () => {
      for (const beat of predictBeats) {
        const first = recordsOf(beat);
        const second = recordsOf(beat);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      }
    });

    test("every string of lesson copy passes the neutrality lint", () => {
      const copy: string[] = [lesson.title];
      for (const beat of lesson.beats) {
        if (beat.kind === "teach" || beat.kind === "recap") {
          copy.push(beat.title, beat.body);
        } else if (beat.kind === "predict") {
          copy.push(beat.setup, beat.question, ...beat.options.map((o) => o.label));
        } else {
          copy.push(beat.intro);
        }
      }
      expect(lintCopy(copy)).toEqual([]);
    });
  },
);

describe("shell copy", () => {
  test("every shell string passes the neutrality lint", () => {
    expect(lintCopy(shellCopyStrings())).toEqual([]);
  });
});
