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

function survivorCount(record: TokenMachineRecord): number {
  const step = record.steps[0];
  if (step === undefined) {
    throw new Error("the sampling lesson run produced no steps");
  }
  return step.event.candidates.filter((c) => c.survived).length;
}

export const samplingDialsLesson: TokenMachineLesson = {
  id: "sampling-dials",
  title: "Sampling: the dials on one distribution",
  engine: "token-machine",
  model,
  tokenizer,
  guideCards: [
    {
      id: "one-distribution",
      title: "One distribution, three dials",
      body: "For the prompt below, the model computes one probability for every token it knows. Temperature reshapes those probabilities, top-k keeps only the k most likely candidates, and top-p keeps the smallest set of candidates whose probabilities add up to p. The dials never add knowledge; they only reshape and cut the same list.",
    },
    {
      id: "guess-first",
      title: "Commit before you run",
      body: "Each case fixes the dials to one setting. Predict what the setting does to the candidate list, lock in your guess, then run and read the result. The run shows every candidate, its probability, and whether it survived the cut.",
    },
  ],
  options: [
    { id: "one", label: "Only the single top candidate stays" },
    { id: "three", label: "Exactly three candidates stay" },
    { id: "between", label: "Some other number of candidates stays" },
    { id: "all", label: "Every candidate stays" },
  ],
  cases: [
    {
      id: "top-k-three",
      setup: "The temperature dial sits at 1 and top-k is set to 3.",
      question: "After the cut, how many candidates can still be sampled?",
      config: {
        prompt: PROMPT,
        maxNewTokens: 1,
        sampling: { temperature: 1, topK: 3 },
        seed: 64,
      },
    },
    {
      id: "temperature-zero",
      setup: "Now the temperature dial turns all the way down to 0, with no top-k and no top-p.",
      question: "After this change, how many candidates can still be sampled?",
      config: {
        prompt: PROMPT,
        maxNewTokens: 1,
        sampling: { temperature: 0 },
        seed: 64,
      },
    },
  ],
  deriveCorrectOption: (record) => {
    const count = survivorCount(record);
    const total = record.steps[0]?.event.candidates.length ?? 0;
    if (count === 1) return "one";
    if (count === 3) return "three";
    if (count === total) return "all";
    return "between";
  },
};
