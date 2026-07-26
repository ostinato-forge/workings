import type { TokenMachineRecord } from "../engine/token-machine";

export function RunRail({
  records,
  selected,
  onSelect,
}: {
  records: TokenMachineRecord[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  if (records.length === 0) {
    return <p className="evidence-meta">No runs yet. Press START.</p>;
  }
  return (
    <ol className="run-rail" aria-label="your runs so far">
      {records.map((record, index) => (
        <li key={record.seed}>
          <button
            className={selected === index ? "run-card selected" : "run-card"}
            onClick={() => onSelect(index)}
          >
            <span className="evidence-meta">Run {index + 1}</span>{" "}
            <span className="run-ending">
              {record.steps.map((s) => s.event.sampledToken).join(" ")}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
