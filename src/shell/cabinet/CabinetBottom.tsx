export function CabinetBottom() {
  const slotGlowing = false;
  return (
    <div
      className="wish-cabinet-bottom relative"
      style={{
        background:
          "linear-gradient(180deg, #1a1a2e, #141428, #0e0e1c, #080810)",
        borderLeft: "4px solid #3a3a4e",
        borderRight: "4px solid #3a3a4e",
        borderBottom: "4px solid #2a2a3e",
        borderRadius: "0 0 8px 8px",
        flex: "0 0 auto",
        padding: "var(--wc-bottom-padding, 14px 28px)",
        boxShadow:
          "inset 4px 0 8px rgba(0,0,0,0.3), inset -4px 0 8px rgba(0,0,0,0.3), inset 0 -4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-center justify-between">
        {/* Coin return */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-4 rounded-[2px]"
            style={{
              background: "linear-gradient(180deg, #1a1a2a, #0a0a14)",
              border: "1px solid #2a2a3e",
              boxShadow:
                "inset 0 2px 4px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.02)",
            }}
          />
          <span
            className="font-arcade"
            style={{
              fontSize: "4px",
              color: "rgba(100,100,120,0.3)",
              letterSpacing: "0.2em",
            }}
          >
            COIN RETURN
          </span>
        </div>

        {/* Coin slot */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="w-8 h-10 rounded-[3px] flex items-center justify-center"
            style={{
              background:
                "radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.15) 0%, transparent 50%), linear-gradient(180deg, #333340, #222230, #1a1a28)",
              border: slotGlowing
                ? "2px solid rgba(212,168,48,0.5)"
                : "2px solid #444450",
              boxShadow: slotGlowing
                ? "inset 0 2px 4px rgba(0,0,0,0.5), 0 0 14px rgba(212,168,48,0.3), 0 0 30px rgba(212,168,48,0.1)"
                : "inset 0 2px 4px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)",
              transition: "border-color 0.3s ease, box-shadow 0.3s ease",
            }}
          >
            <div
              data-coin-slot
              className="w-5 h-1 rounded-sm"
              style={{
                background: slotGlowing
                  ? "linear-gradient(180deg, #1a1008, #0a0804)"
                  : "linear-gradient(180deg, #111, #000)",
                boxShadow: slotGlowing
                  ? "inset 0 1px 2px rgba(0,0,0,0.6), 0 0 8px rgba(212,168,48,0.3)"
                  : "inset 0 1px 2px rgba(0,0,0,0.8)",
                transition: "all 0.3s ease",
              }}
            />
          </div>
          <span
            className="font-arcade"
            style={{
              fontSize: "4px",
              color: "rgba(212,168,48,0.3)",
              letterSpacing: "0.15em",
            }}
          >
            INSERT COIN
          </span>
        </div>

        {/* Service label */}
        <span
          className="font-arcade"
          style={{
            fontSize: "3px",
            color: "rgba(100,100,120,0.15)",
            letterSpacing: "0.1em",
          }}
        >
          SER. NO. 001
        </span>
      </div>
    </div>
  );
}
