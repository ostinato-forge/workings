import { describe, expect, test } from "vitest";
import {
  assertPlainData,
  assertRunRecordInvariants,
  snapshot,
  type RunRecord,
} from "./run-record";

type CounterState = { value: number };
type CounterEvent = { kind: "add"; amount: number };

function counterRecord(): RunRecord<{ start: number }, CounterState, CounterEvent> {
  const steps = [];
  let state: CounterState = { value: 3 };
  const initial = snapshot(state);
  for (const amount of [2, 5]) {
    const before = snapshot(state);
    state = { value: state.value + amount };
    steps.push({
      index: steps.length,
      event: { kind: "add" as const, amount },
      before,
      after: snapshot(state),
    });
  }
  return {
    engine: "counter",
    seed: 0,
    config: { start: 3 },
    initial,
    final: snapshot(state),
    steps,
  };
}

describe("assertPlainData", () => {
  test("accepts plain JSON data", () => {
    expect(() =>
      assertPlainData({ a: [1, "x", null, { b: true }] }, "root"),
    ).not.toThrow();
  });

  test("rejects non-finite numbers", () => {
    expect(() => assertPlainData({ a: Number.NaN }, "root")).toThrow(/root\.a/);
    expect(() => assertPlainData([Infinity], "root")).toThrow(/root\[0\]/);
  });

  test("rejects undefined, functions, and class instances", () => {
    expect(() => assertPlainData({ a: undefined }, "root")).toThrow(/root\.a/);
    expect(() => assertPlainData({ a: () => 1 }, "root")).toThrow(/root\.a/);
    expect(() => assertPlainData(new Map(), "root")).toThrow(/root/);
  });
});

describe("assertRunRecordInvariants", () => {
  test("accepts a well-formed record", () => {
    expect(() => assertRunRecordInvariants(counterRecord())).not.toThrow();
  });

  test("accepts an empty run where initial equals final", () => {
    const record = counterRecord();
    record.steps = [];
    record.final = snapshot(record.initial);
    expect(() => assertRunRecordInvariants(record)).not.toThrow();
  });

  test("rejects a broken before/after chain", () => {
    const record = counterRecord();
    (record.steps[1] as { before: CounterState }).before = { value: 999 };
    expect(() => assertRunRecordInvariants(record)).toThrow(/step 1/);
  });

  test("rejects a final state that does not match the last step", () => {
    const record = counterRecord();
    record.final = { value: 999 };
    expect(() => assertRunRecordInvariants(record)).toThrow(/final/);
  });

  test("rejects wrong step indexes", () => {
    const record = counterRecord();
    (record.steps[1] as { index: number }).index = 7;
    expect(() => assertRunRecordInvariants(record)).toThrow(/index/);
  });

  test("rejects records that are not plain data", () => {
    const record = counterRecord();
    (record.final as { value: number }).value = Number.NaN;
    expect(() => assertRunRecordInvariants(record)).toThrow(/finite/);
  });
});

describe("snapshot", () => {
  test("returns a deep copy", () => {
    const source = { a: { b: 1 } };
    const copy = snapshot(source);
    copy.a.b = 2;
    expect(source.a.b).toBe(1);
  });
});
