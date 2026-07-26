import type { Rng } from "./random";

export type SamplingConfig = {
  temperature: number;
  topK?: number;
  topP?: number;
};

export type SamplingCandidate = {
  index: number;
  logit: number;
  probFull: number;
  probSampled: number;
  survived: boolean;
};

export type DescribedSample = {
  candidates: SamplingCandidate[];
  sampledIndex: number;
};

export function sampleDescribed(
  logits: readonly number[],
  config: SamplingConfig,
  rng: Rng,
): DescribedSample {
  if (logits.length === 0) throw new Error("no logits to sample");
  if (!Number.isFinite(config.temperature) || config.temperature < 0) {
    throw new Error("temperature must be a finite non-negative number");
  }
  if (
    config.topK !== undefined &&
    (!Number.isInteger(config.topK) || config.topK <= 0)
  ) {
    throw new Error("topK must be a positive integer");
  }
  if (config.topP !== undefined && !(config.topP > 0 && config.topP <= 1)) {
    throw new Error("topP must be greater than 0 and at most 1");
  }
  const indexed = logits.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => b.value - a.value);

  if (config.temperature === 0) {
    const winner = (indexed[0] as { index: number }).index;
    const candidates = indexed.map(({ value, index }, rank) => ({
      index,
      logit: value,
      probFull: rank === 0 ? 1 : 0,
      probSampled: rank === 0 ? 1 : 0,
      survived: rank === 0,
    }));
    return { candidates, sampledIndex: winner };
  }

  // probFull: temperature-shaped softmax over every candidate. Additive
  // instrumentation only; the draw path below must not read these values.
  const maxAll = (indexed[0] as { value: number }).value;
  let denomFull = 0;
  const weightsFull = indexed.map(({ value }) => {
    const w = Math.exp((value - maxAll) / config.temperature);
    denomFull += w;
    return w;
  });
  const probFullByRank = weightsFull.map((w) => w / denomFull);

  // Draw path: byte-for-byte the arithmetic of the original sampler.
  let candidates = indexed;
  if (config.topK !== undefined) {
    candidates = candidates.slice(0, Math.max(1, config.topK));
  }

  const max = (candidates[0] as { value: number }).value;
  let denom = 0;
  const weights = candidates.map(({ value }) => {
    const w = Math.exp((value - max) / config.temperature);
    denom += w;
    return w;
  });
  let probs = weights.map((w) => w / denom);

  if (config.topP !== undefined) {
    let mass = 0;
    let cut = probs.length;
    for (let i = 0; i < probs.length; i += 1) {
      mass += probs[i] as number;
      if (mass >= config.topP) {
        cut = i + 1;
        break;
      }
    }
    candidates = candidates.slice(0, cut);
    const kept = probs.slice(0, cut);
    const keptMass = kept.reduce((s, p) => s + p, 0);
    probs = kept.map((p) => p / keptMass);
  }

  let roll = rng();
  let sampledIndex = (candidates[candidates.length - 1] as { index: number })
    .index;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= probs[i] as number;
    if (roll <= 0) {
      sampledIndex = (candidates[i] as { index: number }).index;
      break;
    }
  }

  const survivorCount = candidates.length;
  const described = indexed.map(({ value, index }, rank) => ({
    index,
    logit: value,
    probFull: probFullByRank[rank] as number,
    probSampled: rank < survivorCount ? (probs[rank] as number) : 0,
    survived: rank < survivorCount,
  }));
  return { candidates: described, sampledIndex };
}

export function sampleFromLogits(
  logits: readonly number[],
  config: SamplingConfig,
  rng: Rng,
): number {
  return sampleDescribed(logits, config, rng).sampledIndex;
}
