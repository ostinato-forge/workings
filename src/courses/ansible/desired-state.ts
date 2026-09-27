import type { FreePlayBeatBase, Lesson } from "../../platform/lesson";
import { parsePlaybook, runSimulation, type HostState, type ParsedPlaybook, type SimulationRun } from "./simulation";

export const initialSource = `---
- name: Make desired state real
  hosts: web
  become: true
  gather_facts: false
  tasks:
    - name: Install Nginx
      ansible.builtin.package:
        name: nginx
        state: present
    - name: Start and enable Nginx
      ansible.builtin.systemd_service:
        name: nginx
        state: started
        enabled: true
`;

export const initialHosts: HostState[] = [
  { id: "web-1", packageInstalled: false, serviceRunning: false, serviceEnabled: false },
  { id: "web-2", packageInstalled: true, serviceRunning: false, serviceEnabled: false },
  { id: "web-3", packageInstalled: true, serviceRunning: true, serviceEnabled: true },
].map((host) => ({
  ...host, groups: ["web"], facts: { osFamily: "Debian", environment: "practice" },
  packages: host.packageInstalled ? ["nginx"] : [], files: {}, serviceReloadCount: 0,
}));

const readyHosts = runSimulation(parsePlaybook(initialSource), initialHosts).hosts;

export type AnsiblePlayBeat = {
  kind: "play";
  id: string;
  goal: string;
  initialHosts: HostState[];
  requiredServiceState: "started" | "restarted";
  minRuns: number;
  prediction: {
    question: string;
    options: { id: string; label: string }[];
    deriveCorrectOption: (runs: SimulationRun[]) => string;
  };
};

// Guided runs keep the experiment fixed, apart from the requested state change.
export function guidedPlaybook(source: string, beat: AnsiblePlayBeat): ParsedPlaybook {
  const parsed = parsePlaybook(source);
  const [install, service] = parsed.tasks;
  if (
    parsed.target !== "web" || !parsed.become || parsed.gatherFacts ||
    parsed.tasks.length !== 2 || parsed.handlers.length !== 0 ||
    install?.module !== "package" || install.packageName !== "nginx" || install.state !== "present" ||
    service?.module !== "service" || service.serviceName !== "nginx" ||
    service.state !== beat.requiredServiceState || !service.enabled ||
    parsed.tasks.some((task) => task.condition || task.flow || task.notify.length > 0)
  ) {
    throw new Error(
      `Keep both Nginx tasks, hosts: web, become: true, and gather_facts: false. Set the service state to ${beat.requiredServiceState} and enabled to true.`,
    );
  }
  return parsed;
}

export const desiredStateLesson: Lesson<AnsiblePlayBeat, FreePlayBeatBase> = {
  id: "desired-state",
  title: "Make changes that stay done",
  beats: [
    {
      kind: "teach", id: "meet-the-servers", title: "Three servers, three starting states",
      body: "A playbook describes work for Ansible to do. Here it installs Nginx and keeps the service running. web-1 has no Nginx package. web-2 has the package but its service is stopped. web-3 already has the package and a running service. Predict which servers need a change, then run the playbook twice.",
    },
    {
      kind: "play", id: "run-twice", initialHosts, requiredServiceState: "started", minRuns: 2,
      goal: "Run this playbook twice. Each run starts from the servers left by the previous run. Read which tasks report changed and which report ok.",
      prediction: {
        question: "Which servers will change on the first run?",
        options: [
          { id: "web-1,web-2", label: "web-1 and web-2" },
          { id: "web-1,web-2,web-3", label: "All three servers" },
          { id: "none", label: "No servers" },
        ],
        deriveCorrectOption: (runs) => runs[0]?.changedHosts.join(",") || "none",
      },
    },
    {
      kind: "teach", id: "explain-the-rerun", title: "The same requested state needs no new change",
      body: "The first run made the servers match the playbook. The second run found them already there, so every task reported ok. This is idempotence: repeating the request leaves the same result. Now test a different request. Change started to restarted in the next playbook and run it twice.",
    },
    {
      kind: "play", id: "request-an-action", initialHosts: readyHosts, requiredServiceState: "restarted", minRuns: 2,
      goal: "These servers are already running Nginx. Edit the service state from started to restarted. Predict what two runs will report, then test your prediction.",
      prediction: {
        question: "With state: restarted, when will the service task report changed?",
        options: [
          { id: "every", label: "On both runs" },
          { id: "first", label: "Only on the first run" },
          { id: "never", label: "On neither run" },
        ],
        deriveCorrectOption: (runs) => runs.every((run) => run.changedCount > 0)
          ? "every" : runs[0]?.changedCount ? "first" : "never",
      },
    },
    {
      kind: "recap", id: "recap", title: "A state and an action behave differently",
      body: "started asks for a running service. It changes a server only when needed. restarted asks for a restart, so it reports a change every time. You tested both requests against the same ready servers. In free play you can edit the playbook and reset the practice servers.",
    },
    { kind: "free-play", id: "free-play", intro: "Try another change. Runs here are exploration and do not affect lesson completion." },
  ],
};
