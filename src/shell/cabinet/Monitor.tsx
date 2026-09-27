import type { ReactNode } from "react";

export function Monitor({ children }: { children: ReactNode }) {
  return <div className="wish-monitor-frame">
    <div className="wish-crt-bezel">
      <div className="wish-screen-content">{children}</div>
    </div>
  </div>;
}
