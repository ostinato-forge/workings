import type { ReactNode } from "react";
import { useCabinet } from "./CabinetState";
import { Marquee } from "./Marquee";
import { Monitor } from "./Monitor";

export function Cabinet({ screen, deck }: { screen: ReactNode; deck?: ReactNode }) {
  const { coinInserted, displayTheme, power } = useCabinet();
  return <div className="wish-cabinet-root" data-display-theme={displayTheme} data-power={power}>
    <div className="wish-cabinet-shell">
      <Marquee activated={coinInserted} />
      <Monitor>{screen}</Monitor>
      {deck ?? <div className="wish-idle-deck" aria-hidden="true"><span>WORKINGS / LEARNING ARCADE</span>
        <span className="cabinet-coin-slot" data-coin-slot><i /><span>INSERT COIN</span></span>
      </div>}
    </div>
  </div>;
}
