import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { LegalDoc, LP } from "@/components/LegalDoc";

/** Consumer withdrawal function ("ångerknapp") — required for distance
 *  contracts concluded online since 19 June 2026 (distansavtalslagen via
 *  SFS 2026:246): reachable where the contract was made, no login wall,
 *  confirmation on a durable medium (email, best-effort when signed in;
 *  the request itself is always logged server-side). */
export const Route = createFileRoute("/withdraw")({
  ssr: false,
  head: () => ({ meta: [{ title: "Withdraw a purchase — Courtship" }] }),
  component: WithdrawPage,
});

function WithdrawPage() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [purchase, setPurchase] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(false);
    try {
      const { data, error } = await (supabase as any).rpc("submit_withdrawal", {
        _name: name, _email: email, _purchase: purchase, _note: note || null,
      });
      if (error) throw error;
      setSentId(String(data).slice(0, 8));
      // Durable-medium confirmation: best-effort email to the signed-in user.
      try {
        const { data: au } = await supabase.auth.getUser();
        if (au.user) {
          await supabase.functions.invoke("email-notify", {
            body: {
              user_ids: [au.user.id],
              title: "Withdrawal request received",
              body: `We received your withdrawal request (ref ${String(data).slice(0, 8)}) for: ${purchase}. We'll confirm and refund within 14 days.`,
              url: "/terms",
            },
          });
        }
      } catch { /* best-effort */ }
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <LegalDoc title={t("withdraw.title")} updated="Ångerrätt / EU right of withdrawal">
      {sentId ? (
        <div className="space-y-3 text-center py-4">
          <div className="text-4xl">✅</div>
          <h2 className="font-display text-2xl">{t("withdraw.sent_title")}</h2>
          <LP>{t("withdraw.sent_body", { id: sentId })}</LP>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <LP>{t("withdraw.sub")}</LP>
          <div>
            <label className="csection-label block mb-1">{t("withdraw.name")}</label>
            <input className="cinput" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </div>
          <div>
            <label className="csection-label block mb-1">{t("withdraw.email")}</label>
            <input type="email" className="cinput" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
          </div>
          <div>
            <label className="csection-label block mb-1">{t("withdraw.purchase")}</label>
            <input className="cinput" value={purchase} onChange={(e) => setPurchase(e.target.value)} required maxLength={300} />
          </div>
          <div>
            <label className="csection-label block mb-1">{t("withdraw.note")}</label>
            <input className="cinput" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
          {err && <p className="text-sm font-bold" style={{ color: "var(--coral)" }}>{t("withdraw.err")}</p>}
          <button disabled={busy} className="cbtn cbtn-coral w-full">{busy ? "..." : t("withdraw.send")}</button>
        </form>
      )}
    </LegalDoc>
  );
}
