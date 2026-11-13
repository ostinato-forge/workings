/*
 * A small, correct subject for platform tests. Its one artifact is a list
 * of commands on named counters. Nothing outside tests imports it.
 */

import { snapshot, type EngineResult, type StageRunRecord } from "../run-record";
import { STAGE_STATUSES, type StageEvent } from "../stage-event";
import { defineSubject, type Measure, type Subject, type SubjectRunInput, type WorldView } from "../subject";
import { splitLines } from "../text";

// Counters are a list, not an object keyed by name, because the names come
// from learner text and may be "__proto__" or "constructor".
export type CounterWorld = { counters: { name: string; value: number }[] };

const NAME = "([A-Za-z_][A-Za-z0-9_-]{0,39})";
const AMOUNT = "(\\d{1,6})";
const ADD = new RegExp(`^add ${AMOUNT} to ${NAME}$`);
const SET = new RegExp(`^set ${NAME} to ${AMOUNT}$`);
const CHECK = new RegExp(`^check ${NAME}$`);

type Command = { kind: "add" | "set"; name: string; amount: number } | { kind: "check"; name: string };

function parse(line: string): Command | null {
  const add = ADD.exec(line);
  if (add?.[1] !== undefined && add[2] !== undefined) return { kind: "add", name: add[2], amount: Number(add[1]) };
  const set = SET.exec(line);
  if (set?.[1] !== undefined && set[2] !== undefined) return { kind: "set", name: set[1], amount: Number(set[2]) };
  const check = CHECK.exec(line);
  if (check?.[1] !== undefined) return { kind: "check", name: check[1] };
  return null;
}

function valueOf(world: CounterWorld, name: string): number | undefined {
  return world.counters.find((counter) => counter.name === name)?.value;
}

function withValue(world: CounterWorld, name: string, value: number): CounterWorld {
  const exists = world.counters.some((counter) => counter.name === name);
  return {
    counters: exists
      ? world.counters.map((counter) => (counter.name === name ? { name, value } : counter))
      : [...world.counters, { name, value }],
  };
}

function lineCause(lineNumber: number): StageEvent["causes"] {
  return [{ ref: { artifactId: "counters", fromLine: lineNumber, toLine: lineNumber }, role: "primary" }];
}

// Applies one command. The status follows the counter's visible value, so a
// change the learner cannot see is never called a change.
function apply(world: CounterWorld, command: Command, lineNumber: number, line: string): { world: CounterWorld; event: StageEvent } {
  const before = valueOf(world, command.name);
  const base = { causes: lineCause(lineNumber), row: { id: `line-${lineNumber}`, label: line } };
  if (command.kind === "check") {
    if (before === undefined) {
      return { world, event: { ...base, kind: "check", status: "failed", targets: [], summary: `There is no counter named ${command.name}.` } };
    }
    return {
      world,
      event: { ...base, kind: "check", status: "info", targets: [{ entityId: command.name, factId: "value" }], summary: `Counter ${command.name} is ${before}.` },
    };
  }
  const value = command.kind === "add" ? (before ?? 0) + command.amount : command.amount;
  const status = before === value ? "unchanged" : "changed";
  const summary = command.kind === "add"
    ? `Added ${command.amount} to ${command.name}, which is now ${value}.`
    : `Set ${command.name} to ${value}.`;
  return {
    world: withValue(world, command.name, value),
    event: { ...base, kind: command.kind, status, targets: [{ entityId: command.name, factId: "value" }], summary, data: { amount: command.amount } },
  };
}

export function counterRun({ sources, world, seed, options }: SubjectRunInput<CounterWorld>): EngineResult<StageRunRecord<CounterWorld>> {
  const text = Object.hasOwn(sources, "counters") ? sources.counters ?? "" : "";
  const initial = snapshot(world);
  const steps: StageRunRecord<CounterWorld>["steps"] = [];
  let state = snapshot(world);
  for (const [i, raw] of splitLines(text).entries()) {
    const line = raw.trim();
    if (line === "") continue;
    const command = parse(line);
    if (command === null) {
      return {
        ok: false,
        problem: {
          what: `Line ${i + 1} of counters.txt cannot be read.`,
          fix: "Write each line as add <n> to <name>, set <name> to <n>, or check <name>.",
        },
      };
    }
    const next = apply(state, command, i + 1, line);
    steps.push({ index: steps.length, event: next.event, before: snapshot(state), after: snapshot(next.world) });
    state = next.world;
  }
  return {
    ok: true,
    record: { engine: "counter", seed, config: { sources: { ...sources }, options: { ...options } }, initial, final: snapshot(state), steps },
  };
}

export function counterDescribe({ world, view }: { world: CounterWorld; sources: Record<string, string>; view: string }): WorldView {
  return {
    entities: world.counters.map((counter) => ({
      id: counter.name,
      kind: "counter",
      title: counter.name,
      facts: [
        { id: "value", label: "Value", value: String(counter.value), tone: "neutral" as const },
        ...(view === "parity" ? [{ id: "parity", label: "Parity", value: counter.value % 2 === 0 ? "even" : "odd", tone: "neutral" as const }] : []),
      ],
    })),
  };
}

export function counterSubjectWith(change: Partial<Subject<CounterWorld>> = {}): Subject<CounterWorld> {
  return defineSubject<CounterWorld>({
    id: "counter",
    version: 1,
    simulated: false,
    artifacts: [{ id: "counters", fileName: "counters.txt", kind: "text", language: "plain" }],
    run: counterRun,
    describe: counterDescribe,
    measures: new Map<string, Measure<CounterWorld>>([
      ["counter-value", {
        args: { counter: { kind: "entity" } },
        evidence: ["value"],
        compute: (runs, args) => {
          const last = runs.at(-1);
          const name = args.counter;
          return last === undefined || typeof name !== "string" ? 0 : valueOf(last.final, name) ?? 0;
        },
      }],
      ["status-count", {
        args: { status: { kind: "choice", choices: [...STAGE_STATUSES] } },
        evidence: [],
        compute: (runs, args) => runs.at(-1)?.steps.filter((step) => step.event.status === args.status).length ?? 0,
      }],
    ]),
    faults: new Map([
      ["reset", { label: "Reset the counter to zero", apply: (world: CounterWorld, entityId: string) => valueOf(world, entityId) === undefined ? world : withValue(world, entityId, 0) }],
    ]),
    results: "list",
    validateStep: (step) => (typeof step === "object" && step !== null && !Array.isArray(step) ? [] : ["A counter step must be an object."]),
    ...change,
  });
}

export const counterSubject = counterSubjectWith();

export type CounterCase = SubjectRunInput<CounterWorld> & { name: string; view: string };

export const counterCases: CounterCase[] = [
  {
    name: "adds and sets",
    sources: { counters: "add 3 to apples\nset apples to 5\nset pears to 1\ncheck apples\n\ncheck plums" },
    world: { counters: [{ name: "apples", value: 2 }] },
    seed: 0,
    options: {},
    view: "default",
  },
  {
    name: "parity view",
    sources: { counters: "add 0 to a\r\nadd 2 to a\r\nset a to 2\r\nset b to 0\r\ncheck a" },
    world: { counters: [] },
    seed: 7,
    options: { verbose: true },
    view: "parity",
  },
];

// Hostile names in the places where the counter uses names.
export const counterHostileCases = [
  { name: "prototype names as counters", sources: { counters: "add 1 to __proto__\nset constructor to 2\ncheck prototype\ncheck __proto__" } },
];
