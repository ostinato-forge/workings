export type Rng = () => number;

/*
 * Stream-stability contract: the exact numeric sequence this generator
 * produces for a given seed is a committed artifact. Trained model weights
 * and CI reproducibility checks derive from it. Do not change the algorithm,
 * constants, or arithmetic, even for rewrites that look equivalent. Any
 * change to the stream is a breaking change and requires regeneration of
 * all stored artifacts.
 *
 * mulberry32 by Tommy Ettinger, public domain.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Bias note: floor(rng() * n) is bias-free when n divides 2^32. Otherwise
 * each outcome's probability deviates from 1/n by at most 2^-32, a relative
 * error on the order of n / 2^32, which is sufficient for this project's
 * shuffling and sampling.
 */
export function randInt(rng: Rng, exclusiveMax: number): number {
  return Math.floor(rng() * exclusiveMax);
}

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1);
    const a = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = a;
  }
  return copy;
}

/*
 * One seeded draw over an explicit probability list. Zero-probability
 * entries can never win, including when the rng returns exactly 0. The
 * caller is responsible for probabilities that sum to 1; residue from
 * floating-point accumulation falls to the last index.
 */
export function drawIndex(rng: Rng, probs: readonly number[]): number {
  let roll = rng();
  for (let i = 0; i < probs.length; i += 1) {
    roll -= probs[i] as number;
    if ((probs[i] as number) > 0 && roll <= 0) return i;
  }
  return probs.length - 1;
}
