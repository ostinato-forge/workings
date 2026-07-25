import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32, randInt } from "../../src/engine/random";
import type { Tensor } from "../../src/engine/tensor";
import { buildTokenizer, type Tokenizer } from "../../src/engine/tokenizer";
import {
  createModel,
  deserialize,
  forward,
  serialize,
  trainStep,
  type TransformerConfig,
  type TransformerModel,
} from "../../src/engine/transformer";
import {
  generateCorpus,
  type CorefItem,
  type DistractorKind,
} from "../corpora/coref";
import { evaluateCoref } from "./evaluate-coref";

const SEED = 64;
const STEPS = 6000;
const BATCH = 16;
const MAX_GRAD_NORM = 1.0;
const LEARNING_RATES = {
  rungA: 0.2,
  rungB: 0.5,
} as const;
const LOSS_LOG_INTERVAL = 1000;

type RungName = keyof typeof LEARNING_RATES;
type ProbeName = "P1" | "P2";
type ModelArchitecture = Omit<TransformerConfig, "vocabSize">;
type DistractorBucketKind = Exclude<DistractorKind, "none">;
type MapCoordinate = { layer: number; head: number };
type MapObservation = MapCoordinate & {
  map: Tensor;
  referentWeight: number;
  distractorWeight: number | null;
  uniqueReferentArgmax: boolean;
};
type LineObservation = {
  distractorKind: DistractorBucketKind;
  maps: MapObservation[];
};
type PerMapAccumulator = MapCoordinate & {
  referentWeightTotal: number;
  distractorWeightTotal: number;
  distractorWeightCount: number;
  nullDistractorCount: number;
  uniqueArgmaxHits: number;
};
type ScopeAccumulator = {
  scopeSize: number;
  lineCount: number;
  summedReferentMassTotal: number;
  summedDistractorMassTotal: number;
  distractorLineCount: number;
  nullDistractorCount: number;
  marginHits: number;
  perMapMassOverHalfHits: number;
  anyMapUniqueArgmaxHits: number;
};
type BucketAccumulator = {
  count: number;
  summedReferentMassTotal: number;
  marginHits: number;
  anyMapUniqueArgmaxHits: number;
};

const TWO_LAYER_ARCHITECTURE: ModelArchitecture = {
  context: 24,
  dModel: 48,
  layers: 2,
  heads: 2,
  dHead: 24,
  mlpWidth: 128,
};

const ONE_LAYER_ARCHITECTURES: Record<ProbeName, ModelArchitecture> = {
  P1: {
    context: 24,
    dModel: 48,
    layers: 1,
    heads: 1,
    dHead: 48,
    mlpWidth: 128,
  },
  P2: {
    context: 24,
    dModel: 48,
    layers: 1,
    heads: 2,
    dHead: 24,
    mlpWidth: 128,
  },
};

const GROUP_ABLATIONS: Record<string, MapCoordinate[]> = {
  baseline: [],
  L0H0: [{ layer: 0, head: 0 }],
  L0H1: [{ layer: 0, head: 1 }],
  L1H0: [{ layer: 1, head: 0 }],
  L1H1: [{ layer: 1, head: 1 }],
  L1Both: [
    { layer: 1, head: 0 },
    { layer: 1, head: 1 },
  ],
  L0Both: [
    { layer: 0, head: 0 },
    { layer: 0, head: 1 },
  ],
  allHeads: [
    { layer: 0, head: 0 },
    { layer: 0, head: 1 },
    { layer: 1, head: 0 },
    { layer: 1, head: 1 },
  ],
};

