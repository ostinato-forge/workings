import { expect, test } from "vitest";
import { parseAgentLesson, validateAgentExercises, type AgentLesson } from "./agent-package";
import { referencePackage } from "./agent-package.fixture";

const accepted = import.meta.glob("../content/lessons/*.json", { eager: true, import: "default" });
test.each(Object.entries(accepted))("accepted package %s has valid exercises", (_path, raw) => {
  expect(validateAgentExercises(parseAgentLesson(raw))).toMatchObject({ passed: true, findings: [] });
});

test("a worked example must demonstrate success without learner edits", () => {
  const lesson = structuredClone(referencePackage());
  const example = lesson.beats[1]!;
  if (example.kind !== "play") throw new Error("Fixture");
  example.mode = "observe";
  example.workedExample = true;
  example.pass = "success";
  example.editable = [];
  example.program.observation = "discard";
  expect(validateAgentExercises(parseAgentLesson(lesson)).findings.join()).toMatch(/worked example must succeed/);
});


test("a supported package has reachable experiments and rejects known wrong programs", () => {
  const lesson = parseAgentLesson(referencePackage());
  expect(validateAgentExercises(lesson)).toMatchObject({ passed: true, findings: [] });
});

test("generation cannot weaken a challenge into mere participation", () => {
  const lesson = referencePackage();
  const challenge = lesson.beats[2]!;
  if (challenge.kind !== "play") throw new Error("Fixture");
  challenge.pass = "turn-limit";
  expect(() => parseAgentLesson(lesson)).toThrow(/challenge requires success/);
});

test("unreachable goals and ineffective transfer variations block acceptance", () => {
  const lesson = referencePackage();
  const challenge = lesson.beats[2]!;
  if (challenge.kind !== "play") throw new Error("Fixture");
  challenge.editable = ["dispatch"];
  expect(validateAgentExercises(lesson).findings.join()).toMatch(/unreachable/);
  challenge.cases = [challenge.cases[0]!, { ...challenge.cases[0]!, id: "renamed" }];
  expect(validateAgentExercises(lesson).findings.join()).toMatch(/vary the inventory/);
});

test("unknown formats, malformed cases, duplicate IDs, and missing sources fail at load", () => {
  for (const change of [
    (p: any) => { p.schemaVersion = 2; },
    (p: any) => { p.beats[2].cases[0].inventory = {}; },
    (p: any) => { p.beats[1].id = p.beats[0].id; },
    (p: any) => { p.sources = []; },
    (p: any) => { p.beats[1].program.injectedAnswer = {}; },
  ]) {
    const lesson = structuredClone(referencePackage());
    change(lesson);
    expect(() => parseAgentLesson(lesson)).toThrow();
  }
});
