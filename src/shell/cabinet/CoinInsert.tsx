import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useCabinet } from "./CabinetState";

export function CoinInsert({ onInsert }: { onInsert: () => void }) {
  const { power } = useCabinet();
  const coin = useRef<HTMLSpanElement>(null);
  const [flight, setFlight] = useState<CSSProperties | null>(null);
  const start = () => {
    if (power !== "standby") return;
    const from = coin.current?.getBoundingClientRect();
    const to = document.querySelector("[data-coin-slot]")?.getBoundingClientRect();
    if (from && to && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFlight({ left: from.x, top: from.y, "--coin-dx": `${to.x + to.width / 2 - from.x - from.width / 2}px`,
        "--coin-dy": `${to.y + to.height / 2 - from.y - from.height / 2}px` } as CSSProperties);
    }
    onInsert();
  };
  return <main className="attract-screen">
    <span className="attract-mark" aria-hidden="true">W</span>
    <h1>Learn by doing.</h1>
    <p>Make a prediction. Run an experiment. See what happens.</p>
    <button type="button" className="insert-coin" aria-label="Insert coin" disabled={power !== "standby"} onClick={start}>
      <span ref={coin} className="coin-symbol" aria-hidden="true" style={{ visibility: power === "booting" ? "hidden" : undefined }}>✦</span><span>Insert coin</span>
    </button>
    <p className="evidence-meta" role="status">{power === "booting" ? "Starting the cabinet…" : "Choose a course to begin. No account needed."}</p>
    {flight && power === "booting" ? createPortal(<span className="coin-symbol coin-flight" style={flight} aria-hidden="true">✦</span>, document.body) : null}
  </main>;
}
