import { writeFileSync } from "node:fs";
import { mulberry32, randInt } from "../../src/engine/random";
import { buildTokenizer } from "../../src/engine/tokenizer";
import { Tensor } from "../../src/engine/tensor";
import {
  createModel,
  forward,
  trainStep,
  type TransformerConfig,
} from "../../src/engine/transformer";
import { generateCorpus } from "../corpora/coref";

const SEED = 64;
const TRAIN_LINES = 24; // deliberately starved so the model memorizes
const STEPS = 1200;
const LEARNING_RATE = 0.1;
const SAMPLE_EVERY = 20;

const corpus = generateCorpus(SEED);
const tokenizer = buildTokenizer(
  [...corpus.train, ...corpus.heldOut].map((item) => item.text),
);
const config: TransformerConfig = {
  vocabSize: tokenizer.vocab.length,
  context: 24,
  dModel: 32,
  layers: 2,
  heads: 2,
  dHead: 16,
  mlpWidth: 128,
};

const rng = mulberry32(SEED);
const model = createModel(config, rng);
const tinyTrain = corpus.train
  .slice(0, TRAIN_LINES)
  .map((item) => tokenizer.encode(item.text));
const heldOut = corpus.heldOut
  .slice(0, 100)
  .map((item) => tokenizer.encode(item.text));

function meanLoss(sequences: number[][]): number {
  let total = 0;
  for (const sequence of sequences) {
    const inputs = sequence.slice(0, -1);
    const targets = sequence.slice(1);
    const { logits } = forward(model, inputs);
    total += Tensor.crossEntropyMean(logits, targets).data[0] as number;
  }
  return total / sequences.length;
}

const curve: { step: number; train: number; heldOut: number }[] = [];
for (let step = 0; step < STEPS; step += 1) {
  const batch: number[][] = [];
  for (let b = 0; b < 8; b += 1) {
    batch.push(tinyTrain[randInt(rng, tinyTrain.length)] as number[]);
  }
  trainStep(model, batch, LEARNING_RATE);
  if (step % SAMPLE_EVERY === 0) {
    curve.push({
      step,
      train: meanLoss(tinyTrain),
      heldOut: meanLoss(heldOut),
    });
  }
}
curve.push({
  step: STEPS,
  train: meanLoss(tinyTrain),
  heldOut: meanLoss(heldOut),
});
writeFileSync(
  "models/weights/curves.json",
  JSON.stringify({ SEED, TRAIN_LINES, curve }, null, 2),
);
const last = curve[curve.length - 1];
console.log("final:", JSON.stringify(last));
