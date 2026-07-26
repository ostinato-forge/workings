import type { EngineProblem } from "./run-record";

export type KnobFieldSpec = {
  classes: string[];
  classOf: Record<string, string>;
};

export type KnobFieldModel = {
  spec: KnobFieldSpec;
  weights: Record<string, Record<string, number>>;
};

export function validateKnobFieldSpec(
  spec: KnobFieldSpec,
): EngineProblem | null {
  if (spec.classes.length === 0) {
    return {
      what: "The knob field has no classes.",
      fix: "Declare at least one class and assign every token to one.",
    };
  }
  const tokens = Object.keys(spec.classOf);
  if (tokens.length === 0) {
    return {
      what: "The knob field has no tokens.",
      fix: "Assign at least one token to a class.",
    };
  }
  const declared = new Set(spec.classes);
  for (const [token, cls] of Object.entries(spec.classOf)) {
    if (!declared.has(cls)) {
      return {
        what: `The token "${token}" is assigned to "${cls}", which is not a declared class.`,
        fix: "Add the class to the class list or assign the token to a declared class.",
      };
    }
  }
  return null;
}

export function createKnobField(spec: KnobFieldSpec): KnobFieldModel {
  const weights: KnobFieldModel["weights"] = {};
  for (const from of spec.classes) {
    const row: Record<string, number> = {};
    for (const to of spec.classes) row[to] = 0;
    weights[from] = row;
  }
  return { spec, weights };
}

function classSize(spec: KnobFieldSpec, cls: string): number {
  return Object.values(spec.classOf).filter((c) => c === cls).length;
}

function classOfToken(model: KnobFieldModel, token: string): string {
  const cls = model.spec.classOf[token];
  if (cls === undefined) {
    throw new Error(`token "${token}" is not in the knob-field spec`);
  }
  return cls;
}

export function forwardKnobField(
  model: KnobFieldModel,
  prevToken: string,
): { classProbs: Record<string, number>; tokenProbs: Record<string, number> } {
  const fromClass = classOfToken(model, prevToken);
  const row = model.weights[fromClass] as Record<string, number>;
  const maxW = Math.max(...model.spec.classes.map((c) => row[c] as number));
  let denom = 0;
  const exps: Record<string, number> = {};
  for (const c of model.spec.classes) {
    const e = Math.exp((row[c] as number) - maxW);
    exps[c] = e;
    denom += e;
  }
  const classProbs: Record<string, number> = {};
  for (const c of model.spec.classes) classProbs[c] = (exps[c] as number) / denom;
  const tokenProbs: Record<string, number> = {};
  for (const [token, cls] of Object.entries(model.spec.classOf)) {
    tokenProbs[token] =
      (classProbs[cls] as number) / classSize(model.spec, cls);
  }
  return { classProbs, tokenProbs };
}

export function lossAndGradient(
  model: KnobFieldModel,
  transitions: readonly [string, string][],
): { loss: number; gradient: Record<string, Record<string, number>> } {
  if (transitions.length === 0) {
    throw new Error("lossAndGradient requires at least one transition");
  }
  const gradient: Record<string, Record<string, number>> = {};
  for (const from of model.spec.classes) {
    const row: Record<string, number> = {};
    for (const to of model.spec.classes) row[to] = 0;
    gradient[from] = row;
  }
  let loss = 0;
  for (const [prev, next] of transitions) {
    const fromClass = classOfToken(model, prev);
    const nextClass = classOfToken(model, next);
    const { classProbs } = forwardKnobField(model, prev);
    loss -= Math.log(
      (classProbs[nextClass] as number) / classSize(model.spec, nextClass),
    );
    const row = gradient[fromClass] as Record<string, number>;
    for (const c of model.spec.classes) {
      row[c] =
        (row[c] as number) +
        ((classProbs[c] as number) - (c === nextClass ? 1 : 0));
    }
  }
  const n = transitions.length;
  for (const from of model.spec.classes) {
    const row = gradient[from] as Record<string, number>;
    for (const to of model.spec.classes) row[to] = (row[to] as number) / n;
  }
  return { loss: loss / n, gradient };
}
