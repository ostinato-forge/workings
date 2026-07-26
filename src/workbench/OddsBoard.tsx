import type { TokenMachineRecord } from "../engine/token-machine";
import { ProbabilityBars } from "./ProbabilityBars";

/*
 * The board for one step of one run: the full scored list, with the
 * draw's winner marked. The sweep animation is presentational; where it
 * lands is the record's sampled token, nothing else.
 */
export function OddsBoard({
  record,
  stepIndex,
}: {
  record: TokenMachineRecord;
  stepIndex: number;
}) {
  const step = record.steps[stepIndex];
  if (step === undefined) return null;
  return (
    <div className="odds-board">
      <p className="evidence-meta">
        Drawing word {stepIndex + 1} of {record.steps.length}
      </p>
      <ProbabilityBars
        candidates={step.event.candidates}
        sampledId={step.event.sampledId}
      />
    </div>
  );
}
