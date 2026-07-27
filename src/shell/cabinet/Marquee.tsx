export function Marquee({ activated }: { activated: boolean }) {
  return (
    <div
      className="wish-marquee relative flex justify-between items-center overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #2e2e40 0%, #222236 30%, #1a1a2e 60%, #141428 100%)",
        border: "4px solid #4a4a5e",
        borderBottom: "2px solid #2a2a3e",
        borderRadius: "14px 14px 0 0",
        flex: "0 0 auto",
        padding: "var(--wc-marquee-padding, 16px 28px 12px)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.4), inset 0 0 60px rgba(0,140,220,0.05)",
      }}
    >
      {/* Vertical line texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.01) 0px, transparent 1px, transparent 3px)",
        }}
      />
      {/* Top glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-20px",
          left: "20%",
          right: "20%",
          height: "60px",
          background: activated
            ? "radial-gradient(ellipse at 50% 100%, rgba(126,226,168,0.15) 0%, transparent 70%)"
            : "radial-gradient(ellipse at 50% 100%, rgba(126,226,168,0.06) 0%, transparent 70%)",
          transition: "background 1.2s ease",
        }}
      />

      <Screw className="absolute top-2 left-2.5" />
      <Screw className="absolute top-2 right-2.5" />

      <div className="relative z-[2]">
        <div
          className="font-arcade"
          style={{
            fontSize: "var(--wc-marquee-title-size, 20px)",
            color: activated ? "#50e0ff" : "#2a7088",
            letterSpacing: "0.1em",
            textShadow: activated
              ? "0 0 6px rgba(126,226,168,0.6), 0 0 20px rgba(126,226,168,0.3), 0 0 40px rgba(126,226,168,0.12), 0 2px 0 #003050, 0 3px 0 #002030"
              : "0 0 3px rgba(126,226,168,0.15), 0 0 8px rgba(126,226,168,0.08), 0 2px 0 #002030, 0 3px 0 #001520",
            animation: activated ? "brand-glow 3s ease-in-out infinite" : "none",
            transition: "color 1.2s ease, text-shadow 1.2s ease",
          }}
        >
          WORKINGS
        </div>
        <div
          className="font-arcade mt-[5px]"
          style={{
            fontSize: "var(--wc-marquee-subtitle-size, 7px)",
            color: activated ? "#c084fc" : "#604070",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            textShadow: activated
              ? "0 0 8px rgba(192,132,252,0.3), 0 0 20px rgba(192,132,252,0.1)"
              : "none",
            transition: "color 1.2s ease, text-shadow 1.2s ease",
          }}
        >
          HOW THE MACHINE WORKS · TOKEN TO AGENT
        </div>
      </div>

      <div className="flex items-center gap-4 relative z-[2]">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              border: "2px solid rgba(0,0,0,0.5)",
              background: !activated
                ? "radial-gradient(ellipse at 40% 30%, rgba(255,255,255,0.2) 0%, transparent 40%), radial-gradient(circle, #553300 0%, #331a00 100%)"
                : "radial-gradient(ellipse at 40% 30%, rgba(255,255,255,0.5) 0%, transparent 40%), radial-gradient(circle, #0f0 0%, #0a0 100%)",
              boxShadow: !activated
                ? "inset 0 -2px 4px rgba(0,0,0,0.3), 0 0 4px rgba(80,40,0,0.3)"
                : "inset 0 -2px 4px rgba(0,0,0,0.3), 0 0 8px rgba(0,255,0,0.5)",
              animation: activated ? "lamp-pulse 2s ease-in-out infinite" : "none",
              transition: "background 0.5s ease, box-shadow 0.5s ease",
            }}
          />
          <span
            className="font-arcade"
            style={{
              fontSize: "6px",
              color: activated ? "#666" : "#444",
              letterSpacing: "0.1em",
              transition: "color 0.5s ease",
            }}
          >
            {activated ? "ONLINE" : "STANDBY"}
          </span>
        </div>
      </div>
    </div>
  );
}

function Screw({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle, #555 0%, #333 50%, #222 100%)",
        border: "1px solid #1a1a1a",
        boxShadow:
          "inset 0 1px 2px rgba(255,255,255,0.1), 0 1px 3px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "3px",
          left: "2px",
          width: "6px",
          height: "1px",
          background: "#1a1a1a",
          transform: "rotate(35deg)",
          borderRadius: "1px",
        }}
      />
    </div>
  );
}
