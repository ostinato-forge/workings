import { expect, test } from "vitest";
import { desiredStateLesson, guidedPlaybook, initialHosts, initialSource, type AnsiblePlayBeat } from "./desired-state";
import { parsePlaybook, runSimulation } from "./simulation";

const play = desiredStateLesson.beats.filter((beat): beat is AnsiblePlayBeat => beat.kind === "play");

test("the first run changes only unready servers and the next run leaves them unchanged", () => {
  const before = JSON.stringify(initialHosts);
  const parsed = parsePlaybook(initialSource);
  const first = runSimulation(parsed, initialHosts);
  const second = runSimulation(parsed, first.hosts);
  expect(first.changedHosts).toEqual(["web-1", "web-2"]);
  expect(first.changedCount).toBe(3);
  expect(second.changedCount).toBe(0);
  expect(second.failedCount).toBe(0);
  expect(second.hosts).toEqual(first.hosts);
  expect(JSON.stringify(initialHosts)).toBe(before);
});

test("the transfer case requires editing the artifact and produces a change on both runs", () => {
  const transfer = play[1]!;
  expect(() => guidedPlaybook(initialSource, transfer)).toThrow(/restarted/);
  const edited = initialSource.replace("state: started", "state: restarted");
  const parsed = guidedPlaybook(edited, transfer);
  const first = runSimulation(parsed, transfer.initialHosts);
  const second = runSimulation(parsed, first.hosts);
  expect(first.changedCount).toBe(3);
  expect(second.changedCount).toBe(3);
  expect(transfer.prediction.deriveCorrectOption([first, second])).toBe("every");
});

test("guided experiments reject task changes that would invalidate their explanation", () => {
  for (const source of [
    initialSource.replace("hosts: web", "hosts: all"),
    initialSource.replace("become: true", "become: false"),
    initialSource.replace("name: nginx", "name: curl"),
    initialSource.replace("state: present", "state: absent"),
  ]) expect(() => guidedPlaybook(source, play[0]!)).toThrow();
  expect(() => guidedPlaybook("---\n[", play[0]!)).toThrow();
  expect(() => parsePlaybook(`${initialSource}\n- hosts: all\n  tasks: []\n`)).toThrow(/one play/);
});

test("every prediction is answered by its actual simulation records", () => {
  for (const beat of play) {
    const source = initialSource.replace("state: started", `state: ${beat.requiredServiceState}`);
    const parsed = guidedPlaybook(source, beat);
    let hosts = beat.initialHosts;
    const runs = [];
    for (let i = 0; i < beat.minRuns; i += 1) {
      const run = runSimulation(parsed, hosts);
      expect(run.failedCount).toBe(0);
      runs.push(run);
      hosts = run.hosts;
    }
    expect(beat.prediction.options.map((option) => option.id)).toContain(beat.prediction.deriveCorrectOption(runs));
  }
});
