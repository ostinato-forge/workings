import { describe, expect, test } from "vitest";
import { runTokenMachine } from "../engine/token-machine";
import { shellCopyStrings } from "../shell/copy";
import { lessons } from "./index";
import { lintCopy } from "./lint";
import type { PlayBeat } from "./types";

describe.each(lessons.map((lesson) => [lesson.id, lesson] as const))(
  "lesson contract: %s",
  (_id, lesson) => {
    const playBeats = lesson.beats.filter(
      (beat): beat is PlayBeat => beat.kind === "play",
    );

    const beatSampling = (beat: PlayBeat) => {
      // The contract plays the beat the way a compliant learner would:
      // start from the locked values and satisfy the requirement.
      const candidates = [
        { temperature: 1, ...beat.requires.locked },
        { temperature: 0 },
        { temperature: 1, topK: 3 },
        { temperature: 0.7, topK: 5 },
      ];
      const found = candidates.find((c) => beat.requires.satisfied(c));
      if (found === undefined) {
        throw new Error(
          `beat ${beat.id}: no candidate sampling satisfies the requirement`,
        );
      }
      return found;
    };

    const recordsOf = (beat: PlayBeat) =>
      beat.seeds.slice(0, beat.minRuns).map((seed) => {
        const result = runTokenMachine(lesson.model, lesson.tokenizer, {
          prompt: beat.prompt,
          maxNewTokens: beat.maxNewTokens,
          sampling: beatSampling(beat),
          seed,
        });
        if (!result.ok) {
          throw new Error(
            `beat ${beat.id} rejected its config: ${result.problem.what}`,
          );
        }
        return result.record;
      });

    test("the lesson has at least two play beats and one recap", () => {
      expect(playBeats.length).toBeGreaterThanOrEqual(2);
      expect(lesson.beats.some((b) => b.kind === "recap")).toBe(true);
    });

    test("beat ids are unique", () => {
      const ids = lesson.beats.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("every play beat has enough seeds and a satisfiable requirement", () => {
      for (const beat of playBeats) {
        expect(beat.seeds.length).toBeGreaterThanOrEqual(beat.minRuns);
        expect(new Set(beat.seeds).size).toBe(beat.seeds.length);
        expect(beat.requires.satisfied(beatSampling(beat))).toBe(true);
      }
    });

    test("every prediction derives a valid, unique option from the played records", () => {
      for (const beat of playBeats) {
        const ids = beat.prediction.options.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        const derived = beat.prediction.deriveCorrectOption(recordsOf(beat));
        expect(ids).toContain(derived);
      }
    });

    test("the predictions do not all share one derived answer", () => {
      const derived = playBeats.map((beat) =>
        beat.prediction.deriveCorrectOption(recordsOf(beat)),
      );
      expect(new Set(derived).size).toBeGreaterThan(1);
    });

    test("every played run is byte-identical on repeat", () => {
      for (const beat of playBeats) {
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
        } else if (beat.kind === "play") {
          copy.push(
            beat.goal,
            beat.requires.description,
            beat.prediction.question,
            ...beat.prediction.options.map((o) => o.label),
          );
        } else {
          copy.push(beat.intro);
        }
      }
      expect(lintCopy(copy)).toEqual([]);
    });

    test("the phenomenon beats derive opposite answers", () => {
      const produce = playBeats.find((b) => b.id === "produce-the-phenomenon");
      const kill = playBeats.find((b) => b.id === "kill-the-raffle");
      expect(produce).toBeDefined();
      expect(kill).toBeDefined();
      if (produce === undefined || kill === undefined) return;
      expect(produce.prediction.deriveCorrectOption(recordsOf(produce))).toBe("differ");
      expect(kill.prediction.deriveCorrectOption(recordsOf(kill))).toBe("identical");
    });
  },
);

describe("shell copy", () => {
  test("every shell string passes the neutrality lint", () => {
    expect(lintCopy(shellCopyStrings())).toEqual([]);
  });
});
