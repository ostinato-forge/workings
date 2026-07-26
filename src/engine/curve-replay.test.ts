import { describe, expect, test } from "vitest";
import { assertRunRecordInvariants } from "./run-record";
import { replayCurve, type CurvePoint } from "./curve-replay";

const POINTS: CurvePoint[] = [
  { step: 0, train: 3.9, heldOut: 3.9 },
  { step: 20, train: 2.1, heldOut: 2.6 },
  { step: 40, train: 0.7, heldOut: 2.3 },
];

describe("replayCurve", () => {
  test("wraps curve points into a valid run record", () => {
    const result = replayCurve(POINTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { record } = result;
    assertRunRecordInvariants(record);
    expect(record.engine).toBe("curve-replay");
    expect(record.steps).toHaveLength(2);
    expect(record.initial).toEqual({
      step: 0,
      train: 3.9,
      heldOut: 3.9,
      gap: 0,
    });
    expect(record.final.gap).toBeCloseTo(1.6, 12);
    const last = record.steps[1];
    expect(last?.event).toEqual({
      kind: "sample",
      step: 40,
      train: 0.7,
      heldOut: 2.3,
    });
  });

  test("rejects fewer than two points", () => {
    const result = replayCurve([POINTS[0] as CurvePoint]);
    expect(result.ok).toBe(false);
  });

  test("rejects non-increasing steps and non-finite losses", () => {
    const backwards = replayCurve([
      { step: 0, train: 3, heldOut: 3 },
      { step: 0, train: 2, heldOut: 3 },
    ]);
    expect(backwards.ok).toBe(false);
    const broken = replayCurve([
      { step: 0, train: 3, heldOut: 3 },
      { step: 20, train: Number.NaN, heldOut: 3 },
    ]);
    expect(broken.ok).toBe(false);
  });
});
