import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { type City, type CourtType, COURT_STATUSES, COURT_TYPES, courtTypeMeta, DURATIONS, durationLabel, generateSlots, LEVELS } from "@/lib/courtship";
import { useCityNames } from "@/lib/cities";
import { CourtCombobox } from "@/components/CourtCombobox";
import { rememberDraftGame } from "@/lib/draftGame";
import { rememberNext } from "@/lib/share";
import { BallHeart, Rackets } from "@/components/RailKit";
import { HAIR, CARD, WOOD, LIME, CORAL, LV_COLORS, WizLbl, SegRow, QuietNext, AccordionRow, DetailCard, LevelTrack, Wheel } from "@/components/wizardKit";

export const Route = createFileRoute("/post")({
  component: PostGamePage,
});

function pad(n: number) { return n.toString().padStart(2, "0"); }

/** "Post a game, then create your account" — the reverse-registration funnel.
 *  Same 3-step wizard as the member flow (shared wizardKit atoms), minus the
 *  account-bound extras (sport, SOS, private, buddies, ghost). The draft is
 *  stashed locally, the guest signs up, and the authed shell publishes it. */
function PostGamePage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [city, setCity] = useState<City>("Uppsala");
  const [courtId, setCourtId] = useState("");
  const [courtName, setCourtName] = useState("");
  const [courtType, setCourtType] = useState<CourtType>("outdoor");
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [time, setTime] = useState("");
  const [untilTime, setUntilTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [format, setFormat] = useState("singles");
  const [anyone, setAnyone] = useState(false);
  const [levelMin, setLevelMin] = useState(2);
  const [levelMax, setLevelMax] = useState(4);
  const [courtStatus, setCourtStatus] = useState<typeof COURT_STATUSES[number]["value"]>("will_book");
  const [note, setNote] = useState("");
  const cityNames = useCityNames();

  // Signed-in users get the full form with their profile defaults.
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (data.user) navigate({ to: "/sos/new", search: { edit: undefined }, replace: true });
    });
  }, [navigate]);

  const slots = useMemo(() => generateSlots(city, date), [city, date]);
  const fromItems = useMemo(() => ["—", ...slots], [slots]);
  const toItems = useMemo(() => ["—", ...slots.filter((s) => (time ? s > time : false))], [slots, time]);
  useEffect(() => {
    if (untilTime && time && untilTime <= time) setUntilTime("");
  }, [time, untilTime]);
  useEffect(() => {
    if (time && !slots.includes(time)) setTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, date]);

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const tomorrow0 = new Date(today0.getTime() + 24 * 3600 * 1000);
  const isToday = date.getTime() === today0.getTime();
  const isTomorrow = date.getTime() === tomorrow0.getTime();
  const [pickDateOpen, setPickDateOpen] = useState(false);
  const locale = lang === "sv" ? "sv-SE" : "en-GB";

  const playAt = useMemo(() => {
    if (!time) return null;
    const d = new Date(date);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    return d;
  }, [date, time]);
  const playUntil = useMemo(() => {
    if (!untilTime) return null;
    const d = new Date(date);
    const [h, m] = untilTime.split(":").map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    return d;
  }, [date, untilTime]);

  const canContinue = !!(playAt && playAt.getTime() > Date.now() && courtId);
  const statusLabel = COURT_STATUSES.find((s) => s.value === courtStatus)?.label ?? "";
  const stepTitles = [t("wiz.when_title"), t("wiz.court_title"), t("wiz.who_title")];

  function continueToSignup() {
    if (!playAt || !courtId) return;
    rememberDraftGame({
      court_id: courtId,
      city,
      play_at: playAt.toISOString(),
      play_until: playUntil ? playUntil.toISOString() : null,
      format,
      level_min: anyone ? 1 : levelMin,
      level_max: anyone ? 5 : levelMax,
      court_status: courtStatus,
      court_type: courtType,
      duration_min: duration,
      note: note.trim() || null,
    });
    rememberNext("/board");
    navigate({ to: "/auth", search: { mode: "signup" } });
  }

  return (
    <div className="terry-bg min-h-screen px-5 py-8 font-body text-[var(--ink)]">
      <div className="max-w-md mx-auto space-y-4">
        <Link to="/" className="font-display text-2xl flex items-center gap-2">
          <BallHeart size={26} /> Courtship
        </Link>

        <div>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="text-sm font-extrabold underline">← {t("wiz.back")}</button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="font-display flex-1" style={{ fontSize: 26, lineHeight: 1.1 }}>{stepTitles[step]}</h1>
            <span className="font-extrabold" style={{ fontSize: 13.5, opacity: 0.6 }}>{step + 1}/3</span>
          </div>
          <p className="font-semibold" style={{ opacity: 0.7, fontSize: 13.5, marginTop: 2 }}>{t("post_pub.sub")}</p>
          <div className="flex gap-1.5 mt-2.5">
            {[0, 1, 2].map((k) => (
              <span key={k} style={{ flex: 1, height: 4, borderRadius: 999, background: k <= step ? LIME : HAIR }} />
            ))}
          </div>
        </div>

        {/* ════ STEP 1 · WHEN ════ */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <WizLbl>{t("sos.duration")}</WizLbl>
              <SegRow items={DURATIONS.map((d) => ({ key: String(d), label: durationLabel(d) }))}
                sel={String(duration)} onSel={(k) => setDuration(Number(k))} />
            </div>
            <div>
              <WizLbl>{t("wiz.window_label")}</WizLbl>
              <div style={{ display: "flex", gap: 16, background: "rgba(43,33,24,0.05)", borderRadius: 14, padding: "10px 14px" }}>
                <Wheel label={t("wiz.from")} items={fromItems} value={time || "—"}
                  onChange={(v) => setTime(v === "—" ? "" : v)} />
                <Wheel label={t("wiz.to")} items={toItems} value={untilTime || "—"}
                  disabled={!time}
                  onChange={(v) => setUntilTime(v === "—" ? "" : v)} />
              </div>
              <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>
                {untilTime ? t("sos.flex_help") : t("wiz.window_hint")}
              </p>
            </div>
            <div>
              <WizLbl>{t("wiz.day")}</WizLbl>
              <SegRow
                items={[
                  { key: "today", label: t("wiz.today") },
                  { key: "tomorrow", label: t("wiz.tomorrow") },
                  { key: "pick", label: isToday || isTomorrow ? t("wiz.pick_date") : date.toLocaleDateString(locale, { day: "numeric", month: "short" }) },
                ]}
                sel={isToday ? "today" : isTomorrow ? "tomorrow" : "pick"}
                onSel={(k) => {
                  if (k === "today") { setDate(new Date(today0)); setPickDateOpen(false); }
                  else if (k === "tomorrow") { setDate(new Date(tomorrow0)); setPickDateOpen(false); }
                  else setPickDateOpen(true);
                }}
              />
              {pickDateOpen && (
                <input type="date" className="cinput mt-2" aria-label={t("wiz.pick_date")}
                  min={new Date().toISOString().slice(0, 10)}
                  value={`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}
                  onChange={(e) => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d.getTime())) setDate(d); }} />
              )}
            </div>
            <QuietNext label={t("wiz.next_court")} onClick={() => setStep(1)} />
          </div>
        )}

        {/* ════ STEP 2 · COURT ════ */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              {cityNames.map((cy) => (
                <button key={cy} type="button" onClick={() => { setCity(cy); setCourtId(""); setCourtName(""); }}
                  className="font-display" style={{ fontSize: 19, color: WOOD, opacity: city === cy ? 1 : 0.45, background: "transparent", padding: 0 }}>
                  📍 {cy}
                </button>
              ))}
            </div>
            <div>
              <WizLbl>{t("sos.court")}</WizLbl>
              <CourtCombobox city={city} valueId={courtId} onChange={(id, c) => { setCourtId(id); if (c) setCourtName(c.name); }} />
            </div>
            <div>
              <WizLbl>{t("ct.label")}</WizLbl>
              <SegRow
                items={COURT_TYPES.map((ct) => { const m = courtTypeMeta(ct, lang); return { key: ct, label: `${m.emoji} ${m.label}` }; })}
                sel={courtType} onSel={(k) => setCourtType(k as CourtType)} />
            </div>
            <QuietNext label={t("wiz.next_players")} onClick={() => setStep(2)} />
          </div>
        )}

        {/* ════ STEP 3 · WHO ════ */}
        {step === 2 && (
          <div className="space-y-4">
            {/* live preview — how the game will land on the board */}
            <div>
              <div style={{ display: "flex", border: `1px solid ${HAIR}`, borderRadius: 12, overflow: "hidden", background: CARD }}>
                <div style={{ width: 62, flexShrink: 0, background: "#EEF6D6", borderRight: `1px solid ${HAIR}`, borderLeft: `4px solid ${LIME}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 4px", textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 11.5, textTransform: "uppercase", color: "rgba(43,33,24,0.6)" }}>
                    {isToday ? t("wiz.today") : isTomorrow ? t("wiz.tomorrow") : date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
                  </div>
                  <div className="font-display" style={{ fontSize: 19, marginTop: 1 }}>{time || "—"}</div>
                  {untilTime && <div style={{ fontWeight: 700, fontSize: 10.5, color: "rgba(43,33,24,0.55)" }}>→{untilTime}</div>}
                  <div style={{ fontSize: 15, marginTop: 2 }}>{courtType === "indoor" ? "🏠" : "☀️"}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: "9px 11px" }}>
                  <div className="font-display truncate" style={{ fontSize: 16.5 }}>{t("wiz.hosting")}</div>
                  <div className="font-display truncate" style={{ fontSize: 14, color: WOOD }}>📍 {courtName || t("board.court")}</div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>💳 {statusLabel}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>
                      {anyone ? t("sos.anyone") : (<>L <span style={{ color: LV_COLORS[levelMin - 1] }}>{levelMin}</span>–<span style={{ color: LV_COLORS[levelMax - 1] }}>{levelMax}</span></>)}
                    </span>
                    <Rackets n={format === "singles" ? 2 : 4} size={19} />
                  </div>
                </div>
              </div>
              <div className="text-center font-bold" style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>{t("wiz.preview_hint")}</div>
            </div>

            <div>
              <WizLbl>{t("sos.format")}</WizLbl>
              <SegRow
                items={[
                  { key: "singles", label: t("wiz.singles"), icon: <Rackets n={2} size={18} /> },
                  { key: "doubles", label: t("wiz.doubles"), icon: <Rackets n={4} size={18} /> },
                ]}
                sel={format === "singles" ? "singles" : "doubles"}
                onSel={(k) => setFormat(k === "singles" ? "singles" : "doubles_need3")}
              />
              {format !== "singles" && (
                <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>{t("wiz.doubles_hint")}</p>
              )}
            </div>

            <div>
              <WizLbl right={
                <button type="button" onClick={() => setAnyone(!anyone)} className="font-bold underline" style={{ fontSize: 13.5, opacity: 0.7, background: "transparent" }}>
                  {anyone ? `${levelMin}–${levelMax}` : t("sos.anyone")}
                </button>
              }>{t("sos.level_range")}</WizLbl>
              {anyone ? (
                <div className="font-extrabold" style={{ fontSize: 16 }}>🤝 {t("sos.anyone")} <span className="font-semibold" style={{ fontSize: 13, opacity: 0.6 }}>(1–5)</span></div>
              ) : (
                <LevelTrack lo={levelMin} hi={levelMax} onChange={(lo, hi) => { setLevelMin(lo); setLevelMax(hi); }}
                  endLow={t("wiz.lvl_low")} endHigh={t("wiz.lvl_high")} />
              )}
            </div>

            <DetailCard>
              <AccordionRow label={t("sos.court_status")} value={statusLabel} last>
                <div className="flex flex-wrap gap-1.5 pb-3 px-3">
                  {COURT_STATUSES.map((s) => (
                    <button key={s.value} type="button" onClick={() => setCourtStatus(s.value)} className={`cchip ${courtStatus === s.value ? "cchip-on" : ""}`}>{s.label}</button>
                  ))}
                </div>
              </AccordionRow>
            </DetailCard>

            <div>
              <WizLbl>{t("sos.note_label")}</WizLbl>
              <input className="cinput" placeholder={t("post_pub.note_ph")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
            </div>

            <button type="button" disabled={!canContinue} onClick={continueToSignup}
              className="w-full font-extrabold"
              style={{ background: CORAL, color: "#FFF6E8", border: "none", borderRadius: 12, padding: 16, fontSize: 18, opacity: canContinue ? 1 : 0.55 }}>
              {t("post_pub.continue")} →
            </button>
            <p className="text-center text-sm font-semibold" style={{ opacity: 0.7 }}>{t("post_pub.free_line")}</p>
          </div>
        )}

        <p className="text-center text-sm font-extrabold">
          <Link to="/auth" search={{ mode: "login" }} className="underline">{t("post_pub.have_account")}</Link>
        </p>
        <p className="text-center text-xs font-bold" style={{ opacity: 0.55 }}>
          <Link to="/privacy" className="underline">{t("legal.footer_privacy")}</Link>
          {" · "}
          <Link to="/terms" className="underline">{t("legal.footer_terms")}</Link>
        </p>
      </div>
    </div>
  );
}
