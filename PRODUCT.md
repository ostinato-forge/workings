# Workings

## Accepted direction

Workings is a general teaching platform. AI and Ansible are its first subjects.
The owner confirmed this direction on 2026-09-25 and chose the platform
foundation as the next task.

Learners predict an outcome, change an artifact or setting, run an experiment,
inspect the result, and try another case. Each subject supplies the mechanism
and evidence it needs. Course navigation and the lesson flow are shared.

## Current product

The browser app contains two courses:

- AI: why the same question can produce different answers.
- AI: build an agent that executes a tool, returns its result, and stops.
- AI: retry a failed lookup with a finite allowance and report persistent errors.
- Ansible: why a repeated playbook can leave the servers unchanged.

The sampling lesson runs a small trained model. The Ansible lesson runs a browser
simulation adapted from the original Ansible prototype. The interface labels
the simulation. It does not connect to real servers.

The two agent lessons run local control loops and inventory tools with declared
simulated model responses. They use generated content packages, shared instruction
blocks, a matching downloadable TypeScript loop, and an execution trace.
They make no external model calls while learners practice.

The arcade cabinet remains the current visual design. Teaching text uses plain
language. Course screens list only lessons that can be opened and used.

## Implementation decisions for this slice

- A course is an ordered set of lesson references. Multiple courses can use
  the same lesson module.
- Shared lesson steps cover explanation, experiments, recap, and free play.
  Subject modules supply the editor, controls, mechanism, and result display.
- A prediction is recorded before the first guided run. Repeat runs keep the
  same input so their results can be compared.
- Completion means the learner finished the guided experiments. It is not a
  claim that the learner mastered the subject. Free play does not award progress.
- Progress is local to the browser and belongs to a course and lesson pair.
  Previous AI completion and saved lesson links remain usable.
- A missing course or lesson has an explicit recovery screen. Unavailable
  browser storage does not prevent lessons from running.

## Content generation direction

Generate reusable lessons before delivery. Normal lesson use should run without
remote model calls. Design the final task and its success checks before writing
supporting practice and explanations.

The first generated lesson teaches how to build an AI agent that uses a tool.
Learners connect calls, results, conversation updates, and stopping behavior.
A second lesson teaches bounded retries through the same engine and player.
Learners do not need a model API key.

The first lesson now starts with a working loop and explains each event beside
its code and conversation state. Learners then diagnose missing feedback, repair
execution and stopping, and handle an unfamiliar request-ID fault across requests
of different lengths. Teaching design is reviewed before package drafting, and
acceptance requires a separate review of the actual explanations and tasks.

The initial drafts were generated in the authoring session and passed through
local import, validation, preview, and acceptance. Separate authoring cost is
unknown. The optional external generation adapter has not been run. A human
learner pilot is still required before claiming effective learning or cost savings.

Use Workings branding only. Keep the private training organizations, skill
marketplaces, and authoring tools discussed during planning out of project files,
lesson packages, links, and delivered content. Adapt ideas rather than copying
their files.

Use [the authoring guide](training/README.md) for the available local commands.
The pilot scope is in [the pilot notes](training/PILOT.md).

## Scope still open

The intended first audience, commercial model, authoring interface, and any
formal assessment rules are not settled by this build. There are no learner
accounts or server-side progress records.

The planned 26-lesson AI course and the original 14-lesson Ansible course are
separate content projects. This platform slice does not complete or import
either full course.

## Design context

- Platform: web.
- Register: product.
- Identity: a dark arcade cabinet that fills the window, with a light or dark
  display. The display switch remembers the learner's choice in this browser.
- Controls sit in the cabinet frame. Buttons, joystick, and dials use bold
  game-like shapes, simple shading, and restrained cyan and purple accents.
  Avoid photorealistic materials, chrome, and glossy highlights.
- Drag the joystick itself with a mouse or touch. Holding it vertically scrolls
  the lesson. Moving it horizontally changes steps. It returns to center on
  release. Arrow keys work while the joystick has focus. Back and Next buttons
  provide the same step navigation.
- Lesson text, editing, predictions, and results stay inside the display.
  Run, reset, stop, and lesson navigation controls sit outside it.
- Welcome heading: "Learn by doing."
- Keep the coin insertion and power-on sequence. The frame lights and LEDs
  turn on before the course appears. Reduced motion skips the coin flight.
- Body font: Atkinson Hyperlegible. Code font: IBM Plex Mono.
- Display font: Press Start 2P, used for the cabinet identity and stage labels.
- Keep keyboard operation, clear focus, readable labels, and reduced motion.
