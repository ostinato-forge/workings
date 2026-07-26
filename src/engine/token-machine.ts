import { mulberry32 } from "./random";
import {
  sampleDescribed,
  type SamplingConfig,
} from "./sampling";
import type { TokenizerLike } from "./tokenizer";
import { forward, type TransformerModel } from "./transformer";
import {
  snapshot,
  type EngineResult,
  type RunRecord,
} from "./run-record";

export type TokenMachineConfig = {
  prompt: string;
  maxNewTokens: number;
  sampling: SamplingConfig;
  seed: number;
};

export type TokenMachineState = {
  tokenIds: number[];
  text: string;
  done: boolean;
  reason: "running" | "max-tokens" | "context-full";
};

export type CandidateRecord = {
  tokenId: number;
  token: string;
  logit: number;
  probFull: number;
  probSampled: number;
  survived: boolean;
};

export type TokenMachineEvent = {
  kind: "generate";
  candidates: CandidateRecord[];
  sampledId: number;
  sampledToken: string;
};

export type TokenMachineRecord = RunRecord<
  TokenMachineConfig,
  TokenMachineState,
  TokenMachineEvent
>;

function problem(what: string, fix: string): EngineResult<TokenMachineRecord> {
  return { ok: false, problem: { what, fix } };
}

function validateSampling(
  sampling: SamplingConfig,
): EngineResult<TokenMachineRecord> | null {
  if (!Number.isFinite(sampling.temperature) || sampling.temperature < 0) {
    return problem(
      "The temperature setting is not a usable number.",
      "Set temperature to 0 or any positive number. 0 always picks the top candidate.",
    );
  }
  if (
    sampling.topK !== undefined &&
    (!Number.isInteger(sampling.topK) || sampling.topK <= 0)
  ) {
    return problem(
      "The top-k setting must be a whole number of candidates, at least 1.",
      "Set top-k to a positive whole number, or remove it to keep every candidate.",
    );
  }
  if (
    sampling.topP !== undefined &&
    !(sampling.topP > 0 && sampling.topP <= 1)
  ) {
    return problem(
      "The top-p setting must be a probability above 0 and at most 1.",
      "Set top-p between 0 and 1, or remove it to keep every candidate.",
    );
  }
  return null;
}

export function runTokenMachine(
  model: TransformerModel,
  tokenizer: TokenizerLike,
  config: TokenMachineConfig,
): EngineResult<TokenMachineRecord> {
  if (tokenizer.vocab.length !== model.config.vocabSize) {
    return problem(
      `This tokenizer has ${tokenizer.vocab.length} tokens but the model expects ${model.config.vocabSize}.`,
      "Load the tokenizer that was built alongside this model's weights.",
    );
  }
  if (config.prompt.trim().length === 0) {
    return problem(
      "The prompt is empty.",
      "Type at least one token the model knows before running.",
    );
  }
  const encoded = tokenizer.tryEncode(config.prompt);
  if (!encoded.ok) {
    return problem(
      `The model does not know these tokens: ${encoded.unknown.join(", ")}.`,
      "Use tokens from the model's vocabulary. The vocabulary list shows every token it knows.",
    );
  }
  if (encoded.ids.length === 0) {
    return problem(
      "The prompt is empty.",
      "Type at least one token the model knows before running.",
    );
  }
  if (
    !Number.isInteger(config.maxNewTokens) ||
    config.maxNewTokens <= 0
  ) {
    return problem(
      "The number of tokens to generate must be a whole number, at least 1.",
      "Set it to a positive whole number.",
    );
  }
  const samplingProblem = validateSampling(config.sampling);
  if (samplingProblem !== null) return samplingProblem;
  const contextSize = model.config.context;
  if (encoded.ids.length >= contextSize) {
    return problem(
      `The prompt already fills the model's context window of ${contextSize} tokens, so there is no room to generate.`,
      "Shorten the prompt to leave space for new tokens.",
    );
  }

  const rng = mulberry32(config.seed);
  let tokenIds = [...encoded.ids];
  const stateOf = (
    reason: TokenMachineState["reason"],
  ): TokenMachineState => ({
    tokenIds: [...tokenIds],
    text: tokenizer.decode(tokenIds),
    done: reason !== "running",
    reason,
  });

  const initial = snapshot(stateOf("running"));
  const steps: TokenMachineRecord["steps"] = [];
  let reason: TokenMachineState["reason"] = "running";

  for (let generated = 0; generated < config.maxNewTokens; generated += 1) {
    const before = snapshot(stateOf("running"));
    const { logits } = forward(model, tokenIds);
    const lastRow = tokenIds.length - 1;
    const rowLogits: number[] = [];
    for (let column = 0; column < model.config.vocabSize; column += 1) {
      rowLogits.push(logits.at(lastRow, column));
    }
    const described = sampleDescribed(rowLogits, config.sampling, rng);
    const candidates: CandidateRecord[] = described.candidates.map((c) => ({
      tokenId: c.index,
      token: tokenizer.vocab[c.index] as string,
      logit: c.logit,
      probFull: c.probFull,
      probSampled: c.probSampled,
      survived: c.survived,
    }));
    tokenIds = [...tokenIds, described.sampledIndex];
    const stepReason: TokenMachineState["reason"] =
      generated + 1 === config.maxNewTokens
        ? "max-tokens"
        : tokenIds.length >= contextSize
          ? "context-full"
          : "running";
    steps.push({
      index: steps.length,
      event: {
        kind: "generate",
        candidates,
        sampledId: described.sampledIndex,
        sampledToken: tokenizer.vocab[described.sampledIndex] as string,
      },
      before,
      after: snapshot(stateOf(stepReason)),
    });
    if (stepReason !== "running") {
      reason = stepReason;
      break;
    }
  }

  const record: TokenMachineRecord = {
    engine: "token-machine",
    seed: config.seed,
    config: snapshot(config),
    initial,
    final: snapshot(stateOf(reason)),
    steps,
  };
  return { ok: true, record };
}
