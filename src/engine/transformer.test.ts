import { expect, test } from "vitest";
import { mulberry32 } from "./random";
import {
  createModel,
  deserialize,
  forward,
  parameters,
  serialize,
  trainStep,
} from "./transformer";

const config = {
  vocabSize: 11,
  context: 8,
  dModel: 16,
  layers: 2,
  heads: 2,
  dHead: 8,
  mlpWidth: 32,
};

function parameterSnapshot(model: ReturnType<typeof createModel>): number[][] {
  return parameters(model).map((parameter) => [...parameter.data]);
}

function updateNorm(
  before: number[][],
  model: ReturnType<typeof createModel>,
): number {
  let squaredNorm = 0;
  parameters(model).forEach((parameter, parameterIndex) => {
    const initial = before[parameterIndex] as number[];
    for (let i = 0; i < parameter.data.length; i += 1) {
      const update = (parameter.data[i] as number) - (initial[i] as number);
      squaredNorm += update * update;
    }
  });
  return Math.sqrt(squaredNorm);
}

test("forward emits one logit row per input token and attention maps", () => {
  const model = createModel(config, mulberry32(64));
  const out = forward(model, [1, 4, 2, 7]);
  expect(out.logits.rows).toBe(4);
  expect(out.logits.cols).toBe(11);
  expect(out.attentions.length).toBe(2);
  expect(out.attentions[0]?.length).toBe(2);
  const map = out.attentions[1]?.[0];
  expect(map?.rows).toBe(4);
  const rowSum = (map?.at(3, 0) ?? 0) + (map?.at(3, 1) ?? 0) +
    (map?.at(3, 2) ?? 0) + (map?.at(3, 3) ?? 0);
  expect(Math.abs(rowSum - 1)).toBeLessThan(1e-9);
});

test("forward is deterministic for a fixed model", () => {
  const model = createModel(config, mulberry32(64));
  const a = forward(model, [3, 1, 5]).logits;
  const b = forward(model, [3, 1, 5]).logits;
  expect([...a.data]).toEqual([...b.data]);
});

test("training reduces loss on a repeated pattern", () => {
  const model = createModel(config, mulberry32(64));
  const sequence = [1, 2, 3, 1, 2, 3, 1, 2];
  const first = trainStep(model, [sequence], 0.05);
  let last = first;
  for (let i = 0; i < 60; i += 1) {
    last = trainStep(model, [sequence], 0.05);
  }
  expect(last).toBeLessThan(first * 0.5);
});

test("trainStep clips the global mean-gradient norm to the cap", () => {
  const sequence = [1, 2, 3, 1, 2, 3, 1, 2];
  const cap = 0.01;
  const unclipped = createModel(config, mulberry32(64));
  const clipped = createModel(config, mulberry32(64));
  const unclippedBefore = parameterSnapshot(unclipped);
  const clippedBefore = parameterSnapshot(clipped);

  trainStep(unclipped, [sequence], 1, Number.MAX_VALUE);
  trainStep(clipped, [sequence], 1, cap);

  expect(updateNorm(unclippedBefore, unclipped)).toBeGreaterThan(cap);
  expect(updateNorm(clippedBefore, clipped)).toBeCloseTo(cap, 10);
});

test("trainStep leaves gradients under the cap unchanged", () => {
  const sequence = [1, 2, 3, 1, 2, 3, 1, 2];
  const uncapped = createModel(config, mulberry32(64));
  const underCap = createModel(config, mulberry32(64));
  const before = parameterSnapshot(uncapped);
  const cap = 100;

  trainStep(uncapped, [sequence], 0.05, Number.MAX_VALUE);
  trainStep(underCap, [sequence], 0.05, cap);

  expect(updateNorm(before, uncapped)).toBeLessThan(cap * 0.05);
  expect(parameterSnapshot(underCap)).toEqual(parameterSnapshot(uncapped));
});

test("trainStep rejects an empty batch without changing parameters", () => {
  const model = createModel(config, mulberry32(64));
  const before = parameters(model).map((p) => [...p.data]);
  expect(() => trainStep(model, [], 0.05)).toThrow(
    "batch must contain at least one sequence",
  );
  expect(parameters(model).map((p) => [...p.data])).toEqual(before);
});

test("trainStep rejects short sequences without changing parameters", () => {
  const model = createModel(config, mulberry32(64));
  const before = parameters(model).map((p) => [...p.data]);
  expect(() => trainStep(model, [[1, 2], [3]], 0.05)).toThrow(
    "each sequence must contain at least two tokens",
  );
  expect(parameters(model).map((p) => [...p.data])).toEqual(before);
});

test("serialize and deserialize round-trip behavior exactly", () => {
  const model = createModel(config, mulberry32(64));
  const first = deserialize(serialize(model));
  const second = deserialize(serialize(model));
  const a = forward(first, [2, 9, 4]).logits;
  const b = forward(second, [2, 9, 4]).logits;
  expect([...b.data]).toEqual([...a.data]);
});

test("serialize leaves model forward output bit-identical", () => {
  const model = createModel(config, mulberry32(64));
  const before = [...forward(model, [2, 9, 4]).logits.data];
  serialize(model);
  const after = [...forward(model, [2, 9, 4]).logits.data];
  expect(after).toEqual(before);
});

test("serialized config does not alias model config", () => {
  const model = createModel(config, mulberry32(64));
  const json = serialize(model);
  json.config.dModel = 999;
  expect(model.config.dModel).toBe(config.dModel);
});

test("serialized model is canonical after deserialization", () => {
  const model = createModel(config, mulberry32(64));
  const json = serialize(model);
  expect(serialize(deserialize(json))).toEqual(json);
});
