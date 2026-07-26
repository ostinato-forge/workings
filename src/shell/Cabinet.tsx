import type { ReactNode } from "react";
import { SHELL_COPY } from "./copy";

export function Cabinet({ children }: { children: ReactNode }) {
  return (
    <div className="cabinet">
      <div className="marquee" aria-hidden="true">
        {SHELL_COPY.marquee}
      </div>
      <div className="bezel">
        <div className="screen">{children}</div>
      </div>
    </div>
  );
}
