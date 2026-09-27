import { useEffect, useId, useRef, useState } from "react";

type Direction = "up" | "down" | "left" | "right";

export default function Joystick({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  const helpId = useId();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const direction = useRef<Direction | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const actions = useRef({ onBack, onNext });
  actions.current = { onBack, onNext };

  const stopRepeat = () => {
    if (repeat.current !== null) clearInterval(repeat.current);
    repeat.current = null;
  };
  const center = () => {
    stopRepeat();
    origin.current = null;
    direction.current = null;
    setOffset({ x: 0, y: 0 });
  };
  useEffect(() => () => stopRepeat(), []);

  const move = (next: Direction) => {
    if (next === "left") actions.current.onBack?.();
    else if (next === "right") actions.current.onNext?.();
    else {
      const main = document.querySelector(".wish-screen-content > main");
      if (main) main.scrollBy({ top: (next === "up" ? -1 : 1) * Math.max(60, main.clientHeight * 0.22), behavior: "instant" });
    }
  };
  const engage = (next: Direction | null) => {
    if (direction.current === next) return;
    stopRepeat();
    direction.current = next;
    if (next === null) return;
    move(next);
    if (next === "up" || next === "down") {
      repeat.current = setInterval(() => move(next), 160);
    }
  };

  return <div className="joystick-control">
    <div className="joystick" role="group" aria-label="Navigation joystick" aria-describedby={helpId}
      tabIndex={0} data-dragging={origin.current !== null}
      onPointerDown={(event) => {
        if (event.button !== 0 || origin.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
        setOffset({ x: 0, y: 0 });
      }}
      onPointerMove={(event) => {
        if (!origin.current || origin.current.pointer !== event.pointerId) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        setOffset({ x: Math.max(-18, Math.min(18, dx)), y: Math.max(-14, Math.min(14, dy)) });
        const next = Math.max(Math.abs(dx), Math.abs(dy)) < 12 ? null
          : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
        engage(next);
      }}
      onPointerUp={(event) => {
        if (origin.current?.pointer !== event.pointerId) return;
        center();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={center} onLostPointerCapture={center}
      onKeyDown={(event) => {
        const keys: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
        const next = keys[event.key];
        if (!next) return;
        event.preventDefault();
        setOffset({ x: next === "left" ? -18 : next === "right" ? 18 : 0,
          y: next === "up" ? -14 : next === "down" ? 14 : 0 });
        engage(next);
      }} onKeyUp={center} onBlur={center}>
      <span className="joystick-base" aria-hidden="true" />
      <span className="joystick-stick" aria-hidden="true"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x * 0.6}deg)` }}><i /></span>
      <span className="joystick-arrow joystick-up" aria-hidden="true">↑</span>
      <span className="joystick-arrow joystick-down" aria-hidden="true">↓</span>
      <span className="joystick-arrow joystick-left" aria-hidden="true" data-enabled={!!onBack}>←</span>
      <span className="joystick-arrow joystick-right" aria-hidden="true" data-enabled={!!onNext}>→</span>
    </div>
    <span className="deck-action-label">Navigate</span>
    <span id={helpId} className="deck-action-help">Drag the joystick or use arrow keys. Up and down scroll. Left goes back. Right continues when the step is complete.</span>
  </div>;
}
