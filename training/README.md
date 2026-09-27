# Author a Workings lesson

Write a learning brief, generate a draft, validate its exercises, preview the
learner experience, then accept it into the local course catalog.

The first packages teach tool use and bounded retries. They share the same
agent-loop engine and player. The model is a declared simulation; the loop,
inventory lookup, message handling, and checks execute locally.

## Input

Each lesson directory contains TRAINING.md, a reviewed source bundle, and a draft
named `candidate.json`. The brief defines the final task before supporting
practice and explanations. Its YAML front matter records identity, audience,
prerequisites, engine, and objective. Evidence records are stored separately.

The package contract is in `src/training/agent-package.ts`. Version 1 supports
explanations, experiments, challenges, recaps, and free play through the registered
agent-loop engine. Packages contain data, not executable lesson code.

## Local authoring

An agent in the current session reads the brief and source bundle and writes the
draft. Import records those inputs and runs the checks:

```bash
npm run training -- import training/ai/tool-using-agent/candidate.json --brief training/ai/tool-using-agent
npm run training -- preview training/ai/tool-using-agent/candidate.json
```

Start the development server and open `#/preview`. The draft route and endpoint
exist only in development. Drafts are not copied into the production build.

This route records separate authoring tokens and cost as unknown when the session
cannot measure them. It does not claim that generation was free or that the
standalone provider workflow ran.

## Standalone generation

The optional adapter uses the installed `claude` CLI with tools, hooks, skills,
and MCP servers disabled. Configure that CLI before use. A run sends the brief,
source bundle, package contract, engine, and repair findings to the configured
service. Choose the spending limit before starting a paid run.

```bash
npm run training -- generate training/ai/tool-using-agent --budget-usd 2 --max-tokens 150000 --max-calls 3
```

The command saves the draft, provider response, validation report, and usage under
`.workings/runs`. It allows an initial call and at most two repair calls. It checks
budgets before each call and passes the remaining dollar limit to the provider.
Totals are checked after responses; an in-flight call can cross a local token
threshold. Each call also has a four-minute timeout.

Unknown usage stops automatic continuation. Inspect an interrupted call before
another paid run. Do not delete its record to hide spend. Identical inputs reuse
a validated draft. Changed briefs, sources, engine, contract, driver, or budgets
use a new run.

The external adapter has not run against the service in this build. The accepted
drafts came from the current authoring session. Provenance records distinguish
the two paths.

## Review and accept

```bash
npm run training -- validate training/ai/tool-using-agent/candidate.json
npm run training -- accept training/ai/tool-using-agent/candidate.json --reviewed
```

Review source support, instructions, hints, solutions, and the browser journey
before acceptance. The command copies the package to `src/content/lessons`,
updates the generated catalog index, and writes a review record. It does not
push, publish, or deploy. Changed accepted content must increase its revision.

Run `npm run sweep:agents` for accepted lessons in the production browser build.
Run `npm run sweep` for the original courses and cabinet. Run `npm test` for the
engine, package, progress, and other unit checks.

## What the checks establish

The validator checks structure, supported operations, reachable exercises,
reference solutions, fresh cases, and known wrong programs. Trusted cases outside
the generated content protect the task criteria. Reports identify the content,
engine source, and validator source by file digests.

Browser checks exercise the visible controls and trace. They cover challenge
results, evidence invalidation after editing, help, themes, responsive layouts,
and accessibility. These are functional checks, not simulated human trials.

Citations need an author to review their meaning. Functional checks do not prove
that people learn effectively. Use [PILOT.md](PILOT.md) to record real observations.

The retry lesson demonstrates reuse of the same engine and player. Live models
need separate integration tests. The downloadable TypeScript loop defines a small
model-and-tool protocol; a real API adapter must translate and validate provider
responses before using that protocol.
