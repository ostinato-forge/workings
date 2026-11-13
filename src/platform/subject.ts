/*
 * The subject adapter is the code a subject supplies so the stage can run
 * and draw it. Lessons name a subject's measures, faults, and views in
 * package data, so every name lookup goes through a Map. A plain object
 * would find names such as "constructor" on its prototype.
 */

import type { ComponentType } from "react";
import { PLATFORM_MEASURES } from "./measures";
import type { EngineResult, StageRunRecord } from "./run-record";
import { isPlainRecord } from "./stage-event";

export type ArtifactKind =
  | { id: string; fileName: string; kind: "text"; language: string }
  | { id: string; fileName: string; kind: "settings"; fields: { id: string; label: string }[] };

export type EntityFact = { id: string; label: string; value: string; tone: "good" | "bad" | "neutral" };

export type EntityView = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  facts: EntityFact[];
  table?: { columns: string[]; rows: string[][] };
};

export type WorldView = {
  entities: EntityView[];
  // For worlds that are graphs.
  links?: { from: string; to: string; label?: string }[];
};

// Measure arguments come from package data. There is deliberately no free
// text, pattern, or path kind: a package can only pick from what the
// subject offers.
export type ArgSpec =
  | { kind: "choice"; choices: string[] }
  | { kind: "number"; min: number; max: number; integer: boolean }
  | { kind: "entity" }
  | { kind: "artifact" }
  | { kind: "fact" };

export type ArgValue = string | number | boolean;
export type MeasureArgs = Record<string, ArgValue>;
export type MeasureValue = string | number | boolean | (string | number)[];

// The ids an argument may name. A package is checked against the subject's
// artifacts and the entities and facts its starting world shows.
export type ArgContext = {
  artifactIds: ReadonlySet<string>;
  entityIds: ReadonlySet<string>;
  factIds: ReadonlySet<string>;
};

export type MeasureContext<World> = {
  // Runs of the reference solution, for measures that compare against it.
  referenceRuns: StageRunRecord<World>[];
};

export type Measure<World> = {
  args: Record<string, ArgSpec>;
  // The fact ids the measure reads.
  evidence: string[];
  compute(runs: StageRunRecord<World>[], args: MeasureArgs, context: MeasureContext<World>): MeasureValue;
};

export type Fault<World> = {
  label: string;
  apply(world: World, entityId: string): World;
};

export type SubjectRunInput<World> = {
  // Artifact id to text, or to serialized settings.
  sources: Record<string, string>;
  world: World;
  seed: number;
  options: Record<string, string | number | boolean>;
};

export type Subject<World> = {
  id: string;
  // Bumps when run behavior changes.
  version: number;
  simulated: boolean;
  artifacts: ArtifactKind[];
  // Total over learner input. Never throws.
  run(input: SubjectRunInput<World>): EngineResult<StageRunRecord<World>>;
  // The view name lets one world show different facts in different lessons.
  describe(input: { world: World; sources: Record<string, string>; view: string }): WorldView;
  measures: Map<string, Measure<World>>;
  faults?: Map<string, Fault<World>>;
  // Custom views keyed by entity kind, and one for the whole world when the
  // world is a graph.
  entityViews?: Map<string, ComponentType<{ entity: EntityView }>>;
  worldView?: ComponentType<{ view: WorldView }>;
  results: "matrix" | "list";
  validateStep(step: unknown): string[];
};

const PACKAGE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isPackageId(text: unknown): text is string {
  return typeof text === "string" && PACKAGE_ID.test(text);
}

export function lookup<Value>(table: ReadonlyMap<string, Value> | undefined, name: unknown): Value | undefined {
  if (table === undefined || typeof name !== "string") return undefined;
  return table.get(name);
}

export function isMeasureValue(value: unknown): value is MeasureValue {
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value)) return false;
  return value.every((item) => typeof item === "string" || (typeof item === "number" && Number.isFinite(item)));
}

function idProblem(value: unknown, name: string, noun: string, ids: ReadonlySet<string>): string | null {
  if (typeof value !== "string") return `The argument "${name}" must name ${noun === "entity" || noun === "artifact" ? "an" : "a"} ${noun}.`;
  return ids.has(value) ? null : `There is no ${noun} named "${value}".`;
}

