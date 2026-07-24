import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mulberry32, randInt } from "../../src/engine/random";
import { Tensor } from "../../src/engine/tensor";
import { buildTokenizer } from "../../src/engine/tokenizer";
import {
  createModel,
  deserialize,
  forward,
  serialize,
  trainStep,
  type TransformerConfig,
} from "../../src/engine/transformer";
import { FEMALE_NAMES, MALE_NAMES, generateCorpus } from "../corpora/coref";

const SEED = 64;
const STEPS = 3000;
const BATCH = 16;
const LEARNING_RATE = 0.5;

const config: TransformerConfig = {
  vocabSize: 0,
  context: 24,
  dModel: 32,
  layers: 2,
  heads: 2,
  dHead: 16,
  mlpWidth: 128,
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const corpus = generateCorpus(SEED);
const tokenizer = buildTokenizer([...corpus.train, ...corpus.heldOut]);
config.vocabSize = tokenizer.vocab.length;

const rng = mulberry32(SEED);
const model = createModel(config, rng);
const encodedTrain = corpus.train.map((line) => tokenizer.encode(line));

let lastLoss = 0;
let finalBatch: number[][] = [];
for (let step = 0; step < STEPS; step += 1) {
  const batch: number[][] = [];
  for (let b = 0; b < BATCH; b += 1) {
    batch.push(encodedTrain[randInt(rng, encodedTrain.length)] as number[]);
  }
  lastLoss = trainStep(model, batch, LEARNING_RATE);
  finalBatch = batch;
  if (step % 250 === 0) {
    console.log(`step ${step} loss ${lastLoss.toFixed(4)}`);
  }
}

const json = serialize(model);
const shipped = deserialize(json);
const weightsJson = JSON.stringify(json);

let finalLoss = 0;
for (const sequence of finalBatch) {
  const inputs = sequence.slice(0, -1);
  const targets = sequence.slice(1);
  const { logits } = forward(shipped, inputs);
  finalLoss += Tensor.crossEntropyMean(logits, targets).data[0] as number;
}
finalLoss /= finalBatch.length;

const names = new Set([...FEMALE_NAMES, ...MALE_NAMES]);
let pronounCorrect = 0;
let distractorLines = 0;
let attentionHits = 0;
let attentionWeightTotal = 0;

for (const line of corpus.heldOut) {
  const words = line.split(" ").filter((w) => w.length > 0);
  const pronounIndex = words.findIndex((w) => w === "she" || w === "he");
  const ids = tokenizer.encode(line);
  const inputs = ids.slice(0, pronounIndex);
  const out = forward(shipped, inputs);
  const lastRow = inputs.length - 1;
  const logitsRow: number[] = [];
  for (let c = 0; c < tokenizer.vocab.length; c += 1) {
    logitsRow.push(out.logits.at(lastRow, c));
  }
  const predicted =
    tokenizer.vocab[logitsRow.indexOf(Math.max(...logitsRow))];
  if (predicted === words[pronounIndex]) pronounCorrect += 1;

  const nameIndices = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => names.has(w));
  if (nameIndices.length === 2) {
    distractorLines += 1;
    const referentIndex = (nameIndices[0] as { i: number }).i;
    const finalLayer = out.attentions[out.attentions.length - 1] ?? [];
    let best = { weight: 0, isReferent: false };
    for (const map of finalLayer) {
      const row = lastRow;
      let argmax = 0;
      let argmaxWeight = -1;
      for (let c = 0; c <= row; c += 1) {
        const w = map.at(row, c);
        if (w > argmaxWeight) {
          argmaxWeight = w;
          argmax = c;
        }
      }
      const referentWeight = map.at(row, referentIndex);
      if (referentWeight > best.weight) {
        best = { weight: referentWeight, isReferent: argmax === referentIndex };
      }
    }
    if (best.isReferent) {
      attentionHits += 1;
      attentionWeightTotal += best.weight;
    }
  }
}

const metrics = {
  heldOutLines: corpus.heldOut.length,
  pronounAccuracy: pronounCorrect / corpus.heldOut.length,
  distractorLines,
  attentionHitRate: distractorLines === 0 ? 0 : attentionHits / distractorLines,
  attentionMeanWeight:
    attentionHits === 0 ? 0 : attentionWeightTotal / attentionHits,
  finalLoss,
};
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
