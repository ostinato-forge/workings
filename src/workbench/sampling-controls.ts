import type { SamplingConfig } from "../engine/sampling";
import type { DialControl } from "../shell/cabinet/ControlDeck";

export function samplingControls(
  value: SamplingConfig,
  onChange: (change: Partial<SamplingConfig>) => void,
  disabled = false,
  locked: Partial<SamplingConfig> = {},
  includeTopP = false,
): DialControl[] {
  return [
    {
      id: "temperature", label: "TEMPERATURE", value: value.temperature,
      min: 0, max: 4, step: 0.1,
      disabled: disabled || locked.temperature !== undefined,
      format: (next) => (next ?? 0).toFixed(1),
      onChange: (next) => { if (next !== null) onChange({ temperature: next }); },
    },
    {
      id: "top-k", label: "TOP-K", value: value.topK ?? null,
      min: 1, max: 5, step: 1, optional: true,
      disabled: disabled || locked.topK !== undefined,
      format: (next) => next === null ? "OFF" : String(next),
      onChange: (next) => onChange({ topK: next ?? undefined }),
    },
    ...(includeTopP ? [{
      id: "top-p", label: "TOP-P", value: value.topP ?? null,
      min: 0.1, max: 1, step: 0.1, optional: true,
      disabled,
      format: (next: number | null) => next === null ? "OFF" : next.toFixed(1),
      onChange: (next: number | null) => onChange({ topP: next ?? undefined }),
    }] : []),
  ];
}
