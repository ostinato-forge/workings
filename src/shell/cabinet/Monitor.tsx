import type { ReactNode } from "react";

interface MonitorProps {
  activated: boolean;
  children: ReactNode;
}

export function Monitor({ activated, children }: MonitorProps) {
  return (
    <div
      className="wish-monitor-frame relative"
      style={{
        background:
          "linear-gradient(180deg, #222236 0%, #1a1a2e 50%, #141428 100%)",
        borderLeft: "4px solid #3a3a4e",
        borderRight: "4px solid #3a3a4e",
        display: "flex",
        flex: "1 1 auto",
        flexDirection: "column",
        minHeight: 0,
        padding: "var(--wc-monitor-padding, 16px 20px)",
        boxShadow:
          "inset 4px 0 8px rgba(0,0,0,0.3), inset -4px 0 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Speaker grille */}
      <div
        className="relative"
        style={{
          height: "18px",
          background:
            "repeating-linear-gradient(90deg, #1a1a28 0px, #1a1a28 3px, #111118 3px, #111118 5px)",
          boxShadow:
            "inset 0 2px 6px rgba(0,0,0,0.6), inset 0 -1px 3px rgba(0,0,0,0.4)",
          flex: "0 0 auto",
          marginBottom: "var(--wc-speaker-margin-bottom, 16px)",
          marginLeft: "var(--wc-speaker-margin-x, -20px)",
          marginRight: "var(--wc-speaker-margin-x, -20px)",
          marginTop: "var(--wc-speaker-margin-top, -16px)",
          borderLeft: "4px solid #3a3a4e",
          borderRight: "4px solid #3a3a4e",
        }}
      >
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-arcade"
          style={{
            fontSize: "4px",
            color: "rgba(255,255,255,0.08)",
            letterSpacing: "0.3em",
          }}
        >
          STEREO SOUND
        </span>
      </div>

      {/* CRT bezel */}
      <div
        className="wish-crt-bezel relative overflow-hidden crt-scanlines crt-vignette"
        style={{
          border: "8px solid",
          borderColor: "#44445a #33334a #1a1a2a #33334a",
          borderRadius: "10px",
          background: "#030308",
          display: "flex",
          flex: "1 1 auto",
          minHeight: 0,
          boxShadow: activated
            ? "inset 0 8px 30px rgba(0,0,0,0.8), inset 8px 0 20px rgba(0,0,0,0.4), inset -8px 0 20px rgba(0,0,0,0.4), inset 0 -6px 16px rgba(0,0,0,0.35), inset 0 0 60px rgba(0,20,40,0.3), 0 0 20px rgba(126,226,168,0.06), 0 0 50px rgba(126,226,168,0.03)"
            : "inset 0 10px 35px rgba(0,0,0,0.9), inset 10px 0 25px rgba(0,0,0,0.6), inset -10px 0 25px rgba(0,0,0,0.6), inset 0 -6px 16px rgba(0,0,0,0.5), inset 0 0 80px rgba(0,0,30,0.4), 0 0 15px rgba(126,226,168,0.03)",
          transition: "box-shadow 1.2s ease",
        }}
      >
        {/* Phosphor glow */}
        <div
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            background: activated
              ? "radial-gradient(ellipse at 50% 50%, rgba(126,226,168,0.04) 0%, transparent 60%)"
              : "radial-gradient(ellipse at 50% 50%, rgba(126,226,168,0.015) 0%, transparent 60%)",
            animation: "phosphor-pulse 4s ease-in-out infinite",
            transition: "background 1.2s ease",
          }}
        />

        {/* Screen content */}
        <div className="wish-screen-content relative z-10 flex flex-1 min-h-0 w-full flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
