import DomeButton from "./DomeButton";
import Joystick from "./Joystick";
import { Knob } from "./Knob";
import type { ComponentProps } from "react";

export type DialControl = ComponentProps<typeof Knob> & { id: string };
export type LessonNavigation = {
  onBack?: () => void;
  onNext?: () => void;
  hint: string;
};
export type DeckProps = {
  activated: boolean;
  dials: DialControl[];
  canStart: boolean;
  startSublabel: string;
  startLabel?: string;
  onStart: () => void;
  onStop?: () => void;
  onReset?: () => void;
  resetLabel?: string;
  onStep?: () => void;
  canStep?: boolean;
};

export function ControlDeck({ experiment, navigation }: {
  experiment: DeckProps | null;
  navigation: LessonNavigation;
}) {
  return <footer className="wish-control-deck" aria-label="Cabinet controls">
    <Joystick onBack={navigation.onBack} onNext={navigation.onNext} />
    <div className="deck-settings">
      {experiment?.dials.length ? <div className="deck-dials">
        {experiment.dials.map(({ id, ...dial }) => <Knob key={id} {...dial}
          disabled={!experiment.activated || dial.disabled} />)}
      </div> : <div className="deck-guide"><span className="deck-guide-mark" aria-hidden="true">W /</span>
        <p>{navigation.hint}</p></div>}
    </div>
    <div className="deck-buttons" data-stepping={!!experiment?.onStep}>
      {experiment ? <>
        <DomeButton color="green" size="large" label="Run" symbol="▶"
          accessibleLabel={experiment.startLabel ?? "Run"} sublabel={experiment.startSublabel}
          active={experiment.activated && experiment.canStart} onClick={experiment.onStart} />
        {experiment.onStep ? <DomeButton color="cyan" label="Step" symbol="▷"
          accessibleLabel="Step agent" active={experiment.canStep !== false} onClick={experiment.onStep} /> : null}
        {experiment.onReset ? <DomeButton color="amber" label="Reset" symbol="↺"
          accessibleLabel={experiment.resetLabel ?? "Reset practice servers"} onClick={experiment.onReset} /> : null}
        {experiment.onStop ? <DomeButton color="red" label="Stop" symbol="■"
          onClick={experiment.onStop} /> : null}
      </> : null}
      <div className="deck-step-buttons">
        <DomeButton color="cyan" label="Back" symbol="←" active={!!navigation.onBack} onClick={navigation.onBack} />
        <DomeButton color="cyan" label="Next" accessibleLabel="Continue" symbol="→"
          active={!!navigation.onNext} onClick={navigation.onNext} />
      </div>
    </div>
  </footer>;
}
