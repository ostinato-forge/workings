import type { Rng } from "./random";

export type SamplingConfig = {
  temperature: number;
  topK?: number;
  topP?: number;
};

export function sampleFromLogits(
  logits: readonly number[],
  config: SamplingConfig,
  rng: Rng,
): number {
  if (logits.length === 0) throw new Error("no logits to sample");
  const indexed = logits.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => b.value - a.value);

  if (config.temperature === 0) {
    return (indexed[0] as { index: number }).index;
  }

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
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= probs[i] as number;
    if (roll <= 0) return (candidates[i] as { index: number }).index;
  }
  return (candidates[candidates.length - 1] as { index: number }).index;
}
