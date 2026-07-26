import {
  snapshot,
  type EngineResult,
  type RunRecord,
} from "./run-record";

export type CurvePoint = { step: number; train: number; heldOut: number };

export type CurveState = {
  step: number;
  train: number;
  heldOut: number;
  gap: number;
};

export type CurveEvent = {
  kind: "sample";
  step: number;
  train: number;
  heldOut: number;
};

export type CurveRecord = RunRecord<
  { points: number },
  CurveState,
  CurveEvent
>;

function stateOf(point: CurvePoint): CurveState {
  return {
    step: point.step,
    train: point.train,
    heldOut: point.heldOut,
    gap: point.heldOut - point.train,
  };
}

export function replayCurve(
  points: readonly CurvePoint[],
): EngineResult<CurveRecord> {
  if (points.length < 2) {
    return {
      ok: false,
      problem: {
        what: "A loss curve needs at least two sampled points to replay.",
        fix: "Provide the full sampled curve from the training run.",
      },
    };
  }
  for (const [i, point] of points.entries()) {
    if (
      !Number.isFinite(point.step) ||
      !Number.isFinite(point.train) ||
      !Number.isFinite(point.heldOut)
    ) {
      return {
        ok: false,
        problem: {
          what: `Curve point ${i} contains a value that is not a finite number.`,
          fix: "Re-export the curve from the training run without editing it.",
        },
      };
    }
    if (i > 0 && point.step <= (points[i - 1] as CurvePoint).step) {
      return {
        ok: false,
        problem: {
          what: `Curve steps must increase, but point ${i} does not advance.`,
          fix: "Keep the curve in training order without duplicate steps.",
        },
      };
    }
  }

  let state = stateOf(points[0] as CurvePoint);
  const initial = snapshot(state);
  const steps: CurveRecord["steps"] = [];
  for (const point of points.slice(1)) {
    const before = snapshot(state);
    state = stateOf(point);
    steps.push({
      index: steps.length,
      event: {
        kind: "sample",
        step: point.step,
        train: point.train,
        heldOut: point.heldOut,
      },
      before,
      after: snapshot(state),
    });
  }
  return {
    ok: true,
    record: {
      engine: "curve-replay",
      seed: 0,
      config: { points: points.length },
      initial,
      final: snapshot(state),
      steps,
    },
  };
}
