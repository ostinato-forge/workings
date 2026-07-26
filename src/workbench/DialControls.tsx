import type { SamplingConfig } from "../engine/sampling";

export function DialControls({
  value,
  disabled,
  onChange,
}: {
  value: SamplingConfig;
  disabled: boolean;
  onChange: (next: SamplingConfig) => void;
}) {
  return (
    <fieldset disabled={disabled} className="deck">
      <legend>Sampling dials</legend>
      <label>
        temperature{" "}
        <input
          type="number"
          min="0"
          max="4"
          step="0.1"
          value={value.temperature}
          onChange={(e) =>
            onChange({ ...value, temperature: Number(e.target.value) })
          }
        />
      </label>{" "}
      <label>
        top-k{" "}
        <input
          type="number"
          min="1"
          step="1"
          value={value.topK ?? ""}
          placeholder="off"
          onChange={(e) => {
            const raw = e.target.value;
            const next = { ...value };
            if (raw === "") {
              delete next.topK;
            } else {
              next.topK = Number(raw);
            }
            onChange(next);
          }}
        />
      </label>{" "}
      <label>
        top-p{" "}
        <input
          type="number"
          min="0.05"
          max="1"
          step="0.05"
          value={value.topP ?? ""}
          placeholder="off"
          onChange={(e) => {
            const raw = e.target.value;
            const next = { ...value };
            if (raw === "") {
              delete next.topP;
            } else {
              next.topP = Number(raw);
            }
            onChange(next);
          }}
        />
      </label>
    </fieldset>
  );
}
