---
format: 1
id: retry-tools
topic: retries
title: Give your agent a retry limit
engine: agent-loop/1
audience: Learners who have completed the tool-using agent lesson
prerequisites:
  - Execute a tool request and return its matching result
  - Stop on a final answer
objective: Recover from a temporary tool failure, then stop without an invented answer when the retry budget is exhausted.
---

# Final task

Build an inventory agent that retries one failed lookup. Verify the same loop on
one successful recovery, a different inventory, and a persistent outage. The
persistent outage must end with a tool error, not an answer or a call-limit stop.
All tool failures are simulated by a declared number of failed lookup attempts.
Do not suggest that retries always work or that arbitrary tools are safe to retry.
This lookup only reads data. The retry allowance is shared across the whole run.

# Teaching sequence

Use these IDs and mechanics. Generate original explanations, predictions, and
three progressive hints for every play step. Use a maximum of six steps.

1. `meet-the-failure`, teach: explain the difference between a missing result and
   a tool error. The previous lesson's matching result and final-answer loop is
   supplied. Explain that read-only lookups are the scope of this exercise.
2. `observe-the-error`, play, observe: program dispatch=execute,
   observation=append, finish=return, maxTurns=8, onError=stop, retries=0.
   No editable blocks. pass=tool-error. The case has failures of 1 for the first
   item, expected=complete, two requested items, and ordinary inventory values.
   This stage observes an unfinished task; it is not a successful inventory check.
3. `allow-one-retry`, play, build: same initial program and transient case.
   Editable onError and retries. pass=success. Return the error to the model,
   permit one retry, and inspect the later result.
4. `bounded-recovery`, play, challenge: same initial program. Editable onError,
   retries, and maxTurns. pass=success. Three cases: one temporary failure,
   changed inventory with no failure, and a persistent failure count of 9 with
   expected=tool-error. The other cases have expected=complete. Keep every case
   reachable with maxTurns=8, onError=retry, and retries=1. Vary item IDs and values.
5. `what-retries-prove`, recap: recovery and failure are different results. The
   limit prevents an endless loop; it cannot make unavailable data appear.
6. `free-play`, free-play: dispatch=execute, observation=append, finish=return,
   maxTurns=8, onError=retry, retries=1. Include recovery and persistent cases.

Prediction options cover complete, tool-error, and turn-limit in this lesson.
Navigation hints must state the required action. Run and Step live on the cabinet.

# Writing

Use short sentences and plain English. Do not use an em dash, doubled hyphens as
punctuation, marketing language, or the words bet, wager, magic, or revolutionary.
Keep Workings as the only product branding in lesson prose. Do not invent model
reasoning. Explain that model responses are simulated and the tool loop executes
locally. Sources support loop feedback and stopping limits. The exact retry count
is a lesson policy, not a universal rule.
