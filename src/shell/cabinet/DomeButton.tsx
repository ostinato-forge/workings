import { useId } from "react";

interface DomeButtonProps {
  color: "green" | "red" | "cyan" | "amber";
  size?: "normal" | "large";
  active?: boolean;
  label: string;
  accessibleLabel?: string;
  sublabel?: string;
  symbol?: string;
  onClick?: () => void;
}

export default function DomeButton({ color, size = "normal", active = true,
  label, accessibleLabel, sublabel, symbol = "●", onClick }: DomeButtonProps) {
  const helpId = useId();
  return <div className="deck-action" data-color={color} data-size={size} data-enabled={active}>
    <button type="button" className="deck-dome" disabled={!active} onClick={onClick}
      aria-label={accessibleLabel ?? label} aria-describedby={sublabel ? helpId : undefined}>
      <span aria-hidden="true">{symbol}</span>
    </button>
    <span className="deck-action-label" aria-hidden="true">{label}</span>
    {sublabel ? <span id={helpId} className="deck-action-help">{sublabel}</span> : null}
  </div>;
}
