import { drawIndex, mulberry32 } from "./random";
import {
  snapshot,
  type EngineResult,
  type RunRecord,
} from "./run-record";

export type BigramCounts = Record<string, Record<string, number>>;

export type BigramConfig = {
  lines: string[];
  generateFrom: string;
  maxGenerated: number;
  seed: number;
};

export type BigramState = {
  counts: BigramCounts;
  generated: string[];
  lastToken: string;
  done: boolean;
  reason: "running" | "generated-max" | "no-continuation";
};

export type BigramCandidate = { token: string; count: number; prob: number };

export type BigramEvent =
  | { kind: "count-line"; line: string; pairs: [string, string][] }
  | {
      kind: "generate";
      prev: string;
      candidates: BigramCandidate[];
      sampled: string;
    }
  | { kind: "dead-end"; prev: string };

export type BigramRecord = RunRecord<BigramConfig, BigramState, BigramEvent>;

function words(line: string): string[] {
  return line.split(" ").filter((w) => w.length > 0);
}

export function countBigrams(lines: readonly string[]): BigramCounts {
  const counts: BigramCounts = {};
  for (const line of lines) {
    const tokens = words(line);
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const prev = tokens[i] as string;
      const next = tokens[i + 1] as string;
      const row = counts[prev] ?? {};
      row[next] = (row[next] ?? 0) + 1;
      counts[prev] = row;
    }
  }
  return counts;
}

export type CoverageReport = {
  lineCount: number;
  linesWithUnseenTransition: number;
  transitions: { prev: string; next: string; count: number }[];
};

export function evaluateBigramCoverage(
  counts: BigramCounts,
  lines: readonly string[],
): CoverageReport {
  let linesWithUnseenTransition = 0;
  const transitions: CoverageReport["transitions"] = [];
  for (const line of lines) {
    const tokens = words(line);
    let unseen = false;
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const prev = tokens[i] as string;
      const next = tokens[i + 1] as string;
      const count = counts[prev]?.[next] ?? 0;
      if (count === 0) unseen = true;
      transitions.push({ prev, next, count });
    }
    if (unseen) linesWithUnseenTransition += 1;
  }
  return { lineCount: lines.length, linesWithUnseenTransition, transitions };
}

function candidateRow(counts: BigramCounts, prev: string): BigramCandidate[] {
  const row = counts[prev];
  if (row === undefined) return [];
  const total = Object.values(row).reduce((s, c) => s + c, 0);
  return Object.entries(row)
    .map(([token, count]) => ({ token, count, prob: count / total }))
    .sort((a, b) => b.count - a.count || (a.token < b.token ? -1 : 1));
}

export function runBigramBabble(
  config: BigramConfig,
): EngineResult<BigramRecord> {
  const lines = config.lines.filter((line) => words(line).length > 0);
  if (lines.length === 0) {
    return {
      ok: false,
      problem: {
        what: "The corpus is empty, so there is nothing to count.",
        fix: "Add at least one line with two or more tokens.",
      },
    };
  }
  if (!Number.isInteger(config.maxGenerated) || config.maxGenerated <= 0) {
    return {
      ok: false,
      problem: {
        what: "The number of tokens to babble must be a whole number, at least 1.",
        fix: "Set it to a positive whole number.",
      },
    };
  }
  const allTokens = new Set(lines.flatMap(words));
  if (!allTokens.has(config.generateFrom)) {
    return {
      ok: false,
      problem: {
        what: `The corpus never contains the token "${config.generateFrom}".`,
        fix: "Start babbling from a token that appears in the corpus.",
      },
    };
  }

  const counts: BigramCounts = {};
  let state: BigramState = {
    counts: {},
    generated: [],
    lastToken: config.generateFrom,
    done: false,
    reason: "running",
  };
  const initial = snapshot(state);
  const steps: BigramRecord["steps"] = [];
  const push = (event: BigramEvent, next: BigramState): void => {
    steps.push({
      index: steps.length,
      event,
      before: snapshot(state),
      after: snapshot(next),
    });
    state = next;
  };

  for (const line of lines) {
    const tokens = words(line);
    const pairs: [string, string][] = [];
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const prev = tokens[i] as string;
      const next = tokens[i + 1] as string;
      pairs.push([prev, next]);
      const row = counts[prev] ?? {};
      row[next] = (row[next] ?? 0) + 1;
      counts[prev] = row;
    }
    push({ kind: "count-line", line, pairs }, { ...state, counts: snapshot(counts) });
  }

  const rng = mulberry32(config.seed);
  while (!state.done) {
    const candidates = candidateRow(counts, state.lastToken);
    if (candidates.length === 0) {
      push(
        { kind: "dead-end", prev: state.lastToken },
        { ...state, done: true, reason: "no-continuation" },
      );
      break;
    }
    const sampled = (
      candidates[drawIndex(rng, candidates.map((c) => c.prob))] as BigramCandidate
    ).token;
    const generated = [...state.generated, sampled];
    const doneNow = generated.length >= config.maxGenerated;
    push(
      { kind: "generate", prev: state.lastToken, candidates, sampled },
      {
        ...state,
        generated,
        lastToken: sampled,
        done: doneNow,
        reason: doneNow ? "generated-max" : "running",
      },
    );
  }

  return {
    ok: true,
    record: {
      engine: "bigram",
      seed: config.seed,
      config: snapshot(config),
      initial,
      final: snapshot(state),
      steps,
    },
  };
}
