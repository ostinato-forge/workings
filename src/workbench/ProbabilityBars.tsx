import type { CandidateRecord } from "../engine/token-machine";

const SHOWN = 12;

export function ProbabilityBars({
  candidates,
  sampledId,
}: {
  candidates: CandidateRecord[];
  sampledId: number;
}) {
  const shown = candidates.slice(0, SHOWN);
  const hidden = candidates.length - shown.length;
  return (
    <div>
      <ol aria-label="candidate tokens by probability">
        {shown.map((candidate) => (
          <li key={candidate.tokenId}>
            <span>{candidate.token}</span>{" "}
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                height: "0.75em",
                width: `${Math.max(1, Math.round(candidate.probFull * 200))}px`,
                background: candidate.survived ? "#2266aa" : "#bbbbbb",
              }}
            />{" "}
            <span>{(candidate.probFull * 100).toFixed(1)}%</span>{" "}
            <span>
              {candidate.survived ? "survived the cut" : "cut"}
              {candidate.tokenId === sampledId ? ", sampled" : ""}
            </span>
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <p>
          {hidden} more candidates below this line, all
          {candidates.slice(SHOWN).every((c) => !c.survived)
            ? " cut"
            : " shown above the cut"}
          .
        </p>
      ) : null}
    </div>
  );
}
