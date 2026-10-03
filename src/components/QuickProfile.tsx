import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { LEVELS, MATCHI_BY_LEVEL, toE164, type City } from "@/lib/courtship";
import { uploadPhoto } from "@/lib/avatar";
import { useI18n } from "@/lib/i18n";
import { useCityNames } from "@/lib/cities";
import type { ProfileFormValues } from "@/components/ProfileWizard";

/** Onboarding on ONE screen (2026-10 crystallization): photo (optional), name,
 *  WhatsApp — the contact rail every match runs on —, level, city. Everything
 *  else keeps the sensible defaults from `emptyProfile` and is editable later
 *  in Settings (the flat ProfileWizard). The button is never greyed out: a tap
 *  with something missing says what, and focuses it. */
export function QuickProfile({ initial, userId, busy, onSubmit, submitLabel }: {
  initial: ProfileFormValues;
  userId: string;
  busy?: boolean;
  onSubmit: (v: ProfileFormValues) => void | Promise<void>;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const cityNames = useCityNames();
  const [v, setV] = useState<ProfileFormValues>(initial);
  const [uploading, setUploading] = useState(false);
  const [nudge, setNudge] = useState<"name" | "phone" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof ProfileFormValues>(k: K, val: ProfileFormValues[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(userId, f);
      setV((p) => ({ ...p, photos: [url, ...(p.photos ?? []).filter((x) => x !== url)].slice(0, 10), photo_url: url }));
    } catch (err: any) {
      toast.error(err?.message ?? t("wiz.photo_fail"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit() {
    const phone = toE164(v.phone_e164);
    if (!v.name.trim() || !v.last_name.trim()) {
      setNudge("name"); toast.error(t("wiz.err_name_phone")); firstRef.current?.focus(); return;
    }
    if (!/^\+\d{8,15}$/.test(phone)) {
      setNudge("phone"); toast.error(t("wiz.err_name_phone")); phoneRef.current?.focus(); return;
    }
    setNudge(null);
    const city = (v.home_city || cityNames[0] || "Uppsala") as City;
    onSubmit({ ...v, phone_e164: phone, home_city: city, home_cities: [city] });
  }

  const coralIf = (on: boolean): React.CSSProperties | undefined => (on ? { outline: "2px solid var(--coral)", outlineOffset: 2, borderRadius: 12 } : undefined);

  return (
    <div className="space-y-4">
      {/* photo — one round tile, optional */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label={t("wiz.add_photo")}
          className="shrink-0 flex items-center justify-center overflow-hidden"
          style={{ width: 56, height: 56, borderRadius: "50%", border: v.photo_url ? "2px solid var(--ink)" : "2.5px dashed rgba(43,33,24,0.35)", background: "var(--cream2)" }}>
          {v.photo_url ? <img src={v.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22 }}>📷</span>}
        </button>
        <div className="min-w-0">
          <div className="font-extrabold text-sm">{uploading ? t("wiz.uploading") : v.photo_url ? t("qp.photo_change") : t("wiz.add_photo")}</div>
          <div className="text-xs font-semibold" style={{ opacity: 0.6 }}>{t("qp.photo_sub")}</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
      </div>

      {/* name — two fields on one row */}
      <div className="grid grid-cols-2 gap-3" style={coralIf(nudge === "name")}>
        <div>
          <label className="csection-label block mb-1" htmlFor="qp-first">{t("wiz.first_name")}</label>
          <input id="qp-first" ref={firstRef} className="cinput" value={v.name} maxLength={40} autoComplete="given-name"
            onChange={(e) => set("name", e.target.value)} placeholder={t("wiz.first_name_ph")} />
        </div>
        <div>
          <label className="csection-label block mb-1" htmlFor="qp-last">{t("wiz.last_name")}</label>
          <input id="qp-last" className="cinput" value={v.last_name} maxLength={40} autoComplete="family-name"
            onChange={(e) => set("last_name", e.target.value)} placeholder={t("wiz.last_name_ph")} />
        </div>
      </div>

      {/* WhatsApp — the contact rail */}
      <div style={coralIf(nudge === "phone")}>
        <label className="csection-label block mb-1" htmlFor="qp-phone">{t("wiz.whatsapp")}</label>
        <input id="qp-phone" ref={phoneRef} className="cinput" inputMode="tel" autoComplete="tel" value={v.phone_e164 || "+46"}
          onChange={(e) => set("phone_e164", e.target.value)} placeholder="+46 70 123 45 67" />
        <p className="text-xs font-semibold mt-1 leading-snug" style={{ opacity: 0.65 }}>{t("qp.phone_sub")}</p>
      </div>

      {/* level — five dots, the name on the right */}
      <div>
        <div className="csection-label mb-2">{t("wiz.title_1")}</div>
        <div>
          <div className="flex gap-2" role="radiogroup" aria-label={t("wiz.title_1")}>
            {LEVELS.map((l) => (
              <button key={l.n} type="button" role="radio" aria-checked={l.n === v.level} aria-label={t(`lvl.${l.n}`)}
                onClick={() => set("level", l.n)}
                className="rounded-full border-2 border-[var(--ink)]"
                style={{ width: 36, height: 36, background: l.n <= v.level ? l.color : "var(--cream2)", boxShadow: l.n === v.level ? "2px 2px 0 var(--ink)" : "none" }} />
            ))}
          </div>
        </div>
        <div className="mt-2 leading-tight">
          <span className="font-display text-lg">{t(`lvl.${v.level}`)}</span>
          <span className="text-xs font-bold ml-2" style={{ opacity: 0.55 }}>{t("wiz.matchi_hint", { m: MATCHI_BY_LEVEL[v.level] ?? "—" })}</span>
          <div className="text-sm font-semibold mt-0.5" style={{ opacity: 0.75 }}>{t(`wiz.level_desc_${v.level}`)}</div>
        </div>
      </div>

      {/* city — one pick; more cities later in Settings */}
      <div>
        <div className="csection-label mb-2">{t("city.label")}</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("city.label")}>
          {cityNames.map((cy) => (
            <button key={cy} type="button" role="radio" aria-checked={v.home_city === cy}
              className={`cchip ${v.home_city === cy ? "cchip-on" : ""}`}
              onClick={() => { set("home_city", cy as City); set("home_cities", [cy as City]); }}>
              📍 {cy}
            </button>
          ))}
        </div>
      </div>

      <button type="button" disabled={busy || uploading} onClick={submit} className="cbtn cbtn-coral w-full" style={{ fontSize: 17 }}>
        {busy ? t("wiz.saving") : submitLabel}
      </button>
    </div>
  );
}
