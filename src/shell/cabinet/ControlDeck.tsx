import DomeButton from "./DomeButton";
import Joystick from "./Joystick";
import { Knob } from "./Knob";

export type DeckProps = {
  activated: boolean;
  temperature: number;
  topK: number | null;
  dialsEnabled: boolean;
  lockedDials: ("temperature" | "topK")[];
  canStart: boolean;
  startSublabel: string;
  onTemperature: (next: number) => void;
  onTopK: (next: number | null) => void;
  onStart: () => void;
  onStop: () => void;
};

export function ControlDeck({
  activated,
  temperature,
  topK,
  dialsEnabled,
  lockedDials,
  canStart,
  startSublabel,
  onTemperature,
  onTopK,
  onStart,
  onStop,
}: DeckProps) {
  const ledsOn = activated;

  return (
    <div
      className="wish-control-deck relative"
      style={{
        background:
          "linear-gradient(180deg, #1e1e30 0%, #141424 40%, #0e0e1c 100%)",
        borderLeft: "4px solid #3a3a4e",
        borderRight: "4px solid #3a3a4e",
        flex: "0 0 auto",
        padding: "var(--wc-control-outer-padding, 4px 20px 0)",
        boxShadow:
          "inset 4px 0 8px rgba(0,0,0,0.3), inset -4px 0 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Top LED strip */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: activated
            ? "linear-gradient(90deg, transparent 0%, rgba(126,226,168,0.25) 15%, rgba(126,226,168,0.5) 30%, rgba(128,240,255,0.7) 50%, rgba(126,226,168,0.5) 70%, rgba(126,226,168,0.25) 85%, transparent 100%)"
            : "linear-gradient(90deg, transparent 0%, rgba(126,226,168,0.06) 15%, rgba(126,226,168,0.1) 30%, rgba(126,226,168,0.14) 50%, rgba(126,226,168,0.1) 70%, rgba(126,226,168,0.06) 85%, transparent 100%)",
          boxShadow: activated
            ? "0 0 6px rgba(126,226,168,0.3), 0 2px 8px rgba(126,226,168,0.1)"
            : "none",
          transition: "background 1.2s ease, box-shadow 1.2s ease",
        }}
      />

      <div
        className="flex items-center justify-center"
        style={{
          gap: "var(--wc-control-stage-gap, 40px)",
          padding: "var(--wc-control-stage-padding, 18px 8px 24px)",
          transform: "perspective(1200px) rotateX(12deg)",
          transformOrigin: "top center",
        }}
      >
        {/* Deck plate */}
        <div
          className="flex items-center gap-8 relative"
          style={{
            gap: "var(--wc-control-plate-gap, 32px)",
            padding: "var(--wc-control-plate-padding, 16px 32px)",
            background:
              "linear-gradient(180deg, rgba(40,50,80,0.12), rgba(0,0,0,0.15)), linear-gradient(90deg, rgba(126,226,168,0.02), transparent, rgba(126,226,168,0.02)), #111f3a",
            borderTop: activated
              ? "1px solid rgba(126,226,168,0.12)"
              : "1px solid rgba(126,226,168,0.04)",
            borderLeft: activated
              ? "1px solid rgba(126,226,168,0.12)"
              : "1px solid rgba(126,226,168,0.04)",
            borderRight: activated
              ? "1px solid rgba(126,226,168,0.12)"
              : "1px solid rgba(126,226,168,0.04)",
            borderBottom: "5px solid rgba(0,0,0,0.75)",
            transition: "border-color 0.8s ease",
            borderRadius: "10px",
            boxShadow:
              "inset 0 1px 0 rgba(60,80,140,0.12), inset 0 -1px 0 rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.5), 0 0 1px rgba(126,226,168,0.1)",
          }}
        >
          {/* Brushed metal texture */}
          <div
            className="absolute inset-0 rounded-[10px] pointer-events-none"
            style={{
              background:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.008) 0px, transparent 1px, transparent 2px)",
            }}
          />

          <div aria-hidden="true">
            <Joystick activated={activated} />
          </div>

          {/* LED strip separator */}
          <div className="flex flex-col gap-1.5 self-stretch justify-center py-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  border: "1px solid rgba(0,0,0,0.4)",
                  background: ledsOn ? "#7ee2a8" : "#1a2a3a",
                  boxShadow: ledsOn
                    ? "0 0 4px rgba(126,226,168,0.6), 0 0 10px rgba(126,226,168,0.2)"
                    : "inset 0 1px 2px rgba(0,0,0,0.4)",
                  transition: "background 0.3s ease, box-shadow 0.3s ease",
                  transitionDelay: ledsOn ? `${(4 - i) * 200}ms` : "0ms",
                }}
              />
            ))}
          </div>

          <Knob
            label="TEMPERATURE"
            value={temperature}
            min={0}
            max={4}
            step={0.1}
            disabled={
              !activated ||
              !dialsEnabled ||
              lockedDials.includes("temperature")
            }
            format={(value) => (value ?? 0).toFixed(1)}
            onChange={(next) => {
              if (next !== null) onTemperature(next);
            }}
          />

          <Knob
            label="TOP-K"
            value={topK}
            min={1}
            max={5}
            step={1}
            optional
            disabled={
              !activated || !dialsEnabled || lockedDials.includes("topK")
            }
            format={(value) => value === null ? "OFF" : String(value)}
            onChange={onTopK}
          />

          <DomeButton
            color="green"
            size="large"
            active={activated && canStart}
            label="START"
            sublabel={startSublabel}
            onClick={onStart}
          />

          <DomeButton
            color="red"
            active={activated}
            label="STOP"
            onClick={onStop}
          />

          {/* Plate label */}
          <span
            className="absolute bottom-2 left-1/2 -translate-x-1/2 font-arcade"
            style={{
              fontSize: "4px",
              color: activated ? "rgba(126,226,168,0.12)" : "rgba(126,226,168,0.04)",
              transition: "color 0.8s ease",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
            }}
          >
            PLAYER 1
          </span>
        </div>
      </div>
    </div>
  );
}
