import type { ReactNode } from "react";

// Native <details> section — tucks secondary content away so a screen stays to
// 1–2 primary things. No JS, no deps.
export function Collapsible({ title, defaultOpen = false, children }: { title: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="ccard p-0 overflow-hidden" open={defaultOpen}>
      <summary className="px-4 py-3 font-display text-xl cursor-pointer select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="opacity-40 text-base">▾</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