function transformerConfig(
  architecture: ModelArchitecture,
  vocabSize: number,
): TransformerConfig {
  return { vocabSize, ...architecture };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isUniqueReferentMaximum(
  map: Tensor,
  row: number,
  referentIndex: number,
): boolean {
  let maximum = -Infinity;
  let argmax = -1;
  let tied = false;
  for (let column = 0; column <= row; column += 1) {
    const weight = map.at(row, column);
    if (weight > maximum) {
      maximum = weight;
      argmax = column;
      tied = false;
    } else if (weight === maximum) {
      tied = true;
    }
  }
  return !tied && argmax === referentIndex;
}

function observeDistractorLine(
  model: TransformerModel,
  tokenizer: Tokenizer,
  item: CorefItem,
): LineObservation {
  if (item.distractorKind === "none") {
    throw new Error("attention diagnosis only observes distractor lines");
  }
  const words = item.text.split(" ").filter((word) => word.length > 0);
  const pronounIndex = words.findIndex((word) => word === "she" || word === "he");
  if (pronounIndex < 1) {
    throw new Error("coreference item has no predictable pronoun");
  }
  const inputs = tokenizer.encode(item.text).slice(0, pronounIndex);
  const { attentions } = forward(model, inputs);
  const lastRow = inputs.length - 1;
  const maps: MapObservation[] = [];

  for (let layer = 0; layer < model.config.layers; layer += 1) {
    for (let head = 0; head < model.config.heads; head += 1) {
      const map = attentions[layer]?.[head];
      if (map === undefined) {
        throw new Error("model did not return every configured attention map");
      }
      maps.push({
        layer,
        head,
        map,
        referentWeight: map.at(lastRow, item.referentIndex),
        distractorWeight:
          item.distractorIndex === null
            ? null
            : map.at(lastRow, item.distractorIndex),
        uniqueReferentArgmax: isUniqueReferentMaximum(
          map,
          lastRow,
          item.referentIndex,
        ),
      });
    }
  }

  return {
    distractorKind: item.distractorKind,
    maps,
  };
}

function emptyScopeAccumulator(scopeSize: number): ScopeAccumulator {
  return {
    scopeSize,
    lineCount: 0,
    summedReferentMassTotal: 0,
    summedDistractorMassTotal: 0,
    distractorLineCount: 0,
    nullDistractorCount: 0,
    marginHits: 0,
    perMapMassOverHalfHits: 0,
    anyMapUniqueArgmaxHits: 0,
  };
}

function addScopeLine(
  accumulator: ScopeAccumulator,
  maps: MapObservation[],
): void {
  if (maps.length !== accumulator.scopeSize) {
    throw new Error("attention scope has an unexpected number of maps");
  }
  const summedReferentMass = maps.reduce(
    (total, map) => total + map.referentWeight,
    0,
  );
  const distractorWeights = maps.map((map) => map.distractorWeight);
  accumulator.lineCount += 1;
  accumulator.summedReferentMassTotal += summedReferentMass;
  if (summedReferentMass / accumulator.scopeSize >= 0.5) {
    accumulator.perMapMassOverHalfHits += 1;
  }
  if (maps.some((map) => map.uniqueReferentArgmax)) {
    accumulator.anyMapUniqueArgmaxHits += 1;
  }

  if (distractorWeights.some((weight) => weight === null)) {
    accumulator.nullDistractorCount += 1;
    return;
  }
  const summedDistractorMass = distractorWeights.reduce<number>(
    (total, weight) => total + (weight ?? 0),
    0,
  );
  accumulator.summedDistractorMassTotal += summedDistractorMass;
  accumulator.distractorLineCount += 1;
  if (summedReferentMass > summedDistractorMass) {
    accumulator.marginHits += 1;
  }
}

function finishScope(accumulator: ScopeAccumulator) {
  return {
    scopeSize: accumulator.scopeSize,
    meanSummedReferentMass:
      accumulator.summedReferentMassTotal / accumulator.lineCount,
    meanPerMapReferentMass:
      accumulator.summedReferentMassTotal /
      (accumulator.lineCount * accumulator.scopeSize),
    meanSummedDistractorMass:
      accumulator.distractorLineCount === 0
        ? 0
        : accumulator.summedDistractorMassTotal /
          accumulator.distractorLineCount,
    marginRate:
      accumulator.distractorLineCount === 0
        ? 0
        : accumulator.marginHits / accumulator.distractorLineCount,
    perMapMassOverHalfRate:
      accumulator.perMapMassOverHalfHits / accumulator.lineCount,
    anyMapUniqueArgmaxRate:
      accumulator.anyMapUniqueArgmaxHits / accumulator.lineCount,
    nullDistractorCount: accumulator.nullDistractorCount,
  };
}

function finishBucket(accumulator: BucketAccumulator) {
  return {
    count: accumulator.count,
    meanSummedReferentMass:
      accumulator.count === 0
        ? 0
        : accumulator.summedReferentMassTotal / accumulator.count,
    marginRate:
      accumulator.count === 0
        ? 0
        : accumulator.marginHits / accumulator.count,
    anyMapUniqueArgmaxRate:
      accumulator.count === 0
        ? 0
        : accumulator.anyMapUniqueArgmaxHits / accumulator.count,
  };
}

function diagnoseAttention(
  model: TransformerModel,
  tokenizer: Tokenizer,
  heldOutItems: CorefItem[],
) {
  const distractorItems = heldOutItems.filter(
    (item) => item.distractorKind !== "none",
  );
  if (distractorItems.length === 0) {
    throw new Error("attention diagnosis requires held-out distractor lines");
  }

  const perMapAccumulators: PerMapAccumulator[] = [];
  for (let layer = 0; layer < model.config.layers; layer += 1) {
    for (let head = 0; head < model.config.heads; head += 1) {
      perMapAccumulators.push({
        layer,
        head,
        referentWeightTotal: 0,
        distractorWeightTotal: 0,
        distractorWeightCount: 0,
        nullDistractorCount: 0,
        uniqueArgmaxHits: 0,
      });
    }
  }

  const scopes = {
    layer0: emptyScopeAccumulator(model.config.heads),
    finalLayer: emptyScopeAccumulator(model.config.heads),
    allMaps: emptyScopeAccumulator(model.config.layers * model.config.heads),
  };
  const buckets: Record<DistractorBucketKind, BucketAccumulator> = {
    opposite: {
      count: 0,
      summedReferentMassTotal: 0,
      marginHits: 0,
      anyMapUniqueArgmaxHits: 0,
    },
    same: {
      count: 0,
      summedReferentMassTotal: 0,
      marginHits: 0,
      anyMapUniqueArgmaxHits: 0,
    },
  };
  let bestMapHits = 0;

  for (const item of distractorItems) {
    const observation = observeDistractorLine(model, tokenizer, item);
    for (let index = 0; index < observation.maps.length; index += 1) {
      const map = observation.maps[index] as MapObservation;
      const accumulator = perMapAccumulators[index];
      if (
        accumulator === undefined ||
        accumulator.layer !== map.layer ||
        accumulator.head !== map.head
      ) {
        throw new Error("attention map ordering changed during diagnosis");
      }
      accumulator.referentWeightTotal += map.referentWeight;
      if (map.distractorWeight === null) {
        accumulator.nullDistractorCount += 1;
      } else {
        accumulator.distractorWeightTotal += map.distractorWeight;
        accumulator.distractorWeightCount += 1;
      }
      if (map.uniqueReferentArgmax) {
        accumulator.uniqueArgmaxHits += 1;
      }
    }

    const layer0Maps = observation.maps.filter((map) => map.layer === 0);
    const finalLayerMaps = observation.maps.filter(
      (map) => map.layer === model.config.layers - 1,
    );
    addScopeLine(scopes.layer0, layer0Maps);
    addScopeLine(scopes.finalLayer, finalLayerMaps);
    addScopeLine(scopes.allMaps, observation.maps);

    let bestMap = observation.maps[0];
    if (bestMap === undefined) {
      throw new Error("attention diagnosis found no attention maps");
    }
    for (const map of observation.maps.slice(1)) {
      if (map.referentWeight > bestMap.referentWeight) {
        bestMap = map;
      }
    }
    if (bestMap.uniqueReferentArgmax) {
      bestMapHits += 1;
    }

    const bucket = buckets[observation.distractorKind];
    const summedReferentMass = finalLayerMaps.reduce(
      (total, map) => total + map.referentWeight,
      0,
    );
    const summedDistractorMass = finalLayerMaps.reduce(
      (total, map) => total + (map.distractorWeight ?? 0),
      0,
    );
    bucket.count += 1;
    bucket.summedReferentMassTotal += summedReferentMass;
    if (
      finalLayerMaps.every((map) => map.distractorWeight !== null) &&
      summedReferentMass > summedDistractorMass
    ) {
      bucket.marginHits += 1;
    }
    if (finalLayerMaps.some((map) => map.uniqueReferentArgmax)) {
      bucket.anyMapUniqueArgmaxHits += 1;
    }
  }

  return {
    distractorLines: distractorItems.length,
    perMap: perMapAccumulators.map((accumulator) => ({
      layer: accumulator.layer,
      head: accumulator.head,
      meanReferentWeight:
        accumulator.referentWeightTotal / distractorItems.length,
      meanDistractorWeight:
        accumulator.distractorWeightCount === 0
          ? 0
          : accumulator.distractorWeightTotal /
            accumulator.distractorWeightCount,
      distractorWeightCount: accumulator.distractorWeightCount,
      nullDistractorCount: accumulator.nullDistractorCount,
      uniqueArgmaxHitRate:
        accumulator.uniqueArgmaxHits / distractorItems.length,
    })),
    aggregates: {
      layer0: finishScope(scopes.layer0),
      finalLayer: finishScope(scopes.finalLayer),
      allMaps: finishScope(scopes.allMaps),
    },
    bestMapHitRate: bestMapHits / distractorItems.length,
    buckets: {
      opposite: finishBucket(buckets.opposite),
      same: finishBucket(buckets.same),
    },
  };
}

function heldOutPronounAccuracy(
  model: TransformerModel,
  tokenizer: Tokenizer,
  heldOutItems: CorefItem[],
): number {
  if (heldOutItems.length === 0) {
    throw new Error("pronoun accuracy requires held-out items");
  }
  let correct = 0;
  for (const item of heldOutItems) {
    const words = item.text.split(" ").filter((word) => word.length > 0);
    const pronounIndex = words.findIndex(
      (word) => word === "she" || word === "he",
    );
    if (pronounIndex < 1) {
      throw new Error("coreference item has no predictable pronoun");
    }
    const inputs = tokenizer.encode(item.text).slice(0, pronounIndex);
    const { logits } = forward(model, inputs);
    const lastRow = inputs.length - 1;
    let predictedId = 0;
    let predictedLogit = -Infinity;
    for (let column = 0; column < tokenizer.vocab.length; column += 1) {
      const value = logits.at(lastRow, column);
      if (value > predictedLogit) {
        predictedLogit = value;
        predictedId = column;
      }
    }
    if (tokenizer.vocab[predictedId] === words[pronounIndex]) {
      correct += 1;
    }
  }
  return correct / heldOutItems.length;
}

function trainModel(
  runName: string,
  architecture: ModelArchitecture,
  learningRate: number,
  tokenizer: Tokenizer,
  trainItems: CorefItem[],
) {
  const config = transformerConfig(architecture, tokenizer.vocab.length);
  const rng = mulberry32(SEED);
  const model = createModel(config, rng);
  const encodedTrain = trainItems.map((item) => tokenizer.encode(item.text));
  const lossLog: { step: number; loss: number | null }[] = [];

  let lastLoss = Number.NaN;
  let completedSteps = 0;
  let divergenceReason: string | null = null;
  for (let step = 0; step < STEPS; step += 1) {
    const batch: number[][] = [];
    for (let batchIndex = 0; batchIndex < BATCH; batchIndex += 1) {
      batch.push(
        encodedTrain[randInt(rng, encodedTrain.length)] as number[],
      );
    }
    lastLoss = trainStep(
      model,
      batch,
      learningRate,
      MAX_GRAD_NORM,
    );
    completedSteps = step + 1;
    if (step % LOSS_LOG_INTERVAL === 0) {
      const loggedLoss = Number.isFinite(lastLoss) ? lastLoss : null;
      lossLog.push({ step, loss: loggedLoss });
      console.error(
        `${runName} lr ${learningRate} step ${step} loss ${
          loggedLoss === null ? String(lastLoss) : loggedLoss.toFixed(4)
        }`,
      );
    }
    if (!Number.isFinite(lastLoss)) {
      divergenceReason = `non-finite loss at step ${step}: ${String(lastLoss)}`;
      console.error(`${runName} diverged: ${divergenceReason}`);
      break;
    }
  }
  if (divergenceReason === null && lastLoss > 10) {
    divergenceReason = `final loss ${lastLoss} exceeded 10`;
    console.error(`${runName} diverged: ${divergenceReason}`);
  }

  return {
    model,
    config,
    finalLoss: Number.isFinite(lastLoss) ? lastLoss : null,
    completedSteps,
    lossLog,
    diverged: divergenceReason !== null,
    divergenceReason,
  };
}

function diagnoseGroupAblations(
  model: TransformerModel,
  tokenizer: Tokenizer,
  heldOutItems: CorefItem[],
) {
  const trainedHashBefore = sha256(JSON.stringify(serialize(model)));
  const accuracies: Record<
    string,
    { accuracy: number; dropFromBaseline: number }
  > = {};
  let baselineAccuracy: number | null = null;

  for (const [condition, coordinates] of Object.entries(GROUP_ABLATIONS)) {
    const roundTripped = deserialize(serialize(model));
    for (const coordinate of coordinates) {
      const head =
        roundTripped.layers[coordinate.layer]?.heads[coordinate.head];
      if (head === undefined) {
        throw new Error(
          `cannot ablate missing L${coordinate.layer}H${coordinate.head}`,
        );
      }
      head.wo.data.fill(0);
    }
    const accuracy = heldOutPronounAccuracy(
      roundTripped,
      tokenizer,
      heldOutItems,
    );
    if (condition === "baseline") {
      baselineAccuracy = accuracy;
    }
    if (baselineAccuracy === null) {
      throw new Error("baseline ablation condition must be evaluated first");
    }
    accuracies[condition] = {
      accuracy,
      dropFromBaseline: baselineAccuracy - accuracy,
    };
  }

  const trainedHashAfter = sha256(JSON.stringify(serialize(model)));
  if (trainedHashAfter !== trainedHashBefore) {
    throw new Error("group ablation mutated the trained model");
  }
  return {
    heldOutLines: heldOutItems.length,
    roundTripPerCondition: true,
    trainedModelHashUnchanged: true,
    conditions: accuracies,
  };
}

function trainGroupAblationRung(
  rung: RungName,
  learningRate: number,
  tokenizer: Tokenizer,
  trainItems: CorefItem[],
  heldOutItems: CorefItem[],
) {
  const training = trainModel(
    `part1 ${rung}`,
    TWO_LAYER_ARCHITECTURE,
    learningRate,
    tokenizer,
    trainItems,
  );
  if (training.diverged) {
    throw new Error(
      `part 1 ${rung} diverged: ${training.divergenceReason ?? "unknown"}`,
    );
  }
  const weightsHash = sha256(JSON.stringify(serialize(training.model)));
  const standardMetrics = evaluateCoref(
    training.model,
    tokenizer,
    trainItems,
    heldOutItems,
    SEED,
  );
  const attentionMetrics = diagnoseAttention(
    training.model,
    tokenizer,
    heldOutItems,
  );
  return {
    learningRate,
    finalLoss: training.finalLoss,
    completedSteps: training.completedSteps,
    lossLog: training.lossLog,
    config: training.config,
    weightsHash,
    standardMetrics,
    groupAblation: diagnoseGroupAblations(
      training.model,
      tokenizer,
      heldOutItems,
    ),
    ...attentionMetrics,
  };
}

function oneLayerCompatibility(
  probe: ProbeName,
  architecture: ModelArchitecture,
  tokenizer: Tokenizer,
  sample: CorefItem,
) {
  try {
    const config = transformerConfig(architecture, tokenizer.vocab.length);
    const model = createModel(config, mulberry32(SEED));
    const words = sample.text.split(" ").filter((word) => word.length > 0);
    const pronounIndex = words.findIndex(
      (word) => word === "she" || word === "he",
    );
    if (pronounIndex < 1) {
      throw new Error("compatibility sample has no predictable pronoun");
    }
    const ids = tokenizer.encode(sample.text).slice(0, pronounIndex);
    const result = forward(model, ids);
    return {
      probe,
      passed: true,
      dModelEqualsHeadsTimesDHead:
        config.dModel === config.heads * config.dHead,
      observedLayers: result.attentions.length,
      observedHeadsInLayer0: result.attentions[0]?.length ?? 0,
      logitsShape: [result.logits.rows, result.logits.cols],
      error: null,
    };
  } catch (error) {
    return {
      probe,
      passed: false,
      dModelEqualsHeadsTimesDHead:
        architecture.dModel === architecture.heads * architecture.dHead,
      observedLayers: null,
      observedHeadsInLayer0: null,
      logitsShape: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function trainOneLayerProbe(
  probe: ProbeName,
  architecture: ModelArchitecture,
  learningRate: number,
  tokenizer: Tokenizer,
  trainItems: CorefItem[],
  heldOutItems: CorefItem[],
) {
  const training = trainModel(
    `part2 ${probe}`,
    architecture,
    learningRate,
    tokenizer,
    trainItems,
  );
  const common = {
    probe,
    learningRate,
    config: training.config,
    completedSteps: training.completedSteps,
    finalLoss: training.finalLoss,
    lossLog: training.lossLog,
    diverged: training.diverged,
    divergenceReason: training.divergenceReason,
  };
  if (training.diverged) {
    return common;
  }

  const standardMetrics = evaluateCoref(
    training.model,
    tokenizer,
    trainItems,
    heldOutItems,
    SEED,
  );
  const attentionMetrics = diagnoseAttention(
    training.model,
    tokenizer,
    heldOutItems,
  );
  return {
    ...common,
    weightsHash: sha256(JSON.stringify(serialize(training.model))),
    standardMetrics,
    ...attentionMetrics,
  };
}

type RunId =
  | "part1-rungA"
  | "part1-rungB"
  | "part2-P1-lr0_2"
  | "part2-P1-lr0_5"
  | "part2-P2-lr0_2"
  | "part2-P2-lr0_5";

const RUN_IDS: RunId[] = [
  "part1-rungA",
  "part1-rungB",
  "part2-P1-lr0_2",
  "part2-P1-lr0_5",
  "part2-P2-lr0_2",
  "part2-P2-lr0_5",
];

function evaluationContext() {
  const corpus = generateCorpus(SEED);
  const tokenizer = buildTokenizer(
    [...corpus.train, ...corpus.heldOut].map((item) => item.text),
  );
  return { corpus, tokenizer };
}

function runById(
  runId: RunId,
  context: ReturnType<typeof evaluationContext>,
) {
  const { corpus, tokenizer } = context;
  switch (runId) {
    case "part1-rungA":
      return trainGroupAblationRung(
        "rungA",
        LEARNING_RATES.rungA,
        tokenizer,
        corpus.train,
        corpus.heldOut,
      );
    case "part1-rungB":
      return trainGroupAblationRung(
        "rungB",
        LEARNING_RATES.rungB,
        tokenizer,
        corpus.train,
        corpus.heldOut,
      );
    case "part2-P1-lr0_2":
      return trainOneLayerProbe(
        "P1",
        ONE_LAYER_ARCHITECTURES.P1,
        LEARNING_RATES.rungA,
        tokenizer,
        corpus.train,
        corpus.heldOut,
      );
    case "part2-P1-lr0_5":
      return trainOneLayerProbe(
        "P1",
        ONE_LAYER_ARCHITECTURES.P1,
        LEARNING_RATES.rungB,
        tokenizer,
        corpus.train,
        corpus.heldOut,
      );
    case "part2-P2-lr0_2":
      return trainOneLayerProbe(
        "P2",
        ONE_LAYER_ARCHITECTURES.P2,
        LEARNING_RATES.rungA,
        tokenizer,
        corpus.train,
        corpus.heldOut,
      );
    case "part2-P2-lr0_5":
      return trainOneLayerProbe(
        "P2",
        ONE_LAYER_ARCHITECTURES.P2,
        LEARNING_RATES.rungB,
        tokenizer,
        corpus.train,
        corpus.heldOut,
      );
  }
}

function buildCompatibility(context: ReturnType<typeof evaluationContext>) {
  const { corpus, tokenizer } = context;
  const sample = corpus.train[0];
  if (sample === undefined) {
    throw new Error("compatibility check requires a training sample");
  }
  return {
    implementationConstraintFound: false,
    implementationNote:
      "Each head projects dModel to dHead and back to dModel; forward sums dModel-sized head outputs, so no dModel == heads*dHead constraint is present.",
    probes: {
      P1: oneLayerCompatibility(
        "P1",
        ONE_LAYER_ARCHITECTURES.P1,
        tokenizer,
        sample,
      ),
      P2: oneLayerCompatibility(
        "P2",
        ONE_LAYER_ARCHITECTURES.P2,
        tokenizer,
        sample,
      ),
    },
  };
}

function buildOutput(
  context: ReturnType<typeof evaluationContext>,
  results: Record<RunId, unknown>,
) {
  return {
    constants: {
      seed: SEED,
      steps: STEPS,
      batch: BATCH,
      maxGradNorm: MAX_GRAD_NORM,
      lossLogInterval: LOSS_LOG_INTERVAL,
      learningRates: LEARNING_RATES,
      twoLayerArchitecture: TWO_LAYER_ARCHITECTURE,
      oneLayerArchitectures: ONE_LAYER_ARCHITECTURES,
      rngDiscipline:
        "Fresh mulberry32(64) per training run; createModel consumes it before batch sampling.",
      predictionSlice:
        "Encode the full line, then slice inputs before the first she/he token; score logits at the final input row.",
      ablationMechanism:
        "Each condition starts from deserialize(serialize(trainedModel)); only the requested head wo tensors are zeroed.",
    },
    compatibility: buildCompatibility(context),
    part1: {
      groupAblation: {
        rungA: results["part1-rungA"],
        rungB: results["part1-rungB"],
      },
    },
    part2: {
      oneLayerProbes: {
        P1_lr0_2: results["part2-P1-lr0_2"],
        P1_lr0_5: results["part2-P1-lr0_5"],
        P2_lr0_2: results["part2-P2-lr0_2"],
        P2_lr0_5: results["part2-P2-lr0_5"],
      },
    },
  };
}

function isRunId(value: string): value is RunId {
  return RUN_IDS.some((runId) => runId === value);
}

function runInChild(runId: RunId): Promise<[RunId, unknown]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "tsx",
        fileURLToPath(import.meta.url),
        "--internal-run",
        runId,
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    child.stdout.setEncoding("utf8");
    let output = "";
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${runId} exited with code ${String(code)}`));
        return;
      }
      try {
        resolve([runId, JSON.parse(output) as unknown]);
      } catch (error) {
        reject(
          new Error(
            `${runId} returned invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}

const [firstArgument, secondArgument] = process.argv.slice(2);
if (firstArgument === "--internal-run") {
  if (secondArgument === undefined || !isRunId(secondArgument)) {
    throw new Error(`unknown run id: ${String(secondArgument)}`);
  }
  const result = runById(secondArgument, evaluationContext());
  process.stdout.write(JSON.stringify(result));
} else {
  const entries = await Promise.all(RUN_IDS.map(runInChild));
  const results = Object.fromEntries(entries) as Record<RunId, unknown>;
  const output = `${JSON.stringify(
    buildOutput(evaluationContext(), results),
    null,
    2,
  )}\n`;
  process.stdout.write(output);
  if (firstArgument !== undefined) {
    mkdirSync(dirname(firstArgument), { recursive: true });
    writeFileSync(firstArgument, output);
  }
}
