import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mulberry32, randInt } from "../../src/engine/random";
import { buildTokenizer } from "../../src/engine/tokenizer";
import {
  createModel,
  deserialize,
  serialize,
  trainStep,
  type TransformerConfig,
} from "../../src/engine/transformer";
import { generateCorpus } from "../corpora/coref";
import { evaluateCoref } from "./evaluate-coref";

const SEED = 64;
const STEPS = 6000;
const BATCH = 16;
const LEARNING_RATE = 0.5;
const MAX_GRAD_NORM = 1.0;

const config: TransformerConfig = {
  vocabSize: 0,
  context: 24,
  dModel: 48,
  layers: 1,
  heads: 1,
  dHead: 48,
  mlpWidth: 128,
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const corpus = generateCorpus(SEED);
const tokenizer = buildTokenizer(
  [...corpus.train, ...corpus.heldOut].map((item) => item.text),
);
config.vocabSize = tokenizer.vocab.length;

const rng = mulberry32(SEED);
const model = createModel(config, rng);
const encodedTrain = corpus.train.map((item) => tokenizer.encode(item.text));

let lastLoss = 0;
for (let step = 0; step < STEPS; step += 1) {
  const batch: number[][] = [];
  for (let b = 0; b < BATCH; b += 1) {
    batch.push(encodedTrain[randInt(rng, encodedTrain.length)] as number[]);
  }
  lastLoss = trainStep(model, batch, LEARNING_RATE, MAX_GRAD_NORM);
  if (step % 250 === 0) {
    console.log(`step ${step} loss ${lastLoss.toFixed(4)}`);
  }
}

const json = serialize(model);
const shipped = deserialize(json);
const weightsJson = JSON.stringify(json);

const metrics = evaluateCoref(
  shipped,
  tokenizer,
  corpus.train,
  corpus.heldOut,
  SEED,
);
console.log(JSON.stringify(metrics, null, 2));

mkdirSync("models/weights", { recursive: true });
writeFileSync("models/weights/coref.json", weightsJson);
writeFileSync(
  "models/weights/coref-manifest.json",
  JSON.stringify(
    {
      seed: SEED,
      nodeVersion: process.version,
      arch: process.arch,
      steps: STEPS,
      batch: BATCH,
      learningRate: LEARNING_RATE,
      maxGradNorm: MAX_GRAD_NORM,
      config,
      vocabSize: tokenizer.vocab.length,
      weightsHash: sha256(weightsJson),
      metrics,
    },
    null,
    2,
  ),
);
console.log("wrote models/weights/coref.json and manifest");
