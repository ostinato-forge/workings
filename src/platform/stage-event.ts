/*
 * The stage event is the one shape every subject uses to describe a step of
 * a run. The stage draws it, and the learner follows a change back to the
 * lines or fields that caused it. Subjects build these events from learner
 * input, so the platform checks the shape at run time instead of trusting
 * the type.
 */

export type SourceRef =
  | {
      artifactId: string;
      // Lines are 1-based and inclusive.
      fromLine: number;
      toLine: number;
      // Columns narrow the reference to part of one line.
      fromColumn?: number;
      toColumn?: number;
    }
  | { artifactId: string; field: string };

export type Cause = {
  ref: SourceRef;
  // primary: the line that acted. via: a line that fed it, such as the
  // variable a task read or the notify that queued a handler.
  role: "primary" | "via";
};

export type EntityRef = {
  entityId: string;
  // Which fact, when the event reads or changes one fact.
  factId?: string;
};

export const STAGE_STATUSES = ["changed", "unchanged", "failed", "skipped", "not-run", "info"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export type StageEvent = {
  kind: string;
  status: StageStatus;
  statusWord?: string;
  // Empty only for events the learner did not write, such as an injected fault.
  causes: Cause[];
  // Indexes of earlier steps that led to this one.
  after?: number[];
  targets: EntityRef[];
  row?: { id: string; label: string };
  item?: string;
  summary: string;
  detail?: string;
  data?: Record<string, string | number | boolean | (string | number)[]>;
};

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPositiveWhole(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[], where: string): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${where} has an unknown field "${key}".`);
}

const EVENT_KEYS = ["kind", "status", "statusWord", "causes", "after", "targets", "row", "item", "summary", "detail", "data"];
const LINE_KEYS = ["artifactId", "fromLine", "toLine", "fromColumn", "toColumn"];

function sourceRefProblems(ref: unknown, where: string): string[] {
  if (!isPlainRecord(ref)) return [`${where} has no source reference.`];
  const problems: string[] = [];
  if (!isText(ref.artifactId)) problems.push(`${where} does not name an artifact.`);
  if (Object.hasOwn(ref, "field")) {
    problems.push(...unknownKeys(ref, ["artifactId", "field"], where));
    if (!isText(ref.field)) problems.push(`${where} names an empty field.`);
    return problems;
  }
  problems.push(...unknownKeys(ref, LINE_KEYS, where));
  const { fromLine, toLine, fromColumn, toColumn } = ref;
  if (!isPositiveWhole(fromLine) || !isPositiveWhole(toLine)) {
    problems.push(`${where} needs line numbers that are positive whole numbers.`);
    return problems;
  }
  if (fromLine > toLine) problems.push(`${where} starts at line ${fromLine}, after its last line ${toLine}.`);
  const hasColumns = fromColumn !== undefined || toColumn !== undefined;
  if (!hasColumns) return problems;
  if ((fromColumn !== undefined && !isPositiveWhole(fromColumn)) || (toColumn !== undefined && !isPositiveWhole(toColumn))) {
    problems.push(`${where} needs column numbers that are positive whole numbers.`);
    return problems;
  }
  if (fromLine !== toLine) problems.push(`${where} gives columns but covers more than one line.`);
  if (fromColumn !== undefined && toColumn !== undefined && fromColumn > toColumn) {
    problems.push(`${where} starts at column ${fromColumn}, after its last column ${toColumn}.`);
  }
  return problems;
}

function causeProblems(cause: unknown, where: string): string[] {
  if (!isPlainRecord(cause)) return [`${where} is not an object.`];
  const problems = unknownKeys(cause, ["ref", "role"], where);
  problems.push(...sourceRefProblems(cause.ref, where));
  if (cause.role !== "primary" && cause.role !== "via") problems.push(`${where} has a role that is not "primary" or "via".`);
  return problems;
}

function targetProblems(target: unknown, where: string): string[] {
  if (!isPlainRecord(target)) return [`${where} is not an object.`];
  const problems = unknownKeys(target, ["entityId", "factId"], where);
  if (!isText(target.entityId)) problems.push(`${where} does not name an entity.`);
  if (target.factId !== undefined && !isText(target.factId)) problems.push(`${where} names an empty fact.`);
  return problems;
}

function isDataValue(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value)) return false;
  return value.every((item) => typeof item === "string" || (typeof item === "number" && Number.isFinite(item)));
}

function optionalString(event: Record<string, unknown>, key: string): string[] {
  const value = event[key];
  return value === undefined || typeof value === "string" ? [] : [`The event's ${key} is not text.`];
}

// Never throws. Subject code builds the event, and a field can throw when
// it is read.
export function stageEventProblems(event: unknown): string[] {
  try {
    return eventProblems(event);
  } catch {
    return ["The event could not be read."];
  }
}

function eventProblems(event: unknown): string[] {
  if (!isPlainRecord(event)) return ["The event is not an object."];
  const problems = unknownKeys(event, EVENT_KEYS, "The event");
  if (!isText(event.kind)) problems.push("The event has no kind.");
  if (!STAGE_STATUSES.some((status) => status === event.status)) {
    problems.push(`The event's status is not one of: ${STAGE_STATUSES.join(", ")}.`);
  }
  problems.push(...optionalString(event, "statusWord"), ...optionalString(event, "item"), ...optionalString(event, "detail"));
  if (!isText(event.summary)) problems.push("The event's summary is empty.");

  if (!Array.isArray(event.causes)) problems.push("The event's causes are not a list.");
  else event.causes.forEach((cause, i) => problems.push(...causeProblems(cause, `Cause ${i + 1}`)));

  if (!Array.isArray(event.targets)) problems.push("The event's targets are not a list.");
  else event.targets.forEach((target, i) => problems.push(...targetProblems(target, `Target ${i + 1}`)));

  if (event.after !== undefined) {
    const valid = Array.isArray(event.after) &&
      event.after.every((index) => typeof index === "number" && Number.isInteger(index) && index >= 0);
    if (!valid) problems.push("The event's after list must hold step indexes that are whole numbers of zero or more.");
  }

  if (event.row !== undefined) {
    const row = event.row;
    if (!isPlainRecord(row) || !isText(row.id) || typeof row.label !== "string") {
      problems.push("The event's row needs an id and a label.");
    } else {
      problems.push(...unknownKeys(row, ["id", "label"], "The event's row"));
    }
  }

  if (event.data !== undefined) {
    const data = event.data;
    if (!isPlainRecord(data)) problems.push("The event's data is not a plain object.");
    else {
      for (const [key, value] of Object.entries(data)) {
        if (!isDataValue(value)) {
          problems.push(`The event's data field "${key}" must be text, a finite number, true or false, or a flat list of text and numbers.`);
        }
      }
    }
  }
  return problems;
}
