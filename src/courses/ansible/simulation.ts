import { parseDocument } from "yaml";

export type ResultStatus = "changed" | "ok" | "failed" | "skipped";

export type HostFacts = {
  osFamily: string;
  environment: string;
};

export type HostState = {
  id: string;
  groups: string[];
  facts: HostFacts;
  packages: string[];
  packageInstalled: boolean;
  serviceRunning: boolean;
  serviceEnabled: boolean;
  files: Record<string, string>;
  serviceReloadCount: number;
};

export type ParsedCondition = {
  source: string;
  field: "osFamily" | "environment" | "hostname";
  label: string;
  expected: string;
  needsFacts: boolean;
};

type TaskBase = {
  id: string;
  name: string;
  kind: "task" | "handler";
  sourceNeedle: string;
  sourceLabel: string;
  notify: string[];
  condition?: ParsedCondition;
  flow?: {
    id: string;
    section: "block" | "rescue" | "always";
    hasRescue: boolean;
    final: boolean;
  };
};

export type PackageTask = TaskBase & {
  module: "package";
  packageName: string;
  state: "present" | "absent";
};

export type CopyTask = TaskBase & {
  module: "copy";
  destination: string;
  content: string;
};

export type ServiceTask = TaskBase & {
  module: "service";
  serviceName: string;
  state: "started" | "stopped" | "restarted" | "reloaded";
  enabled?: boolean;
};

export type DebugTask = TaskBase & {
  module: "debug";
  message: string;
};

export type TemplateTask = TaskBase & {
  module: "template";
  destination: string;
  sourceName: string;
  template: string;
};

export type ParsedTask =
  | PackageTask
  | CopyTask
  | ServiceTask
  | DebugTask
  | TemplateTask;

export type ParsedPlaybook = {
  name: string;
  target: string;
  become: boolean;
  gatherFacts: boolean;
  variables: Record<string, unknown>;
  tasks: ParsedTask[];
  handlers: ParsedTask[];
};

export type PlaybookResources = {
  templates?: Record<string, string>;
  roles?: Record<string, string>;
};

export type HostTaskResult = {
  hostId: string;
  status: ResultStatus;
  detail: string;
  before: HostState;
  after: HostState;
};

export type TaskRun = {
  task: ParsedTask;
  results: HostTaskResult[];
};

export type SimulationRun = {
  tasks: TaskRun[];
  hosts: HostState[];
  changedHosts: string[];
  changedCount: number;
  failedCount: number;
  skippedCount: number;
  notificationCount: number;
  handlerRunCount: number;
};

export class PlaybookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaybookError";
  }
}

const packageModuleNames = [
  "ansible.builtin.package",
  "package",
] as const;

const copyModuleNames = ["ansible.builtin.copy", "copy"] as const;

const serviceModuleNames = [
  "ansible.builtin.systemd_service",
  "systemd_service",
  "ansible.builtin.service",
  "service",
] as const;

const debugModuleNames = ["ansible.builtin.debug", "debug"] as const;
const templateModuleNames = [
  "ansible.builtin.template",
  "template",
] as const;
const includeRoleModuleNames = [
  "ansible.builtin.include_role",
  "include_role",
] as const;

function resolveValue(
  value: unknown,
  variables: Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, variables));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveValue(item, variables),
      ]),
    );
  }
  if (typeof value !== "string") {
    return value;
  }

  const exact = value.match(/^\s*{{\s*([A-Za-z_][\w]*)\s*}}\s*$/);
  if (exact && Object.hasOwn(variables, exact[1]!)) {
    return variables[exact[1]!];
  }

  return value.replace(
    /{{\s*([A-Za-z_][\w]*)\s*}}/g,
    (match, name: string) =>
      Object.hasOwn(variables, name) ? String(variables[name]) : match,
  );
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlaybookError(`${label} needs to be a YAML mapping.`);
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PlaybookError(`${label} needs a text value.`);
  }
  return value.trim();
}

function findModule(
  task: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  return names.find((name) => Object.hasOwn(task, name));
}

function parseNotify(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim())
  ) {
    return value.map((item) => (item as string).trim());
  }
  throw new PlaybookError("`notify` needs a handler name or a list of names.");
}

