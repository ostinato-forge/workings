# Workings

Workings is a general teaching platform. Learners predict what will happen,
change something, run an experiment, and inspect the result. AI and Ansible are
the first courses. The AI course includes agent tool use, bounded retries, and
model sampling. The Ansible course contains one lesson.

See [PRODUCT.md](PRODUCT.md) for the accepted direction and current scope.

## Run locally

Use Node.js 22.13 or later in the Node.js 22 release line.

```bash
npm ci
npm run dev
```

Open the address printed by Vite. Insert the coin, choose a course, and open a
lesson. The coin is an interface control and does not involve payment.

The cabinet fills the browser window. Use the display switch in the top frame
to choose light or dark content. Your choice is saved in this browser.
Drag the joystick itself to navigate: hold up or down to scroll, or move left
or right to change steps. Arrow keys work when the joystick has focus.
Run, Next, Back, and experiment controls are mounted in the lower frame.
The coin animation powers on the display and LEDs. Reduced motion skips the
coin flight and shortens startup.

## Shared platform

- `src/platform/catalog.ts` declares courses and available lesson modules.
  A lesson loads when opened. A course references lessons by ID, so the same
  module can appear in more than one course.
- `src/platform/lesson.ts` defines the shared lesson steps.
- `src/platform/LessonFlow.tsx` handles the step sequence and completion.
  Each subject supplies its experiment and free-play views.
- `src/platform/routes.ts` resolves course and lesson URLs. The original
  `#/lesson/sampling-dials` link remains valid.
- `src/platform/progress.ts` stores completion by course and lesson. It reads
  the previous AI progress format without deleting the old data.
- `src/shell/cabinet/ControlDeck.tsx` renders controls supplied by the current
  lesson. The shell has no AI-specific settings.

## Add a lesson or course

For generated agent lessons, follow [the authoring workflow](training/README.md).
It covers TRAINING.md, local drafts, validation, preview, acceptance, and the
separate learner pilot. Accepted packages appear in the AI course automatically.

For a custom engine or player:

1. Define a lesson using `Lesson<YourPlayBeat, YourFreePlayBeat>`.
2. Export a React player accepting `LessonPlayerProps`. Use `LessonFlow` for
   the common steps. Supply the subject's controls and evidence in its views.
3. Call the experiment's `onSettled` only after the required evidence exists.
   Call completion through the shared flow, not from free-play interactions.
4. Register the module's ID, title, description, and lazy loader in the catalog.
5. Add its ID to an existing course or create a new course definition.
6. Add a test of the teaching claim against the real run records and a browser
   journey through the learner's decisions.

Catalog validation rejects duplicate IDs, missing lesson references, repeated
lessons within a course, and empty published courses. Completion follows guided
participation; it does not certify mastery or require every prediction to be
correct.

## Ansible source

`src/courses/ansible/simulation.ts` is copied from the private
`ostinato-forge/workings-ansible` repository at commit
`58e70d92d8d6b7069ac50ad54f3f3438ae5eea76`. The lesson adapts that prototype's
desired-state experiment to the shared flow. Its supported module behaviors
are a browser simulation, not an Ansible installation.
The platform copy also rejects multiple plays explicitly, so an extra play
cannot be silently ignored.

The original full Ansible course remains in its own repository. The
[AI course design](docs/superpowers/specs/2026-07-24-workings-ai-course-design.md)
describes the wider AI curriculum planned in July 2026.

## Verify

```bash
npm test
npm run sweep
```

The sweep builds the production app and runs Chromium through both courses.
It checks course navigation, saved progress, the original AI links, invalid
routes, predictions, YAML error recovery, repeat runs, free play, keyboard
operation, phone and landscape layouts, reduced motion, and accessibility.
It also checks joystick dragging and display theme changes without losing
the current experiment, including when browser storage is unavailable.

Set `WORKINGS_SCREENSHOT_DIR` to save browser screenshots from the sweep.
Playwright needs a local Chromium installation; install its browser with
`npx playwright install chromium` if it is missing.
