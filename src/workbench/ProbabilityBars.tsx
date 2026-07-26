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
  const allHiddenCut = candidates.slice(SHOWN).every((c) => !c.survived);
  return (
    <div>
      <ol aria-label="candidate tokens by probability" className="panel">
        {shown.map((candidate, index) => (
          <li key={candidate.tokenId} className="evidence-row">
            <span
              className={
                candidate.tokenId === sampledId
                  ? "evidence-token sampled-pulse"
                  : "evidence-token"
              }
            >
              {candidate.token}
            </span>
            <span className="evidence-track">
              <span
                aria-hidden="true"
                className={
                  candidate.survived
                    ? "evidence-bar survived"
                    : "evidence-bar cut"
                }
                style={{
                  width: `${Math.max(1, Math.round(candidate.probFull * 260))}px`,
                  animationDelay: `${index * 30}ms`,
                }}
              />
              <span
                className={
                  candidate.survived
                    ? "evidence-meta survived-label"
                    : "evidence-meta"
                }
              >
                {(candidate.probFull * 100).toFixed(1)}%{" "}
                {candidate.survived ? "survived" : "cut"}
                {candidate.tokenId === sampledId ? ", sampled" : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <p className="evidence-meta">
          {hidden} more candidates below this line{allHiddenCut ? ", all cut" : ""}.
        </p>
      ) : null}
    </div>
  );
}
