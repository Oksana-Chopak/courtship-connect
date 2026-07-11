import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { googleCalendarUrl } from "@/lib/calendar";
import { notifyUsers } from "@/lib/push";
import { myInviteLink, shareMessage } from "@/lib/share";
import { countMatchingRescuers, claimSos, formatLabel, whatsappClaimLink, withdrawClaim, applyToGame, withdrawApplication, fetchApplicants, pickApplicant, type SosRow, type ApplicantRow } from "@/lib/sos";
import { whenLabel, levelMeta, vibeEmoji } from "@/lib/courtship";
import { courtTypeMeta } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/sos/$id")({
  head: () => ({ meta: [{ title: "SOS — Courtship" }] }),
  component: SosDetail,
});

type Claimer = { id: string; name: string; photo_url: string | null };

function SosDetail() {
  const { t, lang } = useI18n();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [sos, setSos] = useState<SosRow | null>(null);
  const [courtName, setCourtName] = useState<string>("");
  const [courtCity, setCourtCity] = useState<string>("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [other, setOther] = useState<any>(null);          // the host, shown to a joiner
  const [claimers, setClaimers] = useState<Claimer[]>([]); // joiners, shown to the host
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]); // pending candidates (host, open games)
  const [myApplied, setMyApplied] = useState(false);
  const [gamePlayerBs, setGamePlayerBs] = useState<string[]>([]);
  const [rescuerCount, setRescuerCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const getPhone = useServerFn(getProfilePhone);

  async function load() {
    // SOS row and its games both key off the route id — fetch together. Court
    // needs the SOS row's court_id, so it follows.
    const [sosRes, gamesRes] = await Promise.all([
      (supabase as any).from("sos_requests").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("games").select("player_a,player_b").eq("sos_id", id),
    ]);
    const data = (sosRes as any)?.data;
    setSos(data ?? null);
    // RLS: the host sees all (host = player_a); a joiner sees their own.
    setGamePlayerBs((((gamesRes as any)?.data as any[]) ?? []).map((r) => r.player_b));
    if (data?.court_id) {
      const { data: c } = await (supabase as any).from("courts").select("name,city").eq("id", data.court_id).maybeSingle();
      setCourtName(c?.name ?? "");
      setCourtCity(c?.city ?? "");
    }
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: p } = await supabase.from("profiles" as any).select("name").eq("id", u.user.id).maybeSingle();
        setMe({ id: u.user.id, name: (p as any)?.name ?? "" });
      }
      await load();
    })();

    const ch = (supabase as any)
      .channel(`sos:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sos_requests", filter: `id=eq.${id}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => {
    if (!sos || sos.status !== "active") return;
    let cancelled = false;
    (async () => {
      const n = await countMatchingRescuers(sos.id);
      if (!cancelled) setRescuerCount(n);
    })();
    return () => { cancelled = true; };
  }, [sos?.id, sos?.status]);

  const isCaller = !!(sos && me && sos.caller_id === me.id);

  useEffect(() => {
    if (!sos || !me || isCaller || sos.kind !== "open") { setMyApplied(false); return; }
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("sos_applications").select("id").eq("sos_id", sos.id).eq("applicant_id", me.id).eq("status", "pending").maybeSingle();
        setMyApplied(!!data);
      } catch { setMyApplied(false); }
    })();
  }, [sos?.id, sos?.kind, me?.id, isCaller]);
  const iJoined = !!(me && gamePlayerBs.includes(me.id));

  // Host loads joiner profiles; a joiner loads the host profile.
  useEffect(() => {
    if (!sos || !me) return;
    if (isCaller) {
      if (sos.kind === "open" && sos.status === "active") {
        fetchApplicants(sos.id).then(setApplicants).catch(() => setApplicants([]));
      } else setApplicants([]);
      if (!gamePlayerBs.length) { setClaimers([]); return; }
      (async () => {
        const { data } = await (supabase as any).rpc("players_directory", { _ids: gamePlayerBs });
        setClaimers(((data as any[]) ?? []).map((d) => ({ id: d.id, name: d.name, photo_url: d.photo_url })));
      })();
    } else if (iJoined) {
      (async () => {
        const { data } = await (supabase as any).rpc("players_directory", { _ids: [sos.caller_id] });
        setOther((data as any[])?.[0] ?? null);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sos?.id, me?.id, isCaller, iJoined, gamePlayerBs.join(",")]);

  if (!sos || !me) return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;

  const winEnd = (sos as any).play_until ? new Date((sos as any).play_until as string) : null;
  const when = whenLabel(sos.play_at) + (winEnd ? "–" + winEnd.toLocaleTimeString(lang === "sv" ? "sv-SE" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  const ctMeta = courtTypeMeta(sos.court_type, lang);
  const spotsNeeded = sos.spots_needed ?? 1;
  const spotsFilled = sos.spots_filled ?? 0;
  const remaining = Math.max(0, spotsNeeded - spotsFilled);
  const multi = spotsNeeded > 1;
  const canPlay = new Date(sos.play_at).getTime() > Date.now();
  const calUrl = googleCalendarUrl({
    title: `\u{1F3BE} Tennis · ${courtName || "court"}`,
    startISO: sos.play_at,
    durationMin: sos.duration_min ?? 60,
    location: [courtName, courtCity].filter(Boolean).join(", "),
    details: sos.note || undefined,
  });

  async function messageWa(targetId: string) {
    // Open the tab synchronously inside the click gesture, THEN redirect after the
    // async phone fetch — opening after await is popup-blocked and breaks in iframes.
    const w = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      const { phone } = await getPhone({ data: { targetId } });
      const url = whatsappClaimLink(phone, me!.name, when, courtName || "the court");
      if (w) w.location.href = url;
      else if (typeof window !== "undefined") window.location.href = url;
    } catch (e: any) { if (w) w.close(); oops(e); }
  }

  async function doWithdraw() {
    if (typeof window !== "undefined" && !window.confirm(t("home.cant_make_confirm"))) return;
    setBusy(true);
    const r = await withdrawClaim(sos!.id);
    setBusy(false);
    if (!r.ok) { toast.error(r.reason); return; }
    toast.success(r.re_flared ? t("home.withdrawn_reflared") : t("home.withdrawn"));
    navigate({ to: "/board" });
  }

  // Owner one-tap widen: open the SOS to all levels and re-flare, so the
  // existing notify_on_flare trigger re-blasts the now-wider rescuer audience.
  async function widenLevels() {
    setBusy(true);
    const { error } = await (supabase as any)
      .from("sos_requests")
      .update({ level_min: 1, level_max: 5, flared_at: new Date().toISOString() })
      .eq("id", sos!.id);
    setBusy(false);
    if (error) { oops(error); return; }
    toast.success(t("sos.widen_done"));
    load();
  }

  async function shareSos() {
    const link = await myInviteLink("/sos/" + sos!.id);
    const msg = t(sos!.kind === "open" ? "share.game_msg" : "share.sos_msg", {
      when,
      court: courtName || courtCity || "the court",
      link,
    });
    await shareMessage(msg, t("share.copied"));
  }

  // ENDED
  if (sos.status === "expired" || sos.status === "cancelled") {
    return (
      <div className="space-y-5">
        <Link to="/rescue" className="text-sm font-extrabold underline">← Rescue board</Link>
        <div className="ccard p-6 text-center">
          <div className="text-3xl">⌛</div>
          <div className="font-display text-xl mt-1">{sos.status === "cancelled" ? t("sos.cancelled") : "Expired"}</div>
        </div>
      </div>
    );
  }

  // I JOINED — contact the host (whether or not the group is full yet)
  if (iJoined && !isCaller) {
    return (
      <div className="space-y-5">
        <Link to="/board" className="text-sm font-extrabold underline">← Home</Link>
        <div className="ccard p-5 text-center space-y-3" style={{ background: "var(--green-pop)" }}>
          <div className="text-5xl">🎾</div>
          <h1 className="font-display text-3xl">{t("sos.youre_in")}</h1>
          <div className="font-extrabold">{when} · 📍 {courtCity} · {courtName} · {ctMeta.emoji} {ctMeta.label}</div>
          <div><CourtStatusBadge status={sos.court_status} /></div>
          {multi && (
            <div className="text-base font-semibold text-[var(--ink)]">
              {remaining > 0 ? t("sos.spots_waiting", { n: remaining }) : t("sos.group_full")}
            </div>
          )}
        </div>
        {other && (
          <div className="ccard p-5 space-y-3 text-center">
            <div className="csection-label">{t("sos.your_host")}</div>
            <Avatar src={other.photo_url} name={other.name} seed={other.id} size={120} />
            <div className="font-display text-2xl">{other.name}</div>
            <button className="cbtn cbtn-green w-full" onClick={() => messageWa(other.id)}>{t("sos.message_wa")}</button>
          </div>
        )}
        {canPlay && (
          <a href={calUrl} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost w-full text-center block">{t("cal.add")}</a>
        )}
        {canPlay && (
          <button className="cbtn cbtn-ghost w-full" disabled={busy} onClick={doWithdraw}>{t("home.cant_make_it")}</button>
        )}
      </div>
    );
  }

  // I'M THE HOST
  if (isCaller) {
    const isOpen = sos.kind === "open";
    const full = sos.status === "claimed";
    return (
      <div className="space-y-5">
        <Link to="/board" className="text-sm font-extrabold underline">← Home</Link>
        <div
          className="ccard p-6 text-center space-y-3"
          style={full || isOpen ? { background: "var(--green-pop)" } : { background: "var(--coral)", color: "#FFF6E8" }}
        >
          <div className={full || isOpen ? "text-5xl" : "sos-dot text-5xl"}>{full ? "🎾" : isOpen ? "🎾" : "🚨"}</div>
          <div className="font-display text-3xl">
            {full ? (isOpen ? t("sos.group_set") : t("sos.rescued_title")) : isOpen ? t("sos.on_board") : t("sos.broadcasting", { n: rescuerCount })}
          </div>
          <div className="text-sm opacity-90">{when} · 📍 {courtCity} · {courtName} · {ctMeta.emoji} {ctMeta.label} · {formatLabel(sos.format)}</div>
          {full && !isOpen && <div className="font-extrabold">{t("sos.rescued_sub")}</div>}
          {multi && (
            <div className="font-extrabold">{t("sos.joined_count", { filled: spotsFilled, needed: spotsNeeded })}</div>
          )}
        </div>
        <div><CourtStatusBadge status={sos.court_status} /></div>

        {claimers.length > 0 && (
          <div className="ccard p-4 space-y-3">
            <div className="csection-label">{t("sos.who_joined")}</div>
            {claimers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-t border-[var(--ink)]/15 pt-3 first:border-t-0 first:pt-0">
                <Avatar src={c.photo_url} name={c.name} seed={c.id} size={56} />
                <div className="flex-1 font-extrabold truncate">{c.name}</div>
                <button className="cbtn cbtn-green" onClick={() => messageWa(c.id)}>{t("sos.message_wa")}</button>
              </div>
            ))}
          </div>
        )}

        {isOpen && !full && (
          <div className="ccard p-4 space-y-3">
            <div className="csection-label">🙋 {t("app.candidates")}</div>
            {applicants.length === 0 ? (
              <div className="text-sm font-semibold text-[var(--ink)]/70">{t("app.none_hint")}</div>
            ) : applicants.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-t border-[var(--ink)]/15 pt-3 first:border-t-0 first:pt-0">
                <Avatar src={a.photo_url} name={a.name} seed={a.id} size={52} />
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold truncate">{a.name}</div>
                  <div className="text-xs font-bold" style={{ color: "rgba(43,33,24,0.6)" }}>
                    L{a.level} · {vibeEmoji(a.vibe)}{(a.rescues_count ?? 0) >= 1 ? ` · 🚑 ${a.rescues_count}` : ""}
                  </div>
                  {a.proposed_at && (
                    <div className="text-sm font-extrabold mt-0.5" style={{ color: "var(--coral)" }}>
                      🕐 {t("app.suggests", { time: new Date(a.proposed_at).toLocaleTimeString(lang === "sv" ? "sv-SE" : "en-GB", { hour: "2-digit", minute: "2-digit" }) })}
                    </div>
                  )}
                </div>
                <button className="cbtn cbtn-coral shrink-0" disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await pickApplicant(sos.id, a.id);
                    setBusy(false);
                    if (!r.ok) { toast.error(r.reason); return; }
                    toast.success(t("app.picked_toast", { name: a.name }));
                    await load();
                    fetchApplicants(sos.id).then(setApplicants).catch(() => {});
                  }}>
                  {t("app.pick")}
                </button>
              </div>
            ))}
          </div>
        )}

        {!full && !isOpen && (sos.level_min > 1 || sos.level_max < 5) && (
          <button className="cbtn cbtn-coral w-full" disabled={busy} onClick={widenLevels}>🎯 {t("sos.widen")}</button>
        )}
        {!full && (
          <button className="cbtn cbtn-green w-full" onClick={shareSos}>{t("share.button")}</button>
        )}
        <button
          className="cbtn cbtn-ghost w-full"
          disabled={busy}
          onClick={async () => {
            if (typeof window !== "undefined" && !window.confirm(t("sos.cancel_confirm"))) return;
            setBusy(true);
            const { data, error } = await (supabase as any).rpc("cancel_game", { _sos_id: sos!.id });
            if (error) { setBusy(false); oops(error); return; }
            const ids: string[] = ((data as any[])?.[0]?.claimer_ids) ?? [];
            if (ids.length) {
              await notifyUsers(ids, {
                title: t("cancel.push_title"),
                body: t("cancel.push_body", { name: me!.name, when, court: courtName || "the court" }),
                url: "/board",
                tag: `cancel-${sos!.id}`,
              });
            }
            setBusy(false);
            toast.success(t("sos.cancelled"));
            navigate({ to: "/board" });
          }}
        >
          {t("sos.cancel")}
        </button>
        {canPlay && (
          <a href={calUrl} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost w-full text-center block">{t("cal.add")}</a>
        )}
        <style>{`
          .sos-dot { animation: dotPulse 1.2s infinite; }
          @keyframes dotPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        `}</style>
      </div>
    );
  }

  // FULL but I'm a third party
  if (sos.status === "claimed") {
    return (
      <div className="space-y-5">
        <Link to="/rescue" className="text-sm font-extrabold underline">← Rescue board</Link>
        <div className="ccard p-6 text-center space-y-2">
          <div className="text-5xl">💔</div>
          <div className="font-display text-2xl">{t("sos.taken_title")}</div>
          <div className="text-[var(--ink)] font-semibold">{t("sos.taken_sub")}</div>
        </div>
      </div>
    );
  }

  // ACTIVE — eligible rescuer/joiner (not host, hasn't joined)
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  return (
    <div className="space-y-5">
      <Link to="/rescue" className="text-sm font-extrabold underline">← Rescue board</Link>
      <div className="ccard p-5 space-y-3">
        <div className="font-display text-3xl">{when}</div>
        <div className="font-extrabold">📍 {courtCity} · {courtName} · {ctMeta.emoji} {ctMeta.label} · {formatLabel(sos.format)}</div>
        <div><CourtStatusBadge status={sos.court_status} /></div>
        {multi && <div className="font-extrabold text-[var(--coral)]">{t("sos.spots_left", { n: remaining })}</div>}
        <div className="text-sm">
          Level <span className="font-extrabold" style={{ color: lmMin.color }}>{sos.level_min}</span>
          –<span className="font-extrabold" style={{ color: lmMax.color }}>{sos.level_max}</span>
        </div>
        {sos.note && <div className="text-[var(--ink)] italic">"{sos.note}"</div>}
      </div>
      {sos.kind === "open" ? (
        myApplied ? (
          <div className="ccard p-4 text-center space-y-2" style={{ background: "var(--green-pop)" }}>
            <div className="font-display text-xl">🙋 {t("app.you_applied_title")}</div>
            <div className="text-sm font-semibold">{t("app.you_applied_sub")}</div>
            <button className="cbtn cbtn-ghost w-full" disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await withdrawApplication(sos.id);
                setBusy(false);
                if (ok) { setMyApplied(false); toast.success(t("app.withdrawn")); }
              }}>
              {t("app.withdraw")}
            </button>
          </div>
        ) : (
          <button className="cbtn cbtn-coral w-full" disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await applyToGame(sos.id);
              setBusy(false);
              if (!r.ok) {
                if (r.reason === "taken") toast.error(t("sos.taken_toast"));
                else if (r.reason === "expired") toast.error(t("sos.err_expired"));
                else if (r.reason === "already_applied") { setMyApplied(true); toast.message(t("app.already")); }
                else if (r.reason === "already_in") toast.error(t("sos.already_in"));
                else toast.error(r.reason);
                await load();
                return;
              }
              if (r.fallbackClaimed) { toast.success(t("claim.in")); await load(); return; }
              setMyApplied(true);
              toast.success(t("app.sent"));
            }}>
            🙋 {t("app.im_interested")}
          </button>
        )
      ) : (
      <button
        className="cbtn cbtn-coral w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await claimSos(sos.id);
          setBusy(false);
          if (!r.ok) {
            if (r.reason === "taken") toast.error(t("sos.taken_toast"));
            else if (r.reason === "expired") toast.error(t("sos.err_expired"));
            else if (r.reason === "own_sos") toast.error(t("sos.err_own"));
            else if (r.reason === "already_in") toast.error(t("sos.already_in"));
            else toast.error(r.reason);
            await load();
            return;
          }
          toast.success(t("claim.in"));
          await load();
        }}
      >
        {multi ? t("sos.join_spots", { n: remaining }) : t("sos.im_in")}
      </button>
      )}
    </div>
  );
}
