import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { LEVELS, PLAY_TIMES, levelMeta, vibeEmoji, whatsappLink } from "@/lib/courtship";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/players/$id")({
  head: () => ({ meta: [{ title: "Player — Courtship" }] }),
  component: PlayerDetail,
});

function PlayerDetail() {
  const { id } = Route.useParams();
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const getPhone = useServerFn(getProfilePhone);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles_public" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      setP(data);
    })();
  }, [id]);

  if (!p) return <div className="text-center py-12 text-[var(--ink)]/60">Loading...</div>;

  const lm = levelMeta(p.level);

  async function openWhatsapp() {
    setBusy(true);
    try {
      const { phone, name } = await getPhone({ data: { targetId: id } });
      window.open(whatsappLink(phone, name), "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't open WhatsApp");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/players" className="text-sm font-extrabold underline">
        ← Back to players
      </Link>

      <div className="ccard p-5 space-y-4">
        <div className="aspect-square w-40 mx-auto rounded-2xl overflow-hidden border-2 border-[var(--ink)] bg-[var(--cream)] flex items-center justify-center">
          {p.photo_url ? (
            <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <div className="font-display text-6xl text-[var(--wood)]">{p.name.charAt(0).toUpperCase()}</div>
          )}
        </div>

        <div className="text-center">
          <h1 className="font-display text-3xl">{p.name}</h1>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="w-3 h-3 rounded-full" style={{ background: lm.color }} />
            <span className="font-extrabold">{lm.name}</span>
            <span>· {vibeEmoji(p.vibe)}</span>
          </div>
        </div>

        <button
          disabled={busy}
          onClick={openWhatsapp}
          className="cbtn cbtn-green w-full"
        >
          Message on WhatsApp 👋
        </button>

        <Row label="Formats">{p.formats?.join(" · ") || "—"}</Row>
        <Row label="When">{p.play_times?.join(" · ") || "—"}</Row>
        <Row label="Looking for">{p.looking_for}</Row>
        <Row label="Home courts">{p.home_courts || "—"}</Row>
        <Row label="Buddy">{p.buddy_optin === "yes" ? `Yes — rescues within ${p.buddy_radius_km} km` : p.buddy_optin}</Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-[var(--ink)]/15 pt-2">
      <span className="csection-label">{label}</span>
      <span className="font-semibold text-right">{children}</span>
    </div>
  );
}