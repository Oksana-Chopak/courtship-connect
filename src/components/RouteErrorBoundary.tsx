import React from "react";
import { Link } from "@tanstack/react-router";

type Props = { children: React.ReactNode; resetKey: string };
type State = { error: Error | null };

/**
 * Catches render errors from whatever page is in the <Outlet/> and shows a
 * recoverable fallback INSIDE the app shell, so the header + tab bar stay put
 * and the user can navigate away. Navigating to a new route (resetKey changes)
 * clears the error automatically. This means one broken page can never blank
 * out the entire app again.
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface it for debugging without crashing the tree.
    console.error("Page crashed:", error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-4xl">🎾💥</div>
          <div className="font-display text-2xl leading-tight">This page hit a snag</div>
          <div className="text-sm font-semibold" style={{ opacity: 0.65 }}>
            Something went wrong loading this screen. Reload it, or jump back to the board — the rest of the app still works.
          </div>
          <div className="flex gap-2 justify-center pt-1">
            <button type="button" onClick={() => window.location.reload()} className="cbtn cbtn-coral">
              Reload
            </button>
            <Link to="/board" className="cbtn cbtn-ghost">
              Board
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
