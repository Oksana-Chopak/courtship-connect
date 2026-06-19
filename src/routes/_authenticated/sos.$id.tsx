import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { countMatchingRescuers, claimSos, formatLabel, whatsappClaimLink, withdrawClaim, type SosRow } from "@/lib/sos";
import { whenLabel, levelMeta } from "@/lib/courtship";
import { courtTypeMeta } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { Avatar } from "@/components/Avatar";
import { toast } from "sonner";
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
  const [gamePlayerBs, setGamePlayerBs] = useState<string[]>([]);
  const [rescuerCount, setRescuerCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const getPhone = useServerFn(getProfilePhone);

  async function load() {
    const { data } = await (supabase as any).from("sos_requests").select("*").eq("id", id).maybeSingle();
    setSos(data ?? null);
    if (data?.court_id) {
      const { data: c } = await (supabase as any).from("courts").select("name,city").eq("id", data.court_id).maybeSingle();
      setCourtName(c?.name ?? "");
      setCourtCity(c?.city ?? "");
    }
    // Games for this SOS. RLS: the host sees all (host = player_a); a joiner sees their own.
    const { data: g } = await (supabase as any).from("games").select("player_a,player_b").eq("sos_id", id);
    setGamePlayerBs(((g as any[]) ?? []).map((r) => r.player_b));
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
  const iJoined = !!(me && gamePlayerBs.includes(me.id));

  // Host loads joiner profiles; a joiner loads the host profile.
  useEffect(() => {
    if (!sos || !me) return;
    if (isCaller) {
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

  if (!sos || !me) return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;

  const when = whenLabel(sos.play_at);
  const ctMeta = courtTypeMeta(sos.court_type, lang);
  const spotsNeeded = sos.spots_needed ?? 1;
  const spotsFilled = sos.spots_filled ?? 0;
  const remaining = Math.max(0, spotsNeeded - spotsFilled);
  const multi = spotsNeeded > 1;
  const canPlay = new Date(sos.play_at).getTime() > Date.now();

  async function messageWa(targetId: string) {
    try {
      const { phone } = await getPhone({ data: { targetId } });
      window.open(whatsappClaimLink(phone, me!.name, when, courtName || "the court"), "_blank");
    } catch (e: any) { oops(e); }
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

        {!full && (
          <button
            className="cbtn cbtn-ghost w-full"
            disabled={busy}
            onClick={async () => {
              if (typeof window !== "undefined" && !window.confirm(t("sos.cancel_confirm"))) return;
              setBusy(true);
              const { error } = await (supabase as any).rpc("cancel_sos", { _sos_id: sos.id });
              setBusy(false);
              if (error) oops(error);
              else { toast.success(t("sos.cancelled")); navigate({ to: "/board" }); }
            }}
          >
            {t("sos.cancel")}
          </button>
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
      <button
        className="cbtn cbtn-coral w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await claimSos(sos.id);
          setBusy(false);
          if (!r.ok) {
            if (r.reason === "taken") toast.error(t("sos.taken_toast"));
            else if (r.reason === "expired") toast.error("Too late — SOS expired ⌛");
            else if (r.reason === "own_sos") toast.error("Can't rescue yourself 🙃");
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
    </div>
  );
}
