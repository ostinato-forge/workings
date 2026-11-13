# Design and review the teaching

The authoring agent follows this process before producing an accepted lesson.
Each artifact has a separate purpose. Runtime tests cannot approve the teaching.

## 1. Design the learning task

Read the brief and source bundle. Write `teaching-plan.json` with these fields:

- `version: 1`, `lessonId`, `objective`, `audience`, `prerequisites`, and `scenario`.
- `steps`: ordered records with `id`, `kind`, and `purpose`.
- `workedExample`: the ID of a fixed, successful play step.
- `concepts`: records with `id`, `explanation`, `taughtIn`, `practicedIn`, and `assessedIn`.
- `misconceptions`: records with `belief`, `evidenceStep`, and `feedback`.
- `transfer`: the independent task's `step`, `task`, `changes`, and `withheldGuidance`.
- `claimSources`: records with `step`, `sourceId`, and `claim`.

Start with what the learner should be able to do. Identify what they must
understand to do it. Introduce those concepts in a working example before asking
for repairs. Decide where to give a procedure and where the learner must decide.
Use the existing tool lesson plan as a format example, not as a mandatory story.

Review the plan as a teacher. For each concept, can a learner with the stated
prerequisites follow the example and attempt the task? Reject unexplained terms,
missing practice, and independent tasks that repeat the supplied instructions.
Write a specific review note. Run `review-plan` only after that review. A change
to the brief, source bundle, or plan invalidates its review.

## 2. Draft the explanations and experiments

Draft from the reviewed plan, one teaching purpose at a time. Use a concrete
scenario and actual inputs and outputs. Teach what each participant or function
is responsible for. Connect each new term to the example that needs it.

A worked example shows the full process with explanations. A guided task lets
the learner try a change with support. An independent task states the goal and
constraints while withholding the repair. Keep the distinction in the copy.

Ask a prediction before revealing the consequence. Make alternatives plausible
and distinct. Do not tell the learner the outcome in the preceding sentence.
After a run, explain the observed event, its cause, and how it affects the next
operation. Correct predictions need explanations too. Hints reveal progressively
more help; the full solution also explains why the repair works.

Use short teaching sections with examples rather than compressing every concept
into an introductory paragraph. More words alone do not make a better lesson.
Every paragraph should prepare a decision or explain observed evidence.

Keep claims traceable to reviewed sources. Distinguish general tool-use mechanics
from behavior defined by the local simulator. Do not copy source prose or put
private authoring references into the lesson.

## 3. Validate mechanics, then review the actual teaching

Import the candidate and run its exercises. Fix unreachable tasks, invalid cases,
or incorrect example outcomes. Preview the rendered lesson, including the wrong
attempts, hints, solutions, and final task.

Then read it in sequence as a learner with the stated prerequisites. Write
`evidence/teaching-review.json` containing:

- `version: 1`, `reviewer`, and `basis: "author-review"`.
- `hashes`: SHA-256 of the exact `brief`, `sources`, `plan`, and `content` files.
- `checks`: one record for each criterion below, with `verdict: "pass"` or
  `"revise"`, and `evidence: [{step, detail}]` citing actual lesson steps.

Review these criteria separately:

| Criterion | Questions the reviewer must answer |
| --- | --- |
| `preparation` | Are required concepts taught before use? Are the code and terms explained for this audience? |
| `worked-example` | Can the learner follow a complete success, connecting inputs, operations, and outputs? |
| `prediction` | Does the learner have enough information to reason? Is the answer withheld until the experiment? |
| `feedback` | Do wrong and right attempts receive a causal explanation tied to visible evidence? |
| `transfer` | What must the learner decide independently? What changes beyond names or numbers? |
| `source-support` | Do sources support the actual claims? Are simulated policies labeled as such? |

Fix findings, then review the changed content again. Acceptance requires current
hashes and passing evidence for all six criteria. The command checks that the
review is complete and current. It does not judge whether its prose is truthful
or whether the lesson teaches effectively. An author review can be performed in
the authoring session; label it honestly. Do not call it an independent human review.

## 4. Test with learners

Record real learner observations separately in PILOT.md. Measure unfamiliar-task
performance, requests for help, time, and points of confusion. Do not infer those
results from automated browser journeys or an author's own review.
