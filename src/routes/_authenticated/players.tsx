import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, PLAY_TIMES, levelMeta, vibeEmoji } from "@/lib/courtship";
import { Avatar } from "@/components/Avatar";

export const Route = createFileRoute("/_authenticated/players")({
  head: () => ({ meta: [{ title: "Players — Courtship" }] }),
  component: Players,
});

type P = {
  id: string;
  name: string;
  photo_url: string | null;
  level: number;
  formats: string[];
  play_times: string[];
  vibe: string;
  buddy_optin: string;
  home_courts: string | null;
};

function Players() {
  const [rows, setRows] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<number | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [buddiesOnly, setBuddiesOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles_public" as any)
        .select("id,name,photo_url,level,formats,play_times,vibe,buddy_optin,home_courts")
        .order("created_at", { ascending: false });
      setRows((data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter(
        (p) =>
          (level == null || p.level === level) &&
          (!format || p.formats?.includes(format)) &&
          (!time || p.play_times?.includes(time)) &&
          (!buddiesOnly || p.buddy_optin === "yes"),
      ),
    [rows, level, format, time, buddiesOnly],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">The courtroom</h1>
        <p className="text-[var(--ink)]/70 font-semibold">
          Pick a partner. Make it happen.
        </p>
      </div>

      <div className="space-y-2">
        <FilterRow label="Level">
          <Chip on={level == null} onClick={() => setLevel(null)}>All</Chip>
          {LEVELS.map((l) => (
            <Chip key={l.n} on={level === l.n} onClick={() => setLevel(level === l.n ? null : l.n)}>
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.name}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Format">
          <Chip on={!format} onClick={() => setFormat(null)}>All</Chip>
          {["singles", "doubles"].map((f) => (
            <Chip key={f} on={format === f} onClick={() => setFormat(format === f ? null : f)}>
              {f}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Time">
          <Chip on={!time} onClick={() => setTime(null)}>Any</Chip>
          {PLAY_TIMES.map((t) => (
            <Chip key={t} on={time === t} onClick={() => setTime(time === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Buddies">
          <Chip on={buddiesOnly} onClick={() => setBuddiesOnly(!buddiesOnly)}>
            Will rescue no-shows 🆘
          </Chip>
        </FilterRow>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]/60">Warming up...</div>
      ) : filtered.length === 0 ? (
        <div className="ccard p-6 text-center">
          <div className="text-3xl">🎾</div>
          <div className="font-display text-xl mt-1">Crickets on the court</div>
          <div className="text-sm text-[var(--ink)]/60">Loosen the filters — your match is out there.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="csection-label mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`cchip ${on ? "cchip-on" : ""}`}>
      {children}
    </button>
  );
}

function PlayerCard({ p }: { p: P }) {
  const lm = levelMeta(p.level);
  return (
    <Link
      to="/players/$id"
      params={{ id: p.id }}
      className="ccard p-3 block hover:translate-y-[-2px] transition-transform"
    >
      <div className="flex justify-center mb-2">
        <Avatar src={p.photo_url} name={p.name} seed={p.id} size={104} />
      </div>
      <div className="flex items-center justify-between gap-1">
        <div className="font-display text-lg truncate">{p.name}</div>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: lm.color }} title={lm.name} />
      </div>
      <div className="text-sm">{vibeEmoji(p.vibe)} <span className="text-[var(--ink)]/60">{lm.name}</span></div>
      {p.play_times?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {p.play_times.slice(0, 2).map((t) => (
            <span key={t} className="cchip-mini">{t.replace(/Weekday |Weekend /, "")}</span>
          ))}
        </div>
      )}
    </Link>
  );
}