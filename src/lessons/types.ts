import type { TokenMachineConfig, TokenMachineRecord } from "../engine/token-machine";
import type { TokenizerLike } from "../engine/tokenizer";
import type { TransformerModel } from "../engine/transformer";

export type GuideCard = {
  id: string;
  title: string;
  body: string;
};

export type PredictionOption = {
  id: string;
  label: string;
};

export type LessonCase = {
  id: string;
  setup: string;
  question: string;
  config: TokenMachineConfig;
};

/*
 * A lesson is data plus one derivation. The correct answer is never stored;
 * the contract suite and the player both obtain it by running the engine
 * and passing the record to deriveCorrectOption. If the derivation and the
 * display ever disagree, the record is the arbiter, because both read it.
 */
export type TokenMachineLesson = {
  id: string;
  title: string;
  engine: "token-machine";
  model: TransformerModel;
  tokenizer: TokenizerLike;
  guideCards: GuideCard[];
  options: PredictionOption[];
  cases: [LessonCase, LessonCase];
  deriveCorrectOption: (record: TokenMachineRecord) => string;
};
