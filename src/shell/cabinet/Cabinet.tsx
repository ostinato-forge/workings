import type { ReactNode } from "react";
import { CabinetBottom } from "./CabinetBottom";
import { useCabinet } from "./CabinetState";
import { Marquee } from "./Marquee";
import { Monitor } from "./Monitor";

export function Cabinet({
  screen,
  deck,
}: {
  screen: ReactNode;
  deck?: ReactNode;
}) {
  const { coinInserted } = useCabinet();

  return (
    <div className="wish-cabinet-root flex flex-col items-center relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 80%, rgba(0,40,80,0.15) 0%, transparent 50%), radial-gradient(ellipse at 50% 20%, rgba(20,0,40,0.1) 0%, transparent 50%), #04060c",
        height: "100svh",
        minHeight: "100svh",
        padding: "var(--wc-root-padding, 20px 0)",
      }}
    >
      {/* Floor glow */}
      <div
        className="fixed pointer-events-none z-0"
        style={{
          bottom: "-40px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "800px",
          height: "120px",
          background:
            "radial-gradient(ellipse at 50% 100%, rgba(126,226,168,0.05) 0%, rgba(126,226,168,0.02) 40%, transparent 70%)",
        }}
      />

      <div
        className="wish-cabinet-shell flex flex-col relative z-[1]"
        style={{
          width: "980px",
          maxWidth: "96vw",
          filter:
            "drop-shadow(0 30px 80px rgba(0,0,0,0.9)) drop-shadow(0 0 40px rgba(126,226,168,0.04))",
          transform: "scale(var(--wc-cabinet-scale, 1))",
          transformOrigin: "top center",
        }}
      >
        <Marquee activated={coinInserted} />
        <Monitor activated={coinInserted}>{screen}</Monitor>
        {deck ?? (
          <div
            aria-hidden="true"
            style={{
              height: "96px",
              flex: "0 0 auto",
              background: "linear-gradient(180deg, #242438, #10101c)",
              border: "4px solid #3a3a4e",
            }}
          />
        )}
        <CabinetBottom />
      </div>
    </div>
  );
}
