---
format: 1
id: tool-using-agent
topic: tools
title: Build an agent that can use a tool
engine: agent-loop/1
audience: People who use AI assistants and can read simple loops and objects
prerequisites:
  - Read a condition and a loop
  - Recognize fields in a data object
objective: Build a bounded loop that executes tool requests, returns matching results, and finishes with an answer supported by those results.
---

# Final task

Build an inventory assistant. It must look up two requested items and return their
stock counts. The learner changes program blocks, not inventory values or answers.
Verify the same program against three cases with different item IDs, stock counts,
and request order. At least one item must be out of stock in each case.

The loop must execute lookup_stock, retain the response and matching call ID in
the conversation, return the final answer, and stop within eight model calls.
The model is simulated. The tool and control loop execute locally. Make this
distinction clear. A successful run proves these mechanics in the simulator.

# Teaching sequence

Use these stable step IDs and mechanics. Write the explanations, goals,
predictions, labels, and three progressive hints for each experiment.

1. `meet-the-task`, teach: introduce the inventory request, tool, and loop.
2. `a-request-is-not-an-action`, play, observe: fixed program with dispatch=stop,
   observation=discard, finish=return, maxTurns=5, onError=stop, retries=0.
   No editable blocks. pass=unhandled-tool. Predict that the request waits for
   the application to execute it. Run once and inspect the trace.
3. `execute-the-tool`, play, build: same initial program. Only dispatch is
   editable. pass=turn-limit. Once the learner executes the tool, its result is
   discarded and the model repeats the request. Explain the missing feedback.
4. `return-the-result`, play, build: dispatch=execute, observation=discard,
   finish=return, maxTurns=5, onError=stop, retries=0. Only observation is editable.
   pass=success. Return matching results and inspect the final answer.
5. `finish-the-loop`, teach: explain the final-answer branch, a finite call
   budget, and why reaching the budget does not mean the task succeeded.
6. `build-your-agent`, play, challenge: initial dispatch=execute,
   observation=discard, finish=repeat, maxTurns=5, onError=stop, retries=0.
   Editable dispatch, observation, finish, maxTurns. pass=success. Use three fresh
   cases. State the goal and evidence, not the required option choices.
7. `what-you-built`, recap: summarize the loop and its limits. Explain that a real
   model's decisions can differ and must be tested separately.
8. `free-play`, free-play: working program with dispatch=execute,
   observation=append, finish=return, maxTurns=5, onError=stop, retries=0.
   Include three inventory cases. Invite changes and trace comparisons.

All play steps need a prediction with options for complete, unhandled-tool, and
turn-limit. Ask about the current program, so a learner can change their prediction
when editing before a new run. A wrong prediction does not block progression.
Navigation hints must describe the current task. Do not instruct users to click
buttons inside the display; Run and Step are on the cabinet frame.

# Writing

Use short, direct sentences. Explain tool call, call ID, and conversation when
first used. Do not personify the model. Do not use marketing language, an em dash,
or doubled hyphens as punctuation. Do not use the words bet, wager, magic, or
revolutionary. The only product branding in lesson prose is Workings.

The first hint points to evidence, the second names the concept, and the third
suggests a specific change. Keep the full solution separate from these hints.
Use the source bundle for technical claims. Invent original practice inventory
data, not extra capabilities or tool behavior.
