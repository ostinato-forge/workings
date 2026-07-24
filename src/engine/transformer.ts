import { Tensor } from "./tensor";
import type { Rng } from "./random";

export type TransformerConfig = {
  vocabSize: number;
  context: number;
  dModel: number;
  layers: number;
  heads: number;
  dHead: number;
  mlpWidth: number;
};

type Head = { wq: Tensor; wk: Tensor; wv: Tensor; wo: Tensor };
type Layer = { heads: Head[]; mlpIn: Tensor; mlpInBias: Tensor; mlpOut: Tensor; mlpOutBias: Tensor };

export type TransformerModel = {
  config: TransformerConfig;
  tokenEmbedding: Tensor;
  positionEmbedding: Tensor;
  layers: Layer[];
  unembedding: Tensor;
};

export type ForwardResult = {
  logits: Tensor;
  /** attentions[layer][head] is a tokens-by-tokens causal attention map */
  attentions: Tensor[][];
};

function randomTensor(rows: number, cols: number, rng: Rng, scale: number): Tensor {
  const t = Tensor.zeros(rows, cols);
  for (let i = 0; i < t.data.length; i += 1) {
    t.data[i] = (rng() * 2 - 1) * scale;
  }
  return t;
}

export function createModel(config: TransformerConfig, rng: Rng): TransformerModel {
  const scale = 0.12;
  const layers: Layer[] = [];
  for (let l = 0; l < config.layers; l += 1) {
    const heads: Head[] = [];
    for (let h = 0; h < config.heads; h += 1) {
      heads.push({
        wq: randomTensor(config.dModel, config.dHead, rng, scale),
        wk: randomTensor(config.dModel, config.dHead, rng, scale),
        wv: randomTensor(config.dModel, config.dHead, rng, scale),
        wo: randomTensor(config.dHead, config.dModel, rng, scale),
      });
    }
    layers.push({
      heads,
      mlpIn: randomTensor(config.dModel, config.mlpWidth, rng, scale),
      mlpInBias: Tensor.zeros(1, config.mlpWidth),
      mlpOut: randomTensor(config.mlpWidth, config.dModel, rng, scale),
      mlpOutBias: Tensor.zeros(1, config.dModel),
    });
  }
  return {
    config,
    tokenEmbedding: randomTensor(config.vocabSize, config.dModel, rng, scale),
    positionEmbedding: randomTensor(config.context, config.dModel, rng, scale),
    layers,
    unembedding: randomTensor(config.dModel, config.vocabSize, rng, scale),
  };
}

export function parameters(model: TransformerModel): Tensor[] {
  const params = [model.tokenEmbedding, model.positionEmbedding, model.unembedding];
  for (const layer of model.layers) {
    for (const head of layer.heads) {
      params.push(head.wq, head.wk, head.wv, head.wo);
    }
    params.push(layer.mlpIn, layer.mlpInBias, layer.mlpOut, layer.mlpOutBias);
  }
  return params;
}

export function forward(model: TransformerModel, ids: number[]): ForwardResult {
  const { config } = model;
  if (ids.length > config.context) {
    throw new Error(`sequence exceeds context ${config.context}`);
  }
  const positions = ids.map((_, i) => i);
  let x = Tensor.gatherRows(model.tokenEmbedding, ids).add(
    Tensor.gatherRows(model.positionEmbedding, positions),
  );
  const attentions: Tensor[][] = [];
  const invSqrt = 1 / Math.sqrt(config.dHead);
  for (const layer of model.layers) {
    const layerMaps: Tensor[] = [];
    let attnSum: Tensor | null = null;
    for (const head of layer.heads) {
      const q = x.matmul(head.wq);
      const k = x.matmul(head.wk);
      const v = x.matmul(head.wv);
      const scores = q.matmul(k.transpose()).mulScalar(invSqrt);
      const probs = scores.softmaxRows({ causal: true });
      layerMaps.push(probs);
      const headOut = probs.matmul(v).matmul(head.wo);
      attnSum = attnSum === null ? headOut : attnSum.add(headOut);
    }
    x = x.add(attnSum as Tensor);
    const mlp = x
      .matmul(layer.mlpIn)
      .add(layer.mlpInBias)
      .relu()
      .matmul(layer.mlpOut)
      .add(layer.mlpOutBias);
    x = x.add(mlp);
    attentions.push(layerMaps);
  }
  return { logits: x.matmul(model.unembedding), attentions };
}

/** One SGD step over a batch of token sequences. Returns mean loss. */
export function trainStep(
  model: TransformerModel,
  batch: number[][],
  learningRate: number,
): number {
  if (batch.length === 0) {
    throw new Error("batch must contain at least one sequence");
  }
  if (batch.some((sequence) => sequence.length < 2)) {
    throw new Error("each sequence must contain at least two tokens");
  }
  const params = parameters(model);
  for (const p of params) p.zeroGrad();
  let lossTotal = 0;
  let count = 0;
  let batchLoss: Tensor | null = null;
  for (const sequence of batch) {
    const inputs = sequence.slice(0, -1);
    const targets = sequence.slice(1);
    const { logits } = forward(model, inputs);
    const loss = Tensor.crossEntropyMean(logits, targets);
    batchLoss = batchLoss === null ? loss : loss.add(batchLoss);
    lossTotal += loss.data[0] as number;
    count += 1;
  }
  (batchLoss as Tensor).backward();
  for (const p of params) {
    for (let i = 0; i < p.data.length; i += 1) {
      p.data[i] =
        (p.data[i] as number) -
        (learningRate * (p.grad[i] as number)) / count;
    }
  }
  return lossTotal / count;
}

type SerializedModel = { config: TransformerConfig; tensors: number[][] };

function roundFloat32(values: Float64Array): number[] {
  return [...Float32Array.from(values)];
}

export function serialize(model: TransformerModel): SerializedModel {
  return {
    config: structuredClone(model.config),
    tensors: parameters(model).map((p) => roundFloat32(p.data)),
  };
}

export function deserialize(json: SerializedModel): TransformerModel {
  const rngZero = () => 0;
  const model = createModel(json.config, rngZero);
  const params = parameters(model);
  if (params.length !== json.tensors.length) {
    throw new Error("weight count mismatch");
  }
  params.forEach((p, i) => {
    const values = json.tensors[i] as number[];
    if (values.length !== p.data.length) {
      throw new Error(`tensor ${i} size mismatch`);
    }
    // store at Float32 precision so serialize(deserialize(x)) is stable
    const rounded = Float32Array.from(values);
    for (let j = 0; j < p.data.length; j += 1) {
      p.data[j] = rounded[j] as number;
    }
  });
  return model;
}
