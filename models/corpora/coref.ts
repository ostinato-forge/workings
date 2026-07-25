import { mulberry32, randInt, shuffled } from "../../src/engine/random";

export const FEMALE_NAMES = ["mara", "lena", "sofi", "ruth", "ada", "elle"];
export const MALE_NAMES = ["omar", "felix", "hugo", "ivan", "theo", "saul"];

const PLACES = [
  "market", "harbor", "garden", "workshop", "library",
  "field", "bakery", "station", "orchard", "bridge",
];
const OBJECTS = [
  "basket", "lantern", "ledger", "kettle", "hammer",
  "atlas", "bucket", "parcel", "banner", "crate",
];
const MEET_VERBS = ["met", "helped", "found", "joined"];
const SECOND_VERBS = ["smiled", "waited", "nodded", "paused", "laughed"];
const PREFIXES = [
  { text: "", wordCount: 0 },
  { text: "yesterday", wordCount: 1 },
  { text: "at dawn", wordCount: 2 },
  { text: "after the rain", wordCount: 3 },
] as const;
const HELD_OUT_PER_KIND = 80;

export type DistractorKind = "opposite" | "same" | "none";

export type CorefItem = {
  text: string;
  referentIndex: number;
  distractorIndex: number | null;
  distractorKind: DistractorKind;
};

type Corpus = { train: CorefItem[]; heldOut: CorefItem[] };

function item(
  prefix: (typeof PREFIXES)[number],
  subject: string,
  distractor: string | null,
  distractorKind: DistractorKind,
  place: string,
  object: string,
  meetVerb: string,
  secondVerb: string,
  pronoun: string,
): CorefItem {
  const prefixText = prefix.text.length === 0 ? "" : `${prefix.text} `;
  if (distractor === null) {
    return {
      text: `${prefixText}${subject} carried the ${object} to the ${place} . ${pronoun} ${secondVerb} .`,
      referentIndex: prefix.wordCount,
      distractorIndex: null,
      distractorKind,
    };
  }
  return {
    text: `${prefixText}${subject} ${meetVerb} ${distractor} at the ${place} . ${pronoun} ${secondVerb} .`,
    referentIndex: prefix.wordCount,
    distractorIndex: prefix.wordCount + 2,
    distractorKind,
  };
}

export function generateCorpus(seed: number): Corpus {
  const rng = mulberry32(seed);
  const names = [
    ...FEMALE_NAMES.map((n) => ({ name: n, pronoun: "she" })),
    ...MALE_NAMES.map((n) => ({ name: n, pronoun: "he" })),
  ];
  const distractorKinds = shuffled(rng, [
    ...Array.from({ length: 600 }, () => "opposite" as const),
    ...Array.from({ length: 600 }, () => "same" as const),
  ]);
  const all: CorefItem[] = [];
  let distractorKindIndex = 0;
  for (const subject of names) {
    const opposite =
      subject.pronoun === "she" ? MALE_NAMES : FEMALE_NAMES;
    const same = (
      subject.pronoun === "she" ? FEMALE_NAMES : MALE_NAMES
    ).filter((name) => name !== subject.name);
    for (const place of PLACES) {
      for (const object of OBJECTS) {
        all.push(
          item(
            PREFIXES[randInt(rng, PREFIXES.length)] as (typeof PREFIXES)[number],
            subject.name,
            null,
            "none",
            place,
            object,
            MEET_VERBS[randInt(rng, MEET_VERBS.length)] as string,
            SECOND_VERBS[randInt(rng, SECOND_VERBS.length)] as string,
            subject.pronoun,
          ),
        );
        const distractorKind = distractorKinds[
          distractorKindIndex
        ] as Exclude<DistractorKind, "none">;
        distractorKindIndex += 1;
        const distractorPool =
          distractorKind === "opposite" ? opposite : same;
        all.push(
          item(
            PREFIXES[randInt(rng, PREFIXES.length)] as (typeof PREFIXES)[number],
            subject.name,
            distractorPool[randInt(rng, distractorPool.length)] as string,
            distractorKind,
            place,
            object,
            MEET_VERBS[randInt(rng, MEET_VERBS.length)] as string,
            SECOND_VERBS[randInt(rng, SECOND_VERBS.length)] as string,
            subject.pronoun,
          ),
        );
      }
    }
  }

  const uniqueByText = new Map<string, CorefItem>();
  for (const generated of all) {
    if (!uniqueByText.has(generated.text)) {
      uniqueByText.set(generated.text, generated);
    }
  }
  const byKind: Record<DistractorKind, CorefItem[]> = {
    opposite: [],
    same: [],
    none: [],
  };
  for (const generated of uniqueByText.values()) {
    byKind[generated.distractorKind].push(generated);
  }
  const partitions = {
    opposite: shuffled(rng, byKind.opposite),
    same: shuffled(rng, byKind.same),
    none: shuffled(rng, byKind.none),
  };
  const heldOut = shuffled(rng, [
    ...partitions.opposite.slice(0, HELD_OUT_PER_KIND),
    ...partitions.same.slice(0, HELD_OUT_PER_KIND),
    ...partitions.none.slice(0, HELD_OUT_PER_KIND),
  ]);
  const train = shuffled(rng, [
    ...partitions.opposite.slice(HELD_OUT_PER_KIND),
    ...partitions.same.slice(HELD_OUT_PER_KIND),
    ...partitions.none.slice(HELD_OUT_PER_KIND),
  ]);
  return {
    heldOut,
    train,
  };
}
