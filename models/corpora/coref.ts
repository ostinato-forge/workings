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

type Corpus = { train: string[]; heldOut: string[] };

function line(
  subject: string,
  distractor: string | null,
  place: string,
  object: string,
  meetVerb: string,
  secondVerb: string,
  pronoun: string,
): string {
  if (distractor === null) {
    return `${subject} carried the ${object} to the ${place} . ${pronoun} ${secondVerb} .`;
  }
  return `${subject} ${meetVerb} ${distractor} at the ${place} . ${pronoun} ${secondVerb} .`;
}

export function generateCorpus(seed: number): Corpus {
  const rng = mulberry32(seed);
  const all: string[] = [];
  const names = [
    ...FEMALE_NAMES.map((n) => ({ name: n, pronoun: "she" })),
    ...MALE_NAMES.map((n) => ({ name: n, pronoun: "he" })),
  ];
  for (const subject of names) {
    const opposite =
      subject.pronoun === "she" ? MALE_NAMES : FEMALE_NAMES;
    for (const place of PLACES) {
      for (const object of OBJECTS) {
        const meetVerb = MEET_VERBS[randInt(rng, MEET_VERBS.length)] as string;
        const secondVerb = SECOND_VERBS[
          randInt(rng, SECOND_VERBS.length)
        ] as string;
        // solo line: one actor only
        all.push(
          line(subject.name, null, place, object, meetVerb, secondVerb, subject.pronoun),
        );
        // distractor line: opposite-gender second actor; pronoun still
        // refers to the subject, so gender disambiguates the referent
        const distractor = opposite[randInt(rng, opposite.length)] as string;
        all.push(
          line(subject.name, distractor, place, object, meetVerb, secondVerb, subject.pronoun),
        );
      }
    }
  }
  const deduped = [...new Set(all)];
  const mixed = shuffled(rng, deduped);
  const heldOutCount = Math.max(200, Math.floor(mixed.length * 0.1));
  return {
    heldOut: mixed.slice(0, heldOutCount),
    train: mixed.slice(heldOutCount),
  };
}
