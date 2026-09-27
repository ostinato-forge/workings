import type { TokenMachineConfig, TokenMachineRecord } from "../engine/token-machine";
import type { SamplingConfig } from "../engine/sampling";
import type { TokenizerLike } from "../engine/tokenizer";
import type { TransformerModel } from "../engine/transformer";
import type { Lesson, LessonBeat as SharedLessonBeat, TeachingBeat } from "../platform/lesson";

export type PredictionOption = {
  id: string;
  label: string;
};

/*
 * A teach beat is one panel of exact teaching copy. One new concept per
 * beat; a term appears only after the thing it names has been seen.
 */
export type TeachBeat = TeachingBeat & { kind: "teach" };

/*
 * A play beat is a goal, a dial constraint, a prediction, and the learner's own
 * runs. The learner sets the dials (locked fields are fixed by the beat;
 * free fields must satisfy `requires` before START enables, with the
 * requirement stated in plain language). Each press of START consumes the
 * next seed from `seeds`, so the sequence of records is deterministic and
 * every prediction is derivable at test time from the exact records the learner
 * will produce. The prediction settles once `minRuns` runs have accumulated.
 */
export type DialRequirement = {
  description: string;
  locked: Partial<SamplingConfig>;
  satisfied: (sampling: SamplingConfig) => boolean;
};

export type PlayBeat = {
  kind: "play";
  id: string;
  goal: string;
  prompt: string;
  maxNewTokens: number;
  seeds: number[];
  minRuns: number;
  requires: DialRequirement;
  prediction: {
    question: string;
    options: PredictionOption[];
    deriveCorrectOption: (records: TokenMachineRecord[]) => string;
  };
};

export type RecapBeat = TeachingBeat & { kind: "recap" };

export type FreePlayBeat = {
  kind: "free-play";
  id: string;
  intro: string;
  baseConfig: TokenMachineConfig;
};

export type LessonBeat = SharedLessonBeat<PlayBeat, FreePlayBeat>;

export type TokenMachineLesson = Lesson<PlayBeat, FreePlayBeat> & {
  engine: "token-machine";
  model: TransformerModel;
  tokenizer: TokenizerLike;
};
