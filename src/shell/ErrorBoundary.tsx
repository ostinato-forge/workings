import { Component, type ReactNode } from "react";

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
        <div role="alert">
          <p>This lesson hit an error and stopped: {this.state.message}</p>
          <p>
            The rest of the app still works. Use the back link to return to
            the lesson list.
          </p>
          <a href="#/">Back to the lesson list</a>
        </div>
      );
    }
    return this.props.children;
  }
}
