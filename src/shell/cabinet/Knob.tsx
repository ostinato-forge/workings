import { useRef } from "react";

/*
 * A rotary dial that is a real slider. Keyboard: arrows step, Home/End
 * jump. Mouse or touch: vertical drag. The indicator sweeps 270 degrees
 * from -135 (minimum) to +135 (maximum). A null value (for an optional
 * dial like top-k) reads as OFF at the minimum stop.
 */
export function Knob({
  label,
  value,
  min,
  max,
  step,
  optional,
  disabled,
  format,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  optional?: boolean;
  disabled?: boolean;
  format: (value: number | null) => string;
  onChange: (next: number | null) => void;
}) {
  const dragOrigin = useRef<{ y: number; value: number } | null>(null);
  const effective = value ?? min - step;
  const span = max - (optional ? min - step : min);
  const fraction = Math.max(
    0,
    Math.min(1, (effective - (optional ? min - step : min)) / span),
  );
  const angle = -135 + fraction * 270;

  const commit = (raw: number): void => {
    const snapped = Math.round(raw / step) * step;
    if (optional && snapped < min) {
      onChange(null);
      return;
    }
    onChange(Math.max(min, Math.min(max, Number(snapped.toFixed(4)))));
  };

  return (
    <div className="ctl-knob">
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={optional ? min - step : min}
        aria-valuemax={max}
        aria-valuenow={effective}
        aria-valuetext={format(value)}
        aria-disabled={disabled}
        className={disabled ? "knob-face knob-disabled" : "knob-face"}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            commit(effective + step);
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            commit(effective - step);
          } else if (e.key === "Home") {
            e.preventDefault();
            commit(optional ? min - step : min);
          } else if (e.key === "End") {
            e.preventDefault();
            commit(max);
          }
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOrigin.current = { y: e.clientY, value: effective };
        }}
        onPointerMove={(e) => {
          if (disabled || dragOrigin.current === null) return;
          const delta = (dragOrigin.current.y - e.clientY) / 3;
          commit(dragOrigin.current.value + delta * step);
        }}
        onPointerUp={() => {
          dragOrigin.current = null;
        }}
        onPointerCancel={() => { dragOrigin.current = null; }}
      >
        <span
          className="knob-indicator"
          style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
        />
      </div>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{format(value)}</span>
    </div>
  );
}
