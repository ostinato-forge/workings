import corefWeights from "../../models/weights/coref.json";
import { generateCorpus } from "../../models/corpora/coref";
import { buildTokenizer } from "../engine/tokenizer";
import { deserialize } from "../engine/transformer";
import type { TokenMachineRecord } from "../engine/token-machine";
import type { TokenMachineLesson } from "./types";

const corpus = generateCorpus(64);
const tokenizer = buildTokenizer(
  [...corpus.train, ...corpus.heldOut].map((item) => item.text),
);
const model = deserialize(corefWeights as Parameters<typeof deserialize>[0]);

const PROMPT = "mara met omar at the";

function endingOf(record: TokenMachineRecord): string {
  return record.steps
    .map((step) => step.event.sampledToken)
    .join(" ");
}

function survivorCountAtFirstStep(record: TokenMachineRecord): number {
  const step = record.steps[0];
  if (step === undefined) throw new Error("run produced no steps");
  return step.event.candidates.filter((c) => c.survived).length;
}

export const samplingDialsLesson: TokenMachineLesson = {
  id: "sampling-dials",
  title: "Why the same question gets different answers",
  engine: "token-machine",
  model,
  tokenizer,
  beats: [
    {
      kind: "teach",
      id: "hook",
      title: "Same question, different answers",
      body: "Ask a chatbot the same question twice and you often get two different answers. Nothing changed: not your words, not the model. In this stage you drive a model small enough to watch, and you will make that happen yourself, then make it stop.",
    },
    {
      kind: "teach",
      id: "meet-the-machine",
      title: "The machine you are about to drive",
      body: "This model learned from a few thousand short sentences about people meeting at markets, harbors, and gardens. Given the words so far, it gives every word it knows a score for how likely that word is to come next, then picks one and repeats. You will watch both halves: the scoreboard, and the pick. This tiny model works in whole words; real systems split text into smaller pieces called tokens, and a later stage shows that.",
    },
    {
      kind: "play",
      id: "produce-the-phenomenon",
      goal: "Run the machine three times and watch the endings pile up on the right. The dials are set the way real chatbots usually run.",
      prompt: PROMPT,
      maxNewTokens: 4,
      seeds: [64, 4096, 262144, 1048576, 33554432],
      minRuns: 3,
      requires: {
        description: "The temperature dial is set to 1 for this round.",
        locked: { temperature: 1 },
        satisfied: (sampling) => sampling.temperature === 1,
      },
      bet: {
        question: "Before your first run: three runs, same prompt every time. What do you expect on the rail?",
        options: [
          { id: "identical", label: "Three identical endings" },
          { id: "differ", label: "The endings can differ" },
        ],
        deriveCorrectOption: (records) => {
          const endings = new Set(records.map(endingOf));
          return endings.size > 1 ? "differ" : "identical";
        },
      },
    },
    {
      kind: "teach",
      id: "the-raffle",
      title: "What you just watched",
      body: "On each step the board showed every word's share of probability, and the sweep landed on one of them. Bigger shares win more often; small shares still win sometimes. That draw is called sampling. It is the entire reason your three runs came out different, and it happened once per word, every run.",
    },
    {
      kind: "play",
      id: "kill-the-raffle",
      goal: "Now take the randomness away yourself. Turn the temperature dial down to 0, then run at least three times.",
      prompt: PROMPT,
      maxNewTokens: 4,
      seeds: [64, 4096, 262144, 1048576, 33554432],
      minRuns: 3,
      requires: {
        description: "Set temperature to exactly 0. The other dials stay off.",
        locked: {},
        satisfied: (sampling) =>
          sampling.temperature === 0 &&
          sampling.topK === undefined &&
          sampling.topP === undefined,
      },
      bet: {
        question: "Temperature 0 always takes the highest-scoring word. Your prediction for three runs:",
        options: [
          { id: "identical", label: "Three identical endings" },
          { id: "differ", label: "The endings can still differ" },
        ],
        deriveCorrectOption: (records) => {
          const endings = new Set(records.map(endingOf));
          return endings.size > 1 ? "differ" : "identical";
        },
      },
    },
    {
      kind: "teach",
      id: "the-cut",
      title: "A dial that cuts instead of reshaping",
      body: "Temperature reshapes every word's share. The top-k dial is different: it throws away everything except the k highest-scoring words before the draw, and the board will show you exactly which words survive the cut.",
    },
    {
      kind: "play",
      id: "cut-the-field",
      goal: "Set temperature back to 1 and set top-k to 3, then run and watch the board.",
      prompt: PROMPT,
      maxNewTokens: 4,
      seeds: [64, 4096, 262144],
      minRuns: 1,
      requires: {
        description: "Temperature at 1 and top-k at 3.",
        locked: {},
        satisfied: (sampling) =>
          sampling.temperature === 1 && sampling.topK === 3,
      },
      bet: {
        question: "On each draw, how many words will be able to win?",
        options: [
          { id: "one", label: "Only the top word" },
          { id: "three", label: "Exactly three" },
          { id: "all", label: "Every word the model knows" },
        ],
        deriveCorrectOption: (records) => {
          const record = records[0];
          if (record === undefined) throw new Error("missing record");
          const count = survivorCountAtFirstStep(record);
          if (count === 1) return "one";
          if (count === 3) return "three";
          return "all";
        },
      },
    },
    {
      kind: "recap",
      id: "transfer",
      title: "What you can now explain",
      body: "You produced the variation, you killed it, and you cut the field. The model scores every word, then draws one; temperature reshapes the odds before the draw and 0 removes the draw entirely; top-k keeps only the k highest scorers. The settings with these names in the tools you already use are these same dials on a much larger word list. One more dial, top-p, cuts by total probability share instead of by count; it is live in free play.",
    },
    {
      kind: "free-play",
      id: "free-play",
      intro: "Everything is unlocked, including top-p. Running here is exploration, not assessment.",
      baseConfig: {
        prompt: PROMPT,
        maxNewTokens: 4,
        sampling: { temperature: 1 },
        seed: 64,
      },
    },
  ],
};
