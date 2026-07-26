import { describe, expect, test } from "vitest";
import { mulberry32 } from "./random";
import { buildTokenizer } from "./tokenizer";
import { createModel, type TransformerConfig } from "./transformer";
import { assertRunRecordInvariants } from "./run-record";
import { runTokenMachine, type TokenMachineConfig } from "./token-machine";

const corpusLines = [
  "emma called the plumber",
  "leo asked the doctor",
  "the plumber called emma",
];
const tokenizer = buildTokenizer(corpusLines);
const config: TransformerConfig = {
  vocabSize: tokenizer.vocab.length,
  context: 8,
  dModel: 16,
  layers: 1,
  heads: 1,
  dHead: 16,
  mlpWidth: 32,
};
const model = createModel(config, mulberry32(7));

function machineConfig(
  overrides: Partial<TokenMachineConfig> = {},
): TokenMachineConfig {
  return {
    prompt: "emma called the",
    maxNewTokens: 3,
    sampling: { temperature: 0.8, topK: 4 },
    seed: 64,
    ...overrides,
  };
}

describe("runTokenMachine", () => {
  test("produces a valid run record with one step per generated token", () => {
    const result = runTokenMachine(model, tokenizer, machineConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { record } = result;
    assertRunRecordInvariants(record);
    expect(record.engine).toBe("token-machine");
    expect(record.steps).toHaveLength(3);
    expect(record.final.done).toBe(true);
    expect(record.final.reason).toBe("max-tokens");
    expect(record.final.tokenIds).toHaveLength(3 + 3);
    for (const step of record.steps) {
      expect(step.event.candidates).toHaveLength(tokenizer.vocab.length);
      const winner = step.event.candidates.find(
        (c) => c.tokenId === step.event.sampledId,
      );
      expect(winner?.survived).toBe(true);
      expect(step.after.tokenIds).toEqual([
        ...step.before.tokenIds,
        step.event.sampledId,
      ]);
    }
  });

  test("is deterministic under a seed", () => {
    const a = runTokenMachine(model, tokenizer, machineConfig());
    const b = runTokenMachine(model, tokenizer, machineConfig());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
    }
  });

  test("different seeds may diverge but stay valid", () => {
    const result = runTokenMachine(
      model,
      tokenizer,
      machineConfig({ seed: 65 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) assertRunRecordInvariants(result.record);
  });

  test("stops with context-full when the window fills", () => {
    const result = runTokenMachine(
      model,
      tokenizer,
      machineConfig({ maxNewTokens: 50 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.final.reason).toBe("context-full");
    expect(result.record.final.tokenIds.length).toBe(config.context);
  });

  test("rejects an empty prompt with a plain-language problem", () => {
    const result = runTokenMachine(
      model,
      tokenizer,
      machineConfig({ prompt: "   " }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.what.toLowerCase()).toContain("empty");
      expect(result.problem.fix.length).toBeGreaterThan(0);
    }
  });

  test("rejects unknown words and names them", () => {
    const result = runTokenMachine(
      model,
      tokenizer,
      machineConfig({ prompt: "emma phoned zelda" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.what).toContain("phoned");
      expect(result.problem.what).toContain("zelda");
    }
  });

  test("rejects a prompt that already fills the context window", () => {
    const longPrompt = Array.from({ length: 8 }, () => "the").join(" ");
    const result = runTokenMachine(
      model,
      tokenizer,
      machineConfig({ prompt: longPrompt }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.what).toContain("8");
    }
  });

  test("rejects invalid generation and sampling settings without throwing", () => {
    const bad: Partial<TokenMachineConfig>[] = [
      { maxNewTokens: 0 },
      { maxNewTokens: 2.5 },
      { sampling: { temperature: -1 } },
      { sampling: { temperature: 1, topK: 0 } },
      { sampling: { temperature: 1, topP: 0 } },
      { sampling: { temperature: 1, topP: 1.5 } },
      { sampling: { temperature: Number.NaN } },
    ];
    for (const overrides of bad) {
      const result = runTokenMachine(
        model,
        tokenizer,
        machineConfig(overrides),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problem.what.length).toBeGreaterThan(0);
        expect(result.problem.fix.length).toBeGreaterThan(0);
      }
    }
  });

  test("rejects a tokenizer and model with mismatched vocabulary sizes", () => {
    const other = buildTokenizer(["completely different words here"]);
    const result = runTokenMachine(model, other, {
      prompt: "different words",
      maxNewTokens: 1,
      sampling: { temperature: 1 },
      seed: 1,
    });
    expect(result.ok).toBe(false);
  });
});
