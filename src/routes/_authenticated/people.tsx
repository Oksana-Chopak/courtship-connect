import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "@/components/Avatar";
import {
  fetchMyBuddies, removeBuddy, fetchPendingRequestsTo, respondBuddyRequest,
  type BuddyRow, type BuddyRequest,
} from "@/lib/buddies";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({ meta: [{ title: "People — Courtship" }] }),
  component: PeoplePage,
});

function PeoplePage() {
  const { t } = useI18n();
  const [buddies, setBuddies] = useState<Array<BuddyRow & { other_id: string; name: string; photo_url: string | null; home_city: string | null }>>([]);
  const [buddyReqs, setBuddyReqs] = useState<BuddyRequest[]>([]);
  const [requesterNames, setRequesterNames] = useState<Record<string, string>>({});
  const [referrals, setReferrals] = useState(0);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");

  async function loadBuddies(u: string) {
    const rows = await fetchMyBuddies(u);
    const others = rows.map((b) => (b.user_low === u ? b.user_high : b.user_low));
    if (!others.length) { setBuddies([]); return; }
    const { data } = await (supabase as any).rpc("players_directory", { _ids: others });
    const byId = new Map<string, any>((data as any[] | null)?.map((d) => [d.id, d]) ?? []);
    setBuddies(rows.map((b) => {
      const oid = b.user_low === u ? b.user_high : b.user_low;
      const p = byId.get(oid) ?? {};
      return { ...b, other_id: oid, name: p.name ?? "Player", photo_url: p.photo_url ?? null, home_city: p.home_city ?? null };
    }));
  }

  async function loadBuddyReqs(u: string) {
    const reqs = await fetchPendingRequestsTo(u);
    setBuddyReqs(reqs);
    if (reqs.length) {
      const ids = reqs.map((r) => r.from_id);
      const { data: names } = await (supabase as any).rpc("players_directory", { _ids: ids });
      const m: Record<string, string> = {};
      (names as any[] | null)?.forEach((n) => { m[n.id] = n.name; });
      setRequesterNames(m);
    }
  }

  async function respond(req: BuddyRequest, accept: boolean) {
    try {
      await respondBuddyRequest(req.id, accept);
      setBuddyReqs((p) => p.filter((x) => x.id !== req.id));
      toast.success(accept ? t("buddy.accepted") : t("buddy.declined"));
      if (accept) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) loadBuddies(u.user.id);
      }
    } catch (e: any) { oops(e); }
  }

  async function shareInvite() {
    if (!inviteCode) return;
    const link = `${window.location.origin}/auth?code=${inviteCode}`;
    const msg = t("invite.message").replace("{link}", link).replace("{code}", inviteCode);
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try { await (navigator as any).share({ text: msg }); return; }
      catch (e: any) { if (e?.name === "AbortError") return; }
    }
    let copied = false;
    try { await navigator.clipboard.writeText(msg); copied = true; } catch { /* fall back */ }
    if (!copied && typeof document !== "undefined") {
      try {
        const ta = document.createElement("textarea");
        ta.value = msg; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
    toast.success(copied ? t("invite.copied") : t("invite.share"));
  }

  function copyCode() {
    if (!inviteCode) return;
    navigator.clipboard?.writeText(inviteCode).then(() => toast.success(t("invite.copied"))).catch(() => {});
  }
  async function saveCode() {
    const c = codeDraft.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (c.length < 3) { toast.error(t("invite.too_short")); return; }
    const { data, error } = await (supabase as any).rpc("set_my_invite_code", { _new: c });
    if (error) {
      const m = String(error.message || "");
      toast.error(m.includes("taken") ? t("invite.taken") : m.includes("too_short") ? t("invite.too_short") : t("invite.edit_fail"));
      return;
    }
    if (data) { setInviteCode(data as string); setEditingCode(false); toast.success(t("invite.saved")); }
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      // Buddy lists load on their own; profile + invite code go together.
      loadBuddies(uid);
      loadBuddyReqs(uid);
      const [profRes, codeRes] = await Promise.all([
        (supabase as any).from("profiles").select("referrals_count").eq("id", uid).maybeSingle().then((r: any) => r, () => null),
        (supabase as any).rpc("ensure_my_invite_code").then((r: any) => r, () => null),
      ]);
      setReferrals((profRes as any)?.data?.referrals_count ?? 0);
      const code = (codeRes as any)?.data;
      if (code) setInviteCode(code as string);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <h1 className="font-display text-3xl">{t("people.title")}</h1>

      {buddyReqs.length > 0 && (
        <div className="ccard p-4 space-y-3">
          <div className="font-display text-2xl">{t("buddy.requests_title")}</div>
          {buddyReqs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-t border-[var(--ink)]/15 pt-2">
              <div className="font-extrabold truncate">{requesterNames[r.from_id] ?? "Player"}</div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => respond(r, true)} className="cbtn cbtn-green">{t("buddy.accept")}</button>
                <button onClick={() => respond(r, false)} className="cbtn cbtn-ghost">{t("buddy.decline")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {inviteCode && (
        <div className="ccard p-4 space-y-2">
          <div>
            <div className="font-extrabold text-lg">{t("invite.title")}</div>
            <div className="text-sm text-[var(--ink)]">{t("invite.sub")}</div>
          </div>
          {referrals > 0 && (
            <div className="text-sm font-extrabold" style={{ color: "var(--coral)" }}>🎁 {t("invite.referrals", { n: referrals })}</div>
          )}
          {editingCode ? (
            <div className="flex items-center gap-2">
              <input
                className="cinput flex-1 font-extrabold tracking-widest uppercase"
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                placeholder="YOURCODE"
              />
              <button className="cbtn cbtn-green shrink-0 px-3" onClick={saveCode}>✓</button>
              <button className="cbtn cbtn-ghost shrink-0 px-3" onClick={() => setEditingCode(false)}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <code className="flex-1 font-extrabold tracking-widest text-center py-2 rounded-xl"
                style={{ background: "var(--cream2)" }}>{inviteCode}</code>
              <button className="cbtn cbtn-ghost shrink-0 px-3" onClick={copyCode} aria-label={t("invite.copy")} title={t("invite.copy")}>📋</button>
              <button className="cbtn cbtn-ghost shrink-0 px-3" onClick={() => { setCodeDraft(inviteCode); setEditingCode(true); }} aria-label={t("invite.edit")} title={t("invite.edit")}>✏️</button>
            </div>
          )}
          <button className="cbtn cbtn-coral w-full" onClick={shareInvite}>🔗 {t("invite.cta")}</button>
        </div>
      )}

      <Link to="/players" className="ccard p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔍</span>
          <span className="font-display text-lg">{t("people.browse")}</span>
        </div>
        <span className="text-2xl">›</span>
      </Link>

      <div>
        <div className="csection-label">{t("buddy.my_buddies")}</div>
        {buddies.length === 0 ? (
          <div className="ccard p-4 text-base font-semibold text-[var(--ink)] mt-2">{t("empty.buddies")}</div>
        ) : (
          <div className="ccard p-4 mt-2 space-y-3">
            {buddies.map((b) => (
              <div key={b.id} className="flex items-center gap-3 first:border-t-0 first:pt-0 border-t border-[var(--ink)]/15 pt-3">
                <Avatar src={b.photo_url} name={b.name} seed={b.other_id} size={56} />
                <div className="flex-1 min-w-0">
                  <Link to="/players/$id" params={{ id: b.other_id }} className="font-extrabold underline truncate block">
                    {b.name}
                  </Link>
                  <div className="text-sm text-[var(--ink)]">
                    📍 {b.home_city ?? "—"} · {t(`buddy.source.${b.source}` as any)}
                  </div>
                </div>
                <button
                  className="text-xs underline shrink-0"
                  style={{ opacity: 0.5 }}
                  onClick={async () => {
                    if (typeof window !== "undefined" && !window.confirm(t("buddy.confirm_remove"))) return;
                    try {
                      await removeBuddy(b.other_id);
                      setBuddies((p) => p.filter((x) => x.id !== b.id));
                      toast.success(t("buddy.removed"));
                    } catch (e: any) { oops(e); }
                  }}
                >
                  {t("buddy.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
