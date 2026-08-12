import React from "react";
import { Link } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";

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
          <div className="font-display text-2xl leading-tight">{tStatic("err.snag_title")}</div>
          <div className="text-sm font-semibold" style={{ opacity: 0.65 }}>
            {tStatic("err.snag_sub")}
          </div>
          {/* Raw error text parks behind ⚙️ like oops() does — never a wall of
              stack on screen (2026-08-12 audit P1-15). */}
          <details className="text-left" style={{ fontSize: 11, opacity: 0.55 }}>
            <summary className="cursor-pointer font-bold text-center">{tStatic("err.detail")}</summary>
            <div className="font-mono break-all mt-1">
              {String(this.state.error?.message ?? this.state.error).slice(0, 200)}
            </div>
          </details>
          <div className="flex gap-2 justify-center pt-1">
            <button type="button" onClick={() => window.location.reload()} className="cbtn cbtn-coral">
              {tStatic("err.reload")}
            </button>
            <Link to="/board" className="cbtn cbtn-ghost">
              {tStatic("err.board")}
            </Link>
          </div>
          <Link to="/help" className="block text-sm font-extrabold underline" style={{ opacity: 0.75 }}>
            {tStatic("err.support")}
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
