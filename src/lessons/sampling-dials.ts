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

const PLACE_WORDS = new Set([
  "market", "harbor", "garden", "workshop", "library",
  "field", "bakery", "station", "orchard", "bridge",
]);
const NAME_WORDS = new Set([
  "mara", "lena", "sofi", "ruth", "ada", "elle",
  "omar", "felix", "hugo", "ivan", "theo", "saul",
]);

function firstStep(record: TokenMachineRecord) {
  const step = record.steps[0];
  if (step === undefined) throw new Error("run produced no steps");
  return step;
}

function topToken(record: TokenMachineRecord): string {
  const top = firstStep(record).event.candidates[0];
  if (top === undefined) throw new Error("run produced no candidates");
  return top.token;
}

function survivorCount(record: TokenMachineRecord): number {
  return firstStep(record).event.candidates.filter((c) => c.survived).length;
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
      body: "Ask a chatbot the same question twice and you often get two different answers. Nothing changed: not your words, not the model. This lesson shows you the exact mechanism behind that, on a model small enough to watch.",
    },
    {
      kind: "teach",
      id: "meet-the-model",
      title: "Meet the model",
      body: "The model here learned from a few thousand short sentences about people meeting at markets, harbors, and gardens. Given the words so far, it does exactly one thing: it gives every word it knows a score for how likely that word is to come next. This tiny model works in whole words. Real systems split text into smaller pieces called tokens; a later lesson shows that. Everything else you will see works the same way at both sizes.",
    },
    {
      kind: "predict",
      id: "what-comes-next",
      setup: "We will hand the model this unfinished sentence: \"mara met omar at the ...\"",
      question: "Which kind of word do you expect to get the highest score?",
      options: [
        { id: "place", label: "A place, like market or harbor" },
        { id: "name", label: "A name, like felix or ruth" },
        { id: "other", label: "Some other kind of word" },
      ],
      configs: [
        {
          prompt: PROMPT,
          maxNewTokens: 1,
          sampling: { temperature: 1 },
          seed: 64,
        },
      ],
      deriveCorrectOption: (records) => {
        const record = records[0];
        if (record === undefined) throw new Error("missing record");
        const top = topToken(record);
        if (PLACE_WORDS.has(top)) return "place";
        if (NAME_WORDS.has(top)) return "name";
        return "other";
      },
      showEvidence: "first",
    },
    {
      kind: "teach",
      id: "the-raffle",
      title: "The scores are a raffle",
      body: "You just saw the full list: every word got a share of probability, and the shares add up to 1. The model does not always take the top word. It draws one, the way a raffle draws a ticket: words with bigger shares win more often, and words with small shares still win sometimes. That draw is called sampling, and it is the entire reason one prompt can produce different answers.",
    },
    {
      kind: "predict",
      id: "kill-the-raffle",
      setup: "There is a dial on the raffle. It is called temperature, and at 0 it removes the randomness completely: the model just takes the highest-scoring word, every single time. We will run the same prompt twice at temperature 0, with a different random seed each time, which is like drawing raffle tickets on two different days.",
      question: "The two runs finish. What do you expect?",
      options: [
        { id: "same", label: "Both runs picked the same word" },
        { id: "differ", label: "The runs can pick different words" },
      ],
      configs: [
        {
          prompt: PROMPT,
          maxNewTokens: 1,
          sampling: { temperature: 0 },
          seed: 64,
        },
        {
          prompt: PROMPT,
          maxNewTokens: 1,
          sampling: { temperature: 0 },
          seed: 4096,
        },
      ],
      deriveCorrectOption: (records) => {
        const [a, b] = records;
        if (a === undefined || b === undefined) throw new Error("missing records");
        return topToken(a) === firstStep(b).event.sampledToken &&
          firstStep(a).event.sampledToken === firstStep(b).event.sampledToken
          ? "same"
          : "differ";
      },
      showEvidence: "all",
    },
    {
      kind: "teach",
      id: "the-cut",
      title: "A second dial cuts the list",
      body: "Temperature reshapes the raffle. A different dial shortens it instead: top-k keeps only the k highest-scoring words and throws the rest of the tickets away before the draw. The scores do not change; the list of words allowed to win does.",
    },
    {
      kind: "predict",
      id: "top-k-three",
      setup: "Temperature is back at 1, so the raffle is live. Top-k is set to 3.",
      question: "After the cut, how many words can still win the draw?",
      options: [
        { id: "one", label: "Only the single top word" },
        { id: "three", label: "Exactly three words" },
        { id: "between", label: "Some other number of words" },
        { id: "all", label: "Every word the model knows" },
      ],
      configs: [
        {
          prompt: PROMPT,
          maxNewTokens: 1,
          sampling: { temperature: 1, topK: 3 },
          seed: 64,
        },
      ],
      deriveCorrectOption: (records) => {
        const record = records[0];
        if (record === undefined) throw new Error("missing record");
        const count = survivorCount(record);
        const total = firstStep(record).event.candidates.length;
        if (count === 1) return "one";
        if (count === 3) return "three";
        if (count === total) return "all";
        return "between";
      },
      showEvidence: "first",
    },
    {
      kind: "recap",
      id: "transfer",
      title: "What you can now explain",
      body: "The model scores every word, then draws one. Temperature reshapes the odds before the draw: higher makes unlikely words win more often, 0 removes the draw entirely. Top-k cuts the list to the k highest scorers before drawing. The settings with these names in the tools you already use are these same dials on a much larger word list. One more dial, top-p, cuts by total probability share instead of by count; try it in free play and watch how many words survive.",
    },
    {
      kind: "free-play",
      id: "free-play",
      intro: "The dials are unlocked. Running here is exploration, not assessment.",
      baseConfig: {
        prompt: PROMPT,
        maxNewTokens: 1,
        sampling: { temperature: 1 },
        seed: 64,
      },
    },
  ],
};
