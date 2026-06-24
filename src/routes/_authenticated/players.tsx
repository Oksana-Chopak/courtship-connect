import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, PLAY_TIMES, levelMeta, vibeEmoji, CITIES, type City } from "@/lib/courtship";
import { RescuerBadge } from "@/components/RescuerBadge";
import { ActivityBadge } from "@/components/ActivityBadge";
import { TopRescuers } from "@/components/TopRescuers";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/lib/i18n";
import { FLAGS } from "@/lib/flags";
import { fetchBuddyIds } from "@/lib/buddies";

export const Route = createFileRoute("/_authenticated/players")({
  head: () => ({ meta: [{ title: "Players — Courtship" }] }),
  component: Players,
});

type P = {
  id: string;
  name: string;
  last_name: string | null;
  photo_url: string | null;
  level: number;
  formats: string[];
  play_times: string[];
  vibe: string;
  buddy_optin: string;
  home_courts: string | null;
  home_city: string | null;
  home_cities: string[] | null;
  rescues_count: number | null;
  games_played: number | null;
};

function Players() {
  const { t } = useI18n();
  const [rows, setRows] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<number | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [buddiesOnly, setBuddiesOnly] = useState(false);
  const [city, setCity] = useState<City | null>(null);
  const [buddyIds, setBuddyIds] = useState<Set<string>>(new Set());
  const [meId, setMeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfRow, setSelfRow] = useState<P | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        setMeId(u.user.id);
        setBuddyIds(await fetchBuddyIds(u.user.id));
        const { data: meRow } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
        setIsAdmin(!!(meRow as any)?.is_admin);
        if (meRow) setSelfRow(meRow as P);
      }
      const { data } = await (supabase as any).rpc("players_directory");
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
          (!city || (Array.isArray(p.home_cities) && p.home_cities.length ? p.home_cities.includes(city) : p.home_city === city)) &&
          (!buddiesOnly || p.buddy_optin === "yes"),
      ),
    [rows, level, format, time, city, buddiesOnly],
  );
  const hasFilters = level != null || format != null || time != null || city != null || buddiesOnly;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">{t("players.title")}</h1>
        {FLAGS.luckyServe && <Link to="/lucky" className="cbtn cbtn-coral w-full mt-2 text-center block">{t("lucky.cta")}</Link>}
        {FLAGS.swipeDeck && <Link to="/match" className="cbtn cbtn-green w-full mt-2 text-center block">{t("match.cta")}</Link>}
        <p className="text-[var(--ink)] font-semibold">{t("players.sub")}</p>
      </div>

      <TopRescuers />

      <div className="space-y-2">
        <FilterRow label={t("city.label")}>
          <Chip on={city == null} onClick={() => setCity(null)}>{t("city.any")}</Chip>
          {CITIES.map((cy) => (
            <Chip key={cy} on={city === cy} onClick={() => setCity(city === cy ? null : cy)}>
              📍 {cy}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label={t("players.filter_level")}>
          <Chip on={level == null} onClick={() => setLevel(null)}>{t("common.all")}</Chip>
          {LEVELS.map((l) => (
            <Chip key={l.n} on={level === l.n} onClick={() => setLevel(level === l.n ? null : l.n)}>
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.name}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label={t("players.filter_format")}>
          <Chip on={!format} onClick={() => setFormat(null)}>{t("common.all")}</Chip>
          {["singles", "doubles"].map((f) => (
            <Chip key={f} on={format === f} onClick={() => setFormat(format === f ? null : f)}>
              {f}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label={t("players.filter_time")}>
          <Chip on={!time} onClick={() => setTime(null)}>{t("common.any")}</Chip>
          {PLAY_TIMES.map((t) => (
            <Chip key={t} on={time === t} onClick={() => setTime(time === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label={t("players.filter_buddies")}>
          <Chip on={buddiesOnly} onClick={() => setBuddiesOnly(!buddiesOnly)}>
            {t("players.will_rescue")}
          </Chip>
        </FilterRow>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]">{t("players.warming")}</div>
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🎾</div>
            <div className="font-display text-2xl leading-tight">{t("empty.directory")}</div>
            <button
              className="cbtn cbtn-coral inline-flex"
              onClick={() => { setLevel(null); setFormat(null); setTime(null); setCity(null); setBuddiesOnly(false); }}
            >
              {t("empty.directory_cta")}
            </button>
          </div>
        ) : (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🌱</div>
            <div className="font-display text-2xl leading-tight">{t("empty.dir_new")}</div>
            <Link to="/me" className="cbtn cbtn-coral inline-flex">{t("empty.dir_new_cta")}</Link>
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(selfRow ? [selfRow, ...filtered.filter((p) => p.id !== selfRow.id)] : filtered).map((p) => (
            <PlayerCard key={p.id} p={p} isBuddy={buddyIds.has(p.id)} badge={p.id === meId ? (isAdmin ? t("players.founder") : t("players.you")) : undefined} />
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

function PlayerCard({ p, isBuddy, badge }: { p: P; isBuddy: boolean; badge?: string }) {
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
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-display text-lg truncate min-w-0">{p.name}{p.last_name ? " " + p.last_name : ""}</span>
          {isBuddy && <span className="shrink-0" title="Buddy">🤝</span>}
          {badge && <span className="cchip-mini shrink-0">{badge}</span>}
        </div>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: lm.color }} title={lm.name} />
      </div>
      <div className="text-sm">{vibeEmoji(p.vibe)} <span className="text-[var(--ink)]">{lm.name}</span></div>
      {((p.rescues_count ?? 0) >= 1 || (p.games_played ?? 0) >= 1) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {(p.rescues_count ?? 0) >= 1 && <RescuerBadge count={p.rescues_count ?? 0} />}
          {(p.games_played ?? 0) >= 1 && <ActivityBadge count={p.games_played ?? 0} />}
        </div>
      )}
      {p.home_city && (
        <div className="text-xs font-extrabold mt-1">📍 {p.home_city}</div>
      )}
      {p.play_times?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {p.play_times.slice(0, 2).map((t) => (
            <span key={t} className="cchip-mini">{t.replace(/Weekday |Weekend /, "")}</span>
          ))}
          {p.play_times.length > 2 && (
            <span className="cchip-mini">+{p.play_times.length - 2}</span>
          )}
        </div>
      )}
    </Link>
  );
}