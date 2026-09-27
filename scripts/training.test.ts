import { expect, test } from "vitest";
import { briefMetadata, providerUsage } from "./training";

test("a malformed brief cannot trigger paid generation", () => {
  expect(() => briefMetadata("Write a lesson about tools")).toThrow(/front matter/);
  expect(() => briefMetadata("---\nformat: 1\nid: ../../escape\n---\n")).toThrow();
  expect(() => briefMetadata("---\nformat: 1\nengine: agent-loop/1\ntopic: tools\naudience: Learners\nobjective: Build a loop\n---\n")).toThrow();
});

test("missing spend data cannot become a zero-cost successful generation", () => {
  expect(() => providerUsage({ usage: { input_tokens: 20, output_tokens: 10 } })).toThrow(/unknown/);
  expect(() => providerUsage({ total_cost_usd: 0.1 })).toThrow(/unknown/);
  expect(() => providerUsage({ usage: { input_tokens: 20, output_tokens: 10 }, total_cost_usd: 0.1 })).toThrow(/identity/);
  expect(providerUsage({ usage: { input_tokens: 20, output_tokens: 10, cache_read_input_tokens: 30 }, total_cost_usd: 0.1, modelUsage: { model: {} } })).toEqual({ tokens: 60, estimatedUsd: 0.1, models: ["model"] });
});
