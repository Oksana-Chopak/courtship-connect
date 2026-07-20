import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { type City, SOS_FORMATS, COURT_STATUSES } from "@/lib/courtship";
import { useCityNames } from "@/lib/cities";
import { CourtCombobox } from "@/components/CourtCombobox";
import { rememberDraftGame } from "@/lib/draftGame";
import { rememberNext } from "@/lib/share";
import { BallHeart } from "@/components/RailKit";

export const Route = createFileRoute("/post")({
  component: PostGamePage,
});

/** "Post a game, then create your account" — the reverse-registration funnel
 *  for Facebook groups and cold links. Guests fill the real game form; the
 *  draft is stashed locally, they sign up, and the authed shell publishes it
 *  automatically (see publishDraftGame in the _authenticated route). */
function PostGamePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [city, setCity] = useState<City>("Uppsala");
  const [courtId, setCourtId] = useState("");
  const [courtType, setCourtType] = useState<string>("outdoor");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<string>("singles");
  const [anyone, setAnyone] = useState(false);
  const [levelMin, setLevelMin] = useState(2);
  const [levelMax, setLevelMax] = useState(4);
  const [courtStatus, setCourtStatus] = useState<string>("will_book");
  const [note, setNote] = useState("");
  const cityNames = useCityNames();

  // Signed-in users get the full form with their profile defaults.
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (data.user) navigate({ to: "/sos/new", search: { edit: undefined }, replace: true });
    });
  }, [navigate]);

  const playAt = useMemo(() => {
    if (!date || !time) return null;
    const d = new Date(date + "T" + time);
    return isNaN(d.getTime()) ? null : d;
  }, [date, time]);

  const canContinue = !!(playAt && playAt.getTime() > Date.now() && courtId);

  function continueToSignup() {
    if (!playAt || !courtId) return;
    rememberDraftGame({
      court_id: courtId,
      city,
      play_at: playAt.toISOString(),
      format,
      level_min: anyone ? 1 : levelMin,
      level_max: anyone ? 5 : levelMax,
      court_status: courtStatus,
      court_type: courtType,
      duration_min: 60,
      note: note.trim() || null,
    });
    rememberNext("/board");
    navigate({ to: "/auth", search: { mode: "signup" } });
  }

  return (
    <div className="terry-bg min-h-screen px-5 py-8 font-body text-[var(--ink)]">
      <div className="max-w-md mx-auto space-y-5">
        <Link to="/" className="font-display text-2xl flex items-center gap-2">
          <BallHeart size={26} /> Courtship
        </Link>

        <div>
          <h1 className="font-display text-4xl leading-tight">{t("post_pub.title")}</h1>
          <p className="font-semibold mt-1" style={{ opacity: 0.75 }}>{t("post_pub.sub")}</p>
        </div>

        <div className="ccard p-4 space-y-4">
          {/* City */}
          <div>
            <div className="csection-label mb-1">📍 {t("sos.city") /* falls back to key if absent */}</div>
            <div className="flex gap-1.5 flex-wrap">
              {cityNames.map((c) => (
                <button key={c} type="button" onClick={() => { setCity(c); setCourtId(""); }} className={`cchip ${city === c ? "cchip-on" : ""}`}>{c}</button>
              ))}
            </div>
          </div>

          {/* Court */}
          <div>
            <div className="csection-label mb-1">🎾 {t("sos.court")}</div>
            <CourtCombobox city={city} valueId={courtId} onChange={(id: string) => setCourtId(id)} />
          </div>

          {/* Court type */}
          <div>
            <div className="csection-label mb-1">{t("ct.label")}</div>
            <div className="flex gap-1.5 flex-wrap">
              {(["outdoor", "indoor"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setCourtType(v)} className={`cchip ${courtType === v ? "cchip-on" : ""}`}>{v === "outdoor" ? "☀️" : "🏠"} {t("ct." + v)}</button>
              ))}
            </div>
          </div>

          {/* When */}
          <div>
            <div className="csection-label mb-1">🕐 {t("sos.when")}</div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="cinput" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
              <input type="time" className="cinput" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Format */}
          <div>
            <div className="csection-label mb-1">👥 {t("sos.format")}</div>
            <div className="flex gap-1.5 flex-wrap">
              {SOS_FORMATS.map((f) => (
                <button key={f.value} type="button" onClick={() => setFormat(f.value)} className={`cchip ${format === f.value ? "cchip-on" : ""}`}>{f.label}</button>
              ))}
            </div>
          </div>

          {/* Level */}
          <div>
            <div className="csection-label mb-1">📶 {t("sos.level_range")}</div>
            <div className="flex gap-1.5 flex-wrap items-center">
              <button type="button" onClick={() => setAnyone(!anyone)} className={`cchip ${anyone ? "cchip-on" : ""}`}>{t("sos.anyone")}</button>
              {!anyone && (
                <>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => { if (n <= levelMax) setLevelMin(n); }} className={`cchip ${levelMin === n ? "cchip-on" : ""}`}>{n}</button>
                  ))}
                  <span className="font-extrabold text-sm">–</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={"x" + n} type="button" onClick={() => { if (n >= levelMin) setLevelMax(n); }} className={`cchip ${levelMax === n ? "cchip-on" : ""}`}>{n}</button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Court status */}
          <div>
            <div className="csection-label mb-1">💳 {t("sos.court_status")}</div>
            <div className="flex gap-1.5 flex-wrap">
              {COURT_STATUSES.map((s) => (
                <button key={s.value} type="button" onClick={() => setCourtStatus(s.value)} className={`cchip ${courtStatus === s.value ? "cchip-on" : ""}`}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <div className="csection-label mb-1">💬 {t("sos.note_label")}</div>
            <input className="cinput" placeholder={t("post_pub.note_ph")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
          </div>
        </div>

        <button type="button" disabled={!canContinue} onClick={continueToSignup} className="cbtn cbtn-coral w-full" style={{ opacity: canContinue ? 1 : 0.5 }}>
          {t("post_pub.continue")} →
        </button>
        <p className="text-center text-sm font-semibold" style={{ opacity: 0.7 }}>{t("post_pub.free_line")}</p>
        <p className="text-center text-sm font-extrabold">
          <Link to="/auth" search={{ mode: "login" }} className="underline">{t("post_pub.have_account")}</Link>
        </p>
      </div>
    </div>
  );
}
