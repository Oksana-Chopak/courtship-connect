import { useState } from "react";
import { FORMATS, LEVELS, PLAY_TIMES, VIBES, levelMeta } from "@/lib/courtship";

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
  buddy_optin: "yes" | "sometimes" | "no";
  buddy_radius_km: number;
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
  buddy_optin: "sometimes",
  buddy_radius_km: 10,
};

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function ProfileForm({
  initial,
  onSubmit,
  submitLabel,
  busy,
}: {
  initial: ProfileFormValues;
  onSubmit: (v: ProfileFormValues) => void;
  submitLabel: string;
  busy?: boolean;
}) {
  const [v, setV] = useState<ProfileFormValues>(initial);
  const lm = levelMeta(v.level);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.phone_e164.startsWith("+")) {
          alert("Phone must be in international format, e.g. +46701234567");
          return;
        }
        onSubmit(v);
      }}
      className="space-y-6"
    >
      <Section label="Your name">
        <input
          className="cinput"
          required
          maxLength={60}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          placeholder="Alex"
        />
      </Section>

      <Section label="Phone (WhatsApp · never shown publicly)">
        <input
          className="cinput"
          required
          inputMode="tel"
          value={v.phone_e164}
          onChange={(e) => setV({ ...v, phone_e164: e.target.value })}
          placeholder="+46701234567"
        />
      </Section>

      <Section label="Photo URL (optional)">
        <input
          className="cinput"
          value={v.photo_url}
          onChange={(e) => setV({ ...v, photo_url: e.target.value })}
          placeholder="https://..."
        />
      </Section>

      <Section label={`Level · ${lm.name}`}>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button
              type="button"
              key={l.n}
              onClick={() => setV({ ...v, level: l.n })}
              className={`cchip ${v.level === l.n ? "cchip-on" : ""}`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: l.color }}
              />
              {l.name}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Formats">
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              className={`cchip ${v.formats.includes(f) ? "cchip-on" : ""}`}
              onClick={() => setV({ ...v, formats: toggle(v.formats, f) })}
            >
              {f}
            </button>
          ))}
        </div>
      </Section>

      <Section label="When you play">
        <div className="flex flex-wrap gap-2">
          {PLAY_TIMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`cchip ${v.play_times.includes(t) ? "cchip-on" : ""}`}
              onClick={() => setV({ ...v, play_times: toggle(v.play_times, t) })}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Vibe on court">
        <div className="flex flex-wrap gap-2">
          {VIBES.map((vb) => (
            <button
              key={vb.value}
              type="button"
              className={`cchip ${v.vibe === vb.value ? "cchip-on" : ""}`}
              onClick={() => setV({ ...v, vibe: vb.value })}
            >
              <span>{vb.emoji}</span> {vb.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Looking for">
        <div className="flex flex-wrap gap-2">
          {(["regular", "dropin", "both"] as const).map((x) => (
            <button
              key={x}
              type="button"
              className={`cchip ${v.looking_for === x ? "cchip-on" : ""}`}
              onClick={() => setV({ ...v, looking_for: x })}
            >
              {x === "dropin" ? "Drop-in" : x === "regular" ? "Regular" : "Both"}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Home courts">
        <input
          className="cinput"
          value={v.home_courts}
          onChange={(e) => setV({ ...v, home_courts: e.target.value })}
          placeholder="UTK, Fyrishov..."
        />
      </Section>

      <Section label="Be a buddy (rescue someone's no-show)?">
        <div className="flex flex-wrap gap-2">
          {(["yes", "sometimes", "no"] as const).map((x) => (
            <button
              key={x}
              type="button"
              className={`cchip ${v.buddy_optin === x ? "cchip-on" : ""}`}
              onClick={() => setV({ ...v, buddy_optin: x })}
            >
              {x}
            </button>
          ))}
        </div>
      </Section>

      <Section label={`Buddy radius · ${v.buddy_radius_km} km`}>
        <input
          type="range"
          min={1}
          max={30}
          value={v.buddy_radius_km}
          onChange={(e) => setV({ ...v, buddy_radius_km: Number(e.target.value) })}
          className="w-full accent-[var(--coral)]"
        />
      </Section>

      <button disabled={busy} className="cbtn cbtn-coral w-full">
        {busy ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="csection-label mb-2">{label}</div>
      {children}
    </div>
  );
}