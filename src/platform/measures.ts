/*
 * Measures every subject gets. They read only the artifact text a run
 * kept, so they work the same way for any subject.
 */

import type { StageRunRecord } from "./run-record";
import type { Measure } from "./subject";
import { normalizeText } from "./text";

function sameSources(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a).sort();
  const other = Object.keys(b).sort();
  if (keys.length !== other.length || keys.some((key, i) => key !== other[i])) return false;
  return keys.every((key) => a[key] === b[key]);
}

function artifactText(run: StageRunRecord<unknown> | undefined, artifactId: string): string | undefined {
  if (run === undefined) return undefined;
  const { sources } = run.config;
  return Object.hasOwn(sources, artifactId) ? sources[artifactId] : undefined;
}

export const PLATFORM_MEASURES: ReadonlyMap<string, Measure<unknown>> = new Map<string, Measure<unknown>>([
  ["run-count", {
    args: {},
    evidence: [],
    compute: (runs) => runs.length,
  }],
  ["sources-unchanged", {
    args: {},
    evidence: [],
    // True when the learner ran again without editing anything.
    compute: (runs) => {
      const last = runs.at(-1);
      const previous = runs.at(-2);
      return last !== undefined && previous !== undefined && sameSources(last.config.sources, previous.config.sources);
    },
  }],
  ["sources-match-reference", {
    args: { artifact: { kind: "artifact" } },
    evidence: [],
    compute: (runs, args, { referenceRuns }) => {
      const artifactId = args.artifact;
      if (typeof artifactId !== "string") return false;
      const text = artifactText(runs.at(-1), artifactId);
      const reference = artifactText(referenceRuns.at(-1), artifactId);
      return text !== undefined && reference !== undefined && normalizeText(text) === normalizeText(reference);
    },
  }],
]);
