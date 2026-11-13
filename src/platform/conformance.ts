/*
 * The shared suite every subject must pass. A subject supplies at least two
 * cases, and the suite checks its runs against the stage contract: the
 * same input gives the same run, every event can be drawn and points back
 * to text that exists, the world view agrees with each event's status, and
 * hostile input cannot crash or hang a lesson.
 */

import { describe, expect, test } from "vitest";
import { PLATFORM_MEASURES } from "./measures";
import type { StageRunRecord } from "./run-record";
import { runSubjectWithReport, type RunReport } from "./run-subject";
import type { StageEvent } from "./stage-event";
import { checkArgs, isMeasureValue, lookup, type ArgContext, type ArgSpec, type MeasureArgs, type Subject, type WorldView } from "./subject";
import { countedLines, thrownMessage } from "./text";

export const CONFORMANCE_RULES = [
  "deterministic",
  "record-invariants",
  "event-shape",
  "causes-exist",
  "targets-exist",
  "changed-is-visible",
  "after-points-back",
  "measures-total",
  "hostile-input-safe",
] as const;
export type ConformanceRule = (typeof CONFORMANCE_RULES)[number];

export type ConformanceCase<World> = {
  name: string;
  sources: Record<string, string>;
  world: World;
  seed: number;
  options: Record<string, string | number | boolean>;
  view: string;
};

// A full source set that puts hostile names in places that matter to the
// subject. It runs on the first case's world, seed, and options.
export type HostileCase = { name: string; sources: Record<string, string> };

export type ConformanceProblem = { rule: ConformanceRule; caseName?: string; step?: number; message: string };

export const HOSTILE_TIME_LIMIT_MS = 1_000;
// A busy machine can slow one run down, so a slow run is timed again and
// only the best time counts.
const HOSTILE_TIMED_RUNS = 3;

// Flow-style mappings, one level per line, so the text stays inside the
// line limits while the nesting grows.
function nestedYaml(depth: number): string {
  const open = Array.from({ length: depth }, (_, level) => `${" ".repeat(level)}{a:`);
  return [...open, "1", "}".repeat(depth)].join("\n");
}

function linesOf(count: number, line: (index: number) => string): string {
  return Array.from({ length: count }, (_, index) => line(index)).join("\n");
}

const PROTOTYPE_NAMES = ["constructor", "__proto__", "prototype"];

// The first eight texts are stopped by the source limits, so they test the
// limits. The rest fit inside every limit, so the subject's own parser sees
// them.
export const HOSTILE_TEXTS: readonly { name: string; text: string }[] = Object.freeze([
  { name: "empty text", text: "" },
  { name: "one megabyte of the letter a", text: "a".repeat(1_048_576) },
  { name: "5,000 opening square brackets", text: "[".repeat(5_000) },
  // Flow style keeps the text small while nesting 5,000 levels deep.
  { name: "5,000 nested YAML mappings", text: `${"{a: ".repeat(5_000)}1${"}".repeat(5_000)}` },
  { name: "unclosed template expression followed by 3,000 spaces", text: `{{${" ".repeat(3_000)}` },
  { name: "only prototype names", text: "constructor\n__proto__\nprototype\n" },
  { name: "null character", text: "name\u0000value\n" },
  { name: "only carriage returns", text: "\r".repeat(100) },
  { name: "1,999 lines of one opening square bracket", text: linesOf(1_999, () => "[") },
  { name: "YAML mappings nested 39 levels deep over several lines", text: nestedYaml(39) },
  { name: "YAML mappings nested 60 levels deep over several lines", text: nestedYaml(60) },
  { name: "unclosed template expression followed by 396 spaces", text: `{{${" ".repeat(396)}` },
  // Each line and its line ending take 400 bytes, cut at exactly 63,000.
  { name: "63,000 bytes of 399-character lines", text: `${"a".repeat(399)}\n`.repeat(158).slice(0, 63_000) },
  { name: "1,999 lines of prototype names", text: linesOf(1_999, (index) => PROTOTYPE_NAMES[index % PROTOTYPE_NAMES.length] ?? "") },
]);

type Sampled = { ok: true; args: MeasureArgs } | { ok: false; problem: string };

// Builds arguments that pass a measure's own spec, so the suite can call
// every measure without knowing what it does.
export function sampleArgs(spec: Record<string, ArgSpec>, context: ArgContext): Sampled {
  const args: MeasureArgs = {};
  for (const [name, arg] of Object.entries(spec)) {
    let value: string | number | undefined;
    if (arg.kind === "choice") value = arg.choices[0];
    else if (arg.kind === "number") value = arg.integer ? Math.ceil(arg.min) : arg.min;
    else {
      const ids = arg.kind === "entity" ? context.entityIds : arg.kind === "artifact" ? context.artifactIds : context.factIds;
      value = ids.values().next().value;
      if (value === undefined) {
        return { ok: false, problem: `The argument "${name}" needs ${arg.kind === "fact" ? "a" : "an"} ${arg.kind}, but the cases show none.` };
      }
    }
    if (value === undefined) return { ok: false, problem: `The argument "${name}" has no value that fits its spec.` };
    args[name] = value;
  }
  return { ok: true, args };
}

