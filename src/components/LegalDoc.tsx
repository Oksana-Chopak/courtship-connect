import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LangToggle, useI18n } from "@/lib/i18n";

/** Shared shell for the public legal pages (/privacy, /terms, /withdraw).
 *  The documents themselves are intentionally English-only (single canonical
 *  version, v1.0) — only the chrome around them is translated. */
export function LegalDoc({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="terry-bg min-h-screen font-body text-[var(--ink)]">
      <div className="max-w-md mx-auto px-5 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="font-extrabold text-sm underline">← Courtship</Link>
          <LangToggle />
        </div>
        <div className="ccard p-6 space-y-4">
          <div>
            <h1 className="font-display text-3xl leading-tight">{title}</h1>
            <p className="text-sm font-bold mt-1" style={{ opacity: 0.6 }}>{updated}</p>
          </div>
          <div className="space-y-3 text-[15px] leading-relaxed font-medium legal-doc">{children}</div>
        </div>
        <p className="text-center text-sm font-bold" style={{ opacity: 0.7 }}>
          <Link to="/privacy" className="underline">{t("legal.footer_privacy")}</Link>
          {" · "}
          <Link to="/terms" className="underline">{t("legal.footer_terms")}</Link>
          {" · hello@court-ship.com"}
        </p>
      </div>
    </div>
  );
}

export function LH({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl pt-3">{children}</h2>;
}

export function LP({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function LUl({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-4" style={{ listStyle: "disc" }}>
      {items.map((it, i) => (<li key={i}>{it}</li>))}
    </ul>
  );
}