export function parseCondition(value: unknown): ParsedCondition | undefined {
  if (value === undefined) {
    return undefined;
  }

  const source = asText(value, "`when`");
  const comparison =
    source.match(
      /^ansible_facts(?:\.os_family|\[['"]os_family['"]\])\s*==\s*(['"])(.*?)\1$/,
    ) ??
    source.match(
      /^ansible_facts(?:\.environment|\[['"]environment['"]\])\s*==\s*(['"])(.*?)\1$/,
    ) ??
    source.match(/^app_environment\s*==\s*(['"])(.*?)\1$/) ??
    source.match(/^inventory_hostname\s*==\s*(['"])(.*?)\1$/);

  if (!comparison) {
    throw new PlaybookError(
      'Use a condition such as ansible_facts.os_family == "Debian" or app_environment == "production".',
    );
  }

  const expected = comparison[2] ?? "";
  if (source.startsWith("inventory_hostname")) {
    return {
      source,
      field: "hostname",
      label: "inventory_hostname",
      expected,
      needsFacts: false,
    };
  }
  if (source.startsWith("app_environment")) {
    return {
      source,
      field: "environment",
      label: "app_environment",
      expected,
      needsFacts: false,
    };
  }
  if (source.includes("environment")) {
    return {
      source,
      field: "environment",
      label: "environment",
      expected,
      needsFacts: true,
    };
  }
  return {
    source,
    field: "osFamily",
    label: "os_family",
    expected,
    needsFacts: true,
  };
}

function parseTask(
  rawTask: unknown,
  index: number,
  kind: "task" | "handler",
  variables: Record<string, unknown>,
  resources: PlaybookResources,
): ParsedTask {
  const label = kind === "handler" ? `Handler ${index + 1}` : `Task ${index + 1}`;
  const task = asObject(resolveValue(rawTask, variables), label);
  const taskName =
    typeof task.name === "string" && task.name.trim()
      ? task.name.trim()
      : label;
  const common = {
    id: `${kind}-${index + 1}`,
    name: taskName,
    kind,
    notify: parseNotify(task.notify),
    condition: parseCondition(task.when),
  };

  const packageModule = findModule(task, packageModuleNames);
  if (packageModule) {
    const args = asObject(task[packageModule], `Arguments for ${packageModule}`);
    const state = asText(args.state, "`state`");
    if (state !== "present" && state !== "absent") {
      throw new PlaybookError(
        `${packageModule} supports \`present\` or \`absent\` in this arcade.`,
      );
    }
    return {
      ...common,
      module: "package",
      packageName: asText(args.name, "`name`"),
      state,
      sourceNeedle: packageModule,
      sourceLabel: packageModule,
    };
  }

  const copyModule = findModule(task, copyModuleNames);
  if (copyModule) {
    const args = asObject(task[copyModule], `Arguments for ${copyModule}`);
    const destination = asText(args.dest, "`dest`");
    return {
      ...common,
      module: "copy",
      destination,
      content: asText(args.content, "`content`"),
      sourceNeedle: destination,
      sourceLabel: copyModule,
    };
  }

  const serviceModule = findModule(task, serviceModuleNames);
  if (serviceModule) {
    const args = asObject(task[serviceModule], `Arguments for ${serviceModule}`);
    const state = asText(args.state, "`state`");
    if (
      state !== "started" &&
      state !== "stopped" &&
      state !== "restarted" &&
      state !== "reloaded"
    ) {
      throw new PlaybookError(
        `${serviceModule} supports \`started\`, \`stopped\`, \`restarted\`, or \`reloaded\` in this arcade.`,
      );
    }
    if (args.enabled !== undefined && typeof args.enabled !== "boolean") {
      throw new PlaybookError("`enabled` needs to be `true` or `false`.");
    }
    return {
      ...common,
      module: "service",
      serviceName: asText(args.name, "`name`"),
      state,
      enabled:
        typeof args.enabled === "boolean" ? args.enabled : undefined,
      sourceNeedle: serviceModule,
      sourceLabel: serviceModule,
    };
  }

  const debugModule = findModule(task, debugModuleNames);
  if (debugModule) {
    const args = asObject(task[debugModule], `Arguments for ${debugModule}`);
    return {
      ...common,
      module: "debug",
      message: asText(args.msg, "`msg`"),
      sourceNeedle: debugModule,
      sourceLabel: debugModule,
    };
  }

  const templateModule = findModule(task, templateModuleNames);
  if (templateModule) {
    const args = asObject(task[templateModule], `Arguments for ${templateModule}`);
    const sourceName = asText(args.src, "`src`");
    const template = resources.templates?.[sourceName];
    if (!template) {
      throw new PlaybookError(
        `This lesson does not have a template named \`${sourceName}\`.`,
      );
    }
    return {
      ...common,
      module: "template",
      destination: asText(args.dest, "`dest`"),
      sourceName,
      template,
      sourceNeedle: templateModule,
      sourceLabel: templateModule,
    };
  }

  throw new PlaybookError(
    `${taskName} uses a module this lesson does not support yet.`,
  );
}

function parseTaskList(
  rawTasks: unknown[],
  kind: "task" | "handler",
  variables: Record<string, unknown>,
  resources: PlaybookResources,
) {
  const parsed: ParsedTask[] = [];
  let counter = 0;

  const addTask = (
    rawTask: unknown,
    taskVariables: Record<string, unknown>,
    flow?: ParsedTask["flow"],
    sourceOverride?: string,
  ) => {
    const task = parseTask(
      rawTask,
      counter,
      kind,
      taskVariables,
      resources,
    );
    counter += 1;
    parsed.push({
      ...task,
      ...(flow ? { flow } : {}),
      ...(sourceOverride
        ? {
            sourceNeedle: sourceOverride,
            sourceLabel: `${task.sourceLabel} from role`,
          }
        : {}),
    });
  };

  const expand = (
    rawTask: unknown,
    flow?: Omit<NonNullable<ParsedTask["flow"]>, "final">,
  ) => {
    const task = asObject(rawTask, `Task ${counter + 1}`);

    if (Array.isArray(task.block)) {
      const blockId = `block-${counter + 1}`;
      const rescue = Array.isArray(task.rescue) ? task.rescue : [];
      const always = Array.isArray(task.always) ? task.always : [];
      const sections = [
        ...task.block.map((item) => ({
          item,
          section: "block" as const,
        })),
        ...rescue.map((item) => ({
          item,
          section: "rescue" as const,
        })),
        ...always.map((item) => ({
          item,
          section: "always" as const,
        })),
      ];
      if (sections.length === 0) {
        throw new PlaybookError("A block needs at least one task.");
      }
      sections.forEach(({ item, section }, sectionIndex) =>
        expand(item, {
          id: blockId,
          section,
          hasRescue: rescue.length > 0,
          ...(sectionIndex === sections.length - 1
            ? { final: true }
            : { final: false }),
        }),
      );
      return;
    }

    const includeRoleModule = findModule(task, includeRoleModuleNames);
    if (includeRoleModule) {
      const args = asObject(
        resolveValue(task[includeRoleModule], variables),
        `Arguments for ${includeRoleModule}`,
      );
      const roleName = asText(args.name, "`name`");
      const roleSource = resources.roles?.[roleName];
      if (!roleSource) {
        throw new PlaybookError(
          `This lesson does not have a role named \`${roleName}\`.`,
        );
      }
      const roleDocument = parseDocument(roleSource, {
        prettyErrors: true,
        strict: true,
      });
      if (roleDocument.errors.length > 0) {
        throw new PlaybookError(`The ${roleName} role is not valid YAML.`);
      }
      const roleTasks = roleDocument.toJS() as unknown;
      if (!Array.isArray(roleTasks) || roleTasks.length === 0) {
        throw new PlaybookError(`The ${roleName} role has no tasks.`);
      }
      for (const roleTask of roleTasks) {
        const parsedRoleTask = parseTask(
          roleTask,
          counter,
          kind,
          variables,
          resources,
        );
        counter += 1;
        parsed.push({
          ...parsedRoleTask,
          ...(flow ? { flow: { ...flow, final: false } } : {}),
          sourceNeedle: includeRoleModule,
          sourceLabel: `${parsedRoleTask.sourceLabel} from ${roleName}`,
        });
      }
      if (flow && parsed.length > 0) {
        parsed[parsed.length - 1] = {
          ...parsed[parsed.length - 1]!,
          flow: { ...flow, final: false },
        };
      }
      return;
    }

    const resolvedLoop = resolveValue(task.loop, variables);
    if (task.loop !== undefined) {
      if (!Array.isArray(resolvedLoop) || resolvedLoop.length === 0) {
        throw new PlaybookError("`loop` needs a non-empty list.");
      }
      resolvedLoop.forEach((item, itemIndex) => {
        const withoutLoop = { ...task };
        delete withoutLoop.loop;
        addTask(
          withoutLoop,
          { ...variables, item },
          flow
            ? {
                ...flow,
                final: itemIndex === resolvedLoop.length - 1,
              }
            : undefined,
        );
      });
      return;
    }

    addTask(
      task,
      variables,
      flow ? { ...flow, final: false } : undefined,
    );
  };

  rawTasks.forEach((task) => expand(task));

  const flowLastIndexes = new Map<string, number>();
  parsed.forEach((task, index) => {
    if (task.flow) {
      flowLastIndexes.set(task.flow.id, index);
    }
  });
  for (const index of flowLastIndexes.values()) {
    const task = parsed[index]!;
    parsed[index] = {
      ...task,
      flow: task.flow ? { ...task.flow, final: true } : undefined,
    };
  }

  return parsed;
}

export function parsePlaybook(
  source: string,
  resources: PlaybookResources = {},
): ParsedPlaybook {
  const document = parseDocument(source, {
    prettyErrors: true,
    strict: true,
  });

  if (document.errors.length > 0) {
    const message = document.errors[0]?.message.split("\n")[0];
    throw new PlaybookError(message || "The playbook is not valid YAML.");
  }

  const root = document.toJS() as unknown;
  if (!Array.isArray(root) || root.length === 0) {
    throw new PlaybookError("A playbook starts with a list of plays.");
  }
  if (root.length !== 1) {
    throw new PlaybookError("This simulation supports one play at a time.");
  }

  const play = asObject(root[0], "The first play");
  const name =
    typeof play.name === "string" && play.name.trim()
      ? play.name.trim()
      : "Untitled play";
  const target = asText(play.hosts, "`hosts`");
  const become = play.become === true;
  const gatherFacts = play.gather_facts !== false;
  const variables =
    play.vars === undefined
      ? {}
      : asObject(play.vars, "`vars`");

  if (
    (!Array.isArray(play.tasks) || play.tasks.length === 0) &&
    (!Array.isArray(play.roles) || play.roles.length === 0)
  ) {
    throw new PlaybookError("Add at least one task or role.");
  }

  const roleEntries = Array.isArray(play.roles)
    ? play.roles.map((role) => ({
        name: `Run ${typeof role === "string" ? role : "role"}`,
        "ansible.builtin.include_role": {
          name:
            typeof role === "string"
              ? role
              : asText(asObject(role, "Role entry").role, "`role`"),
        },
      }))
    : [];
  const tasks = parseTaskList(
    [...(Array.isArray(play.tasks) ? play.tasks : []), ...roleEntries],
    "task",
    variables,
    resources,
  );
  const handlers =
    play.handlers === undefined
      ? []
      : Array.isArray(play.handlers) && play.handlers.length > 0
        ? parseTaskList(
            play.handlers,
            "handler",
            variables,
            resources,
          )
        : (() => {
            throw new PlaybookError("`handlers` needs a non-empty list.");
          })();

  const handlerNames = new Set(handlers.map((handler) => handler.name));
  for (const task of tasks) {
    for (const notification of task.notify) {
      if (!handlerNames.has(notification)) {
        throw new PlaybookError(
          `\`${notification}\` does not match a handler name.`,
        );
      }
    }
  }

  return {
    name,
    target,
    become,
    gatherFacts,
    variables,
    tasks,
    handlers,
  };
}

export function cloneHost(host: HostState): HostState {
  return {
    ...host,
    groups: [...host.groups],
    facts: { ...host.facts },
    packages: [...host.packages],
    files: { ...host.files },
  };
}

export function cloneHosts(hosts: HostState[]): HostState[] {
  return hosts.map(cloneHost);
}

function failedResult(host: HostState, detail: string): HostTaskResult {
  return {
    hostId: host.id,
    status: "failed",
    detail,
    before: cloneHost(host),
    after: cloneHost(host),
  };
}

function runPackageTask(
  task: PackageTask,
  host: HostState,
  become: boolean,
): HostTaskResult {
  const before = cloneHost(host);

  if (!become) {
    return failedResult(host, "permission denied; add `become: true`");
  }

  const wantsInstalled = task.state === "present";
  const isInstalled =
    host.packages.includes(task.packageName) ||
    (task.packageName === "nginx" && host.packageInstalled);
  if (isInstalled === wantsInstalled) {
    return {
      hostId: host.id,
      status: "ok",
      detail: wantsInstalled
        ? `${task.packageName} already present`
        : `${task.packageName} already absent`,
      before,
      after: cloneHost(host),
    };
  }

  host.packages = wantsInstalled
    ? [...new Set([...host.packages, task.packageName])]
    : host.packages.filter((name) => name !== task.packageName);
  if (task.packageName === "nginx") {
    host.packageInstalled = wantsInstalled;
  }
  if (!wantsInstalled && task.packageName === "nginx") {
    host.serviceRunning = false;
    host.serviceEnabled = false;
  }

  return {
    hostId: host.id,
    status: "changed",
    detail: wantsInstalled
      ? `installed ${task.packageName}`
      : `removed ${task.packageName}`,
    before,
    after: cloneHost(host),
  };
}

function runCopyTask(
  task: CopyTask,
  host: HostState,
  become: boolean,
): HostTaskResult {
  const before = cloneHost(host);

  if (!become) {
    return failedResult(host, "permission denied; add `become: true`");
  }

  if (host.files[task.destination] === task.content) {
    return {
      hostId: host.id,
      status: "ok",
      detail: `${task.destination} already current`,
      before,
      after: cloneHost(host),
    };
  }

  host.files[task.destination] = task.content;
  return {
    hostId: host.id,
    status: "changed",
    detail: `updated ${task.destination}`,
    before,
    after: cloneHost(host),
  };
}

function renderTemplate(
  template: string,
  playbook: ParsedPlaybook,
  host: HostState,
) {
  return template.replace(
    /{{\s*([^}]+?)\s*}}/g,
    (match, rawName: string) => {
      const name = rawName.trim();
      if (name === "inventory_hostname") {
        return host.id;
      }
      if (
        name === "ansible_facts.os_family" ||
        name === "ansible_facts['os_family']"
      ) {
        return host.facts.osFamily;
      }
      if (
        name === "ansible_facts.environment" ||
        name === "ansible_facts['environment']"
      ) {
        return host.facts.environment;
      }
      if (name === "app_environment") {
        return host.facts.environment;
      }
      return Object.hasOwn(playbook.variables, name)
        ? String(playbook.variables[name])
        : match;
    },
  );
}

function runTemplateTask(
  task: TemplateTask,
  host: HostState,
  playbook: ParsedPlaybook,
): HostTaskResult {
  const before = cloneHost(host);
  if (!playbook.become) {
    return failedResult(host, "permission denied; add `become: true`");
  }
  const content = renderTemplate(task.template, playbook, host);
  if (host.files[task.destination] === content) {
    return {
      hostId: host.id,
      status: "ok",
      detail: `${task.destination} already matches ${task.sourceName}`,
      before,
      after: cloneHost(host),
    };
  }
  host.files[task.destination] = content;
  return {
    hostId: host.id,
    status: "changed",
    detail: `built ${task.destination} from ${task.sourceName}`,
    before,
    after: cloneHost(host),
  };
}

function runServiceTask(
  task: ServiceTask,
  host: HostState,
  become: boolean,
): HostTaskResult {
  const before = cloneHost(host);

  if (!become) {
    return failedResult(host, "permission denied; add `become: true`");
  }

  if (!host.packageInstalled && task.state !== "stopped") {
    return failedResult(host, `${task.serviceName} is not installed`);
  }

  if (task.state === "reloaded") {
    if (!host.serviceRunning) {
      return failedResult(host, `${task.serviceName} is not running`);
    }
    host.serviceReloadCount += 1;
    return {
      hostId: host.id,
      status: "changed",
      detail: `reloaded ${task.serviceName}`,
      before,
      after: cloneHost(host),
    };
  }

  const changes: string[] = [];

  if (task.state === "restarted") {
    host.serviceRunning = true;
    changes.push(`restarted ${task.serviceName}`);
  } else {
    const wantsRunning = task.state === "started";
    if (host.serviceRunning !== wantsRunning) {
      host.serviceRunning = wantsRunning;
      changes.push(
        wantsRunning
          ? `started ${task.serviceName}`
          : `stopped ${task.serviceName}`,
      );
    }
  }

  if (
    typeof task.enabled === "boolean" &&
    host.serviceEnabled !== task.enabled
  ) {
    host.serviceEnabled = task.enabled;
    changes.push(task.enabled ? "enabled at boot" : "disabled at boot");
  }

  if (changes.length === 0) {
    const runningState = host.serviceRunning ? "running" : "stopped";
    const enabledState =
      typeof task.enabled === "boolean"
        ? host.serviceEnabled
          ? " and enabled"
          : " and disabled"
        : "";
    return {
      hostId: host.id,
      status: "ok",
      detail: `${task.serviceName} already ${runningState}${enabledState}`,
      before,
      after: cloneHost(host),
    };
  }

  return {
    hostId: host.id,
    status: "changed",
    detail: changes.join("; "),
    before,
    after: cloneHost(host),
  };
}

function conditionValue(condition: ParsedCondition, host: HostState) {
  if (condition.field === "hostname") {
    return host.id;
  }
  return host.facts[condition.field];
}

export function conditionMatches(
  condition: ParsedCondition,
  host: HostState,
): boolean {
  return conditionValue(condition, host) === condition.expected;
}

function runTask(
  task: ParsedTask,
  host: HostState,
  playbook: ParsedPlaybook,
): HostTaskResult {
  if (task.condition) {
    if (task.condition.needsFacts && !playbook.gatherFacts) {
      return failedResult(
        host,
        "ansible_facts unavailable; set `gather_facts: true`",
      );
    }
    if (!conditionMatches(task.condition, host)) {
      return {
        hostId: host.id,
        status: "skipped",
        detail: `when false · ${task.condition.label} is ${conditionValue(
          task.condition,
          host,
        )}`,
        before: cloneHost(host),
        after: cloneHost(host),
      };
    }
  }

  if (task.module === "package") {
    return runPackageTask(task, host, playbook.become);
  }
  if (task.module === "copy") {
    return runCopyTask(task, host, playbook.become);
  }
  if (task.module === "service") {
    return runServiceTask(task, host, playbook.become);
  }
  if (task.module === "template") {
    return runTemplateTask(task, host, playbook);
  }
  return {
    hostId: host.id,
    status: "ok",
    detail: renderTemplate(task.message, playbook, host),
    before: cloneHost(host),
    after: cloneHost(host),
  };
}

export function runSimulation(
  playbook: ParsedPlaybook,
  initialHosts: HostState[],
): SimulationRun {
  const hosts = cloneHosts(initialHosts);
  const targetHosts = hosts.filter(
    (host) =>
      playbook.target === "all" || host.groups.includes(playbook.target),
  );

  if (targetHosts.length === 0) {
    throw new PlaybookError(
      `No hosts match \`${playbook.target}\`. Try \`all\` or the \`web\` group.`,
    );
  }

  const failedHosts = new Set<string>();
  const changedHosts = new Set<string>();
  const handlerQueues = new Map<string, Set<string>>();
  const blockStates = new Map<
    string,
    Map<
      string,
      {
        failed: boolean;
        rescueFailed: boolean;
        alwaysFailed: boolean;
      }
    >
  >();
  const taskRuns: TaskRun[] = [];
  let notificationCount = 0;

  for (const task of playbook.tasks) {
    const results = targetHosts.map((host): HostTaskResult => {
      const hostBlocks =
        blockStates.get(host.id) ??
        new Map<
          string,
          {
            failed: boolean;
            rescueFailed: boolean;
            alwaysFailed: boolean;
          }
        >();
      blockStates.set(host.id, hostBlocks);
      const blockState = task.flow
        ? (hostBlocks.get(task.flow.id) ?? {
            failed: false,
            rescueFailed: false,
            alwaysFailed: false,
          })
        : null;
      if (task.flow && blockState) {
        hostBlocks.set(task.flow.id, blockState);
      }
      const finishFlow = () => {
        if (!task.flow?.final || !blockState) {
          return;
        }
        if (
          blockState.alwaysFailed ||
          (blockState.failed &&
            (!task.flow.hasRescue || blockState.rescueFailed))
        ) {
          failedHosts.add(host.id);
        }
        hostBlocks.delete(task.flow.id);
      };

      if (failedHosts.has(host.id) && task.flow?.section !== "always") {
        finishFlow();
        return {
          hostId: host.id,
          status: "skipped",
          detail: "skipped after an earlier failure",
          before: cloneHost(host),
          after: cloneHost(host),
        };
      }

      if (
        task.flow?.section === "block" &&
        blockState?.failed
      ) {
        finishFlow();
        return {
          hostId: host.id,
          status: "skipped",
          detail: "skipped because an earlier task in the block failed",
          before: cloneHost(host),
          after: cloneHost(host),
        };
      }
      if (
        task.flow?.section === "rescue" &&
        (!blockState?.failed || blockState.rescueFailed)
      ) {
        finishFlow();
        return {
          hostId: host.id,
          status: "skipped",
          detail: blockState?.rescueFailed
            ? "skipped because the rescue failed"
            : "no failure to recover from",
          before: cloneHost(host),
          after: cloneHost(host),
        };
      }

      let result = runTask(task, host, playbook);
      if (result.status === "changed") {
        changedHosts.add(host.id);
        if (task.notify.length > 0) {
          const queue = handlerQueues.get(host.id) ?? new Set<string>();
          for (const handlerName of task.notify) {
            notificationCount += 1;
            queue.add(handlerName);
          }
          handlerQueues.set(host.id, queue);
          result = {
            ...result,
            detail: `${result.detail}; notified ${task.notify.join(", ")}`,
          };
        }
      }
      if (result.status === "failed") {
        if (task.flow?.section === "block" && blockState) {
          blockState.failed = true;
        } else if (task.flow?.section === "rescue" && blockState) {
          blockState.rescueFailed = true;
        } else if (task.flow?.section === "always" && blockState) {
          blockState.alwaysFailed = true;
        } else {
          failedHosts.add(host.id);
        }
      }

      finishFlow();
      return result;
    });
    taskRuns.push({ task, results });
  }

  let handlerRunCount = 0;
  for (const handler of playbook.handlers) {
    const results = targetHosts.map((host): HostTaskResult => {
      if (failedHosts.has(host.id)) {
        return {
          hostId: host.id,
          status: "skipped",
          detail: "skipped after an earlier failure",
          before: cloneHost(host),
          after: cloneHost(host),
        };
      }
      if (!handlerQueues.get(host.id)?.has(handler.name)) {
        return {
          hostId: host.id,
          status: "skipped",
          detail: "not notified",
          before: cloneHost(host),
          after: cloneHost(host),
        };
      }

      handlerRunCount += 1;
      const result = runTask(handler, host, playbook);
      if (result.status === "changed") {
        changedHosts.add(host.id);
      }
      if (result.status === "failed") {
        failedHosts.add(host.id);
      }
      return result;
    });
    taskRuns.push({ task: handler, results });
  }

  const allResults = taskRuns.flatMap((task) => task.results);
  return {
    tasks: taskRuns,
    hosts,
    changedHosts: [...changedHosts],
    changedCount: allResults.filter((result) => result.status === "changed")
      .length,
    failedCount: allResults.filter((result) => result.status === "failed")
      .length,
    skippedCount: allResults.filter((result) => result.status === "skipped")
      .length,
    notificationCount,
    handlerRunCount,
  };
}
