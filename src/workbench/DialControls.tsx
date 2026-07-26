import type { SamplingConfig } from "../engine/sampling";

export function DialControls({
  value,
  disabled,
  lockedKeys,
  onChange,
}: {
  value: SamplingConfig;
  disabled: boolean;
  lockedKeys?: ("temperature" | "topK" | "topP")[];
  onChange: (next: SamplingConfig) => void;
}) {
  const locked = new Set(lockedKeys ?? []);
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
          disabled={disabled || locked.has("temperature")}
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
          disabled={disabled || locked.has("topK")}
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
          disabled={disabled || locked.has("topP")}
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
