import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createEventRequest } from "@/lib/events";
import { CITIES } from "@/lib/courtship";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export function EventFormModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted?: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles" as any)
        .select("phone_e164")
        .eq("id", u.user.id)
        .maybeSingle();
      if ((data as any)?.phone_e164) setContact((data as any).phone_e164);
    })();
  }, []);

  const valid = !!(title.trim() && startsAt && location.trim());

  async function submit() {
    if (!valid) { toast.error(t("ev.fill_required")); return; }
    setBusy(true);
    try {
      await createEventRequest({
        title: title.trim(),
        starts_at: new Date(startsAt).toISOString(),
        city,
        location: location.trim(),
        format: format.trim() || null,
        description: description.trim() || null,
        contact: contact.trim() || null,
      });
      toast.success(t("ev.submitted"));
      onSubmitted?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(43,33,24,0.5)" }}
      onClick={onClose}
    >
      <div
        className="ccard w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--cream2)" }}
      >
        <div>
          <h2 className="font-display text-3xl leading-tight">{t("ev.title")}</h2>
          <p className="text-base font-semibold text-[var(--ink)] mt-1">{t("ev.sub")}</p>
        </div>

        <Field label={t("ev.f_title")}>
          <input className="cinput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ev.f_title_ph")} />
        </Field>
        <Field label={t("ev.f_when")}>
          <input className="cinput" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label={t("ev.f_city")}>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`cchip ${city === null ? "cchip-on" : ""}`} onClick={() => setCity(null)}>
              {t("ev.f_city_none")}
            </button>
            {CITIES.map((cy) => (
              <button key={cy} type="button" className={`cchip ${city === cy ? "cchip-on" : ""}`} onClick={() => setCity(cy)}>
                📍 {cy}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("ev.f_location")}>
          <input className="cinput" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("ev.f_location_ph")} />
        </Field>
        <Field label={t("ev.f_format")}>
          <input className="cinput" value={format} onChange={(e) => setFormat(e.target.value)} placeholder={t("ev.f_format_ph")} />
        </Field>
        <Field label={t("ev.f_desc")}>
          <textarea className="cinput" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("ev.f_desc_ph")} />
        </Field>
        <Field label={t("ev.f_contact")}>
          <input className="cinput" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("ev.f_contact_ph")} />
        </Field>

        <div className="text-sm text-[var(--ink)] font-semibold">{t("ev.review_note")}</div>

        <div className="flex gap-2">
          <button type="button" className="cbtn cbtn-ghost flex-1" onClick={onClose}>{t("court.cancel")}</button>
          <button type="button" className="cbtn cbtn-coral flex-1" disabled={busy || !valid} onClick={submit}>
            {busy ? "..." : t("ev.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="csection-label">{label}</div>
      {children}
    </div>
  );
}
