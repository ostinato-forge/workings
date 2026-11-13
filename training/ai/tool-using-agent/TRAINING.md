---
format: 1
id: tool-using-agent
topic: tools
title: Build an agent that can use a tool
engine: agent-loop/1
audience: People who use AI assistants and can read simple loops and objects
prerequisites:
  - Read a function call, condition, loop, and object field
  - No model API experience is required
objective: Build and diagnose a bounded loop that executes tool requests, returns matching results, and finishes with an answer supported by those results.
---

# Learner and task

The learner has used an AI assistant but has not written its control loop. They
can read simple code. Do not assume they know tool calls, message history, or
request IDs. Introduce those concepts through an inventory support task.

A customer asks for current stock counts. The model cannot read the inventory
directly. The application exposes a lookup function, runs requests from the model,
and supplies the results on the next call. The learner will repair that application.

# Teaching design before package generation

Write `teaching-plan.json` before drafting the package. Use `training/DESIGN.md`
to review the sequence, worked example, misconceptions, and independent task.
Each concept must be introduced, practiced, then assessed. Record the design
review with `training review-plan`. Do not substitute passing engine tests for
this teaching review.

Start with one complete example. Let the learner inspect actual code and message
history at each event. Then remove an operation and ask for a prediction before
revealing the consequence. Follow with a repair task, explicit teaching about
request IDs, and practice distinguishing a final answer from a limit stop.

Teach the model, application, and tool as separate responsibilities. Explain that
a tool result in a local variable is absent from the next model input until it is
added to the conversation. Use a concrete request/result pair to explain call IDs.
Use short teaching sections and code examples instead of one dense paragraph.

# Independent task

Use a new broken program and two- and three-item inventory requests. Include
an unrelated result ID rather than simply repeating the missing-result exercise.
The same repair must handle all cases, including a request that needs one more
model call than the initial budget allows. Do not reveal the faulty fields or
correct settings in the challenge instructions. Hints and solutions are optional.

The trusted checks require actual lookups, matching results in the conversation,
the correct final answer, and termination within eight model calls. Do not change
the grader to make content pass. Do not claim this small challenge proves general
agent-building skill.

# Explanations and feedback

Predictions should test a causal distinction. Do not state the outcome immediately
before asking for it. Guided repairs may explain a procedure; the independent task
must state a goal and constraints without prescribing the repair.

After a run, connect evidence to cause: what event occurred, what information was
available to the next call, and why the model continued or the application stopped.
Give every experiment a debrief and a solution explanation. A correct prediction
also needs an explanation. Keep full solutions separate from progressive hints.

Use the source bundle for general technical claims. Record claim-to-step mappings
in the teaching plan. The local engine is the authority for simulation details:
one tool request per model call, missing-item order, fixed repetition, and exact
call counts. Do not attribute those policies to all language models.

# Writing and delivery

Use plain English. Define technical terms before asking learners to use them.
Keep explanations concise enough for the display, with concrete examples that
prepare the next task. Use Workings branding only. Avoid em dashes and doubled
hyphens as punctuation. Keep Run, Step, Stop, Reset, and navigation on the frame.

Target 15 to 20 minutes for this revision; measure the duration with real learners.
The simulated model and local tools require no paid calls during learning.
Review content in the authoring session, record unresolved findings, and keep
human pilot results separate from automated checks and author judgment.