function characterCount(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

type CaseRuns<World> = { item: ConformanceCase<World>; first: RunReport<World>; second: RunReport<World> };

class Checker<World> {
  private runs: CaseRuns<World>[] | undefined;

  constructor(
    private readonly subject: Subject<World>,
    private readonly cases: readonly ConformanceCase<World>[],
    private readonly hostileCases: readonly HostileCase[],
  ) {
    if (cases.length < 2) throw new Error(`Subject "${subject.id}" needs at least two cases for the conformance suite.`);
  }

  private caseRuns(): CaseRuns<World>[] {
    this.runs ??= this.cases.map((item) => ({
      item,
      first: runSubjectWithReport(this.subject, item),
      second: runSubjectWithReport(this.subject, item),
    }));
    return this.runs;
  }

  // Runs that produced a record. The run path turns a record with a
  // malformed event into an internal fault, so a malformed event is
  // reported once, under event-shape, and later rules never see it.
  private records(): { item: ConformanceCase<World>; record: StageRunRecord<World> }[] {
    return this.caseRuns().flatMap(({ item, first }) => (first.result.ok ? [{ item, record: first.result.record }] : []));
  }

  private describeWorld(world: World, sources: Record<string, string>, view: string): WorldView | string {
    try {
      return this.subject.describe({ world, sources, view });
    } catch (error) {
      return `describe threw: ${thrownMessage(error)}`;
    }
  }

  check(rule: ConformanceRule): ConformanceProblem[] {
    switch (rule) {
      case "deterministic": return this.deterministic();
      case "record-invariants": return this.recordInvariants();
      case "event-shape": return this.eventShape();
      case "causes-exist": return this.perEvent(rule, (event, _step, record) => this.causeProblems(event, record));
      case "targets-exist": return this.perEvent(rule, (event, step, record, item) => this.targetProblems(event, step, record, item.view));
      case "changed-is-visible": return this.perEvent(rule, (event, step, record, item) => this.visibleProblems(event, step, record, item));
      case "after-points-back": return this.perEvent(rule, (event, step) => (event.after ?? [])
        .filter((index) => index >= step.index)
        .map((index) => `The event lists step ${index} in after, which is not an earlier step.`));
      case "measures-total": return this.measuresTotal();
      case "hostile-input-safe": return this.hostileInputSafe();
    }
  }

  private deterministic(): ConformanceProblem[] {
    return this.caseRuns().flatMap(({ item, first, second }) => {
      if (JSON.stringify(first.result) === JSON.stringify(second.result)) return [];
      const problem: ConformanceProblem = { rule: "deterministic", caseName: item.name, message: "Two runs of the same case gave different results." };
      if (first.result.ok && second.result.ok) {
        const a = first.result.record.steps;
        const b = second.result.record.steps;
        const index = a.findIndex((step, i) => JSON.stringify(step) !== JSON.stringify(b[i]));
        if (index >= 0) problem.step = index;
      }
      return [problem];
    });
  }

  private recordInvariants(): ConformanceProblem[] {
    return this.caseRuns().flatMap(({ item, first }): ConformanceProblem[] => {
      if (first.eventProblems !== undefined) return [];
      if (first.internal !== undefined) return [{ rule: "record-invariants", caseName: item.name, message: first.internal }];
      if (!first.result.ok) {
        return [{ rule: "record-invariants", caseName: item.name, message: `The case gave a problem instead of a run: ${first.result.problem.what}` }];
      }
      return [];
    });
  }

  private eventShape(): ConformanceProblem[] {
    return this.caseRuns().flatMap(({ item, first }) => (first.eventProblems ?? [])
      .map(({ step, message }) => ({ rule: "event-shape" as const, caseName: item.name, step, message })));
  }

  private perEvent(
    rule: ConformanceRule,
    check: (event: StageEvent, step: StageRunRecord<World>["steps"][number], record: StageRunRecord<World>, item: ConformanceCase<World>) => string[],
  ): ConformanceProblem[] {
    return this.records().flatMap(({ item, record }) => record.steps.flatMap((step) =>
      check(step.event, step, record, item).map((message) => ({ rule, caseName: item.name, step: step.index, message }))));
  }

  private causeProblems(event: StageEvent, record: StageRunRecord<World>): string[] {
    if (event.causes.length === 0) {
      // A subject picks its own event kinds, so the kind alone cannot excuse
      // an event from pointing at the learner's text. The fault must be one
      // the subject declares.
      if (event.kind !== "fault") return [`The event has no causes, but only a fault event may have none. Its kind is "${event.kind}".`];
      const fault = event.data?.fault;
      return lookup(this.subject.faults, fault) === undefined
        ? ["The fault event has no causes, but its data.fault does not name a fault the subject declares."]
        : [];
    }
    return event.causes.flatMap((cause, i) => {
      const { ref } = cause;
      const where = `Cause ${i + 1}`;
      const artifact = this.subject.artifacts.find((item) => item.id === ref.artifactId);
      if (artifact === undefined) return [`${where} names artifact "${ref.artifactId}", which the subject does not declare.`];
      const sources = record.config.sources;
      const text = Object.hasOwn(sources, ref.artifactId) ? sources[ref.artifactId] : undefined;
      if (text === undefined) return [`${where} names artifact "${ref.artifactId}", which is not in the run's text.`];
      if ("field" in ref) {
        if (artifact.kind !== "settings") return [`${where} names field "${ref.field}" of a text artifact.`];
        return artifact.fields.some((field) => field.id === ref.field) ? [] : [`${where} names field "${ref.field}", which the artifact does not declare.`];
      }
      const lines = countedLines(text);
      if (ref.toLine > lines.length) return [`${where} points at line ${ref.toLine}, but the text has ${lines.length} lines.`];
      const length = characterCount(lines[ref.fromLine - 1] ?? "");
      const lastColumn = ref.toColumn ?? ref.fromColumn;
      if (lastColumn !== undefined && lastColumn > length) {
        return [`${where} points at column ${lastColumn} of line ${ref.fromLine}, which has ${length} characters.`];
      }
      return [];
    });
  }

  private views(step: StageRunRecord<World>["steps"][number], record: StageRunRecord<World>, view: string) {
    const sources = record.config.sources;
    return { before: this.describeWorld(step.before, sources, view), after: this.describeWorld(step.after, sources, view) };
  }

  private targetProblems(event: StageEvent, step: StageRunRecord<World>["steps"][number], record: StageRunRecord<World>, view: string): string[] {
    if (event.targets.length === 0) return [];
    const { before, after } = this.views(step, record, view);
    if (typeof before === "string") return [before];
    if (typeof after === "string") return [after];
    return event.targets.flatMap((target) => {
      const entities = [before, after].flatMap((view) => view.entities.filter((entity) => entity.id === target.entityId));
      if (entities.length === 0) return [`The target entity "${target.entityId}" is not in the world before or after the event.`];
      const { factId } = target;
      if (factId === undefined || entities.some((entity) => entity.facts.some((fact) => fact.id === factId))) return [];
      return [`The target fact "${factId}" of entity "${target.entityId}" is not in the world before or after the event.`];
    });
  }

  private visibleProblems(event: StageEvent, step: StageRunRecord<World>["steps"][number], record: StageRunRecord<World>, item: ConformanceCase<World>): string[] {
    if (event.status !== "changed" && event.status !== "unchanged") return [];
    const { before, after } = this.views(step, record, item.view);
    if (typeof before === "string") return [before];
    if (typeof after === "string") return [after];
    const same = JSON.stringify(before) === JSON.stringify(after);
    if (event.status === "changed" && same) return ["The event says changed, but the world looks the same before and after."];
    if (event.status === "unchanged" && !same) return ["The event says unchanged, but the world looks different before and after."];
    return [];
  }

  private argContext(): ArgContext {
    const entityIds = new Set<string>();
    const factIds = new Set<string>();
    for (const item of this.cases) {
      const view = this.describeWorld(item.world, item.sources, item.view);
      if (typeof view === "string") continue;
      for (const entity of view.entities) {
        entityIds.add(entity.id);
        entity.facts.forEach((fact) => factIds.add(fact.id));
      }
    }
    return { artifactIds: new Set(this.subject.artifacts.map((artifact) => artifact.id)), entityIds, factIds };
  }

  private measuresTotal(): ConformanceProblem[] {
    const context = this.argContext();
    const measures = [...PLATFORM_MEASURES, ...this.subject.measures];
    return measures.flatMap(([name, measure]): ConformanceProblem[] => {
      const report = (message: string): ConformanceProblem[] => [{ rule: "measures-total", message: `Measure "${name}": ${message}` }];
      const sampled = sampleArgs(measure.args, context);
      if (!sampled.ok) return report(sampled.problem);
      const argProblems = checkArgs(measure.args, sampled.args, context);
      if (argProblems.length > 0) return report(argProblems.join(" "));
      try {
        const value: unknown = measure.compute([], sampled.args, { referenceRuns: [] });
        return isMeasureValue(value) ? [] : report("It gave something that is not a value for an empty list of runs.");
      } catch (error) {
        return report(`It threw for an empty list of runs: ${thrownMessage(error)}`);
      }
    });
  }

  // The event checks that matter most for text the subject was not built
  // for. The run path already checked each event's shape. Each message
  // names the check, since all of them are reported under hostile-input-safe.
  private hostileRecordProblems(record: StageRunRecord<World>, view: string): { step: number; message: string }[] {
    return record.steps.flatMap((step) => [
      ...this.causeProblems(step.event, record).map((message) => `causes-exist: ${message}`),
      ...this.targetProblems(step.event, step, record, view).map((message) => `targets-exist: ${message}`),
    ].map((message) => ({ step: step.index, message })));
  }

  private timedRun(caseName: string, sources: Record<string, string>): ConformanceProblem[] {
    const [base] = this.cases;
    if (base === undefined) return [];
    const input = { sources, world: base.world, seed: base.seed, options: base.options };
    const timed = () => {
      const start = performance.now();
      const report = runSubjectWithReport(this.subject, input);
      return { report, elapsed: performance.now() - start };
    };
    const { report, elapsed: firstElapsed } = timed();
    let best = firstElapsed;
    for (let run = 1; run < HOSTILE_TIMED_RUNS && best > HOSTILE_TIME_LIMIT_MS; run += 1) best = Math.min(best, timed().elapsed);
    const elapsed = Math.round(best);
    const problems: ConformanceProblem[] = [];
    // The run path turns a throw or a broken record into a plain problem
    // for the learner. The subject is still at fault, so the suite reads
    // the reason the run path kept.
    if (report.eventProblems !== undefined) {
      problems.push(...report.eventProblems
        .map(({ step, message }) => ({ rule: "hostile-input-safe" as const, caseName, step, message: `event-shape: ${message}` })));
    } else if (report.internal !== undefined) {
      problems.push({ rule: "hostile-input-safe", caseName, message: `The run had an internal fault: ${report.internal}` });
    } else if (report.result.ok) {
      problems.push(...this.hostileRecordProblems(report.result.record, base.view)
        .map(({ step, message }) => ({ rule: "hostile-input-safe" as const, caseName, step, message })));
    }
    if (elapsed > HOSTILE_TIME_LIMIT_MS) {
      problems.push({ rule: "hostile-input-safe", caseName, message: `The run took ${elapsed} milliseconds, over the limit of ${HOSTILE_TIME_LIMIT_MS}.` });
    }
    return problems;
  }

  private hostileInputSafe(): ConformanceProblem[] {
    const [base] = this.cases;
    if (base === undefined) return [];
    const problems: ConformanceProblem[] = [];
    for (const hostile of HOSTILE_TEXTS) {
      for (const artifact of this.subject.artifacts) {
        const sources = { ...base.sources, [artifact.id]: hostile.text };
        problems.push(...this.timedRun(`${hostile.name} in ${artifact.id}`, sources));
      }
    }
    for (const hostile of this.hostileCases) problems.push(...this.timedRun(hostile.name, hostile.sources));
    return problems;
  }
}

export function formatConformanceProblem(problem: ConformanceProblem): string {
  const where = [problem.caseName === undefined ? "" : `case "${problem.caseName}"`, problem.step === undefined ? "" : `step ${problem.step}`]
    .filter(Boolean)
    .join(", ");
  return `${problem.rule}: ${where === "" ? "" : `${where}: `}${problem.message}`;
}

export function conformanceProblemList<World>(
  subject: Subject<World>,
  cases: readonly ConformanceCase<World>[],
  hostileCases: readonly HostileCase[] = [],
): ConformanceProblem[] {
  const checker = new Checker(subject, cases, hostileCases);
  return CONFORMANCE_RULES.flatMap((rule) => checker.check(rule));
}

export function subjectConformanceProblems<World>(
  subject: Subject<World>,
  cases: readonly ConformanceCase<World>[],
  hostileCases: readonly HostileCase[] = [],
): string[] {
  return conformanceProblemList(subject, cases, hostileCases).map(formatConformanceProblem);
}

// One named test per rule, so a failing subject shows which rule it breaks.
export function describeSubjectConformance<World>(
  name: string,
  subject: Subject<World>,
  cases: readonly ConformanceCase<World>[],
  hostileCases: readonly HostileCase[] = [],
): void {
  describe(`${name} conformance`, () => {
    const checker = new Checker(subject, cases, hostileCases);
    for (const rule of CONFORMANCE_RULES) {
      // The hostile texts include a megabyte of text, which a busy machine
      // needs more than the default five seconds to run through every artifact.
      test(rule, () => {
        expect(checker.check(rule).map(formatConformanceProblem)).toEqual([]);
      }, 60_000);
    }
  });
}
