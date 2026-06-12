import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { countMatchingRescuers, claimSos, formatLabel, whatsappClaimLink, withdrawClaim, type SosRow } from "@/lib/sos";
import { whenLabel, levelMeta } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { Avatar } from "@/components/Avatar";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/sos/$id")({
  head: () => ({ meta: [{ title: "SOS — Courtship" }] }),
  component: SosDetail,
});

function SosDetail() {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [sos, setSos] = useState<SosRow | null>(null);
  const [courtName, setCourtName] = useState<string>("");
  const [courtCity, setCourtCity] = useState<string>("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [other, setOther] = useState<any>(null);
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sos_requests", filter: `id=eq.${id}` }, () => {
        load();
      })
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

  // Load opposite player profile when claimed
  useEffect(() => {
    if (!sos || sos.status !== "claimed" || !me) return;
    const otherId = sos.caller_id === me.id ? sos.claimed_by : sos.caller_id;
    if (!otherId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles_public" as any)
        .select("id,name,photo_url,level,vibe")
        .eq("id", otherId)
        .maybeSingle();
      setOther(data);
    })();
  }, [sos?.status, sos?.caller_id, sos?.claimed_by, me?.id]);

  if (!sos || !me) return <div className="text-center py-12 text-[var(--ink)]">Loading...</div>;

  const isCaller = sos.caller_id === me.id;
  const isClaimant = sos.claimed_by === me.id;
  const when = whenLabel(sos.play_at);

  // CLAIMED match screen for both parties
  if (sos.status === "claimed" && (isCaller || isClaimant)) {
    return (
      <div className="space-y-5">
        <Link to="/home" className="text-sm font-extrabold underline">← Home</Link>
        <div className="ccard p-5 text-center space-y-3" style={{ background: "var(--green-pop)" }}>
          <div className="text-5xl">🎾</div>
          <h1 className="font-display text-3xl">{t("sos.matched")}</h1>
          <div className="font-extrabold">{when} · 📍 {courtCity} · {courtName}</div>
          <div><CourtStatusBadge status={sos.court_status} /></div>
        </div>
        {other && (
          <div className="ccard p-5 space-y-3 text-center">
            <Avatar src={other.photo_url} name={other.name} seed={other.id} size={120} />
            <div className="font-display text-2xl">{other.name}</div>
            <button
              className="cbtn cbtn-green w-full"
              onClick={async () => {
                try {
                  const { phone } = await getPhone({ data: { targetId: other.id } });
                  window.open(whatsappClaimLink(phone, me.name, when, courtName || "the court"), "_blank");
                } catch (e: any) { toast.error(e?.message ?? "Couldn't open WhatsApp"); }
              }}
            >
              {t("sos.message_wa")}
            </button>
          </div>
        )}
        {isClaimant && new Date(sos.play_at).getTime() > Date.now() && (
          <button
            className="cbtn cbtn-ghost w-full"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(t("home.cant_make_confirm"))) return;
              setBusy(true);
              const r = await withdrawClaim(sos.id);
              setBusy(false);
              if (!r.ok) { toast.error(r.reason); return; }
              toast.success(r.re_flared ? t("home.withdrawn_reflared") : t("home.withdrawn"));
              navigate({ to: "/home" });
            }}
          >
            {t("home.cant_make_it")}
          </button>
        )}
      </div>
    );
  }

  // CLAIMED but viewed by a third party
  if (sos.status === "claimed") {
    return (
      <div className="space-y-5">
        <Link to="/rescue" className="text-sm font-extrabold underline">← Rescue board</Link>
        <div className="ccard p-6 text-center space-y-2">
          <div className="text-5xl">💔</div>
          <div className="font-display text-2xl">This one's taken</div>
          <div className="text-[var(--ink)] font-semibold">
            Stay ready — heroes are always needed.
          </div>
        </div>
      </div>
    );
  }

  if (sos.status === "expired" || sos.status === "cancelled") {
    return (
      <div className="space-y-5">
        <Link to="/rescue" className="text-sm font-extrabold underline">← Rescue board</Link>
        <div className="ccard p-6 text-center">
          <div className="text-3xl">⌛</div>
          <div className="font-display text-xl mt-1">SOS {sos.status}</div>
        </div>
      </div>
    );
  }

  // ACTIVE — caller view
  if (isCaller) {
    return (
      <div className="space-y-5">
        <Link to="/home" className="text-sm font-extrabold underline">← Home</Link>
        <div className="ccard p-6 text-center space-y-3" style={{ background: "var(--coral)", color: "#FFF6E8" }}>
          <div className="sos-dot text-5xl">🚨</div>
          <div className="font-display text-3xl">{t("sos.broadcasting", { n: rescuerCount })}</div>
          <div className="text-sm opacity-90">{when} · 📍 {courtCity} · {courtName} · {formatLabel(sos.format)}</div>
        </div>
        <div><CourtStatusBadge status={sos.court_status} /></div>
        <button
          className="cbtn cbtn-ghost w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await (supabase as any)
              .from("sos_requests").update({ status: "cancelled" }).eq("id", sos.id);
            setBusy(false);
            if (error) toast.error(error.message);
            else { toast.success("Cancelled"); navigate({ to: "/home" }); }
          }}
        >
          {t("sos.cancel")}
        </button>
        <style>{`
          .sos-dot { animation: dotPulse 1.2s infinite; }
          @keyframes dotPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        `}</style>
      </div>
    );
  }

  // ACTIVE — rescuer view
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  return (
    <div className="space-y-5">
      <Link to="/rescue" className="text-sm font-extrabold underline">← Rescue board</Link>
      <div className="ccard p-5 space-y-3">
        <div className="font-display text-3xl">{when}</div>
        <div className="font-extrabold">📍 {courtCity} · {courtName} · {formatLabel(sos.format)}</div>
        <div><CourtStatusBadge status={sos.court_status} /></div>
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
            if (r.reason === "taken") toast.error("This one's taken 💔");
            else if (r.reason === "expired") toast.error("Too late — SOS expired ⌛");
            else if (r.reason === "own_sos") toast.error("Can't rescue yourself 🙃");
            else toast.error(r.reason);
            await load();
            return;
          }
          toast.success("You're a hero 🚑");
          await load();
        }}
      >
        {t("sos.im_in")}
      </button>
    </div>
  );
}