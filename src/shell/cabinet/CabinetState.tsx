import { createContext, useContext, useState, type ReactNode } from "react";

export type CabinetState = {
  coinInserted: boolean;
  insertCoin: () => void;
};

const Ctx = createContext<CabinetState | null>(null);

export function CabinetProvider({ children }: { children: ReactNode }) {
  const [coinInserted, setCoinInserted] = useState(false);
  return (
    <Ctx.Provider
      value={{ coinInserted, insertCoin: () => setCoinInserted(true) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCabinet(): CabinetState {
  const state = useContext(Ctx);
  if (state === null) throw new Error("useCabinet outside CabinetProvider");
  return state;
}
