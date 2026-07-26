import type { TokenMachineRecord } from "../engine/token-machine";

/*
 * The sentence as word tiles: the prompt fixed, generated words appended
 * one per revealed step. `revealedSteps` drives the replay; every tile
 * comes from the record.
 */
export function SentenceTrack({
  record,
  revealedSteps,
}: {
  record: TokenMachineRecord;
  revealedSteps: number;
}) {
  const promptTokens = record.config.prompt.split(" ").filter((w) => w.length > 0);
  const generated = record.steps
    .slice(0, revealedSteps)
    .map((step) => step.event.sampledToken);
  return (
    <p className="sentence-track" aria-label="the sentence so far">
      {promptTokens.map((word, i) => (
        <span key={`p${i}`} className="word-tile prompt-tile">
          {word}
        </span>
      ))}
      {generated.map((word, i) => (
        <span key={`g${i}`} className="word-tile generated-tile">
          {word}
        </span>
      ))}
      {revealedSteps < record.steps.length ? (
        <span className="word-tile pending-tile" aria-hidden="true">
          ?
        </span>
      ) : null}
    </p>
  );
}
