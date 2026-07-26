import { Component, type ReactNode } from "react";
import { SHELL_COPY } from "./copy";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.message !== null) {
      return (
        <div role="alert" className="panel">
          <p>
            {SHELL_COPY.errorLead} {this.state.message}
          </p>
          <p>{SHELL_COPY.errorRecovery}</p>
          <a href="#/">{SHELL_COPY.errorBack}</a>
        </div>
      );
    }
    return this.props.children;
  }
}
