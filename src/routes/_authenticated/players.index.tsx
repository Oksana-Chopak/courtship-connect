import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, PLAY_TIMES, levelMeta, vibeEmoji, monogramColors, CITIES, type City } from "@/lib/courtship";
import { TopRescuers } from "@/components/TopRescuers";
import { useI18n } from "@/lib/i18n";
import { FLAGS } from "@/lib/flags";
import { fetchBuddyIds } from "@/lib/buddies";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/players/")({
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
  bio: string | null;
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      setMeId(uid);
      // Buddies, my profile and the directory are independent — load together.
      const [buddies, meRes, dirRes] = await Promise.all([
        uid ? fetchBuddyIds(uid).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
        uid ? (supabase as any).rpc("get_my_full_profile").maybeSingle().then((r: any) => r, () => null) : Promise.resolve(null),
        (supabase as any).rpc("players_directory").then((r: any) => r, () => ({ data: [] })),
      ]);
      setBuddyIds(buddies as Set<string>);
      const meRow = (meRes as any)?.data;
      setIsAdmin(!!meRow?.is_admin);
      if (meRow) setSelfRow(meRow as P);
      setRows(((dirRes as any)?.data as any) ?? []);
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
  const activeCount = (level != null ? 1 : 0) + (format ? 1 : 0) + (time ? 1 : 0) + (city ? 1 : 0) + (buddiesOnly ? 1 : 0);
  const hasFilters = activeCount > 0;
  function clearFilters() { setLevel(null); setFormat(null); setTime(null); setCity(null); setBuddiesOnly(false); }
  const ordered = selfRow ? [selfRow, ...filtered.filter((p) => p.id !== selfRow.id)] : filtered;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl">{t("players.title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("players.sub")}</p>
      </div>

      {/* Invite your crew first — the accent of this page */}
      <InviteAccent />

      {FLAGS.luckyServe && <Link to="/lucky" className="cbtn cbtn-coral w-full text-center block">{t("lucky.cta")}</Link>}
      {FLAGS.swipeDeck && <Link to="/match" className="cbtn cbtn-green w-full text-center block">{t("match.cta")}</Link>}

      <TopRescuers />

      <Link to="/leaders" className="ccard p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="font-display text-lg">{t("lb.title")}</span>
        </div>
        <span className="text-2xl" style={{ opacity: 0.4 }}>›</span>
      </Link>

      {/* Filters — collapsed to one row; tap opens the bottom sheet */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex items-center gap-2 font-extrabold rounded-full px-4 py-2 text-sm"
          style={{ background: "var(--ink)", color: "#FFF6E8" }}
        >
          ⚙ {t("players.filters")}
          {activeCount > 0 && (
            <span className="rounded-full px-2 text-xs font-extrabold" style={{ background: "var(--coral)", color: "#FFF6E8" }}>{activeCount}</span>
          )}
        </button>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-sm font-extrabold underline" style={{ color: "var(--coral)" }}>
            {t("players.filters_clear")}
          </button>
        )}
        <span className="ml-auto text-sm font-semibold" style={{ color: "rgba(43,33,24,0.7)" }}>{t("players.count", { n: filtered.length })}</span>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]">{t("players.warming")}</div>
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🎾</div>
            <div className="font-display text-2xl leading-tight">{t("empty.directory")}</div>
            <button className="cbtn cbtn-coral inline-flex" onClick={clearFilters}>{t("empty.directory_cta")}</button>
          </div>
        ) : (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🌱</div>
            <div className="font-display text-2xl leading-tight">{t("empty.dir_new")}</div>
            <Link to="/me" className="cbtn cbtn-coral inline-flex">{t("empty.dir_new_cta")}</Link>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {ordered.map((p) => (
            <DirCard key={p.id} p={p} isBuddy={buddyIds.has(p.id)} badge={p.id === meId ? (isAdmin ? t("players.founder") : t("players.you")) : undefined} />
          ))}
        </div>
      )}

      {filtersOpen && (
        <FilterSheet
          level={level} setLevel={setLevel}
          format={format} setFormat={setFormat}
          time={time} setTime={setTime}
          city={city} setCity={setCity}
          buddiesOnly={buddiesOnly} setBuddiesOnly={setBuddiesOnly}
          count={filtered.length}
          onClear={clearFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}

// Invite-a-friend accent — invite your crew first, then browse everyone else.
function InviteAccent() {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any).rpc("ensure_my_invite_code");
        if (data) setCode(data as string);
      } catch { /* invite RPC not deployed — accent still shows */ }
    })();
  }, []);
  async function share() {
    if (!code) return;
    const link = `${window.location.origin}/auth?code=${code}`;
    const msg = t("invite.message").replace("{link}", link).replace("{code}", code);
    if (navigator.share) {
      try { await navigator.share({ text: msg }); } catch { /* cancelled */ }
      return;
    }
    try { await navigator.clipboard.writeText(msg); toast.success(t("invite.copied")); } catch { /* ignore */ }
  }
  return (
    <div className="ccard p-4" style={{ background: "var(--green-pop)" }}>
      <div className="font-display text-xl leading-tight">{t("players.invite_first_title")}</div>
      <div className="text-sm font-semibold text-[var(--ink)] mt-1">{t("players.invite_first_sub")}</div>
      <button onClick={share} className="cbtn cbtn-coral w-full mt-3">🔗 {t("invite.cta")}</button>
    </div>
  );
}

type SheetProps = {
  level: number | null; setLevel: (v: number | null) => void;
  format: string | null; setFormat: (v: string | null) => void;
  time: string | null; setTime: (v: string | null) => void;
  city: City | null; setCity: (v: City | null) => void;
  buddiesOnly: boolean; setBuddiesOnly: (v: boolean) => void;
  count: number; onClear: () => void; onClose: () => void;
};

