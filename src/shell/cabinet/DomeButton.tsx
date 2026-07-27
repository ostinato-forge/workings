interface DomeButtonProps {
  color: "green" | "red" | "cyan" | "amber";
  size?: "normal" | "large";
  active?: boolean;
  label: string;
  sublabel?: string;
  onClick?: () => void;
}

const COLOR_STYLES = {
  green: {
    base: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.45) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, #33dd44 0%, #1a9928 55%, #0a6a14 100%)",
    shadow: "0 5px 0 #063a06, 0 8px 16px rgba(0,0,0,0.5), 0 0 24px rgba(51,221,68,0.4)",
    dimBase: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.15) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, #1a5520 0%, #0a3310 55%, #042208 100%)",
    dimShadow: "0 5px 0 #021a02, 0 8px 16px rgba(0,0,0,0.5), 0 0 6px rgba(51,221,68,0.1)",
    labelColor: "rgba(51,221,68,0.6)",
    dimLabelColor: "rgba(51,221,68,0.2)",
    animation: "start-breathe 2s ease-in-out infinite",
  },
  red: {
    base: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #ff3355 0%, #c01030 60%, #800020 100%)",
    shadow: "0 4px 0 #400010, 0 6px 12px rgba(0,0,0,0.5), 0 0 18px rgba(255,51,85,0.3)",
    dimBase: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #551522 0%, #401020 60%, #280010 100%)",
    dimShadow: "0 4px 0 #200008, 0 6px 12px rgba(0,0,0,0.5), 0 0 6px rgba(255,51,85,0.08)",
    labelColor: "rgba(255,51,85,0.5)",
    dimLabelColor: "rgba(255,51,85,0.2)",
    animation: "stop-pulse 1.5s ease-in-out infinite",
  },
  cyan: {
    base: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.45) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, #7ee2a8 0%, #0088aa 55%, #005577 100%)",
    shadow: "0 5px 0 #003344, 0 8px 16px rgba(0,0,0,0.5), 0 0 24px rgba(126,226,168,0.4)",
    dimBase: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.15) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, #0a4455 0%, #062a33 55%, #041a22 100%)",
    dimShadow: "0 5px 0 #011a22, 0 8px 16px rgba(0,0,0,0.5), 0 0 6px rgba(126,226,168,0.1)",
    labelColor: "rgba(126,226,168,0.6)",
    dimLabelColor: "rgba(126,226,168,0.2)",
    animation: "none",
  },
  amber: {
    base: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.45) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, #d4a830 0%, #aa8020 55%, #886010 100%)",
    shadow: "0 5px 0 #443008, 0 8px 16px rgba(0,0,0,0.5), 0 0 24px rgba(212,168,48,0.4)",
    dimBase: "radial-gradient(ellipse at 32% 22%, rgba(255,255,255,0.15) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, #554420 0%, #332a10 55%, #221a08 100%)",
    dimShadow: "0 5px 0 #221a04, 0 8px 16px rgba(0,0,0,0.5), 0 0 6px rgba(212,168,48,0.1)",
    labelColor: "rgba(212,168,48,0.6)",
    dimLabelColor: "rgba(212,168,48,0.2)",
    animation: "none",
  },
} as const;

export default function DomeButton({
  color,
  size = "normal",
  active = true,
  label,
  sublabel,
  onClick,
}: DomeButtonProps) {
  const s = COLOR_STYLES[color];
  const dim = size === "large" ? "w-[72px] h-[72px]" : "w-[46px] h-[46px]";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        className={`${dim} rounded-full border-none cursor-pointer relative transition-transform duration-100 active:translate-y-[3px]`}
        style={{
          background: active ? s.base : s.dimBase,
          boxShadow: active ? s.shadow : s.dimShadow,
          animation: active ? s.animation : "none",
          opacity: active ? 1 : 0.6,
        }}
        onClick={active ? onClick : undefined}
        disabled={!active}
        aria-label={label}
      />
      <span
        className="font-arcade tracking-widest uppercase"
        style={{
          fontSize: size === "large" ? "8px" : "6px",
          color: active ? s.labelColor : s.dimLabelColor,
          textShadow: active
            ? `0 0 8px ${s.dimLabelColor}`
            : "none",
        }}
      >
        {label}
      </span>
      {sublabel && (
        <span
          className="font-ui -mt-1"
          style={{
            fontSize: "8px",
            color: active ? s.dimLabelColor : "rgba(100,100,120,0.3)",
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}
