import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  CITIES,
  FORMATS,
  LEVELS,
  PLAY_TIMES,
  VIBES,
  levelMeta,
  toE164,
  type City,
} from "@/lib/courtship";
import { fetchCourtsForPicker, type CourtFull } from "@/lib/courts";
import { CourtCombobox } from "@/components/CourtCombobox";
import { uploadAvatar } from "@/lib/avatar";
import { Avatar } from "@/components/Avatar";
import { useEffect } from "react";

export type ProfileFormValues = {
  name: string;
  phone_e164: string;
  photo_url: string;
  level: number;
  formats: string[];
  play_times: string[];
  vibe: "chill" | "friendly" | "sweat";
  looking_for: "regular" | "dropin" | "both";
  home_courts: string;
  home_city: City;
  home_cities: City[];
  buddy_optin: "yes" | "sometimes" | "no";
  buddy_radius_km: number;
  buddy_sos_optin: boolean;
};

export const emptyProfile: ProfileFormValues = {
  name: "",
  phone_e164: "",
  photo_url: "",
  level: 3,
  formats: ["singles"],
  play_times: [],
  vibe: "friendly",
  looking_for: "both",
  home_courts: "",
  home_city: "Uppsala",
  home_cities: ["Uppsala"],
  buddy_optin: "sometimes",
  buddy_radius_km: 10,
  buddy_sos_optin: true,
};

const LEVEL_DESC: Record<number, string> = {
  1: "Just picked up a racket. Rallies start here.",
  2: "Can rally a bit. Working on consistency.",
  3: "Solid rallies, decent serve, plays matches.",
  4: "Tournament-tested. Strong all-court game.",
  5: "Competition level. Bring your A game.",
};

const VIBE_META: Record<string, { e: string; label: string; desc: string }> = {
  chill: { e: "😌", label: "Chill", desc: "Just a hit. Laughs allowed." },
  friendly: { e: "🤝", label: "Friendly", desc: "Competitive but cool." },
  sweat: { e: "🔥", label: "Sweat", desc: "Show up to win. No mercy." },
};

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

const TITLES = [
  "Who's serving?",
  "Your level",
  "How do you play?",
  "What's your vibe?",
  "What are you after?",
];

