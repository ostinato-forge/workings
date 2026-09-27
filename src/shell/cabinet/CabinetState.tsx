import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type CabinetState = {
  coinInserted: boolean;
  power: "standby" | "booting" | "on";
  insertCoin: () => void;
  displayTheme: "dark" | "light";
  toggleDisplayTheme: () => void;
};

const Ctx = createContext<CabinetState | null>(null);

export function CabinetProvider({ children }: { children: ReactNode }) {
  const [coinInserted, setCoinInserted] = useState(false);
  const [power, setPower] = useState<CabinetState["power"]>("standby");
  const powerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (powerTimer.current !== null) clearTimeout(powerTimer.current); }, []);
  const insertCoin = () => {
    if (power !== "standby" || powerTimer.current !== null) return;
    setPower("booting");
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 30 : 900;
    powerTimer.current = setTimeout(() => { setCoinInserted(true); setPower("on"); }, delay);
  };
  const [displayTheme, setDisplayTheme] = useState<"dark" | "light">(() => {
    try { return localStorage.getItem("workings-display-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  const toggleDisplayTheme = () => {
    const next = displayTheme === "dark" ? "light" : "dark";
    setDisplayTheme(next);
    try { localStorage.setItem("workings-display-theme", next); }
    catch { /* The switch still works when browser storage is unavailable. */ }
  };
  return <Ctx.Provider value={{
    coinInserted, insertCoin, power, displayTheme, toggleDisplayTheme,
  }}>{children}</Ctx.Provider>;
}

export function useCabinet(): CabinetState {
  const state = useContext(Ctx);
  if (state === null) throw new Error("useCabinet outside CabinetProvider");
  return state;
}