function FilterSheet({ level, setLevel, format, setFormat, time, setTime, city, setCity, buddiesOnly, setBuddiesOnly, count, onClear, onClose }: SheetProps) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(22,18,13,0.45)" }} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="w-full sm:max-w-md p-5 pb-7 space-y-3"
        style={{ background: "var(--cream2)", border: "2.5px solid var(--ink)", borderRadius: "22px 22px 0 0", maxHeight: "82%", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto rounded-full" style={{ width: 44, height: 5, background: "var(--ink)", opacity: 0.3 }} />
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl">{t("players.filters")}</span>
          <button onClick={onClear} className="text-sm font-extrabold underline" style={{ color: "var(--coral)" }}>{t("players.filters_clear")}</button>
        </div>
        <Group label={t("city.label")}>
          <Chip on={city == null} onClick={() => setCity(null)}>{t("city.any")}</Chip>
          {CITIES.map((cy) => <Chip key={cy} on={city === cy} onClick={() => setCity(city === cy ? null : cy)}>📍 {cy}</Chip>)}
        </Group>
        <Group label={t("players.filter_level")}>
          <Chip on={level == null} onClick={() => setLevel(null)}>{t("common.all")}</Chip>
          {LEVELS.map((l) => (
            <Chip key={l.n} on={level === l.n} onClick={() => setLevel(level === l.n ? null : l.n)}>
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />{l.name}
            </Chip>
          ))}
        </Group>
        <Group label={t("players.filter_format")}>
          <Chip on={!format} onClick={() => setFormat(null)}>{t("common.all")}</Chip>
          {["singles", "doubles"].map((f) => <Chip key={f} on={format === f} onClick={() => setFormat(format === f ? null : f)}>{f}</Chip>)}
        </Group>
        <Group label={t("players.filter_time")}>
          <Chip on={!time} onClick={() => setTime(null)}>{t("common.any")}</Chip>
          {PLAY_TIMES.map((pt) => <Chip key={pt} on={time === pt} onClick={() => setTime(time === pt ? null : pt)}>{pt}</Chip>)}
        </Group>
        <Group label={t("players.filter_buddies")}>
          <Chip on={buddiesOnly} onClick={() => setBuddiesOnly(!buddiesOnly)}>{t("players.will_rescue")}</Chip>
        </Group>
        <button onClick={onClose} className="cbtn cbtn-green w-full">{t("players.filters_show", { n: count })}</button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
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

// Directory card (DirCardA / MiniCardBig) — colorway/photo panel + compact info.
function DirCard({ p, isBuddy, badge }: { p: P; isBuddy: boolean; badge?: string }) {
  const lm = levelMeta(p.level);
  const [bg, fg] = monogramColors(p.id);
  const hasPhoto = !!p.photo_url;
  const times = (p.play_times ?? []).map((x) => x.replace(/Weekday |Weekend /, "")).filter(Boolean);
  return (
    <Link
      to="/players/$id"
      params={{ id: p.id }}
      className="flex gap-3 rounded-2xl overflow-hidden hover:translate-y-[-2px] transition-transform"
      style={{ border: "2px solid var(--ink)", boxShadow: "4px 4px 0 rgba(43,33,24,0.14)", background: "var(--cream2)" }}
    >
      <div
        className="relative shrink-0 self-stretch"
        style={{ width: 104, minHeight: 104, background: bg, backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 11px)" }}
      >
        {hasPhoto ? (
          <img src={p.photo_url!} alt={p.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center font-display" style={{ fontSize: 52, color: fg, opacity: 0.92 }}>{p.name[0]}</div>
        )}
        {(p.rescues_count ?? 0) >= 5 && (
          <span className="absolute bottom-1.5 left-1.5 font-extrabold rounded-full" style={{ fontSize: 10, padding: "1px 6px", color: "#FFF6E8", background: "var(--coral)", border: "1.5px solid var(--ink)" }}>🚑 {p.rescues_count}</span>
        )}
      </div>
      <div className="flex-1 min-w-0 py-2.5 pr-3">
        <div className="flex items-start justify-between gap-2">
          <span className="font-display text-lg leading-tight">{p.name}{p.last_name ? " " + p.last_name : ""}</span>
          <span className="inline-flex gap-0.5 shrink-0 mt-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="rounded-full" style={{ width: 7, height: 7, background: i <= p.level ? lm.color : "transparent", border: `1.5px solid ${i <= p.level ? lm.color : "var(--ink)"}`, opacity: i <= p.level ? 1 : 0.3, boxSizing: "border-box" }} />
            ))}
          </span>
        </div>
        <div className="text-[13px] font-bold mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: "rgba(43,33,24,0.7)" }}>
          <span>{vibeEmoji(p.vibe)}</span>
          {p.home_city && <span>📍 {p.home_city}</span>}
          {isBuddy && <span>🤝</span>}
        </div>
        {times.length > 0 && (
          <div className="text-[12px] font-semibold mt-1" style={{ color: "rgba(43,33,24,0.6)" }}>🎾 {times.slice(0, 3).join(" · ")}</div>
        )}
        {p.bio && (
          <div
            className="text-[13px] italic mt-1 leading-snug"
            style={{ color: "rgba(43,33,24,0.85)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            "{p.bio}"
          </div>
        )}
        {badge && (
          <div className="text-[11px] font-bold uppercase tracking-wide mt-1.5" style={{ color: "rgba(43,33,24,0.45)" }}>{badge}</div>
        )}
      </div>
    </Link>
  );
}