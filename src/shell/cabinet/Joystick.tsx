export default function Joystick({ activated = true }: { activated?: boolean }) {
  return (
    <div className="flex flex-col items-center relative">
      <div className="w-[76px] h-[76px] relative flex items-center justify-center">
        <div
          className="w-[70px] h-[70px] rounded-full flex items-center justify-center flex-col"
          style={{
            background:
              "radial-gradient(ellipse at 40% 30%, rgba(60,80,120,0.5), transparent 60%), linear-gradient(180deg, #1e2e48, #141e34)",
            border: "2px solid #2a3a58",
            boxShadow:
              "inset 0 3px 6px rgba(0,0,0,0.6), inset 0 -1px 3px rgba(60,80,120,0.1), 0 3px 10px rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="w-8 h-8 rounded-full relative -top-[5px]"
            style={{
              background:
                "radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.45) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, #2a2a3a 0%, #141420 100%)",
              border: "1px solid #3a3a4a",
              boxShadow:
                "0 3px 8px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.05)",
            }}
          />
          <div
            className="w-2.5 h-7 rounded-[5px]"
            style={{
              background: "linear-gradient(90deg, #2a2a3a, #444458, #2a2a3a)",
              boxShadow:
                "inset 1px 0 2px rgba(255,255,255,0.05), 0 0 4px rgba(0,0,0,0.5)",
              marginTop: "-18px",
            }}
          />
        </div>
        <div className="absolute inset-[-6px] pointer-events-none">
          <span
            className="absolute font-arcade top-[-4px] left-1/2 -translate-x-1/2"
            style={{ fontSize: "5px", color: activated ? "rgba(126,226,168,0.15)" : "rgba(126,226,168,0.05)", transition: "color 1.2s ease" }}
          >
            ▲
          </span>
          <span
            className="absolute font-arcade bottom-[-4px] left-1/2 -translate-x-1/2"
            style={{ fontSize: "5px", color: activated ? "rgba(126,226,168,0.15)" : "rgba(126,226,168,0.05)", transition: "color 1.2s ease" }}
          >
            ▼
          </span>
          <span
            className="absolute font-arcade left-[-10px] top-1/2 -translate-y-1/2"
            style={{ fontSize: "5px", color: activated ? "rgba(126,226,168,0.15)" : "rgba(126,226,168,0.05)", transition: "color 1.2s ease" }}
          >
            ◄
          </span>
          <span
            className="absolute font-arcade right-[-10px] top-1/2 -translate-y-1/2"
            style={{ fontSize: "5px", color: activated ? "rgba(126,226,168,0.15)" : "rgba(126,226,168,0.05)", transition: "color 1.2s ease" }}
          >
            ►
          </span>
        </div>
      </div>
      <span
        className="font-arcade mt-2 tracking-[0.15em]"
        style={{
          fontSize: "7px",
          color: activated ? "rgba(126,226,168,0.45)" : "rgba(126,226,168,0.12)",
          textShadow: activated ? "0 0 6px rgba(126,226,168,0.1)" : "none",
          transition: "color 1.2s ease, text-shadow 1.2s ease",
        }}
      >
        NAVIGATE
      </span>
      <span
        className="font-ui mt-0.5"
        style={{ fontSize: "8px", color: activated ? "rgba(126,226,168,0.2)" : "rgba(126,226,168,0.06)", transition: "color 1.2s ease" }}
      >
        ↑↓←→
      </span>
    </div>
  );
}
