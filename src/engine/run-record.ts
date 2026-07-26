/*
 * The shared engine contract. Every engine takes typed state in and returns
 * a typed run record whose steps carry before and after state, so the
 * animation layer and the evidence surface read the same data and cannot
 * disagree. Engines are total over learner input: invalid input produces an
 * EngineProblem in plain language, never a throw.
 */

export type EngineProblem = {
  what: string;
  fix: string;
};

export type EngineResult<TRecord> =
  | { ok: true; record: TRecord }
  | { ok: false; problem: EngineProblem };

export type EngineStep<TState, TEvent> = {
  index: number;
  event: TEvent;
  before: TState;
  after: TState;
};

export type RunRecord<TConfig, TState, TEvent> = {
  engine: string;
  seed: number;
  config: TConfig;
  initial: TState;
  final: TState;
  steps: EngineStep<TState, TEvent>[];
};

export function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function assertPlainData(value: unknown, path: string): void {
  if (value === null) return;
  const kind = typeof value;
  if (kind === "boolean" || kind === "string") return;
  if (kind === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} is not a finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertPlainData(item, `${path}[${i}]`));
    return;
  }
  if (kind === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`${path} is not a plain object`);
    }
    for (const [key, item] of Object.entries(value as object)) {
      assertPlainData(item, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} has non-serializable type ${kind}`);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function assertRunRecordInvariants(
  record: RunRecord<unknown, unknown, unknown>,
): void {
  assertPlainData(record, "record");
  const { steps } = record;
  if (steps.length === 0) {
    if (!sameJson(record.initial, record.final)) {
      throw new Error("empty run: final state must equal initial state");
    }
    return;
  }
  if (!sameJson(steps[0]?.before, record.initial)) {
    throw new Error("step 0 before-state must equal the initial state");
  }
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) throw new Error(`step ${i} is missing`);
    if (step.index !== i) {
      throw new Error(`step ${i} carries index ${step.index}`);
    }
    if (i > 0 && !sameJson(steps[i - 1]?.after, step.before)) {
      throw new Error(`step ${i} before-state does not chain from step ${i - 1}`);
    }
  }
  if (!sameJson(steps[steps.length - 1]?.after, record.final)) {
    throw new Error("final state must equal the last step's after-state");
  }
}