function argProblem(spec: ArgSpec, name: string, value: unknown, context: ArgContext): string | null {
  switch (spec.kind) {
    case "choice":
      return typeof value === "string" && spec.choices.includes(value)
        ? null
        : `The argument "${name}" must be one of: ${spec.choices.join(", ")}.`;
    case "number": {
      const fits = typeof value === "number" && Number.isFinite(value) && value >= spec.min && value <= spec.max &&
        (!spec.integer || Number.isInteger(value));
      return fits ? null : `The argument "${name}" must be a ${spec.integer ? "whole number" : "number"} from ${spec.min} to ${spec.max}.`;
    }
    case "entity":
      return idProblem(value, name, "entity", context.entityIds);
    case "artifact":
      return idProblem(value, name, "artifact", context.artifactIds);
    case "fact":
      return idProblem(value, name, "fact", context.factIds);
  }
}

export function checkArgs(spec: Record<string, ArgSpec>, args: unknown, context: ArgContext): string[] {
  if (!isPlainRecord(args)) return ["The arguments must be a set of named values."];
  const problems: string[] = [];
  for (const name of Object.keys(spec)) {
    if (!Object.hasOwn(args, name)) problems.push(`The argument "${name}" is missing.`);
  }
  for (const [name, value] of Object.entries(args)) {
    const argSpec = Object.hasOwn(spec, name) ? spec[name] : undefined;
    if (argSpec === undefined) {
      problems.push(`The argument "${name}" is not one this measure takes.`);
      continue;
    }
    const problem = argProblem(argSpec, name, value, context);
    if (problem !== null) problems.push(problem);
  }
  return problems;
}

const ID_RULE = "Use up to 64 lowercase letters, digits, dots, dashes, and underscores, starting with a letter or digit.";

function requireId(subjectId: string, what: string, value: string): void {
  if (!isPackageId(value)) throw new Error(`Subject "${subjectId}" has a ${what} "${value}" that is not a valid id. ${ID_RULE}`);
}

function requireSatisfiable(subjectId: string, measure: string, name: string, spec: ArgSpec): void {
  if (spec.kind === "choice" && spec.choices.length === 0) {
    throw new Error(`Subject "${subjectId}" measure "${measure}" argument "${name}" has no choices.`);
  }
  if (spec.kind === "number") {
    const lowest = spec.integer ? Math.ceil(spec.min) : spec.min;
    if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || lowest > spec.max) {
      throw new Error(`Subject "${subjectId}" measure "${measure}" argument "${name}" has a range that no value fits.`);
    }
  }
}

// Checks the subject's own names when the subject is defined, so a bad name
// fails at startup instead of when a lesson first uses it.
export function defineSubject<World>(subject: Subject<World>): Subject<World> {
  const subjectId = subject.id;
  requireId(subjectId, "subject id", subjectId);
  if (!Number.isInteger(subject.version) || subject.version < 1) {
    throw new Error(`Subject "${subjectId}" needs a version that is a positive whole number.`);
  }
  const artifactIds = new Set<string>();
  for (const artifact of subject.artifacts) {
    requireId(subjectId, "artifact id", artifact.id);
    if (artifactIds.has(artifact.id)) throw new Error(`Subject "${subjectId}" declares artifact "${artifact.id}" more than once.`);
    artifactIds.add(artifact.id);
    if (artifact.kind === "text") requireId(subjectId, "artifact language", artifact.language);
    else artifact.fields.forEach((field) => requireId(subjectId, "settings field id", field.id));
  }
  for (const [name, measure] of subject.measures) {
    requireId(subjectId, "measure name", name);
    if (PLATFORM_MEASURES.has(name)) {
      throw new Error(`Subject "${subjectId}" has a measure "${name}" with the same name as a platform measure.`);
    }
    for (const [argName, spec] of Object.entries(measure.args)) {
      requireId(subjectId, "argument name", argName);
      requireSatisfiable(subjectId, name, argName, spec);
    }
    measure.evidence.forEach((factId) => requireId(subjectId, "evidence fact id", factId));
  }
  for (const name of subject.faults?.keys() ?? []) requireId(subjectId, "fault name", name);
  for (const kind of subject.entityViews?.keys() ?? []) requireId(subjectId, "entity view kind", kind);
  return subject;
}
