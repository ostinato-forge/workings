import { expect, test } from "vitest";
import { mulberry32 } from "./random";
import { createModel, forward, trainStep, serialize, deserialize } from "./transformer";

const config = {
  vocabSize: 11,
  context: 8,
  dModel: 16,
  layers: 2,
  heads: 2,
  dHead: 8,
  mlpWidth: 32,
};

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

test("serialize and deserialize round-trip behavior exactly", () => {
  const model = createModel(config, mulberry32(64));
  const json = serialize(model);
  const restored = deserialize(json);
  const a = forward(model, [2, 9, 4]).logits;
  const b = forward(restored, [2, 9, 4]).logits;
  expect([...b.data]).toEqual([...a.data]);
  expect(JSON.stringify(serialize(restored))).toBe(JSON.stringify(json));
});
