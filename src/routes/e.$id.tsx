import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { rememberNext } from "@/lib/share";
import { BallHeart, RF, RailShell, TimeRail, clampLines } from "@/components/RailKit";
import { cityTimeZone } from "@/lib/courtship";
import type { EventRow } from "@/lib/events";

const SITE = "https://court-ship.com";

/** Public event page — where every shared event link lands (2026-10 funnel
 *  audit: the old share pointed at /events, a route that does not exist → 404
 *  for members and for newcomers after signup). Anyone can read it: the
 *  events_public_peek policy exposes approved, upcoming events to anon. Signup
 *  is asked only at the moment of intent ("I'm in"), and the intent is carried
 *  through signup exactly like a guest game join (/board?join_event=<id>). */
export const Route = createFileRoute("/e/$id")({
  loader: async ({ params }) => {
    try {
      const { data } = await (supabase as any)
        .from("event_requests")
        .select("*")
        .eq("id", params.id)
        .eq("status", "approved")
        .maybeSingle();
      return { event: (data ?? null) as EventRow | null };
    } catch {
      return { event: null as EventRow | null };
    }
  },
  head: ({ loaderData, params }) => {
    const e = loaderData?.event;
    const url = `${SITE}/e/${params.id}`;
    const img = `${SITE}/og-game.png`;
    const base = [
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: img },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: img },
    ];
    if (!e) {
      const title = "A tennis event — Courtship 🎾";
      return { meta: [{ title }, { property: "og:title", content: title }, { name: "description", content: "Open play, socials and tournaments near you. Tap to see what's on." }, ...base] };
    }
    // Server-side for crawlers (UTC runtime) — pin the event's own zone.
    const tz = cityTimeZone(e.city);
    const d = new Date(e.starts_at);
    const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const title = `🎉 ${e.title} — ${day} ${time} — Courtship`;
    const spots = e.capacity != null ? `${Math.max(0, e.capacity - e.spots_taken)} spots left · ` : "";
    const desc = `${e.location}${e.city ? `, ${e.city}` : ""} · ${spots}${e.price_sek ? `${e.price_sek} kr` : "Free"}. Tap to join.`;
    return { meta: [{ title }, { name: "description", content: desc }, { property: "og:title", content: title }, { property: "og:description", content: desc }, ...base] };
  },
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" && s.code ? s.code : undefined,
  }),
  component: PublicEventPage,
});

function PublicEventPage() {
  const { t, lang } = useI18n();
  const { id } = Route.useParams();
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const { event } = Route.useLoaderData();

  useEffect(() => {
    void (async () => {
      // signed in → the board finishes the join and shows the event in context
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) navigate({ to: "/board", search: { join_event: id } as any, replace: true });
    })();
  }, [id]);

  function joinNow() {
    const next = `/board?join_event=${id}`;
    rememberNext(next);
    const params = new URLSearchParams();
    if (code) params.set("code", code);
    params.set("mode", "signup");
    params.set("next", next);
    navigate({ to: "/auth", search: Object.fromEntries(params.entries()) as any });
  }

  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const upcoming = !!event && new Date(event.starts_at).getTime() > Date.now();
  const spotsLeft = event?.capacity != null ? Math.max(0, event.capacity - event.spots_taken) : null;
  const full = spotsLeft === 0;

  return (
    <div className="min-h-dvh terry-bg" style={{ background: "var(--cream)" }}>
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <Link to="/" className="font-display text-2xl flex items-center gap-2 justify-center">
          <BallHeart size={26} /> Courtship
        </Link>

        {(!event || !upcoming) && (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🌅</div>
            <div className="font-display text-2xl">{t("e.gone_title")}</div>
            <p className="font-semibold" style={{ opacity: 0.7 }}>{t("e.gone_sub")}</p>
            <Link to="/board" className="cbtn cbtn-coral inline-block">🎾 {t("e.see_board")}</Link>
          </div>
        )}

        {event && upcoming && (() => {
          // Same rail as the board's event card (RailKit) — one look everywhere.
          const d = new Date(event.starts_at);
          const now = new Date();
          const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
          const day = d.toDateString() === now.toDateString() ? t("rail.today") : d.toDateString() === tmr.toDateString() ? t("rail.tmrw") : d.toLocaleDateString(locale, { weekday: "short" });
          const dateStr = d.toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "");
          const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
          const hours = event.duration_min != null ? `${Math.round(event.duration_min / 60 * 10) / 10}h` : undefined;
          return (
            <>
              <div className="text-center">
                <div className="font-display" style={{ fontSize: 26, lineHeight: 1.15 }}>{event.title}</div>
              </div>

              <RailShell>
                <TimeRail day={day} time={time} ct="🎉" tone="event" dateStr={dateStr} ctSub={hours} />
                <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
                  <div style={{ fontWeight: 800, fontSize: RF.club, color: "#8C5A33", ...clampLines(2) }}>📍 {event.location}{event.city ? ` · ${event.city}` : ""}</div>
                  <div style={{ fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.6)", marginTop: 6 }}>
                    {event.price_sek ? `${event.price_sek} kr` : t("ev.free")}
                    {spotsLeft != null && ` · ${full ? t("ev.full_label") : t("e.spots_left", { n: spotsLeft })}`}
                    {event.level_min != null && event.level_max != null && ` · L${event.level_min}–${event.level_max}`}
                  </div>
                  {event.description && <div style={{ fontStyle: "italic", fontWeight: 600, fontSize: RF.note, color: "rgba(43,33,24,0.6)", marginTop: 6, ...clampLines(3) }}>"{event.description}"</div>}
                </div>
              </RailShell>

              {!full ? (
                <div className="space-y-2">
                  <button type="button" onClick={joinNow} className="cbtn cbtn-coral w-full" style={{ fontSize: 17 }}>
                    🎾 {t("e.im_in")}
                  </button>
                  <p className="text-center text-sm font-semibold" style={{ opacity: 0.65 }}>{t("e.signup_note")}</p>
                </div>
              ) : (
                <div className="ccard p-4 text-center space-y-2">
                  <div className="font-display text-xl">{t("ev.full_label")} 💔</div>
                  <Link to="/board" className="cbtn cbtn-coral inline-block">🎾 {t("e.see_board")}</Link>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
