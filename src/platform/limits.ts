/*
 * Input limits the platform applies before any engine parses learner text.
 * Engines do not set their own limits, so every subject gets the same
 * protection and the same plain messages.
 */

import type { EngineProblem } from "./run-record";
import { isPlainRecord } from "./stage-event";
import { countedLines } from "./text";

export const LIMITS = Object.freeze({
  maxArtifacts: 8,
  maxArtifactBytes: 64_000,
  maxTotalBytes: 200_000,
  maxArtifactLines: 2_000,
  maxLineCharacters: 400,
  maxDataDepth: 40,
  maxDataNodes: 20_000,
  maxRunSteps: 5_000,
  // Loop items times entities. It cannot be counted before parsing.
  maxRepeatedWork: 2_000,
});

const count = (value: number) => value.toLocaleString("en-US");
const encoder = new TextEncoder();

function characterCount(line: string): number {
  // A string's length counts UTF-16 code units, which is never fewer than
  // the characters a learner sees, so only long lines need a full count.
  if (line.length <= LIMITS.maxLineCharacters) return line.length;
  let characters = 0;
  for (const _ of line) characters += 1;
  return characters;
}

export function checkSourceLimits(sources: unknown, fileNames?: ReadonlyMap<string, string>): EngineProblem | null {
  if (!isPlainRecord(sources)) return { what: "The files could not be read.", fix: "Give the files as a set of named texts." };
  const entries = Object.entries(sources);
  if (entries.length > LIMITS.maxArtifacts) {
    return { what: `There are ${count(entries.length)} files.`, fix: `Use ${LIMITS.maxArtifacts} files or fewer.` };
  }
  const nameOf = (id: string) => fileNames?.get(id) ?? id;
  const texts: [string, string][] = [];
  let total = 0;
  for (const [id, text] of entries) {
    if (typeof text !== "string") return { what: `${nameOf(id)} is not text.`, fix: "Give each file as text." };
    const bytes = encoder.encode(text).length;
    if (bytes > LIMITS.maxArtifactBytes) {
      return { what: `${nameOf(id)} is ${count(bytes)} bytes long.`, fix: `Keep each file to ${count(LIMITS.maxArtifactBytes)} bytes or less.` };
    }
    total += bytes;
    texts.push([id, text]);
  }
  if (total > LIMITS.maxTotalBytes) {
    return { what: `The files are ${count(total)} bytes long in total.`, fix: `Keep all files together to ${count(LIMITS.maxTotalBytes)} bytes or less.` };
  }
  for (const [id, text] of texts) {
    const lines = countedLines(text);
    if (lines.length > LIMITS.maxArtifactLines) {
      return { what: `${nameOf(id)} has ${count(lines.length)} lines.`, fix: `Keep each file to ${count(LIMITS.maxArtifactLines)} lines or fewer.` };
    }
    for (const [i, line] of lines.entries()) {
      const characters = characterCount(line);
      if (characters > LIMITS.maxLineCharacters) {
        return {
          what: `Line ${i + 1} of ${nameOf(id)} is ${count(characters)} characters long.`,
          fix: `Keep each line to ${LIMITS.maxLineCharacters} characters or fewer.`,
        };
      }
    }
  }
  return null;
}

// Walks parsed data with an explicit stack, so deep nesting cannot exhaust
// the call stack. The node limit also stops data that refers to itself.
export function checkDataLimits(value: unknown): EngineProblem | null {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    nodes += 1;
    if (nodes > LIMITS.maxDataNodes) return tooManyValues();
    if (typeof next.value !== "object" || next.value === null) continue;
    const depth = next.depth + 1;
    if (depth > LIMITS.maxDataDepth) {
      return { what: `The data is nested more than ${LIMITS.maxDataDepth} levels deep.`, fix: `Keep nesting to ${LIMITS.maxDataDepth} levels or fewer.` };
    }
    const children = Object.values(next.value);
    // Every value on the stack is counted later, so a wide container that
    // would pass the limit is reported now instead of filling the stack.
    if (nodes + stack.length + children.length > LIMITS.maxDataNodes) return tooManyValues();
    for (const child of children) stack.push({ value: child, depth });
  }
  return null;
}

function tooManyValues(): EngineProblem {
  return { what: `The data holds more than ${count(LIMITS.maxDataNodes)} values.`, fix: `Keep the data to ${count(LIMITS.maxDataNodes)} values or fewer.` };
}

// The work an engine may count. The message is fixed for each kind, so an
// engine cannot put free text in front of the learner.
export const REPEATED_WORK = ["task"] as const;
export type RepeatedWork = (typeof REPEATED_WORK)[number];

const REPEATED_WORK_TEXT: Record<RepeatedWork, { noun: string; fix: string }> = {
  task: { noun: "a task", fix: "Use fewer loop items or fewer servers" },
};

// Engines call this once they know how often the input repeats some work,
// such as a task over every loop item on every server.
export function checkRepeatedWork(total: number, what: RepeatedWork): EngineProblem | null {
  if (Number.isFinite(total) && total <= LIMITS.maxRepeatedWork) return null;
  const text = REPEATED_WORK_TEXT[what];
  const times = Number.isFinite(total) ? count(total) : `more than ${count(LIMITS.maxRepeatedWork)}`;
  return {
    what: `This run would repeat ${text.noun} ${times} times.`,
    fix: `${text.fix}, so the total is ${count(LIMITS.maxRepeatedWork)} or fewer.`,
  };
}

export function checkRunSize(record: { steps: readonly unknown[] }): EngineProblem | null {
  const steps = record.steps.length;
  if (steps <= LIMITS.maxRunSteps) return null;
  return {
    what: `The run took ${count(steps)} steps.`,
    fix: `Make the input do less work so the run takes ${count(LIMITS.maxRunSteps)} steps or fewer.`,
  };
}