export function ProfileWizard({
  initial,
  userId,
  onSubmit,
  submitLabel = "Finish my profile",
  savedState = false,
  savedLabel = "Saved ✓",
  busy,
}: {
  initial: ProfileFormValues;
  userId: string;
  onSubmit: (v: ProfileFormValues) => void | Promise<void>;
  submitLabel?: string;
  savedState?: boolean;
  savedLabel?: string;
  busy?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [v, setV] = useState<ProfileFormValues>(initial);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [courts, setCourts] = useState<CourtFull[]>([]);
  const [picker, setPicker] = useState<string>("");

  useEffect(() => {
    fetchCourtsForPicker().then(setCourts);
  }, []);

  function set<K extends keyof ProfileFormValues>(k: K, val: ProfileFormValues[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(userId, file);
      set("photo_url", url);
    } catch (err: any) {
      toast.error(err?.message ?? "Photo upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function canAdvance(): boolean {
    if (step === 0) {
      if (!v.name.trim()) return false;
      const phone = toE164(v.phone_e164);
      if (!/^\+\d{8,15}$/.test(phone)) return false;
      return true;
    }
    if (step === 2 && v.formats.length === 0) return false;
    return true;
  }

  function next() {
    if (!canAdvance()) {
      toast.error(
        step === 0
          ? "Add your first name and a valid phone number."
          : "Pick at least one option.",
      );
      return;
    }
    if (step === 0) set("phone_e164", toE164(v.phone_e164));
    if (step < 4) setStep(step + 1);
    else onSubmit({ ...v, phone_e164: toE164(v.phone_e164) });
  }

  const lm = levelMeta(v.level);
  const norm = (x: ProfileFormValues) =>
    JSON.stringify({ ...x, formats: [...(x.formats || [])].sort(), play_times: [...(x.play_times || [])].sort() });
  const dirty = norm(v) !== norm(initial);
  const saved = savedState && step === 4 && !dirty;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => step > 0 && setStep(step - 1)}
          className="text-sm font-extrabold underline disabled:opacity-30"
          disabled={step === 0}
        >
          ← Back
        </button>
        <span className="csection-label">{step + 1} / 5</span>
      </div>

      <div className="flex gap-2 justify-center mb-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-3 h-3 rounded-full border-2 border-[var(--ink)]"
            style={{ background: i <= step ? "var(--green-pop)" : "var(--cream2)" }}
          />
        ))}
      </div>

      <h2 className="font-display text-3xl mb-5">{TITLES[step]}</h2>

      <div className="min-h-[260px]">
        {step === 0 && (
          <div className="flex flex-col items-center gap-5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative"
              disabled={uploading}
              aria-label="Add a photo"
            >
              {v.photo_url ? (
                <Avatar src={v.photo_url} name={v.name || "?"} seed={userId} size={140} />
              ) : (
                <div
                  className="w-[140px] h-[140px] rounded-full flex flex-col items-center justify-center gap-1 bg-[var(--cream2)] text-[var(--ink)] font-bold text-sm"
                  style={{ border: "2.5px dashed rgba(43,33,24,0.35)" }}
                >
                  <span className="text-3xl">📷</span>
                  <span>{uploading ? "Uploading..." : "Add a photo"}</span>
                </div>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={pickPhoto}
              className="hidden"
            />
            {v.photo_url && (
              <button
                type="button"
                onClick={() => set("photo_url", "")}
                className="text-xs underline text-[var(--ink)]"
              >
                Remove photo (use monogram)
              </button>
            )}
            <p className="text-xs font-bold text-[var(--ink)] text-center">
              Real face optional. Real forehand mandatory.
            </p>

            <div className="w-full">
              <div className="csection-label mb-1">Your name</div>
              <input
                className="cinput"
                value={v.name}
                maxLength={40}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Björn K."
              />
              <div className="text-sm text-[var(--ink)] mt-1 opacity-70">First name + last initial — so players can tell you apart 🎾</div>
            </div>

            <div className="w-full">
              <div className="csection-label mb-1">WhatsApp number</div>
              <input
                className="cinput"
                inputMode="tel"
                value={v.phone_e164 || "+46"}
                onChange={(e) => set("phone_e164", e.target.value)}
                placeholder="+46 70 123 45 67"
              />
              <p className="text-xs font-semibold text-[var(--ink)] mt-2 leading-snug">
                Players can reach you on WhatsApp. Your number is only shared
                when someone actually messages you — never shown in the app.
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col items-center gap-7 pt-3">
            <div className="flex gap-3">
              {LEVELS.map((l) => (
                <button
                  key={l.n}
                  type="button"
                  onClick={() => set("level", l.n)}
                  aria-label={l.name}
                  className="w-12 h-12 rounded-full border-2 border-[var(--ink)] transition"
                  style={{
                    background: l.n <= v.level ? l.color : "var(--cream2)",
                    boxShadow: l.n === v.level ? "2px 2px 0 var(--ink)" : "none",
                  }}
                />
              ))}
            </div>
            <div className="text-center">
              <div className="font-display text-2xl">{lm.name}</div>
              <div className="font-bold text-sm text-[var(--ink)] mt-1">
                {LEVEL_DESC[v.level]}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="csection-label mb-2">Format</div>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`cchip ${v.formats.includes(f) ? "cchip-on" : ""}`}
                    onClick={() => set("formats", toggle(v.formats, f))}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="csection-label mb-2">When can you play?</div>
              <div className="flex flex-wrap gap-2">
                {PLAY_TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`cchip ${v.play_times.includes(t) ? "cchip-on" : ""}`}
                    onClick={() => set("play_times", toggle(v.play_times, t))}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            {VIBES.map((vb) => {
              const meta = VIBE_META[vb.value];
              const on = v.vibe === vb.value;
              return (
                <button
                  key={vb.value}
                  type="button"
                  onClick={() => set("vibe", vb.value)}
                  className="ccard flex items-center gap-4 p-4 text-left w-full transition"
                  style={{
                    background: on ? "var(--green-pop)" : "var(--cream2)",
                    boxShadow: on
                      ? "4px 4px 0 var(--ink)"
                      : "4px 4px 0 rgba(43,33,24,0.14)",
                  }}
                >
                  <span className="text-3xl">{meta.e}</span>
                  <span>
                    <span className="block font-display text-lg">{meta.label}</span>
                    <span className="block text-sm font-bold text-[var(--ink)] mt-0.5">
                      {meta.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="csection-label mb-2">Looking for</div>
              <div className="flex flex-wrap gap-2">
                {(["regular", "dropin", "both"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`cchip ${v.looking_for === l ? "cchip-on" : ""}`}
                    onClick={() => set("looking_for", l)}
                  >
                    {l === "dropin" ? "Drop-in" : l === "regular" ? "Regular" : "Both"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="csection-label mb-2">Home courts</div>
              <div className="text-xs text-[var(--ink)] mb-2 -mt-1">Pick the cities you play in — tap both if you split your time.</div>
              <div className="flex gap-2 mb-3">
                {CITIES.map((cy) => {
                  const on = (v.home_cities ?? []).includes(cy);
                  return (
                    <button
                      key={cy}
                      type="button"
                      className={`cchip ${on ? "cchip-on" : ""}`}
                      onClick={() => {
                        const cur = v.home_cities ?? [];
                        const next = on ? cur.filter((c) => c !== cy) : [...cur, cy];
                        const cities = next.length ? next : cur;
                        set("home_cities", cities);
                        set("home_city", cities[0]);
                      }}
                    >
                      📍 {cy}
                    </button>
                  );
                })}
              </div>
              <CourtCombobox
                city={v.home_city}
                valueId={picker}
                onChange={(id, c) => {
                  setPicker(id);
                  if (c) {
                    setCourts((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
                    const list = (v.home_courts || "").split(",").map((s) => s.trim()).filter(Boolean);
                    if (!list.includes(c.name)) {
                      set("home_courts", [...list, c.name].join(", "));
                    }
                    setTimeout(() => setPicker(""), 50);
                  }
                }}
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {(v.home_courts || "").split(",").map((s) => s.trim()).filter(Boolean).map((n) => (
                  <span key={n} className="cchip cchip-on">
                    {n}
                    <button
                      type="button"
                      aria-label={`Remove ${n}`}
                      className="ml-1 underline"
                      onClick={() => {
                        const list = (v.home_courts || "").split(",").map((s) => s.trim()).filter(Boolean);
                        set("home_courts", list.filter((x) => x !== n).join(", "));
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="csection-label mb-2">Be a buddy — rescue someone's no-show?</div>
              <div className="flex flex-wrap gap-2">
                {(["yes", "sometimes", "no"] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    className={`cchip ${v.buddy_optin === x ? "cchip-on" : ""}`}
                    onClick={() => set("buddy_optin", x)}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <label className="flex items-start gap-3 mt-4 ccard p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 w-5 h-5 accent-[var(--coral)]"
                  checked={v.buddy_sos_optin}
                  onChange={(e) => set("buddy_sos_optin", e.target.checked)}
                />
                <span>
                  <span className="block font-extrabold">SOS from my buddies 🤝</span>
                  <span className="block text-sm font-semibold text-[var(--ink)] mt-1">
                    Hear when a buddy needs you — even when rescuer mode is off.
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={busy || uploading || saved}
        onClick={next}
        className={saved ? "cbtn w-full mt-6" : "cbtn cbtn-coral w-full mt-6"}
        style={saved ? { background: "var(--green-pop)", color: "var(--ink)", border: "2px solid var(--ink)", cursor: "default" } : undefined}
      >
        {busy
          ? "Saving..."
          : step < 4
            ? "Next"
            : saved
              ? savedLabel
              : submitLabel}
      </button>
    </div>
  );
}