import { mulberry32, randInt } from "../../src/engine/random";
import type { Tensor } from "../../src/engine/tensor";
import type { Tokenizer } from "../../src/engine/tokenizer";
import {
  deserialize,
  forward,
  serialize,
  type TransformerModel,
} from "../../src/engine/transformer";
import {
  FEMALE_NAMES,
  MALE_NAMES,
  type CorefItem,
  type DistractorKind,
} from "../corpora/coref";

type DistractorBucketKind = Exclude<DistractorKind, "none">;

export type AttentionBucketMetrics = {
  count: number;
  hits: number;
  hitRate: number;
};

export type MarginBucketMetrics = {
  count: number;
  wins: number;
  winRate: number;
};

export type SelectedHead = {
  layer: number;
  head: number;
};

export type CorefMetrics = {
  heldOutLines: number;
  pronounAccuracy: number;
  distractorLines: number;
  selectedHead: SelectedHead;
  attentionHitRate: number;
  attentionMeanWeight: number;
  attentionByReferentPosition: Record<string, AttentionBucketMetrics>;
  attentionByDistractorKind: Record<
    DistractorBucketKind,
    AttentionBucketMetrics
  >;
  marginRate: number;
  marginByReferentPosition: Record<string, MarginBucketMetrics>;
  marginByDistractorKind: Record<
    DistractorBucketKind,
    MarginBucketMetrics
  >;
  flipItems: number;
  flipRate: number;
  ablationDrop: number;
};

type Observation = {
  words: string[];
  pronounIndex: number;
  predicted: string;
  lastRow: number;
  attentions: Tensor[][];
};

type MutableBucket = {
  count: number;
  hits: number;
};

type MutableMarginBucket = {
  count: number;
  wins: number;
};

function observe(
  model: TransformerModel,
  tokenizer: Tokenizer,
  item: CorefItem,
): Observation {
  const words = item.text.split(" ").filter((word) => word.length > 0);
  const pronounIndex = words.findIndex((word) => word === "she" || word === "he");
  if (pronounIndex < 1) {
    throw new Error("coreference item has no predictable pronoun");
  }
  const inputs = tokenizer.encode(item.text).slice(0, pronounIndex);
  const { logits, attentions } = forward(model, inputs);
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
  return {
    words,
    pronounIndex,
    predicted: tokenizer.vocab[predictedId] as string,
    lastRow,
    attentions,
  };
}

function attentionMap(
  attentions: Tensor[][],
  selectedHead: SelectedHead,
): Tensor {
  const map = attentions[selectedHead.layer]?.[selectedHead.head];
  if (map === undefined) {
    throw new Error("selected attention head is missing");
  }
  return map;
}

