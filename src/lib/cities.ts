import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CITIES as FALLBACK_CITIES,
  BOOKING_GRANULARITY_MINUTES,
  DEFAULT_GRANULARITY_MINUTES,
} from "@/lib/courtship";

export type CityInfo = { name: string; timezone: string; granularity_min: number };

let _cache: CityInfo[] | null = null;
let _inflight: Promise<CityInfo[]> | null = null;

function fallback(): CityInfo[] {
  return FALLBACK_CITIES.map((name) => ({
    name,
    timezone: "Europe/Stockholm",
    granularity_min: BOOKING_GRANULARITY_MINUTES[name] ?? DEFAULT_GRANULARITY_MINUTES,
  }));
}

/**
 * Active cities from the DB (name, timezone, booking granularity).
 * Cached for the session. Falls back to the static CITIES list on any error,
 * so pickers never break even if the `cities` table isn't migrated yet.
 * Side effect: seeds BOOKING_GRANULARITY_MINUTES so cityGranularity() picks up
 * new cities' slot granularity without threading props.
 */
export async function fetchCities(): Promise<CityInfo[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const { data } = await (supabase as any)
        .from("cities")
        .select("name,timezone,granularity_min")
        .eq("active", true)
        .order("sort");
      const rows = (data as CityInfo[] | null) ?? [];
      if (rows.length) {
        _cache = rows;
        for (const r of rows) BOOKING_GRANULARITY_MINUTES[r.name] = r.granularity_min;
        return rows;
      }
    } catch {
      /* ignore — use fallback */
    }
    return fallback();
  })();
  const out = await _inflight;
  _inflight = null;
  return out;
}

/**
 * City names for pickers/filters. Returns the static list immediately, then
 * swaps in the DB list once loaded (so a newly-added city like Miami appears
 * with no code change).
 */
export function useCityNames(): string[] {
  const [names, setNames] = useState<string[]>([...FALLBACK_CITIES]);
  useEffect(() => {
    let on = true;
    fetchCities().then((cs) => {
      if (on && cs.length) setNames(cs.map((c) => c.name));
    });
    return () => { on = false; };
  }, []);
  return names;
}
