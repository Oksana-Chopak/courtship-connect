import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileWizard, emptyProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { toast } from "sonner";
import { LangToggle, useI18n } from "@/lib/i18n";
import { RescuerBadge } from "@/components/RescuerBadge";
import { CommunityStatsWidget } from "@/components/CommunityStats";
import { GamesHistory } from "@/components/GamesHistory";
import {
  fetchMyBuddies, removeBuddy, fetchPendingRequestsTo, respondBuddyRequest,
  type BuddyRow, type BuddyRequest,
} from "@/lib/buddies";
import { Avatar } from "@/components/Avatar";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Edit profile — Courtship" }] }),
  component: MePage,
});

function MePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [initial, setInitial] = useState<ProfileFormValues | null>(null);
  const [rescues, setRescues] = useState(0);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [buddies, setBuddies] = useState<Array<BuddyRow & { other_id: string; name: string; photo_url: string | null; home_city: string | null }>>([]);
  const [buddyReqs, setBuddyReqs] = useState<BuddyRequest[]>([]);
  const [requesterNames, setRequesterNames] = useState<Record<string, string>>({});
  const [confirmSignout, setConfirmSignout] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  async function loadBuddies(u: string) {
    const rows = await fetchMyBuddies(u);
    const others = rows.map((b) => (b.user_low === u ? b.user_high : b.user_low));
    if (!others.length) { setBuddies([]); return; }
    const { data } = await (supabase as any)
      .from("profiles_public")
      .select("id,name,photo_url,home_city")
      .in("id", others);
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
      const { data: names } = await (supabase as any)
        .from("profiles_public").select("id,name").in("id", ids);
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
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
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

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUid(u.user.id);
      const { data } = await supabase
        .from("profiles" as any)
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      if (!data) {
        navigate({ to: "/onboarding" });
        return;
      }
      const d = data as any;
      setIsAdmin(!!d.is_admin);
      setRescues(d.rescues_count ?? 0);
      setInitial({
        name: d.name ?? "",
        phone_e164: d.phone_e164 ?? "",
        photo_url: d.photo_url ?? "",
        level: d.level ?? 3,
        formats: d.formats ?? [],
        play_times: d.play_times ?? [],
        vibe: d.vibe ?? "friendly",
        looking_for: d.looking_for ?? "both",
        home_courts: d.home_courts ?? "",
        home_city: d.home_city ?? "Uppsala",
        home_cities: d.home_cities ?? [d.home_city ?? "Uppsala"],
        buddy_optin: d.buddy_optin ?? "sometimes",
        buddy_radius_km: d.buddy_radius_km ?? 10,
        buddy_sos_optin: d.buddy_sos_optin ?? true,
      });
      loadBuddies(u.user.id);
      loadBuddyReqs(u.user.id);
      try {
        const { data: code } = await (supabase as any).rpc("ensure_my_invite_code");
        if (code) setInviteCode(code as string);
      } catch { /* invite RPC not deployed yet — block stays hidden */ }
    })();
  }, [navigate]);

  if (!initial || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">{t("me.title")}</h1>
          <p className="text-[var(--ink)] font-semibold">{t("me.sub")}</p>
        </div>
        <LangToggle className="shrink-0" />
      </div>

      {rescues >= 1 && <RescuerBadge count={rescues} size="lg" progress />}

      <CommunityStatsWidget city={initial.home_city} />
      <GamesHistory />

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
          <div className="flex items-center gap-2">
            <code className="flex-1 font-extrabold tracking-widest text-center py-2 rounded-xl"
              style={{ background: "var(--cream2)" }}>{inviteCode}</code>
            <button className="cbtn cbtn-coral shrink-0" onClick={shareInvite}>{t("invite.share")}</button>
          </div>
        </div>
      )}

      <div className="ccard p-4 space-y-3">
        <div className="font-display text-2xl">{t("buddy.my_buddies")}</div>
        {buddies.length === 0 ? (
          <div className="text-base font-semibold text-[var(--ink)]">{t("empty.buddies")}</div>
        ) : (
          buddies.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-t border-[var(--ink)]/15 pt-3">
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
                className="cbtn cbtn-ghost"
                onClick={async () => {
                  if (typeof window !== "undefined" && !window.confirm(t("buddy.confirm_remove"))) return;
                  try {
                    await removeBuddy(b.other_id);
                    setBuddies((p) => p.filter((x) => x.id !== b.id));
                    toast.success(t("buddy.removed"));
                  } catch (e: any) { toast.error(e?.message ?? "Error"); }
                }}
              >
                {t("buddy.remove")}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="ccard p-5">
        <ProfileWizard
          initial={initial ?? emptyProfile}
          userId={uid}
          submitLabel={t("me.save")}
          savedState
          savedLabel={t("me.saved")}
          busy={busy}
          onSubmit={async (v: ProfileFormValues) => {
            setBusy(true);
            const { home_cities, ...rest } = v;
            const { error } = await supabase
              .from("profiles" as any)
              .update(rest)
              .eq("id", uid);
            if (!error) {
              await supabase.from("profiles" as any).update({ home_cities }).eq("id", uid);
            }
            setBusy(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            setInitial(v);
            toast.success(t("me.updated"));
          }}
        />
      </div>

      {isAdmin && (
        <Link to="/admin" className="ccard p-4 flex items-center justify-between">
          <div>
            <div className="font-display text-xl">{t("admin.title")}</div>
            <div className="text-base text-[var(--ink)] font-semibold">{t("admin.tag")}</div>
          </div>
          <div className="text-2xl">🛠️</div>
        </Link>
      )}

      <button
        type="button"
        onClick={() => setConfirmSignout(true)}
        className="cbtn cbtn-ghost w-full"
      >
        {t("auth.signout")}
      </button>

      {confirmSignout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.5)" }} onClick={() => setConfirmSignout(false)}>
          <div className="ccard p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} style={{ background: "var(--cream2)" }}>
            <div className="font-display text-2xl">{t("auth.signout_confirm_title")}</div>
            <div className="text-base font-semibold text-[var(--ink)]">{t("auth.signout_confirm_body")}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSignout(false)} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  toast.success(t("auth.signed_out"));
                  window.location.href = "/";
                }}
                className="cbtn cbtn-coral flex-1"
              >
                {t("auth.signout")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}