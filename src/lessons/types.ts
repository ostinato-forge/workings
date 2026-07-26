import type { TokenMachineConfig, TokenMachineRecord } from "../engine/token-machine";
import type { TokenizerLike } from "../engine/tokenizer";
import type { TransformerModel } from "../engine/transformer";

export type PredictionOption = {
  id: string;
  label: string;
};

/*
 * A teach beat is one panel of exact teaching copy. One new concept per
 * beat; a term appears only after the thing it names has been seen.
 */
export type TeachBeat = {
  kind: "teach";
  id: string;
  title: string;
  body: string;
};

/*
 * A predict beat is the interaction grammar in one unit: setup, a
 * committed guess, one or two engine runs, and evidence. With two configs
 * the derivation sees both records, which supports run-comparison
 * questions (same seed or different seeds, same dials or different
 * dials). The correct answer is never stored; deriveCorrectOption
 * computes it from the records at play time and test time alike.
 */
export type PredictBeat = {
  kind: "predict";
  id: string;
  setup: string;
  question: string;
  options: PredictionOption[];
  configs: [TokenMachineConfig] | [TokenMachineConfig, TokenMachineConfig];
  deriveCorrectOption: (records: TokenMachineRecord[]) => string;
  showEvidence: "first" | "all";
};

export type RecapBeat = {
  kind: "recap";
  id: string;
  title: string;
  body: string;
};

export type FreePlayBeat = {
  kind: "free-play";
  id: string;
  intro: string;
  baseConfig: TokenMachineConfig;
};

export type LessonBeat = TeachBeat | PredictBeat | RecapBeat | FreePlayBeat;

export type TokenMachineLesson = {
  id: string;
  title: string;
  engine: "token-machine";
  model: TransformerModel;
  tokenizer: TokenizerLike;
  beats: LessonBeat[];
};