function selectHead(
  model: TransformerModel,
  tokenizer: Tokenizer,
  trainItems: CorefItem[],
): SelectedHead {
  if (trainItems.length < 200) {
    throw new Error("fixed-head selection requires at least 200 training items");
  }
  const totals = Array.from({ length: model.config.layers }, () =>
    Array.from({ length: model.config.heads }, () => 0),
  );
  for (const item of trainItems.slice(0, 200)) {
    const observation = observe(model, tokenizer, item);
    for (let layer = 0; layer < model.config.layers; layer += 1) {
      for (let head = 0; head < model.config.heads; head += 1) {
        const map = observation.attentions[layer]?.[head];
        if (map === undefined) {
          throw new Error("model did not return every configured attention map");
        }
        const layerTotals = totals[layer];
        if (layerTotals === undefined) {
          throw new Error("attention selection totals are missing");
        }
        layerTotals[head] =
          (layerTotals[head] as number) +
          map.at(observation.lastRow, item.referentIndex);
      }
    }
  }

  let selectedHead = { layer: 0, head: 0 };
  let selectedMean = -Infinity;
  for (let layer = 0; layer < model.config.layers; layer += 1) {
    for (let head = 0; head < model.config.heads; head += 1) {
      const mean = (totals[layer]?.[head] as number) / 200;
      if (mean > selectedMean) {
        selectedMean = mean;
        selectedHead = { layer, head };
      }
    }
  }
  return selectedHead;
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

function finishBucket(bucket: MutableBucket): AttentionBucketMetrics {
  return {
    count: bucket.count,
    hits: bucket.hits,
    hitRate: bucket.count === 0 ? 0 : bucket.hits / bucket.count,
  };
}

function finishMarginBucket(
  bucket: MutableMarginBucket,
): MarginBucketMetrics {
  return {
    count: bucket.count,
    wins: bucket.wins,
    winRate: bucket.count === 0 ? 0 : bucket.wins / bucket.count,
  };
}

function pronounAccuracy(
  model: TransformerModel,
  tokenizer: Tokenizer,
  items: CorefItem[],
): number {
  let correct = 0;
  for (const item of items) {
    const observation = observe(model, tokenizer, item);
    if (observation.predicted === observation.words[observation.pronounIndex]) {
      correct += 1;
    }
  }
  return correct / items.length;
}

function oppositeGenderNames(referent: string): string[] {
  if (FEMALE_NAMES.includes(referent)) return MALE_NAMES;
  if (MALE_NAMES.includes(referent)) return FEMALE_NAMES;
  throw new Error(`unknown referent name: ${referent}`);
}

export function evaluateCoref(
  model: TransformerModel,
  tokenizer: Tokenizer,
  trainItems: CorefItem[],
  heldOutItems: CorefItem[],
  flipSeed: number,
): CorefMetrics {
  if (heldOutItems.length === 0) {
    throw new Error("coreference evaluation requires held-out items");
  }
  const selectedHead = selectHead(model, tokenizer, trainItems);
  const positionBuckets = new Map<number, MutableBucket>();
  const kindBuckets: Record<DistractorBucketKind, MutableBucket> = {
    opposite: { count: 0, hits: 0 },
    same: { count: 0, hits: 0 },
  };
  const marginPositionBuckets = new Map<number, MutableMarginBucket>();
  const marginKindBuckets: Record<
    DistractorBucketKind,
    MutableMarginBucket
  > = {
    opposite: { count: 0, wins: 0 },
    same: { count: 0, wins: 0 },
  };
  const flipRng = mulberry32(flipSeed);
  let pronounCorrect = 0;
  let distractorLines = 0;
  let attentionHits = 0;
  let attentionWeightTotal = 0;
  let marginWins = 0;
  let flipItems = 0;
  let flips = 0;

  for (const item of heldOutItems) {
    const observation = observe(model, tokenizer, item);
    const truePronoun = observation.words[observation.pronounIndex] as string;
    if (observation.predicted === truePronoun) {
      pronounCorrect += 1;
    }
    if (item.distractorKind === "none") continue;
    if (item.distractorIndex === null) {
      throw new Error("distractor line is missing its distractor index");
    }

    distractorLines += 1;
    const map = attentionMap(observation.attentions, selectedHead);
    const referentWeight = map.at(observation.lastRow, item.referentIndex);
    const distractorWeight = map.at(
      observation.lastRow,
      item.distractorIndex,
    );
    const marginWin = referentWeight > distractorWeight;
    const hit = isUniqueReferentMaximum(
      map,
      observation.lastRow,
      item.referentIndex,
    );
    attentionWeightTotal += referentWeight;
    if (hit) attentionHits += 1;
    if (marginWin) marginWins += 1;

    const positionBucket = positionBuckets.get(item.referentIndex) ?? {
      count: 0,
      hits: 0,
    };
    positionBucket.count += 1;
    if (hit) positionBucket.hits += 1;
    positionBuckets.set(item.referentIndex, positionBucket);

    const marginPositionBucket = marginPositionBuckets.get(
      item.referentIndex,
    ) ?? {
      count: 0,
      wins: 0,
    };
    marginPositionBucket.count += 1;
    if (marginWin) marginPositionBucket.wins += 1;
    marginPositionBuckets.set(item.referentIndex, marginPositionBucket);

    const kindBucket = kindBuckets[item.distractorKind];
    kindBucket.count += 1;
    if (hit) kindBucket.hits += 1;

    const marginKindBucket = marginKindBuckets[item.distractorKind];
    marginKindBucket.count += 1;
    if (marginWin) marginKindBucket.wins += 1;

    if (item.distractorKind === "opposite") {
      flipItems += 1;
      const referent = observation.words[item.referentIndex] as string;
      const distractor = observation.words[item.distractorIndex] as string;
      const candidates = oppositeGenderNames(referent).filter(
        (name) => name !== distractor,
      );
      const replacement = candidates[randInt(flipRng, candidates.length)] as string;
      tokenizer.toId(replacement);
      const swappedWords = [...observation.words];
      swappedWords[item.referentIndex] = replacement;
      const swappedItem = { ...item, text: swappedWords.join(" ") };
      const swappedPrediction = observe(model, tokenizer, swappedItem).predicted;
      const flippedPronoun = truePronoun === "she" ? "he" : "she";
      if (
        observation.predicted === truePronoun &&
        swappedPrediction === flippedPronoun
      ) {
        flips += 1;
      }
    }
  }

  if (distractorLines === 0 || flipItems === 0) {
    throw new Error("coreference evaluation requires both distractor buckets");
  }

  const ablated = deserialize(serialize(model));
  const selectedLayer = ablated.layers[selectedHead.layer];
  const ablatedHead = selectedLayer?.heads[selectedHead.head];
  if (ablatedHead === undefined) {
    throw new Error("cannot ablate missing selected head");
  }
  ablatedHead.wo.data.fill(0);
  const normalAccuracy = pronounCorrect / heldOutItems.length;
  const ablatedAccuracy = pronounAccuracy(ablated, tokenizer, heldOutItems);

  const attentionByReferentPosition: Record<
    string,
    AttentionBucketMetrics
  > = {};
  for (const [position, bucket] of [...positionBuckets.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    attentionByReferentPosition[String(position)] = finishBucket(bucket);
  }
  const marginByReferentPosition: Record<
    string,
    MarginBucketMetrics
  > = {};
  for (const [position, bucket] of [...marginPositionBuckets.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    marginByReferentPosition[String(position)] =
      finishMarginBucket(bucket);
  }

  return {
    heldOutLines: heldOutItems.length,
    pronounAccuracy: normalAccuracy,
    distractorLines,
    selectedHead,
    attentionHitRate: attentionHits / distractorLines,
    attentionMeanWeight: attentionWeightTotal / distractorLines,
    attentionByReferentPosition,
    attentionByDistractorKind: {
      opposite: finishBucket(kindBuckets.opposite),
      same: finishBucket(kindBuckets.same),
    },
    marginRate: marginWins / distractorLines,
    marginByReferentPosition,
    marginByDistractorKind: {
      opposite: finishMarginBucket(marginKindBuckets.opposite),
      same: finishMarginBucket(marginKindBuckets.same),
    },
    flipItems,
    flipRate: flips / flipItems,
    ablationDrop: normalAccuracy - ablatedAccuracy,
  };
}
