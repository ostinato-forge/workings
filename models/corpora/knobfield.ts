export const SUBJECTS = ["emma", "leo", "mara", "tom"];
export const VERBS = ["calls", "greets", "helps", "thanks"];
export const OBJECTS = ["plumber", "doctor", "teacher", "baker"];

export type KnobFieldCorpus = {
  train: string[];
  heldOut: string[];
  vocab: string[];
  fineClasses: string[];
  fineClassOf: Record<string, string>;
  coarseClasses: string[];
  coarseClassOf: Record<string, string>;
};

export function generateKnobFieldCorpus(): KnobFieldCorpus {
  const train: string[] = [];
  const heldOut: string[] = [];
  for (let i = 0; i < SUBJECTS.length; i += 1) {
    for (let j = 0; j < VERBS.length; j += 1) {
      for (let k = 0; k < OBJECTS.length; k += 1) {
        const line = `${SUBJECTS[i]} ${VERBS[j]} ${OBJECTS[k]}`;
        if (i !== j && j !== k) {
          train.push(line);
        } else {
          heldOut.push(line);
        }
      }
    }
  }
  const vocab = [...SUBJECTS, ...VERBS, ...OBJECTS];
  const fineClassOf: Record<string, string> = {};
  const coarseClassOf: Record<string, string> = {};
  for (const s of SUBJECTS) {
    fineClassOf[s] = "subject";
    coarseClassOf[s] = "thing";
  }
  for (const v of VERBS) {
    fineClassOf[v] = "verb";
    coarseClassOf[v] = "verb";
  }
  for (const o of OBJECTS) {
    fineClassOf[o] = "object";
    coarseClassOf[o] = "thing";
  }
  return {
    train,
    heldOut,
    vocab,
    fineClasses: ["subject", "verb", "object"],
    fineClassOf,
    coarseClasses: ["thing", "verb"],
    coarseClassOf,
  };
}
