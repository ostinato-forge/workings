import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mulberry32 } from "../../engine/random";

type Phase = "idle" | "dropping" | "impact";

const SPARK_COUNT = 12;
const random = mulberry32(20260726);

export function CoinInsert({ onInsert }: { onInsert: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dropOrigin, setDropOrigin] = useState<{ x: number; y: number } | null>(null);
  const coinRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    return () => {
      styleRef.current?.remove();
    };
  }, []);

  const handleClick = useCallback(() => {
    if (phase !== "idle") return;

    const coin = coinRef.current;
    const container = containerRef.current;
    if (!coin || !container) return;

    const coinRect = coin.getBoundingClientRect();

    const slot = document.querySelector<HTMLElement>("[data-coin-slot]");
    const slotRect = slot
      ? slot.getBoundingClientRect()
      : container.getBoundingClientRect();

    const startX = coinRect.left + coinRect.width / 2;
    const startY = coinRect.top + coinRect.height / 2;
    const targetX = slotRect.left + slotRect.width / 2;
    const targetY = slotRect.top + slotRect.height / 2;
    const dx = targetX - startX;
    const dy = targetY - startY;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes coin-drop {
        0% { transform: translate(-50%, -50%) scale(1) rotateY(0deg); opacity: 1; }
        15% { transform: translate(-50%, -50%) scale(1.1) rotateY(0deg); opacity: 1; }
        30% { transform: translate(calc(-50% + ${dx * 0.3}px), calc(-50% + ${dy * 0.1}px)) scale(1) rotateY(90deg); opacity: 1; }
        50% { transform: translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.35}px)) scale(0.85) rotateY(180deg); opacity: 1; }
        70% { transform: translate(calc(-50% + ${dx * 0.8}px), calc(-50% + ${dy * 0.7}px)) scale(0.6) rotateY(270deg); opacity: 1; }
        85% { transform: translate(calc(-50% + ${dx * 0.95}px), calc(-50% + ${dy * 0.9}px)) scale(0.35) rotateY(340deg); opacity: 0.9; }
        100% { transform: translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.1) rotateY(360deg); opacity: 0; }
      }
      @keyframes screen-shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-3px) translateY(1px); }
        40% { transform: translateX(3px) translateY(-1px); }
        60% { transform: translateX(-2px); }
        80% { transform: translateX(1px); }
      }
      @keyframes flash-burst {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
      ${Array.from({ length: SPARK_COUNT }, (_, i) => {
        const angle = ((random() * 180 + 180) * Math.PI) / 180;
        const dist = 30 + random() * 60;
        const sdx = Math.cos(angle) * dist;
        const sdy = Math.sin(angle) * dist;
        const dur = 0.4 + random() * 0.4;
        return `@keyframes spark-fly-${i} {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(${sdx}px, ${sdy}px) scale(0); opacity: 0; }
        }
        .coin-spark-${i} { animation: spark-fly-${i} ${dur}s ease-out forwards; }`;
      }).join("\n")}
    `;
    document.head.appendChild(style);
    styleRef.current = style;

    setDropOrigin({ x: startX, y: startY });
    setPhase("dropping");

    setTimeout(() => {
      setPhase("impact");
    }, 420);

    setTimeout(() => {
      onInsert();
    }, 900);
  }, [phase, onInsert]);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col items-center justify-center px-10 py-9 relative overflow-hidden"
      style={phase === "impact" ? { animation: "screen-shake 0.3s ease-out" } : undefined}
    >
      {/* INSERT COIN text */}
      {phase === "idle" && (
        <div className="text-center mb-6 pointer-events-none">
          <div
            className="font-arcade"
            style={{
              fontSize: "28px",
              color: "#50e0ff",
              letterSpacing: "5px",
              textShadow:
                "0 0 4px rgba(126,226,168,0.4), 0 0 16px rgba(126,226,168,0.15)",
              animation: "coin-pulse 1.2s ease-in-out infinite",
            }}
          >
            INSERT COIN
          </div>
          <div
            className="font-arcade mt-3"
            style={{
              fontSize: "8px",
              color: "rgba(126,226,168,0.25)",
              letterSpacing: "0.2em",
            }}
          >
            CLICK THE COIN TO BEGIN
          </div>
        </div>
      )}

      {/* The floating coin */}
      {phase === "idle" && (
        <button
          ref={coinRef}
          type="button"
          aria-label="Insert coin"
          onClick={handleClick}
          style={{
            position: "relative",
            width: 64,
            height: 64,
            padding: 0,
            border: 0,
            borderRadius: "50%",
            background: "transparent",
            cursor: "grab",
            zIndex: 100,
          }}
        >
          {/* Coin face */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse at 35% 28%, rgba(255,255,255,0.5) 0%, transparent 40%), radial-gradient(ellipse at 50% 50%, #f0c040 0%, #d4a830 30%, #b08820 60%, #906810 80%, #705008 100%)",
              border: "3px solid #c09020",
              boxShadow:
                "inset 0 2px 4px rgba(255,255,200,0.3), inset 0 -3px 6px rgba(100,60,0,0.4), 0 4px 8px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
              animation:
                "coin-float 2.5s ease-in-out infinite, coin-shine 3s ease-in-out infinite",
              filter:
                "drop-shadow(0 0 16px rgba(212,168,48,0.5)) drop-shadow(0 0 40px rgba(212,168,48,0.2))",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 2,
                borderRadius: "50%",
                border: "2px solid rgba(255,220,100,0.2)",
              }}
            />
            <span
              style={{
                fontSize: 28,
                color: "#ffe080",
                textShadow: "0 1px 2px rgba(100,60,0,0.5)",
                filter: "drop-shadow(0 0 4px rgba(255,224,128,0.4))",
              }}
            >
              ★
            </span>
          </div>
        </button>
      )}

      {/* Dropping coin, portaled to body so it escapes overflow:hidden */}
      {phase === "dropping" &&
        dropOrigin &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: dropOrigin.y,
              left: dropOrigin.x,
              width: 64,
              height: 64,
              zIndex: 10000,
              pointerEvents: "none",
              transformStyle: "preserve-3d",
              animation:
                "coin-drop 0.85s cubic-bezier(0.22, 0.61, 0.36, 1) forwards",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background:
                  "radial-gradient(ellipse at 35% 28%, rgba(255,255,255,0.5) 0%, transparent 40%), radial-gradient(ellipse at 50% 50%, #f0c040 0%, #d4a830 30%, #b08820 60%, #906810 80%, #705008 100%)",
                border: "3px solid #c09020",
                boxShadow:
                  "inset 0 2px 4px rgba(255,255,200,0.3), inset 0 -3px 6px rgba(100,60,0,0.4), 0 4px 8px rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 2,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,220,100,0.2)",
                }}
              />
              <span
                style={{
                  fontSize: 28,
                  color: "#ffe080",
                  textShadow: "0 1px 2px rgba(100,60,0,0.5)",
                  filter: "drop-shadow(0 0 4px rgba(255,224,128,0.4))",
                }}
              >
                ★
              </span>
            </div>
          </div>,
          document.body,
        )}

      {/* Credit text */}
      {phase === "idle" && (
        <div
          className="font-arcade mt-8"
          style={{
            fontSize: "8px",
            color: "rgba(212,168,48,0.5)",
            letterSpacing: "0.15em",
          }}
        >
          CREDIT 0
        </div>
      )}

      {/* Gold flash overlay */}
      {phase === "impact" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 50% 90%, rgba(255,220,100,0.4) 0%, transparent 50%)",
            animation: "flash-burst 0.6s ease-out forwards",
            pointerEvents: "none",
            zIndex: 200,
          }}
        />
      )}

      {/* Sparks */}
      {phase === "impact" && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            pointerEvents: "none",
            zIndex: 150,
          }}
        >
          {Array.from({ length: SPARK_COUNT }, (_, i) => (
            <div
              key={i}
              className={`coin-spark-${i}`}
              style={{
                position: "absolute",
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: "#ffe080",
                boxShadow: "0 0 6px rgba(255,220,100,0.8), 0 0 12px rgba(255,200,50,0.4)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
