/*
 * What a lesson asks of the cabinet controls. The platform defines these
 * shapes so lessons can drive the controls without depending on the
 * cabinet, and the cabinet draws whatever a lesson sends.
 */

export type DialControl = {
  id: string;
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  optional?: boolean;
  disabled?: boolean;
  format: (value: number | null) => string;
  onChange: (next: number | null) => void;
};

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
