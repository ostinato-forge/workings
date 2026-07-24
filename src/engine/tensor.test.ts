import { expect, test } from "vitest";
import { Tensor } from "./tensor";
import { mulberry32 } from "./random";

function randomTensor(rows: number, cols: number, seed: number): Tensor {
  const rng = mulberry32(seed);
  const t = Tensor.zeros(rows, cols);
  for (let i = 0; i < t.data.length; i += 1) t.data[i] = rng() * 2 - 1;
  return t;
}

/**
 * Central-difference gradcheck: f builds a scalar-producing graph from the
 * given leaf tensors. Verifies autograd grads on every leaf element.
 */
function gradcheck(
  leaves: Tensor[],
  f: (leaves: Tensor[]) => Tensor,
  tolerance = 1e-4,
): void {
  const out = f(leaves);
  expect(out.rows * out.cols).toBe(1);
  out.backward();
  const analytic = leaves.map((leaf) => Float64Array.from(leaf.grad));
  const eps = 1e-5;
  leaves.forEach((leaf, leafIndex) => {
    for (let i = 0; i < leaf.data.length; i += 1) {
      const saved = leaf.data[i] as number;
      leaf.data[i] = saved + eps;
      const up = f(leaves).data[0] as number;
      leaf.data[i] = saved - eps;
      const down = f(leaves).data[0] as number;
      leaf.data[i] = saved;
      const numeric = (up - down) / (2 * eps);
      const got = (analytic[leafIndex] as Float64Array)[i] as number;
      expect(Math.abs(got - numeric)).toBeLessThan(tolerance);
    }
  });
}

test("matmul gradients", () => {
  const a = randomTensor(3, 4, 1);
  const b = randomTensor(4, 2, 2);
  gradcheck([a, b], ([x, y]) => (x as Tensor).matmul(y as Tensor).sum());
});

test("add with row broadcast gradients", () => {
  const a = randomTensor(3, 4, 3);
  const bias = randomTensor(1, 4, 4);
  gradcheck([a, bias], ([x, y]) => (x as Tensor).add(y as Tensor).sum());
});

test("relu gradients", () => {
  const a = randomTensor(3, 4, 5);
  gradcheck([a], ([x]) => (x as Tensor).relu().mulScalar(3).sum());
});

test("scale and elementwise-multiply gradients", () => {
  const a = randomTensor(2, 3, 6);
  const b = randomTensor(2, 3, 7);
  gradcheck([a, b], ([x, y]) => (x as Tensor).mul(y as Tensor).sum());
});

test("row softmax sums to one and matches gradcheck through a dot", () => {
  const a = randomTensor(2, 5, 8);
  const probs = a.softmaxRows();
  for (let r = 0; r < 2; r += 1) {
    let total = 0;
    for (let c = 0; c < 5; c += 1) total += probs.at(r, c);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  }
  const w = randomTensor(2, 5, 9);
  gradcheck([a], ([x]) => (x as Tensor).softmaxRows().mul(w).sum());
});

test("causal mask zeroes attention to future positions", () => {
  const scores = randomTensor(4, 4, 10);
  const probs = scores.softmaxRows({ causal: true });
  for (let r = 0; r < 4; r += 1) {
    for (let c = r + 1; c < 4; c += 1) {
      expect(probs.at(r, c)).toBe(0);
    }
  }
});

test("cross entropy decreases when the true class logit rises", () => {
  const logits = Tensor.zeros(1, 3);
  const low = Tensor.crossEntropyMean(logits, [2]).data[0] as number;
  logits.data[2] = 4;
  const high = Tensor.crossEntropyMean(logits, [2]).data[0] as number;
  expect(high).toBeLessThan(low);
});

test("cross entropy gradients", () => {
  const logits = randomTensor(3, 5, 11);
  gradcheck([logits], ([x]) =>
    Tensor.crossEntropyMean(x as Tensor, [1, 4, 0]),
  );
});

test("gather rows gradients accumulate to the embedding table", () => {
  const table = randomTensor(6, 4, 12);
  gradcheck([table], ([t]) =>
    Tensor.gatherRows(t as Tensor, [1, 3, 1]).sum(),
  );
});

test("transpose gradients", () => {
  const a = randomTensor(3, 4, 13);
  const b = randomTensor(3, 2, 14);
  gradcheck([a, b], ([x, y]) =>
    (x as Tensor).transpose().matmul(y as Tensor).sum(),
  );
});
