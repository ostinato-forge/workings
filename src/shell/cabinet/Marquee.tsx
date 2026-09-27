import type { CSSProperties } from "react";
import { useCabinet } from "./CabinetState";

export function Marquee({ activated }: { activated: boolean }) {
  const { displayTheme, toggleDisplayTheme, power } = useCabinet();
  return <header className="wish-marquee">
    <div className="cabinet-brand">
      <span className="cabinet-wordmark">WORKINGS<span aria-hidden="true">▰</span></span>
      <span className="wish-marquee-subtitle">PREDICT · CHANGE · RUN · INSPECT</span>
    </div>
    <div className="marquee-vents" aria-hidden="true">{Array.from({ length: 7 }, (_, index) =>
      <i key={index} style={{ "--led-delay": `${index * 85}ms` } as CSSProperties} />)}</div>
    <div className="marquee-settings">
      <span className="cabinet-status"><i data-active={activated} />{activated ? "ONLINE" : power === "booting" ? "STARTING" : "STANDBY"}</span>
      <button type="button" role="switch" aria-checked={displayTheme === "light"}
        aria-label="Light display" className="display-switch" onClick={toggleDisplayTheme}>
        <span className="display-switch-track" aria-hidden="true"><span /></span>
        <span>{displayTheme === "light" ? "Light" : "Dark"}<span className="display-switch-suffix"> display</span></span>
      </button>
    </div>
  </header>;
}
